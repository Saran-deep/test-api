const HttpError = require('../http-error');
const { books, loans } = require('../store');
const { ref, ok, err, idParam, pagingParams, page } = require('./helpers');

const MAX_ACTIVE_LOANS = 3;
const DAY_MS = 86400000;

function statusOf(loan) {
  if (loan.returned_at !== null) return 'returned';
  return Date.parse(loan.due_at) < Date.now() ? 'overdue' : 'active';
}

function toLoanOut(loan) {
  return { ...loan, status: statusOf(loan) };
}

// Members only see their own loans; someone else's loan is reported as not found.
function findVisibleLoan(id, user) {
  const loan = loans.get(id);
  if (!loan || (user.role !== 'admin' && loan.user_id !== user.id)) {
    throw new HttpError(404, 'loan_not_found', `Loan ${id} not found`);
  }
  return loan;
}

const loanId = idParam('loanId', 'Loan ID');

module.exports = [
  {
    method: 'GET',
    path: '/api/loans',
    operationId: 'listLoans',
    tag: 'Loans',
    summary: 'List loans',
    description: 'Members see only their own loans. Admins see every loan and may filter by user_id.',
    auth: 'user',
    params: [
      { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'overdue', 'returned'] } },
      { name: 'user_id', in: 'query', description: 'Admins only. A member may pass only their own ID.', schema: { type: 'integer', minimum: 1 } },
      ...pagingParams,
    ],
    responses: {
      200: ok('A page of loans, newest first', ref('LoanList')),
      403: err("A member asked for another user's loans"),
    },
    handler({ query, user }) {
      let userId = query.user_id;
      if (user.role !== 'admin') {
        if (userId !== undefined && userId !== user.id) {
          throw new HttpError(403, 'forbidden', "You can only list your own loans");
        }
        userId = user.id;
      }
      let items = loans.all().map(toLoanOut);
      if (userId !== undefined) items = items.filter((l) => l.user_id === userId);
      if (query.status !== undefined) items = items.filter((l) => l.status === query.status);
      items.sort((a, b) => b.id - a.id);
      return { status: 200, body: page(items, query) };
    },
  },
  {
    method: 'POST',
    path: '/api/loans',
    operationId: 'createLoan',
    tag: 'Loans',
    summary: 'Borrow a book',
    description:
      `Rules, checked in this order: the book must exist (404); you must not already have this book (409 already_borrowed); ` +
      `you may have at most ${MAX_ACTIVE_LOANS} unreturned loans (409 loan_limit_reached); a copy must be available (409 not_available).`,
    auth: 'user',
    body: ref('LoanIn'),
    responses: {
      201: ok('Loan created', ref('LoanOut')),
      404: err('Book not found'),
      409: err('Already borrowed, loan limit reached, or no copy available'),
    },
    handler({ body, user }) {
      const book = books.get(body.book_id);
      if (!book) throw new HttpError(404, 'book_not_found', `Book ${body.book_id} not found`);

      const mine = loans.filter((l) => l.user_id === user.id && l.returned_at === null);
      if (mine.some((l) => l.book_id === book.id)) {
        throw new HttpError(409, 'already_borrowed', 'You already have this book on loan');
      }
      if (mine.length >= MAX_ACTIVE_LOANS) {
        throw new HttpError(409, 'loan_limit_reached', `You cannot have more than ${MAX_ACTIVE_LOANS} books on loan`);
      }
      const onLoan = loans.filter((l) => l.book_id === book.id && l.returned_at === null).length;
      if (onLoan >= book.total_copies) {
        throw new HttpError(409, 'not_available', 'No copies of this book are available');
      }

      const now = Date.now();
      const loan = loans.insert({
        book_id: book.id,
        user_id: user.id,
        borrowed_at: new Date(now).toISOString(),
        due_at: new Date(now + (body.days ?? 14) * DAY_MS).toISOString(),
        returned_at: null,
      });
      return { status: 201, body: toLoanOut(loan) };
    },
  },
  {
    method: 'GET',
    path: '/api/loans/{loanId}',
    operationId: 'getLoan',
    tag: 'Loans',
    summary: 'Get one loan',
    auth: 'user',
    params: [loanId],
    responses: {
      200: ok('The loan', ref('LoanOut')),
      404: err("Loan not found (or it belongs to another member)"),
    },
    handler({ params, user }) {
      return { status: 200, body: toLoanOut(findVisibleLoan(params.loanId, user)) };
    },
  },
  {
    method: 'POST',
    path: '/api/loans/{loanId}/return',
    operationId: 'returnLoan',
    tag: 'Loans',
    summary: 'Return a borrowed book',
    auth: 'user',
    params: [loanId],
    responses: {
      200: ok('Book returned', ref('LoanOut')),
      404: err("Loan not found (or it belongs to another member)"),
      409: err('Loan was already returned'),
    },
    handler({ params, user }) {
      const loan = findVisibleLoan(params.loanId, user);
      if (loan.returned_at !== null) {
        throw new HttpError(409, 'already_returned', 'This loan has already been returned');
      }
      const updated = loans.update(loan.id, { returned_at: new Date().toISOString() });
      return { status: 200, body: toLoanOut(updated) };
    },
  },
];
