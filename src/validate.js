// Small JSON-schema validator covering the keywords used in schemas.js.
const { components } = require('./schemas');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolve(schema) {
  return schema.$ref ? components[schema.$ref.split('/').pop()] : schema;
}

function typeMatches(type, value) {
  switch (type) {
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    default: return typeof value === type;
  }
}

function validate(rawSchema, value, field, errors = []) {
  const schema = resolve(rawSchema);
  const fail = (message) => errors.push({ field, message });

  if (value === null) {
    if (!schema.nullable) fail('must not be null');
    return errors;
  }
  if (schema.type && !typeMatches(schema.type, value)) {
    fail(`must be of type ${schema.type}`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value)) fail(`must be one of: ${schema.enum.join(', ')}`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(`must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(`must be at most ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      fail(schema.pattern === '\\S' ? 'must not be blank' : `must match pattern ${schema.pattern}`);
    }
    if (schema.format === 'email' && !EMAIL.test(value)) fail('must be a valid email address');
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be <= ${schema.maximum}`);
  }

  if (schema.type === 'object') {
    const props = schema.properties || {};
    for (const key of schema.required || []) {
      if (value[key] === undefined) errors.push({ field: `${field}.${key}`, message: 'is required' });
    }
    if (schema.minProperties && Object.keys(value).length < schema.minProperties) {
      fail(`must contain at least ${schema.minProperties} field(s)`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (props[key]) validate(props[key], child, `${field}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push({ field: `${field}.${key}`, message: 'is not an allowed field' });
    }
  }

  if (schema.type === 'array' && schema.items) {
    value.forEach((item, i) => validate(schema.items, item, `${field}[${i}]`, errors));
  }
  return errors;
}

// Query and path values arrive as strings; convert them to the schema type when they look right,
// otherwise leave the string so validate() reports a type error.
function coerce(schema, raw) {
  switch (schema.type) {
    case 'integer':
      return /^-?\d+$/.test(raw) ? Number(raw) : raw;
    case 'number':
      return raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    case 'boolean':
      return raw === 'true' ? true : raw === 'false' ? false : raw;
    default:
      return raw;
  }
}

module.exports = { validate, coerce };
