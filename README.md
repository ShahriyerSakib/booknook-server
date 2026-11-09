# BookNook Server

Express.js + MongoDB API for BookNook. JWT protected routes.

## Routes
- GET /books (public)
- GET /books/:id
- POST /books
- PATCH /books/:id
- DELETE /books/:id
- POST /borrows
- GET /borrows
- DELETE /borrows/:id

## Run
```
npm install
cp .env.example .env   # fill values
npm run dev
```
