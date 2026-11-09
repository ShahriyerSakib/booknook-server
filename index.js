require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(
  cors({
    origin: (origin, cb) => cb(null, true), // client URL is checked by JWT, API is token protected
  })
);
app.use(express.json());

// ---------- DB (lazy connect: works on Render & Vercel) ----------
const client = new MongoClient(process.env.MONGODB_URI);
let books, borrows;
async function init() {
  if (books) return;
  await client.connect();
  const db = client.db("booknook");
  books = db.collection("books");
  borrows = db.collection("borrows");
}
app.use(async (req, res, next) => {
  try {
    await init();
    next();
  } catch (e) {
    next(e);
  }
});

// ---------- JWT middleware ----------
const verifyToken = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer "))
    return res.status(401).send({ message: "Unauthorized access" });
  try {
    req.user = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).send({ message: "Invalid or expired token" });
  }
};

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const validId = (id) => ObjectId.isValid(id);

app.get("/", (req, res) => res.send("BookNook server is running"));

// 1. GET /books  (public)  ?sort=latest&limit=6&email=
app.get(
  "/books",
  wrap(async (req, res) => {
    const { limit, sort, email } = req.query;
    const query = email ? { userEmail: email } : {};
    let cursor = books.find(query);
    if (sort === "latest") cursor = cursor.sort({ createdAt: -1 });
    if (limit) cursor = cursor.limit(parseInt(limit));
    res.send(await cursor.toArray());
  })
);

// 2. GET /books/:id  (protected)
app.get(
  "/books/:id",
  verifyToken,
  wrap(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).send({ message: "Invalid book id" });
    const book = await books.findOne({ _id: new ObjectId(req.params.id) });
    if (!book) return res.status(404).send({ message: "Book not found" });
    res.send(book);
  })
);

// 3. POST /books  (protected)
app.post(
  "/books",
  verifyToken,
  wrap(async (req, res) => {
    const b = req.body;
    if (!b.title || !b.author || !b.category || !b.image || !b.description)
      return res.status(400).send({ message: "All fields are required" });
    const copies = Math.max(1, Number(b.totalCopies) || 1);
    const doc = {
      title: b.title,
      author: b.author,
      category: b.category,
      image: b.image,
      description: b.description,
      totalCopies: copies,
      availableCopies: copies,
      userName: req.user.name,
      userEmail: req.user.email,
      createdAt: new Date(),
    };
    res.send(await books.insertOne(doc));
  })
);

// 4. PATCH /books/:id  (owner only)
app.patch(
  "/books/:id",
  verifyToken,
  wrap(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).send({ message: "Invalid book id" });
    const _id = new ObjectId(req.params.id);
    const book = await books.findOne({ _id });
    if (!book) return res.status(404).send({ message: "Book not found" });
    if (book.userEmail !== req.user.email) return res.status(403).send({ message: "Forbidden access" });
    const { title, author, category, image, description } = req.body;
    res.send(await books.updateOne({ _id }, { $set: { title, author, category, image, description } }));
  })
);

// 5. DELETE /books/:id  (owner only)
app.delete(
  "/books/:id",
  verifyToken,
  wrap(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).send({ message: "Invalid book id" });
    const _id = new ObjectId(req.params.id);
    const book = await books.findOne({ _id });
    if (!book) return res.status(404).send({ message: "Book not found" });
    if (book.userEmail !== req.user.email) return res.status(403).send({ message: "Forbidden access" });
    res.send(await books.deleteOne({ _id }));
  })
);

// 6. POST /borrows  (protected) - no double borrow + $inc copies
app.post(
  "/borrows",
  verifyToken,
  wrap(async (req, res) => {
    const { bookId } = req.body;
    if (!validId(bookId)) return res.status(400).send({ message: "Invalid book id" });
    const email = req.user.email;
    const _id = new ObjectId(bookId);
    const book = await books.findOne({ _id });
    if (!book) return res.status(404).send({ message: "Book not found" });

    const already = await borrows.findOne({ bookId, userEmail: email });
    if (already) return res.status(409).send({ message: "You have already borrowed this book" });

    const upd = await books.updateOne({ _id, availableCopies: { $gt: 0 } }, { $inc: { availableCopies: -1 } });
    if (upd.modifiedCount === 0) return res.status(400).send({ message: "This book is not available right now" });

    const borrowDate = new Date();
    const returnDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const result = await borrows.insertOne({
      bookId,
      bookTitle: book.title,
      bookImage: book.image,
      userEmail: email,
      userName: req.user.name,
      borrowDate,
      returnDate,
    });
    res.send(result);
  })
);

// 7. GET /borrows  (logged in user's borrows)
app.get(
  "/borrows",
  verifyToken,
  wrap(async (req, res) => {
    res.send(await borrows.find({ userEmail: req.user.email }).sort({ borrowDate: -1 }).toArray());
  })
);

// 8. DELETE /borrows/:id  (return a book)
app.delete(
  "/borrows/:id",
  verifyToken,
  wrap(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).send({ message: "Invalid borrow id" });
    const _id = new ObjectId(req.params.id);
    const borrow = await borrows.findOne({ _id });
    if (!borrow) return res.status(404).send({ message: "Borrow record not found" });
    if (borrow.userEmail !== req.user.email) return res.status(403).send({ message: "Forbidden access" });
    await borrows.deleteOne({ _id });
    await books.updateOne({ _id: new ObjectId(borrow.bookId) }, { $inc: { availableCopies: 1 } });
    res.send({ success: true });
  })
);

// ---------- error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send({ message: "Server error, please try again" });
});

module.exports = app;

if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`BookNook server listening on ${port}`));
}
