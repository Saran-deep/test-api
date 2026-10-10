const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const ok = (description, schema) => ({ description, schema });
const noContent = (description) => ({ description });
const err = (description) => ({ description, schema: ref('Error') });

const idParam = (name, description) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'integer', minimum: 1 },
});

const pagingParams = [
  { name: 'limit', in: 'query', description: 'Page size.', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  { name: 'offset', in: 'query', description: 'Number of items to skip.', schema: { type: 'integer', minimum: 0, default: 0 } },
];

function page(items, { limit, offset }) {
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
}

module.exports = { ref, ok, noContent, err, idParam, pagingParams, page };
