const app = require('../src/app');
const { createHttpClient } = require('./helpers/http-client');
const request = createHttpClient(app);

describe('Citations Endpoints', () => {
  const WORK_WITH_CITATIONS = 22; // Work ID that has citation data
  const WORK_WITHOUT_DATA = 999999; // Non-existent work ID
  
  describe('GET /works/:id/citations', () => {
    it('should return citations for a work with valid structure', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/citations`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('work_id', WORK_WITH_CITATIONS);
      expect(res.body.data).toHaveProperty('citing_works');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.data).toHaveProperty('filters');
      expect(Array.isArray(res.body.data.citing_works)).toBe(true);
      expect(res.body.meta.request.path).toContain(`/works/${WORK_WITH_CITATIONS}/citations`);
      
      // Validate citation structure
      if (res.body.data.citing_works.length > 0) {
        const citation = res.body.data.citing_works[0];
        expect(citation).toHaveProperty('citing_work_id');
        expect(citation).toHaveProperty('title');
        expect(citation).toHaveProperty('type');
        expect(citation).toHaveProperty('authors_count');
        expect(citation).toHaveProperty('citation');
        expect(citation.citation).toHaveProperty('type');
      }
    });

    it('should handle citation type filter', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/citations?type=NEUTRAL`)
        .expect(200);

      expect(res.body.data.filters).toHaveProperty('type', 'NEUTRAL');
    });

    it('should validate citation type', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/citations?type=INVALID`)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message');
    });

    it('should handle pagination with standard format', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/citations?page=1&limit=2`)
        .expect(200);

      expect(res.body.pagination).toHaveProperty('page', 1);
      expect(res.body.pagination).toHaveProperty('limit', 2);
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('totalPages');
      expect(res.body.pagination).toHaveProperty('hasNext');
      expect(res.body.pagination).toHaveProperty('hasPrev');
    });

    it('should return empty results for work without citations', async () => {
      const res = await request()
        .get('/works/1/citations')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data.citing_works).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });
  });

  describe('GET /works/:id/references', () => {
    it('should return references made by a work', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/references`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('work_id', WORK_WITH_CITATIONS);
      expect(res.body.data).toHaveProperty('referenced_works');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data.referenced_works)).toBe(true);
      expect(res.body.meta.request.path).toContain(`/works/${WORK_WITH_CITATIONS}/references`);
      
      // Validate reference structure
      if (res.body.data.referenced_works.length > 0) {
        const reference = res.body.data.referenced_works[0];
        expect(reference).toHaveProperty('cited_work_id');
        expect(reference).toHaveProperty('title');
        expect(reference).toHaveProperty('type');
        expect(reference).toHaveProperty('authors_count');
        expect(reference).toHaveProperty('citation');
      }
    });
  });

  describe('GET /works/:id/metrics', () => {
    it('should return metrics with standard envelope (no crashes)', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/metrics`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('work_id', WORK_WITH_CITATIONS);
      expect(res.body.data).toHaveProperty('citation_metrics');
    });

    it('should return 404 for non-existent work', async () => {
      const res = await request()
        .get(`/works/${WORK_WITHOUT_DATA}/metrics`)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
    });
  });

  describe('GET /works/:id/network', () => {
    it('should build citation network (fallback if needed) without crashing', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/network`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('network_stats');
      expect(res.body.data).toHaveProperty('edges');
    });

    it('should handle depth parameter', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/network?depth=2`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
    });

    it('should validate depth parameter limits', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/network?depth=5`)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
    });
  });

  describe('Parameter Validation', () => {
    it('should validate work ID format', async () => {
      const res = await request()
        .get('/works/invalid/citations')
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message');
    });

    it('should validate pagination parameters', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/citations?page=0&limit=1000`)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('message');
    });
    
    it('should handle context truncation correctly', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/citations`)
        .expect(200);

      if (res.body.data.citing_works.length > 0) {
        const citation = res.body.data.citing_works[0];
        if (citation.citation.context) {
          expect(citation.citation.context.length).toBeLessThanOrEqual(203); // 200 chars + '...' = 203
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle works with citations but no references', async () => {
      // Test with a work that has incoming citations but no outgoing references
      const res = await request()
        .get('/works/2390919/references') // This work is cited by work 22
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('referenced_works');
      expect(Array.isArray(res.body.data.referenced_works)).toBe(true);
    });

    it('should return consistent network stats', async () => {
      const res = await request()
        .get(`/works/${WORK_WITH_CITATIONS}/network?depth=1`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('network_stats');
    });
  });
});
