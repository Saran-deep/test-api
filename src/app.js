const http = require('http');
const routes = require('./routes');
const auth = require('./auth');
const HttpError = require('./http-error');
const { validate, coerce } = require('./validate');
const { buildSpec } = require('./openapi');

const MAX_BODY_BYTES = 1024 * 1024;
const QUIET = process.env.QUIET === 'true';

const compiled = routes.map((route) => ({
  ...route,
  regex: new RegExp(`^${route.path.replace(/\{(\w+)\}/g, '(?<$1>[^/]+)')}$`),
}));

const DOCS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Library API docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#ui', persistAuthorization: true });</script>
</body></html>`;

function send(res, status, body, headers = {}) {
  if (body === undefined) {
    res.writeHead(status, headers);
    return res.end();
  }
  const isText = typeof body === 'string';
  res.writeHead(status, { 'Content-Type': isText ? 'text/html; charset=utf-8' : 'application/json', ...headers });
  res.end(isText ? body : JSON.stringify(body, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'payload_too_large', 'Request body must be at most 1 MB'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

async function parseInput(route, match, url, req) {
  const errors = [];
  const params = {};
  const query = {};

  for (const p of route.params || []) {
    const raw = p.in === 'path' ? safeDecode(match.groups[p.name]) : url.searchParams.get(p.name);
    const target = p.in === 'path' ? params : query;
    if (raw === null) {
      if (p.required) errors.push({ field: `${p.in}.${p.name}`, message: 'is required' });
      else if (p.schema.default !== undefined) target[p.name] = p.schema.default;
      continue;
    }
    const value = coerce(p.schema, raw);
    validate(p.schema, value, `${p.in}.${p.name}`, errors);
    target[p.name] = value;
  }

  let body;
  if (route.body) {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
      throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
    }
    const text = await readBody(req);
    if (!text.trim()) {
      errors.push({ field: 'body', message: 'is required' });
    } else {
      try {
        body = JSON.parse(text);
      } catch {
        throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON');
      }
      validate(route.body, body, 'body', errors);
    }
  }

  if (errors.length) throw new HttpError(422, 'validation_error', 'Request validation failed', errors);
  return { params, query, body };
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') return send(res, 204);
  if (req.method === 'GET' && pathname === '/openapi.json') return send(res, 200, buildSpec(routes, url.origin));
  if (req.method === 'GET' && pathname === '/docs') return send(res, 200, DOCS_HTML);
  if (req.method === 'GET' && pathname === '/') return send(res, 302, undefined, { Location: '/docs' });

  const candidates = compiled.filter((r) => r.regex.test(pathname));
  if (!candidates.length) throw new HttpError(404, 'not_found', `No route for ${pathname}`);
  const route = candidates.find((r) => r.method === req.method);
  if (!route) {
    const allow = candidates.map((r) => r.method).join(', ');
    throw Object.assign(new HttpError(405, 'method_not_allowed', `Use one of: ${allow}`), { headers: { Allow: allow } });
  }

  // Authentication is checked before input validation, so an anonymous caller always gets 401.
  let user = null;
  if (route.auth) {
    user = auth.userFromRequest(req);
    if (!user) throw new HttpError(401, 'unauthorized', 'A valid bearer token is required');
    if (route.auth === 'admin' && user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Admin role required');
  }

  const input = await parseInput(route, pathname.match(route.regex), url, req);
  const result = await route.handler({ req, user, ...input });
  send(res, result.status, result.body);
  return result.status;
}

function createServer() {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    try {
      await handle(req, res);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      const error = e instanceof HttpError ? e : new HttpError(500, 'internal_error', 'Unexpected server error');
      if (!res.headersSent) {
        send(res, error.status, { error: { code: error.code, message: error.message, ...(error.details && { details: error.details }) } }, error.headers);
      }
    }
    if (!QUIET) console.log(`${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started} ms)`);
  });
}

module.exports = { createServer };
