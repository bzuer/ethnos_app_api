const supertest = require('supertest');

function createHttpClient(app) {
  return () => supertest(app);
}

module.exports = { createHttpClient };
