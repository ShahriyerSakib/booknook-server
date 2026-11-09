// Optional: npm run seed  -> adds 8 sample books so your Home page isn't empty
require("dotenv").config();
const { MongoClient } = require("mongodb");
const cover = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
const items = [
  ["The Alchemist", "Paulo Coelho", "Fiction", "9780061122415", "A shepherd boy follows a dream across the desert and learns to listen to his heart."],
  ["A Brief History of Time", "Stephen Hawking", "Science", "9780553380163", "From the Big Bang to black holes, explained for curious readers."],
  ["Sapiens", "Yuval Noah Harari", "History", "9780062316097", "A sweeping story of how humans came to dominate the planet."],
  ["Matilda", "Roald Dahl", "Kids", "9780142410370", "A gifted girl with a love of books outsmarts the grown-ups who underestimate her."],
  ["Cosmos", "Carl Sagan", "Science", "9780345539434", "A personal voyage through space, time and the history of scientific thought."],
  ["1984", "George Orwell", "Fiction", "9780451524935", "A chilling portrait of a society ruled by surveillance and fear."],
  ["Atomic Habits", "James Clear", "Others", "9780735211292", "Small changes that compound into remarkable results over time."],
  ["The Diary of a Young Girl", "Anne Frank", "History", "9780553296983", "A young girl's diary written while hiding during the Second World War."],
];
(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const col = client.db("booknook").collection("books");
  const now = Date.now();
  await col.insertMany(
    items.map(([title, author, category, isbn, description], i) => ({
      title, author, category, description, image: cover(isbn),
      totalCopies: 3, availableCopies: 3,
      userName: "BookNook Team", userEmail: "team@booknook.app",
      createdAt: new Date(now - i * 3600 * 1000),
    }))
  );
  console.log("Seeded 8 books");
  await client.close();
})();
