const { ref, ok } = require('./helpers');

const startedAt = Date.now();

const system = [
  {
    method: 'GET',
    path: '/health',
    operationId: 'health',
    tag: 'System',
    summary: 'Health check',
    responses: { 200: ok('Service is up', ref('Health')) },
    handler() {
      return {
        status: 200,
        body: { status: 'ok', timestamp: new Date().toISOString(), uptime_seconds: Math.floor((Date.now() - startedAt) / 1000) },
      };
    },
  },
];

module.exports = [...system, ...require('./auth'), ...require('./books'), ...require('./loans')];
