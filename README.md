# Library API

A small library-management REST API for practising API testing. It has no dependencies: you only need
Node.js 18 or later. All data is saved as JSON files in `data/`.

## Run it

```powershell
cd "D:\API Testing\library-api"
npm start              # http://127.0.0.1:3000  (set $env:PORT to change the port)
npm run dev            # same, but restarts when you change the code
npm run reset          # put data/*.json back to the sample data
npm test               # built-in smoke tests (use a temporary copy of the data)
```

- Swagger UI: http://127.0.0.1:3000/docs
- OpenAPI 3.0 spec: http://127.0.0.1:3000/openapi.json (import this into Postman)
- Health: http://127.0.0.1:3000/health

## Test accounts (sample data)

| Email | Password | Role |
| --- | --- | --- |
| `admin@library.test` | `Admin@123` | admin |
| `reader@library.test` | `Reader@123` | member |

Log in with `POST /api/auth/login` and send the returned token as `Authorization: Bearer <token>`.
Tokens last one hour. `POST /api/auth/logout` revokes a token.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | – | Health check |
| POST | `/api/auth/register` | – | Create a member account |
| POST | `/api/auth/login` | – | Get a bearer token |
| POST | `/api/auth/logout` | user | Revoke the token |
| GET | `/api/auth/me` | user | Current user |
| GET | `/api/books` | – | Search and list books: `q`, `genre`, `available`, `sort_by`, `order`, `limit`, `offset` |
| GET | `/api/books/{bookId}` | – | One book |
| POST | `/api/books` | admin | Add a book |
| PUT | `/api/books/{bookId}` | admin | Replace a book |
| PATCH | `/api/books/{bookId}` | admin | Change some fields |
| DELETE | `/api/books/{bookId}` | admin | Delete a book |
| GET | `/api/loans` | user | List loans: `status`, `user_id` (admins), `limit`, `offset` |
| POST | `/api/loans` | user | Borrow a book: `{ "book_id": 2, "days": 7 }` |
| GET | `/api/loans/{loanId}` | user | One loan |
| POST | `/api/loans/{loanId}/return` | user | Return a book |

## Rules you can write tests against

- **Validation (422):** every body, query and path value is checked against the OpenAPI schema. Unknown
  body fields are rejected. Each problem is listed in `error.details[]` as `{ field, message }`, for example
  `body.email` or `query.limit`.
- **Check order:** 401 (no or bad token), then 403 (not admin), then 415/400/422 (input), then 404/409
  (business rules).
- **Books:** ISBNs must be unique (409 `duplicate_isbn`). `total_copies` cannot drop below the copies on
  loan (409 `copies_in_use`). A book with copies on loan cannot be deleted (409 `book_on_loan`).
  `available_copies` is calculated from the loans.
- **Loans:** a member may have at most 3 unreturned loans (409 `loan_limit_reached`), cannot borrow the
  same book twice (409 `already_borrowed`), and cannot borrow a book with no free copies (409
  `not_available`). Returning twice gives 409 `already_returned`.
- **Privacy:** members see only their own loans. Someone else's loan returns 404, and asking for
  another member's `user_id` returns 403. Admins see everything.
- **Status:** a loan is `active`, `overdue` (not returned and past `due_at`) or `returned`.
- **Errors** always look like `{ "error": { "code": "...", "message": "...", "details": [...] } }`.
  Unknown paths give 404 and a wrong method gives 405 with an `Allow` header.

The sample data includes an overdue loan (reader, book 6 *1984*, its only copy), a returned loan, and a
book with no copies (book 8 *Educated*). Use these for the negative cases.

## Data files

`data/users.json`, `books.json`, `loans.json` and `sessions.json` each hold `{ "nextId": n, "items": [...] }`.
They are created on first start and re-read on every request, so you can edit them by hand while the
server is running. Set `$env:DATA_DIR` to keep them somewhere else.

## Code layout

| Path | What |
| --- | --- |
| `server.js` | Entry point |
| `src/app.js` | HTTP server, routing, auth check, input validation, error handling |
| `src/routes/*.js` | Endpoint definitions: path, schemas, responses and handler in one place |
| `src/schemas.js` | Schemas used both for validation and for `/openapi.json` |
| `src/openapi.js` | Builds the OpenAPI document from the routes |
| `src/store.js` | JSON-file storage |
| `src/seed.js` | Sample data |
