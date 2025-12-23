const app = require('./helpers/test-app');
const { createHttpClient } = require('./helpers/http-client');
const request = createHttpClient(app);
const { expectSuccessEnvelope, expectStandardError } = require('./helpers/expectations');

describe('Search API', () => {
  const sphinxIntegration = process.env.JEST_ENABLE_SPHINX === '1';
  describe('GET /search/works', () => {
    it('should return fulltext search results for works', async () => {
      const res = await request()
        .get('/search/works?q=machine%20learning')
        .expect(200)
        .expect('Content-Type', /json/);

      expectSuccessEnvelope(res.body, { paginated: true, meta: ['query', 'search_type', 'performance'] });
      expect(res.body.meta.performance).toHaveProperty('engine');
      expect(res.body.meta.performance).toHaveProperty('controller_time_ms');
      expect(Array.isArray(res.body.data)).toBe(true);
      
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty('id');
        expect(res.body.data[0]).toHaveProperty('title');
        expect(res.body.data[0]).toHaveProperty('type');
        expect(res.body.data[0]).toHaveProperty('publication_year');
        expect(res.body.data[0]).toHaveProperty('authors_preview');
        expect(res.body.data[0]).toHaveProperty('relevance');
      }
    });

    it('should accept filters (type, language, year)', async () => {
      const res = await request()
        .get('/search/works?q=test&type=ARTICLE&language=en&year_from=2020')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true, meta: ['query', 'search_type', 'performance'] });
      expect(res.body.meta.query).toBe('test');
    });

    it('should return 400 for missing query', async () => {
      const res = await request()
        .get('/search/works')
        .expect(400);

      expectStandardError(res.body);
    });

    it('should return 400 for query too short', async () => {
      const res = await request()
        .get('/search/works?q=a')
        .expect(400);

      expectStandardError(res.body);
    });
  });

  describe('GET /search/persons', () => {
    it('should return fulltext search results for persons', async () => {
      const res = await request()
        .get('/search/persons?q=silva')
        .expect(200)
        .expect('Content-Type', /json/);

      expectSuccessEnvelope(res.body, { paginated: true, meta: ['query', 'search_type', 'performance'] });
      expect(Array.isArray(res.body.data)).toBe(true);
      
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty('id');
        expect(res.body.data[0]).toHaveProperty('preferred_name');
        expect(res.body.data[0]).toHaveProperty('metrics');
      }
    });

    it('should accept verified filter', async () => {
      const res = await request()
        .get('/search/persons?q=silva&verified=true')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true, meta: ['query', 'search_type', 'performance'] });
      expect(res.body.meta.query).toBe('silva');
    });
  });

  describe('GET /search/organizations', () => {
    it('should return 404 for disabled organizations search', async () => {
      const res = await request()
        .get('/search/organizations?q=universidade')
        .expect(404);

      expect(res.body.message).toContain('find');
    });
  });

  describe('GET /search/global', () => {
    it('should return combined search results', async () => {
      const res = await request()
        .get('/search/global?q=artificial%20intelligence')
        .expect(200)
        .expect('Content-Type', /json/);

      expectSuccessEnvelope(res.body, { dataType: 'object', meta: ['query', 'controller_time_ms', 'sources'] });
      expect(res.body.data).toHaveProperty('works');
      expect(res.body.data).toHaveProperty('persons');
      expect(res.body.data).toHaveProperty('organizations');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toHaveProperty('query', 'artificial intelligence');
      expect(res.body.meta.sources).toHaveProperty('works');
      
      expect(res.body.data.works).toHaveProperty('total');
      expect(res.body.data.works).toHaveProperty('results');
      expect(res.body.data.persons).toHaveProperty('total');
      expect(res.body.data.persons).toHaveProperty('results');
      expect(res.body.data.organizations).toHaveProperty('total');
      expect(res.body.data.organizations).toHaveProperty('results');
      
      expect(Array.isArray(res.body.data.works.results)).toBe(true);
      expect(Array.isArray(res.body.data.persons.results)).toBe(true);
      expect(Array.isArray(res.body.data.organizations.results)).toBe(true);
      
      expect(res.body.data.organizations.total).toBe(0);
      expect(res.body.data.organizations.results).toEqual([]);
    });

    it('should accept limit parameter', async () => {
      const res = await request()
        .get('/search/global?q=test&limit=3')
        .expect(200);

      expect(res.body.data.works.results.length).toBeLessThanOrEqual(3);
      expect(res.body.data.persons.results.length).toBeLessThanOrEqual(3);
      expect(res.body.data.organizations.results.length).toBe(0);
    });

    it('should return 400 for missing query', async () => {
      const res = await request()
        .get('/search/global')
        .expect(400);

      expectStandardError(res.body);
    });
  });

  describe('Performance Tests', () => {
    it('should complete fulltext search in reasonable time', async () => {
      const startTime = Date.now();
      
      const res = await request()
        .get('/search/works?q=machine%20learning')
        .expect(200);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const maxResponse = sphinxIntegration ? 5000 : 10000;
      const maxQueryMs = sphinxIntegration ? 1000 : 6000;

      expect(responseTime).toBeLessThan(maxResponse);
      expect(res.body.meta.performance.controller_time_ms).toBeLessThan(maxQueryMs);
    });

    it('should complete global search in reasonable time', async () => {
      const startTime = Date.now();
      
      const res = await request()
        .get('/search/global?q=artificial%20intelligence&limit=5')
        .expect(200);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const maxResponse = sphinxIntegration ? 10000 : 15000;
      const maxQueryMs = sphinxIntegration ? 2000 : 8000;

      expect(responseTime).toBeLessThan(maxResponse);
      expect(res.body.meta.controller_time_ms).toBeLessThan(maxQueryMs);
    });
  });
});
