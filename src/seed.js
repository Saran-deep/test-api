// Creates data/*.json with sample data. `npm run reset` (--force) wipes and recreates them.
const fs = require('fs');
const { DATA_DIR, filePath, writeFile } = require('./store');
const { hashPassword } = require('./auth');

const DAY_MS = 86400000;

const BOOKS = [
  { title: 'The Pragmatic Programmer', author: 'Andrew Hunt, David Thomas', isbn: '9780135957059', genre: 'technology', published_year: 2019, total_copies: 3 },
  { title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', genre: 'technology', published_year: 2008, total_copies: 2 },
  { title: 'Sapiens', author: 'Yuval Noah Harari', isbn: '9780062316097', genre: 'history', published_year: 2015, total_copies: 4 },
  { title: 'A Brief History of Time', author: 'Stephen Hawking', isbn: '9780553380163', genre: 'science', published_year: 1998, total_copies: 2 },
  { title: 'To Kill a Mockingbird', author: 'Harper Lee', isbn: '9780061120084', genre: 'fiction', published_year: 1960, total_copies: 5 },
  { title: '1984', author: 'George Orwell', isbn: '9780451524935', genre: 'fiction', published_year: 1949, total_copies: 1 },
  { title: 'The Very Hungry Caterpillar', author: 'Eric Carle', isbn: '9780399226908', genre: 'children', published_year: 1969, total_copies: 2 },
  { title: 'Educated', author: 'Tara Westover', isbn: '9780399590504', genre: 'non-fiction', published_year: 2018, total_copies: 0 },
];

function buildSeed() {
  const now = Date.now();
  const at = (days) => new Date(now + days * DAY_MS).toISOString();
  const created = at(0);

  const users = [
    { id: 1, name: 'Library Admin', email: 'admin@library.test', role: 'admin', password_hash: hashPassword('Admin@123'), created_at: created },
    { id: 2, name: 'Rita Reader', email: 'reader@library.test', role: 'member', password_hash: hashPassword('Reader@123'), created_at: created },
  ];
  const books = BOOKS.map((b, i) => ({ id: i + 1, ...b, created_at: created, updated_at: created }));
  const loans = [
    // overdue: still out, due date in the past
    { id: 1, book_id: 6, user_id: 2, borrowed_at: at(-20), due_at: at(-6), returned_at: null },
    // returned
    { id: 2, book_id: 3, user_id: 2, borrowed_at: at(-40), due_at: at(-26), returned_at: at(-30) },
  ];

  return { users, books, loans, sessions: [] };
}

function seed({ force = false } = {}) {
  const data = buildSeed();
  const written = [];
  for (const [name, items] of Object.entries(data)) {
    if (!force && fs.existsSync(filePath(name))) continue;
    const nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    writeFile(name, { nextId, items });
    written.push(name);
  }
  return written;
}

if (require.main === module) {
  const written = seed({ force: process.argv.includes('--force') });
  console.log(written.length ? `Seeded ${written.join(', ')} in ${DATA_DIR}` : 'Data files already exist (use --force to reset).');
}

module.exports = { seed };
