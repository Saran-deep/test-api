// Smoke tests: start the server on a random port against a throwaway data directory.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'library-api-'));
process.env.QUIET = 'true';
const { createServer } = require('../src/app');
const { seed } = require('../src/seed');

let server;
let base;

async function call(method, url, { body, token, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

async function login(email, password) {
  const res = await call('POST', '/api/auth/login', { body: { email, password } });
  assert.strictEqual(res.status, 200);
  return res.body.access_token;
}

before(async () => {
  seed({ force: true });
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

test('health and spec', async () => {
  assert.strictEqual((await call('GET', '/health')).body.status, 'ok');
  const spec = (await call('GET', '/openapi.json')).body;
  assert.strictEqual(spec.openapi, '3.0.3');
  assert.ok(spec.paths['/api/loans/{loanId}/return'].post.responses['409']);
});

test('register, login, me, logout', async () => {
  const reg = await call('POST', '/api/auth/register', { body: { name: 'Tess Ter', email: 'Tess@Example.com', password: 'Password1' } });
  assert.strictEqual(reg.status, 201);
  assert.strictEqual(reg.body.email, 'tess@example.com');
  assert.strictEqual(reg.body.password_hash, undefined);

  const dup = await call('POST', '/api/auth/register', { body: { name: 'Again', email: 'tess@example.com', password: 'Password1' } });
  assert.strictEqual(dup.status, 409);

  const bad = await call('POST', '/api/auth/register', { body: { name: 'x', email: 'nope', password: 'short', extra: 1 } });
  assert.strictEqual(bad.status, 422);
  assert.deepStrictEqual(bad.body.error.details.map((d) => d.field).sort(), ['body.email', 'body.extra', 'body.name', 'body.password']);

  assert.strictEqual((await call('POST', '/api/auth/login', { body: { email: 'tess@example.com', password: 'wrong' } })).status, 401);
  const token = await login('tess@example.com', 'Password1');
  assert.strictEqual((await call('GET', '/api/auth/me', { token })).body.role, 'member');
  assert.strictEqual((await call('POST', '/api/auth/logout', { token })).status, 204);
  assert.strictEqual((await call('GET', '/api/auth/me', { token })).status, 401);
});

test('books: list, filter, validation, admin rules', async () => {
  const list = await call('GET', '/api/books?genre=fiction&sort_by=title&order=desc&limit=1');
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.body.total, 2);
  assert.strictEqual(list.body.items[0].title, 'To Kill a Mockingbird');
  assert.strictEqual((await call('GET', '/api/books?limit=0')).status, 422);
  assert.strictEqual((await call('GET', '/api/books/abc')).status, 422);
  assert.strictEqual((await call('GET', '/api/books/999')).status, 404);
  assert.strictEqual((await call('GET', '/api/books/6')).body.available_copies, 0); // seeded overdue loan

  const book = { title: 'Test Book', author: 'Tester', isbn: '9781234567897', genre: 'other', published_year: 2020, total_copies: 1 };
  assert.strictEqual((await call('POST', '/api/books', { body: book })).status, 401);
  const reader = await login('reader@library.test', 'Reader@123');
  assert.strictEqual((await call('POST', '/api/books', { body: book, token: reader })).status, 403);

  const admin = await login('admin@library.test', 'Admin@123');
  const created = await call('POST', '/api/books', { body: book, token: admin });
  assert.strictEqual(created.status, 201);
  assert.strictEqual((await call('POST', '/api/books', { body: book, token: admin })).status, 409);
  assert.strictEqual((await call('POST', '/api/books', { body: '{bad', token: admin })).status, 400);
  assert.strictEqual((await call('PATCH', `/api/books/${created.body.id}`, { body: {}, token: admin })).status, 422);
  const patched = await call('PATCH', `/api/books/${created.body.id}`, { body: { total_copies: 2 }, token: admin });
  assert.strictEqual(patched.body.total_copies, 2);
  assert.strictEqual((await call('PATCH', '/api/books/6', { body: { total_copies: 0 }, token: admin })).status, 409);
  assert.strictEqual((await call('DELETE', '/api/books/6', { token: admin })).status, 409);
  assert.strictEqual((await call('DELETE', `/api/books/${created.body.id}`, { token: admin })).status, 204);
  assert.strictEqual((await call('PUT', '/api/books', { token: admin })).status, 405);
});

test('loans: borrow rules and return', async () => {
  const reader = await login('reader@library.test', 'Reader@123');
  const mine = await call('GET', '/api/loans', { token: reader });
  assert.deepStrictEqual(mine.body.items.map((l) => l.status), ['returned', 'overdue']);

  assert.strictEqual((await call('POST', '/api/loans', { body: { book_id: 8 }, token: reader })).status, 409); // 0 copies
  assert.strictEqual((await call('POST', '/api/loans', { body: { book_id: 6 }, token: reader })).body.error.code, 'already_borrowed');
  const loan = await call('POST', '/api/loans', { body: { book_id: 1, days: 7 }, token: reader });
  assert.strictEqual(loan.status, 201);
  assert.strictEqual(loan.body.status, 'active');
  assert.strictEqual((await call('POST', '/api/loans', { body: { book_id: 2 }, token: reader })).status, 201);
  const limit = await call('POST', '/api/loans', { body: { book_id: 3 }, token: reader });
  assert.strictEqual(limit.body.error.code, 'loan_limit_reached');

  await call('POST', '/api/auth/register', { body: { name: 'Other', email: 'other@example.com', password: 'Password1' } });
  const other = await login('other@example.com', 'Password1');
  assert.strictEqual((await call('GET', `/api/loans/${loan.body.id}`, { token: other })).status, 404);
  assert.strictEqual((await call('GET', '/api/loans?user_id=2', { token: other })).status, 403);

  const returned = await call('POST', `/api/loans/${loan.body.id}/return`, { token: reader });
  assert.strictEqual(returned.body.status, 'returned');
  assert.strictEqual((await call('POST', `/api/loans/${loan.body.id}/return`, { token: reader })).status, 409);
});
