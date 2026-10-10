const HttpError = require('../http-error');
const { users } = require('../store');
const auth = require('../auth');
const { ref, ok, noContent, err } = require('./helpers');

module.exports = [
  {
    method: 'POST',
    path: '/api/auth/register',
    operationId: 'register',
    tag: 'Auth',
    summary: 'Register a new member account',
    body: ref('RegisterIn'),
    responses: {
      201: ok('Account created', ref('UserOut')),
      409: err('Email address is already registered'),
    },
    handler({ body }) {
      const email = body.email.toLowerCase();
      if (users.find((u) => u.email === email)) {
        throw new HttpError(409, 'email_taken', 'An account with this email already exists');
      }
      const user = users.insert({
        name: body.name.trim(),
        email,
        role: 'member',
        password_hash: auth.hashPassword(body.password),
        created_at: new Date().toISOString(),
      });
      return { status: 201, body: auth.publicUser(user) };
    },
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    operationId: 'login',
    tag: 'Auth',
    summary: 'Log in and receive a bearer token',
    description: `Tokens are valid for ${auth.TOKEN_TTL_SECONDS} seconds. Send them as \`Authorization: Bearer <token>\`.`,
    body: ref('LoginIn'),
    responses: {
      200: ok('Logged in', ref('TokenOut')),
      401: err('Email or password is wrong'),
    },
    handler({ body }) {
      const user = users.find((u) => u.email === body.email.toLowerCase());
      if (!user || !auth.verifyPassword(body.password, user.password_hash)) {
        throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');
      }
      return {
        status: 200,
        body: {
          access_token: auth.issueToken(user.id),
          token_type: 'bearer',
          expires_in: auth.TOKEN_TTL_SECONDS,
          user: auth.publicUser(user),
        },
      };
    },
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    operationId: 'logout',
    tag: 'Auth',
    summary: 'Revoke the current bearer token',
    auth: 'user',
    responses: { 204: noContent('Token revoked') },
    handler({ req }) {
      auth.revokeToken(auth.bearerToken(req));
      return { status: 204 };
    },
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    operationId: 'getCurrentUser',
    tag: 'Auth',
    summary: 'Get the logged-in user',
    auth: 'user',
    responses: { 200: ok('The current user', ref('UserOut')) },
    handler({ user }) {
      return { status: 200, body: auth.publicUser(user) };
    },
  },
];
