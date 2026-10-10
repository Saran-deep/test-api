// Builds the OpenAPI 3.0 document from the route table and the component schemas.
const { components } = require('./schemas');
const { err } = require('./routes/helpers');

function response({ description, schema }) {
  return schema ? { description, content: { 'application/json': { schema } } } : { description };
}

function buildSpec(routes, serverUrl) {
  const paths = {};
  for (const route of routes) {
    const responses = { ...route.responses };
    if (route.body) {
      responses[400] = err('Malformed JSON body');
      responses[415] = err('Content-Type is not application/json');
    }
    if (route.auth) responses[401] = err('Missing, invalid or expired bearer token');
    if (route.auth === 'admin') responses[403] = err('Admin role required');
    if (route.body || (route.params || []).length) responses[422] = err('Request validation failed');

    const operation = {
      operationId: route.operationId,
      summary: route.summary,
      ...(route.description && { description: route.description }),
      tags: [route.tag],
      ...(route.auth && { security: [{ bearerAuth: [] }] }),
      parameters: (route.params || []).map(({ name, in: location, required, description, schema }) => ({
        name,
        in: location,
        required: location === 'path' || !!required,
        ...(description && { description }),
        schema,
      })),
      ...(route.body && { requestBody: { required: true, content: { 'application/json': { schema: route.body } } } }),
      responses: Object.fromEntries(
        Object.keys(responses).sort().map((code) => [code, response(responses[code])]),
      ),
    };
    paths[route.path] = { ...paths[route.path], [route.method.toLowerCase()]: operation };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Library API',
      version: '1.0.0',
      description:
        'Demo library-management API for practising API testing. Data is stored in JSON files.\n\n' +
        'Seed accounts: `admin@library.test` / `Admin@123` (admin) and `reader@library.test` / `Reader@123` (member).',
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'System' },
      { name: 'Auth', description: 'Registration and bearer-token login' },
      { name: 'Books', description: 'Catalogue. Reading is public; changes need the admin role.' },
      { name: 'Loans', description: 'Borrowing and returning books' },
    ],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      schemas: components,
    },
  };
}

module.exports = { buildSpec };
