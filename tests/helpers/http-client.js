const supertest = require('supertest');

// Use supertest directly against the Express app instance to avoid binding sockets
// This prevents listen EPERM in sandboxed environments
function createHttpClient(app) {
  return () => supertest(app);
}

module.exports = { createHttpClient };
