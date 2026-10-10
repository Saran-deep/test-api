const crypto = require('crypto');
const { users, sessions } = require('./store');

const TOKEN_TTL_SECONDS = 3600;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [, salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function bearerToken(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  return match ? match[1] : null;
}

function issueToken(userId) {
  const now = Date.now();
  sessions.removeWhere((s) => Date.parse(s.expires_at) <= now); // housekeeping
  const token = crypto.randomBytes(32).toString('hex');
  sessions.insert({
    token,
    user_id: userId,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
  return token;
}

function revokeToken(token) {
  sessions.removeWhere((s) => s.token === token);
}

function userFromRequest(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const session = sessions.find((s) => s.token === token);
  if (!session || Date.parse(session.expires_at) <= Date.now()) return null;
  return users.get(session.user_id);
}

function publicUser(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

module.exports = {
  TOKEN_TTL_SECONDS,
  hashPassword,
  verifyPassword,
  bearerToken,
  issueToken,
  revokeToken,
  userFromRequest,
  publicUser,
};
