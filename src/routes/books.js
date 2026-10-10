const HttpError = require('../http-error');
const { books, loans } = require('../store');
const { GENRES } = require('../schemas');
const { ref, ok, noContent, err, idParam, pagingParams, page } = require('./helpers');

const bookId = idParam('bookId', 'Book ID');

function activeLoanCount(id) {
  return loans.filter((l) => l.book_id === id && l.returned_at === null).length;
}

function toBookOut(book) {
  return { ...book, available_copies: Math.max(book.total_copies - activeLoanCount(book.id), 0) };
}

function findBook(id) {
  const book = books.get(id);
  if (!book) throw new HttpError(404, 'book_not_found', `Book ${id} not found`);
  return book;
}

function assertIsbnFree(isbn, exceptId) {
  if (books.find((b) => b.isbn === isbn && b.id !== exceptId)) {
    throw new HttpError(409, 'duplicate_isbn', `A book with ISBN ${isbn} already exists`);
  }
}

function assertCopiesCoverLoans(id, totalCopies) {
  const onLoan = activeLoanCount(id);
  if (totalCopies < onLoan) {
    throw new HttpError(409, 'copies_in_use', `total_copies cannot be lower than the ${onLoan} copies currently on loan`);
  }
}

function saveChanges(id, changes) {
  if (changes.isbn !== undefined) assertIsbnFree(changes.isbn, id);
  if (changes.total_copies !== undefined) assertCopiesCoverLoans(id, changes.total_copies);
  const updated = books.update(id, { ...changes, updated_at: new Date().toISOString() });
  return { status: 200, body: toBookOut(updated) };
}

const conflictOnUpdate = err('ISBN already used by another book, or total_copies is lower than the copies on loan');

module.exports = [
  {
    method: 'GET',
    path: '/api/books',
    operationId: 'listBooks',
    tag: 'Books',
    summary: 'Search and list books',
    params: [
      { name: 'q', in: 'query', description: 'Case-insensitive text found in title or author.', schema: { type: 'string', minLength: 1, maxLength: 100 } },
      { name: 'genre', in: 'query', schema: { type: 'string', enum: GENRES } },
      { name: 'available', in: 'query', description: 'true = only books with available_copies > 0; false = only books with none.', schema: { type: 'boolean' } },
      { name: 'sort_by', in: 'query', schema: { type: 'string', enum: ['id', 'title', 'author', 'published_year'], default: 'id' } },
      { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
      ...pagingParams,
    ],
    responses: { 200: ok('A page of books', ref('BookList')) },
    handler({ query }) {
      let items = books.all().map(toBookOut);
      if (query.q !== undefined) {
        const needle = query.q.toLowerCase();
        items = items.filter((b) => b.title.toLowerCase().includes(needle) || b.author.toLowerCase().includes(needle));
      }
      if (query.genre !== undefined) items = items.filter((b) => b.genre === query.genre);
      if (query.available !== undefined) items = items.filter((b) => (b.available_copies > 0) === query.available);

      const dir = query.order === 'desc' ? -1 : 1;
      const key = query.sort_by;
      items.sort((a, b) => {
        const cmp = typeof a[key] === 'string' ? a[key].localeCompare(b[key]) : a[key] - b[key];
        return (cmp || a.id - b.id) * dir;
      });
      return { status: 200, body: page(items, query) };
    },
  },
  {
    method: 'GET',
    path: '/api/books/{bookId}',
    operationId: 'getBook',
    tag: 'Books',
    summary: 'Get one book',
    params: [bookId],
    responses: {
      200: ok('The book', ref('BookOut')),
      404: err('Book not found'),
    },
    handler({ params }) {
      return { status: 200, body: toBookOut(findBook(params.bookId)) };
    },
  },
  {
    method: 'POST',
    path: '/api/books',
    operationId: 'createBook',
    tag: 'Books',
    summary: 'Add a book (admin only)',
    auth: 'admin',
    body: ref('BookIn'),
    responses: {
      201: ok('Book created', ref('BookOut')),
      409: err('A book with this ISBN already exists'),
    },
    handler({ body }) {
      assertIsbnFree(body.isbn);
      const now = new Date().toISOString();
      const book = books.insert({ ...body, title: body.title.trim(), author: body.author.trim(), created_at: now, updated_at: now });
      return { status: 201, body: toBookOut(book) };
    },
  },
  {
    method: 'PUT',
    path: '/api/books/{bookId}',
    operationId: 'replaceBook',
    tag: 'Books',
    summary: 'Replace all fields of a book (admin only)',
    auth: 'admin',
    params: [bookId],
    body: ref('BookIn'),
    responses: {
      200: ok('Book updated', ref('BookOut')),
      404: err('Book not found'),
      409: conflictOnUpdate,
    },
    handler({ params, body }) {
      findBook(params.bookId);
      return saveChanges(params.bookId, body);
    },
  },
  {
    method: 'PATCH',
    path: '/api/books/{bookId}',
    operationId: 'updateBook',
    tag: 'Books',
    summary: 'Change some fields of a book (admin only)',
    auth: 'admin',
    params: [bookId],
    body: ref('BookPatch'),
    responses: {
      200: ok('Book updated', ref('BookOut')),
      404: err('Book not found'),
      409: conflictOnUpdate,
    },
    handler({ params, body }) {
      findBook(params.bookId);
      return saveChanges(params.bookId, body);
    },
  },
  {
    method: 'DELETE',
    path: '/api/books/{bookId}',
    operationId: 'deleteBook',
    tag: 'Books',
    summary: 'Delete a book (admin only)',
    description: 'A book with copies currently on loan cannot be deleted.',
    auth: 'admin',
    params: [bookId],
    responses: {
      204: noContent('Book deleted'),
      404: err('Book not found'),
      409: err('Copies of this book are on loan'),
    },
    handler({ params }) {
      findBook(params.bookId);
      if (activeLoanCount(params.bookId) > 0) {
        throw new HttpError(409, 'book_on_loan', 'Book has copies on loan and cannot be deleted');
      }
      books.remove(params.bookId);
      return { status: 204 };
    },
  },
];

