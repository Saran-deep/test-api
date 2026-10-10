const { createServer } = require('./src/app');
const { seed } = require('./src/seed');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

seed({ force: false }); // creates data/*.json on first start only

createServer().listen(PORT, HOST, () => {
  console.log(`Library API listening on http://${HOST}:${PORT}`);
  console.log(`  Swagger UI:   http://${HOST}:${PORT}/docs`);
  console.log(`  OpenAPI spec: http://${HOST}:${PORT}/openapi.json`);
});
