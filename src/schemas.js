// OpenAPI component schemas. The same objects drive request validation and /openapi.json,
// so the documentation cannot drift from what the server enforces.

const GENRES = ['fiction', 'non-fiction', 'science', 'history', 'technology', 'children', 'other'];
const NOT_BLANK = '\\S';
const timestamp = { type: 'string', format: 'date-time', example: '2026-10-10T09:30:00.000Z' };

const bookFields = {
  title: { type: 'string', minLength: 1, maxLength: 200, pattern: NOT_BLANK, example: 'Clean Code' },
  author: { type: 'string', minLength: 1, maxLength: 120, pattern: NOT_BLANK, example: 'Robert C. Martin' },
  isbn: {
    type: 'string',
    pattern: '^(97[89])?\\d{9}[\\dX]$',
    description: 'ISBN-10 or ISBN-13, digits only (no hyphens). Must be unique.',
    example: '9780132350884',
  },
  genre: { type: 'string', enum: GENRES, example: 'technology' },
  published_year: { type: 'integer', minimum: 1450, maximum: 2100, example: 2008 },
  total_copies: { type: 'integer', minimum: 0, maximum: 1000, example: 3 },
};

const components = {
  Error: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', example: 'validation_error' },
          message: { type: 'string', example: 'Request validation failed' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              required: ['field', 'message'],
              properties: {
                field: { type: 'string', example: 'body.email' },
                message: { type: 'string', example: 'must be a valid email address' },
              },
            },
          },
        },
      },
    },
  },
  Health: {
    type: 'object',
    required: ['status', 'timestamp', 'uptime_seconds'],
    properties: {
      status: { type: 'string', enum: ['ok'] },
      timestamp,
      uptime_seconds: { type: 'integer', minimum: 0 },
    },
  },
  RegisterIn: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'email', 'password'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100, pattern: NOT_BLANK, example: 'Test User' },
      email: { type: 'string', format: 'email', maxLength: 254, description: 'Unique, case-insensitive.', example: 'test.user@example.com' },
      password: { type: 'string', minLength: 8, maxLength: 128, example: 'Secret@123' },
    },
  },
  LoginIn: {
    type: 'object',
    additionalProperties: false,
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 254, example: 'reader@library.test' },
      password: { type: 'string', minLength: 1, maxLength: 128, example: 'Reader@123' },
    },
  },
  TokenOut: {
    type: 'object',
    required: ['access_token', 'token_type', 'expires_in', 'user'],
    properties: {
      access_token: { type: 'string' },
      token_type: { type: 'string', enum: ['bearer'] },
      expires_in: { type: 'integer', description: 'Seconds until the token expires.', example: 3600 },
      user: { $ref: '#/components/schemas/UserOut' },
    },
  },
  UserOut: {
    type: 'object',
    required: ['id', 'name', 'email', 'role', 'created_at'],
    properties: {
      id: { type: 'integer', minimum: 1 },
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      role: { type: 'string', enum: ['admin', 'member'] },
      created_at: timestamp,
    },
  },
  BookIn: {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(bookFields),
    properties: bookFields,
  },
  BookPatch: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: bookFields,
  },
  BookOut: {
    type: 'object',
    required: ['id', ...Object.keys(bookFields), 'available_copies', 'created_at', 'updated_at'],
    properties: {
      id: { type: 'integer', minimum: 1 },
      ...bookFields,
      available_copies: { type: 'integer', minimum: 0, description: 'total_copies minus copies currently on loan.' },
      created_at: timestamp,
      updated_at: timestamp,
    },
  },
  BookList: {
    type: 'object',
    required: ['items', 'total', 'limit', 'offset'],
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/BookOut' } },
      total: { type: 'integer', minimum: 0, description: 'Number of matches before paging.' },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    },
  },
  LoanIn: {
    type: 'object',
    additionalProperties: false,
    required: ['book_id'],
    properties: {
      book_id: { type: 'integer', minimum: 1, example: 2 },
      days: { type: 'integer', minimum: 1, maximum: 30, default: 14, description: 'Loan length in days.' },
    },
  },
  LoanOut: {
    type: 'object',
    required: ['id', 'book_id', 'user_id', 'status', 'borrowed_at', 'due_at', 'returned_at'],
    properties: {
      id: { type: 'integer', minimum: 1 },
      book_id: { type: 'integer', minimum: 1 },
      user_id: { type: 'integer', minimum: 1 },
      status: {
        type: 'string',
        enum: ['active', 'overdue', 'returned'],
        description: 'overdue = not returned and due_at is in the past.',
      },
      borrowed_at: timestamp,
      due_at: timestamp,
      returned_at: { ...timestamp, nullable: true },
    },
  },
  LoanList: {
    type: 'object',
    required: ['items', 'total', 'limit', 'offset'],
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/LoanOut' } },
      total: { type: 'integer', minimum: 0 },
      limit: { type: 'integer' },
      offset: { type: 'integer' },
    },
  },
};

module.exports = { components, GENRES };
