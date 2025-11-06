const app = require('../src/app');
const { createHttpClient } = require('./helpers/http-client');

const request = createHttpClient(app);

const INTERNAL_ACCESS_KEY = process.env.INTERNAL_ACCESS_KEY || 'test-internal-key';

const withAccessKey = (req) => req.set('x-access-key', INTERNAL_ACCESS_KEY);

describe('Health Endpoints', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await withAccessKey(request()
        .get('/health'))
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('timestamp');
      expect(res.body.data).toHaveProperty('uptime');
      expect(res.body.data).toHaveProperty('version');
      expect(res.body.data).toHaveProperty('services');
      expect(res.body.data.services).toHaveProperty('database');
      expect(res.body.data.services).toHaveProperty('cache');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const res = await withAccessKey(request()
        .get('/health/ready'))
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('ready');
      expect(res.body.data.ready).toBe(true);
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', async () => {
      const res = await request()
        .get('/health/live')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body).toMatchObject({
        status: 'success',
        data: {
          alive: true,
          timestamp: expect.any(String)
        }
      });
    });
  });
});
