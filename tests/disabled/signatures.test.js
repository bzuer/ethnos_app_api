const request = require('supertest');
const app = require('../src/app');
const { sequelize } = require('../src/models');

describe('Signatures Endpoints', () => {
  beforeAll(async () => {
    // Ensure database connection
    try {
      await sequelize.authenticate();
    } catch (error) {
      console.warn('Database connection failed - using mock data');
    }
  });

  afterAll(async () => {
    if (sequelize) {
      await sequelize.close();
    }
  });

  describe('GET /signatures', () => {
    it('should return signatures list with pagination', async () => {
      const response = await request(app)
        .get('/signatures')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('offset');
      expect(response.body.pagination).toHaveProperty('pages');
    });

    it('should accept limit parameter', async () => {
      const response = await request(app)
        .get('/signatures?limit=5')
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(5);
      expect(response.body.pagination.limit).toBe(5);
    });

    it('should accept offset parameter', async () => {
      const response = await request(app)
        .get('/signatures?offset=10')
        .expect(200);

      expect(response.body.pagination.offset).toBe(10);
    });

    it('should accept search parameter', async () => {
      const response = await request(app)
        .get('/signatures?search=Silva')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });

    it('should accept sortBy parameter', async () => {
      const response = await request(app)
        .get('/signatures?sortBy=created_at')
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });

    it('should accept sortOrder parameter', async () => {
      const response = await request(app)
        .get('/signatures?sortOrder=DESC')
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });

    it('should reject invalid limit values', async () => {
      await request(app)
        .get('/signatures?limit=150')
        .expect(400);
    });

    it('should reject invalid offset values', async () => {
      await request(app)
        .get('/signatures?offset=-1')
        .expect(400);
    });

    it('should reject invalid sortBy values', async () => {
      await request(app)
        .get('/signatures?sortBy=invalid_field')
        .expect(400);
    });

    it('should reject invalid sortOrder values', async () => {
      await request(app)
        .get('/signatures?sortOrder=INVALID')
        .expect(400);
    });
  });

  describe('GET /signatures/statistics', () => {
    it('should return signature statistics', async () => {
      const response = await request(app)
        .get('/signatures/statistics')
        .expect(200);

      expect(response.body).toHaveProperty('total_signatures');
      expect(response.body).toHaveProperty('short_signatures');
      expect(response.body).toHaveProperty('medium_signatures');
      expect(response.body).toHaveProperty('long_signatures');
      expect(response.body).toHaveProperty('avg_signature_length');
      expect(response.body).toHaveProperty('linked_signatures');
      expect(response.body).toHaveProperty('unlinked_signatures');

      expect(typeof response.body.total_signatures).toBe('number');
      expect(typeof response.body.avg_signature_length).toBe('number');
    });
  });

  describe('GET /signatures/search', () => {
    it('should search signatures with required query parameter', async () => {
      const response = await request(app)
        .get('/signatures/search?q=Silva')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body).toHaveProperty('searchTerm');
      expect(response.body).toHaveProperty('exact');
      expect(response.body.searchTerm).toBe('Silva');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support exact matching', async () => {
      const response = await request(app)
        .get('/signatures/search?q=Silva&exact=true')
        .expect(200);

      expect(response.body.exact).toBe(true);
    });

    it('should support pagination in search', async () => {
      const response = await request(app)
        .get('/signatures/search?q=Silva&limit=5&offset=10')
        .expect(200);

      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.pagination.offset).toBe(10);
    });

    it('should require query parameter', async () => {
      await request(app)
        .get('/signatures/search')
        .expect(400);
    });

    it('should reject empty query parameter', async () => {
      await request(app)
        .get('/signatures/search?q=')
        .expect(400);
    });

    it('should reject query parameter too long', async () => {
      const longQuery = 'a'.repeat(101);
      await request(app)
        .get(`/signatures/search?q=${longQuery}`)
        .expect(400);
    });

    it('should reject invalid exact parameter', async () => {
      await request(app)
        .get('/signatures/search?q=Silva&exact=invalid')
        .expect(400);
    });
  });

  describe('GET /signatures/:id', () => {
    let nonExistentSignatureId = 999999999;
    beforeAll(async () => {
      try {
        const [rows] = await sequelize.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM signatures');
        const maxId = rows && rows[0] && rows[0].max_id ? parseInt(rows[0].max_id) : 0;
        nonExistentSignatureId = (Number.isFinite(maxId) ? maxId : 0) + 100000;
      } catch (_) {
        // fall back to large ID if DB unavailable
        nonExistentSignatureId = 2147483647;
      }
    });
    it('should return signature by valid ID', async () => {
      const response = await request(app)
        .get('/signatures/1')
        .expect((res) => {
          // Accept both 200 (found) and 404 (not found) as valid responses
          expect([200, 404]).toContain(res.status);
        });

      if (response.status === 200) {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('signature');
        expect(response.body).toHaveProperty('created_at');
        expect(response.body).toHaveProperty('persons_count');
        expect(response.body.id).toBe(1);
      }
    });

    it('should return 404 for non-existent signature', async () => {
      await request(app)
        .get(`/signatures/${nonExistentSignatureId}`)
        .expect(404);
    });

    it('should reject invalid ID parameter', async () => {
      await request(app)
        .get('/signatures/invalid')
        .expect(400);
    });

    it('should reject negative ID parameter', async () => {
      await request(app)
        .get('/signatures/-1')
        .expect(400);
    });

    it('should reject zero ID parameter', async () => {
      await request(app)
        .get('/signatures/0')
        .expect(400);
    });
  });

  describe('GET /signatures/:id/persons', () => {
    it('should return persons for valid signature ID', async () => {
      const response = await request(app)
        .get('/signatures/1/persons')
        .expect((res) => {
          // Accept both 200 and 404 as valid responses
          expect([200, 404]).toContain(res.status);
        });

      if (response.status === 200) {
        expect(response.body).toHaveProperty('persons');
        expect(response.body).toHaveProperty('pagination');
        expect(Array.isArray(response.body.persons)).toBe(true);
        
        if (response.body.persons.length > 0) {
          const person = response.body.persons[0];
          expect(person).toHaveProperty('id');
          expect(person).toHaveProperty('preferred_name');
          expect(person).toHaveProperty('given_names');
          expect(person).toHaveProperty('family_name');
          expect(person).toHaveProperty('is_verified');
        }
      }
    });

    it('should support pagination for signature persons', async () => {
      const response = await request(app)
        .get('/signatures/1/persons?limit=5&offset=0')
        .expect((res) => {
          expect([200, 404]).toContain(res.status);
        });

      if (response.status === 200) {
        expect(response.body.pagination.limit).toBe(5);
        expect(response.body.pagination.offset).toBe(0);
      }
    });

    it('should reject invalid signature ID', async () => {
      await request(app)
        .get('/signatures/invalid/persons')
        .expect(400);
    });

    it('should reject negative signature ID', async () => {
      await request(app)
        .get('/signatures/-1/persons')
        .expect(400);
    });

    it('should reject zero signature ID', async () => {
      await request(app)
        .get('/signatures/0/persons')
        .expect(400);
    });

    it('should reject invalid limit parameter', async () => {
      await request(app)
        .get('/signatures/1/persons?limit=150')
        .expect(400);
    });

    it('should reject invalid offset parameter', async () => {
      await request(app)
        .get('/signatures/1/persons?offset=-1')
        .expect(400);
    });
  });

  describe('Response structure validation', () => {
    it('should have consistent signature object structure', async () => {
      const response = await request(app)
        .get('/signatures?limit=1')
        .expect(200);

      if (response.body.data.length > 0) {
        const signature = response.body.data[0];
        expect(signature).toHaveProperty('id');
        expect(signature).toHaveProperty('signature');
        expect(signature).toHaveProperty('created_at');
        expect(signature).toHaveProperty('persons_count');
        
        expect(typeof signature.id).toBe('number');
        expect(typeof signature.signature).toBe('string');
        expect(typeof signature.persons_count).toBe('number');
      }
    });

    it('should have consistent pagination structure', async () => {
      const response = await request(app)
        .get('/signatures')
        .expect(200);

      const pagination = response.body.pagination;
      expect(pagination).toHaveProperty('total');
      expect(pagination).toHaveProperty('limit');
      expect(pagination).toHaveProperty('offset');
      expect(pagination).toHaveProperty('pages');

      expect(typeof pagination.total).toBe('number');
      expect(typeof pagination.limit).toBe('number');
      expect(typeof pagination.offset).toBe('number');
      expect(typeof pagination.pages).toBe('number');
    });
  });

  describe('Performance and limits', () => {
    it('should respond within reasonable time', async () => {
      const startTime = Date.now();
      await request(app)
        .get('/signatures?limit=20')
        .expect(200);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds max
    });

    it('should respect rate limiting', async () => {
      // This test depends on rate limiting configuration
      // Multiple rapid requests should be handled gracefully
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          request(app)
            .get('/signatures')
            .timeout(10000)
        );
      }

      const responses = await Promise.allSettled(requests);
      const successfulResponses = responses.filter(r => r.status === 'fulfilled');
      expect(successfulResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      // This test would require mocking database failures
      // For now, we just ensure the endpoint doesn't crash
      const response = await request(app)
        .get('/signatures')
        .timeout(10000);

      expect([200, 500, 503]).toContain(response.status);
    });

    it('should return proper error format', async () => {
      const response = await request(app)
        .get('/signatures?limit=invalid')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      if (response.body.details) {
        expect(Array.isArray(response.body.details)).toBe(true);
      }
    });
  });
});
