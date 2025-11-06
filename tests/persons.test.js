const app = require('../src/app');
const { createHttpClient } = require('./helpers/http-client');
const request = createHttpClient(app);
const { expectSuccessEnvelope, expectStandardError } = require('./helpers/expectations');

describe('Persons API', () => {
  describe('GET /persons', () => {
    it('should return paginated list of persons', async () => {
      const res = await request()
        .get('/persons')
        .expect(200)
        .expect('Content-Type', /json/);

      expectSuccessEnvelope(res.body, { paginated: true, meta: ['pagination_extras', 'engine', 'query_type'] });
      expect(res.body.data.length).toBeLessThanOrEqual(20);
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty('identifiers');
        expect(res.body.data[0].identifiers).toHaveProperty('orcid');
      }
    });

    it('should accept search parameter', async () => {
      const res = await request()
        .get('/persons?search=silva')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    });

    it('should accept verified filter', async () => {
      const res = await request()
        .get('/persons?verified=true')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      if (res.body.data.length > 0) {
        expect(res.body.data[0].is_verified).toBe(true);
      }
    });

    it('should accept signature search', async () => {
      const res = await request()
        .get('/persons?signature=silva')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    });

    it('should return 400 for invalid search length', async () => {
      const res = await request()
        .get('/persons?search=a')
        .expect(400);

      expectStandardError(res.body);
      expect(res.body.errors).toBeInstanceOf(Array);
    });
  });

  describe('GET /persons/:id', () => {
    it('should return person details for valid ID', async () => {
      const res = await request()
        .get('/persons/1')
        .expect(200);

      expectSuccessEnvelope(res.body, { dataType: 'object' });
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('preferred_name');
      expect(res.body.data).toHaveProperty('identifiers');
      expect(res.body.data).toHaveProperty('metrics');
      expect(res.body.data).toHaveProperty('recent_works');
      expect(res.body.data.identifiers).toHaveProperty('orcid');
      expect(res.body.data.metrics).toHaveProperty('works_count');
      expect(Array.isArray(res.body.data.recent_works)).toBe(true);
    });

    it('should return 400 for invalid ID format', async () => {
      const res = await request()
        .get('/persons/invalid')
        .expect(400);

      expectStandardError(res.body);
      expect(res.body.errors).toBeInstanceOf(Array);
    });

    it('should return 404 for non-existent ID', async () => {
      const res = await request()
        .get('/persons/999999999')
        .expect(404);

      expectStandardError(res.body);
      expect(res.body).toHaveProperty('message');
    });
  });
});
