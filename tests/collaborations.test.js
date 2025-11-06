const app = require('../src/app');
const { createHttpClient } = require('./helpers/http-client');
const request = createHttpClient(app);
const { sequelize } = require('../src/models');

describe('Collaborations Endpoints', () => {
  describe('GET /persons/:id/collaborators', () => {
    it('should return collaborators for a person', async () => {
      const res = await request()
        .get('/persons/1/collaborators')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('person_id', 1);
      expect(res.body.data).toHaveProperty('collaborators');
      expect(res.body.data).toHaveProperty('pagination');
      expect(res.body.data).toHaveProperty('filters');
      expect(res.body.data).toHaveProperty('summary');
      expect(Array.isArray(res.body.data.collaborators)).toBe(true);
      expect(res.body.meta).toHaveProperty('source', 'collaboration_analysis');
    });

    it('should handle min_collaborations filter', async () => {
      const res = await request()
        .get('/persons/1/collaborators?min_collaborations=5')
        .expect(200);

      expect(res.body.data.filters).toHaveProperty('min_collaborations', 5);
    });

    it('should validate min_collaborations range', async () => {
      const res = await request()
        .get('/persons/1/collaborators?min_collaborations=100')
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
    });

    it('should handle sort_by parameter', async () => {
      const res = await request()
        .get('/persons/1/collaborators?sort_by=latest_collaboration_year')
        .expect(200);

      expect(res.body.data.filters).toHaveProperty('sort_by', 'latest_collaboration_year');
    });

    it('should validate sort_by parameter', async () => {
      const res = await request()
        .get('/persons/1/collaborators?sort_by=invalid')
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
    });
  });

  describe('GET /persons/:id/network', () => {
    it('should return collaboration network', async () => {
      const res = await request()
        .get('/persons/1/network')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('central_person_id', 1);
      expect(res.body.data).toHaveProperty('network_depth', 2);
      expect(res.body.data).toHaveProperty('nodes');
      expect(res.body.data).toHaveProperty('edges');
      expect(res.body.data).toHaveProperty('network_stats');
      expect(Array.isArray(res.body.data.edges)).toBe(true);
      expect(res.body.meta).toHaveProperty('source', 'network_analysis');
    });

    it('should handle depth parameter', async () => {
      const res = await request()
        .get('/persons/1/network?depth=1')
        .expect(200);

      expect(res.body.data).toHaveProperty('network_depth', 1);
    });

    it('should validate depth range', async () => {
      const res = await request()
        .get('/persons/1/network?depth=4')
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
    });
  });

  describe('GET /collaborations/top', () => {
    it('should return top collaborations', async () => {
      const res = await request()
        .get('/collaborations/top')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('top_collaborations');
      expect(res.body.data).toHaveProperty('summary');
      expect(Array.isArray(res.body.data.top_collaborations)).toBe(true);
      expect(res.body.meta).toHaveProperty('source', 'collaboration_ranking');
    });

    it('should handle year filters', async () => {
      const res = await request()
        .get('/collaborations/top?year_from=2020&year_to=2024')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
    });

    it('should validate year range', async () => {
      const res = await request()
        .get('/collaborations/top?year_from=1800')
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
    });

    it('should handle min_collaborations parameter', async () => {
      const res = await request()
        .get('/collaborations/top?min_collaborations=10')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
    });
  });

  describe('Parameter Validation', () => {
    let nonExistentPersonId = 999999999;
    beforeAll(async () => {
      try {
        const [rows] = await sequelize.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM persons');
        const maxId = rows && rows[0] && rows[0].max_id ? parseInt(rows[0].max_id) : 0;
        nonExistentPersonId = (Number.isFinite(maxId) ? maxId : 0) + 100000;
      } catch (_) {
        nonExistentPersonId = 2147483647;
      }
    });
    it('should validate person ID format', async () => {
      const res = await request()
        .get('/persons/invalid/collaborators')
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('errors');
    });

    it('should handle non-existent person', async () => {
      const res = await request()
        .get(`/persons/${nonExistentPersonId}/collaborators`)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
    });

    it('should validate pagination limits', async () => {
      const res = await request()
        .get('/persons/1/collaborators?limit=200')
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
    });
  });

  describe('Performance Tests', () => {
    it('should respond quickly to collaboration queries', async () => {
      const startTime = Date.now();
      
      await request()
        .get('/persons/1/collaborators?limit=10')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(10000); // 10 seconds max
    });

    it('should handle network analysis efficiently', async () => {
      const startTime = Date.now();
      
      await request()
        .get('/persons/1/network?depth=1')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(15000); // 15 seconds max for network analysis
    });
  });
});
