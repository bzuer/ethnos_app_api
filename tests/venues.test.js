const app = require('../src/app');
const { testConnection } = require('../src/config/database');
const { expectSuccessEnvelope, expectStandardError } = require('./helpers/expectations');
const { createHttpClient } = require('./helpers/http-client');

const request = createHttpClient(app);

describe('Venues API', () => {
  beforeAll(async () => {
    await testConnection();
  }, 30000);

  describe('GET /venues', () => {
    it('should return a list of venues with pagination', async () => {
      const response = await request()
        .get('/venues')
        .expect(200);

      expectSuccessEnvelope(response.body, { paginated: true, meta: ['pagination_extras', 'includes'] });
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('totalPages');
      expect(response.body.pagination).toHaveProperty('hasNext');
      expect(response.body.pagination).toHaveProperty('hasPrev');

      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('pagination_extras');
      expect(response.body.meta.pagination_extras).toHaveProperty('offset');
      expect(response.body.meta).toHaveProperty('includes');
      expect(response.body.meta.includes).toMatchObject({
        legacy_metrics: false,
        subjects: true,
        terms: true,
        keywords: true
      });

      if (response.body.data.length > 0) {
        const venue = response.body.data[0];
        expect(venue).toHaveProperty('id');
        expect(venue).toHaveProperty('name');
        expect(venue).toHaveProperty('type');
        expect(['JOURNAL', 'CONFERENCE', 'REPOSITORY', 'BOOK_SERIES']).toContain(venue.type);
        expect(venue).toHaveProperty('works_count');
        expect(typeof venue.works_count).toBe('number');
        expect(venue).toHaveProperty('publisher');
        expect(venue.publisher).toHaveProperty('name');
        expect(venue).toHaveProperty('identifiers');
        expect(venue.identifiers).toHaveProperty('issn');
        expect(venue.identifiers).toHaveProperty('eissn');
        expect(venue.identifiers).toHaveProperty('external');
        expect(venue).toHaveProperty('subjects');
        expect(Array.isArray(venue.subjects)).toBe(true);
        expect(venue).toHaveProperty('terms');
        expect(Array.isArray(venue.terms)).toBe(true);
        expect(venue).toHaveProperty('keywords');
        expect(Array.isArray(venue.keywords)).toBe(true);
        // Metrics object no longer present
        expect(venue.metrics).toBeUndefined();
        expect(venue.legacy_metrics).toBeUndefined();
      }
    });

    it('should respect limit parameter', async () => {
      const response = await request()
        .get('/venues?limit=5')
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(5);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.meta.pagination_extras).toHaveProperty('offset');
    });

    it('should filter by venue type', async () => {
      const response = await request()
        .get('/venues?type=JOURNAL')
        .expect(200);

      if (response.body.data.length > 0) {
        response.body.data.forEach(venue => {
          expect(venue.type).toBe('JOURNAL');
        });
      }
    });

    it('should filter by search term', async () => {
      const response = await request()
        .get('/venues/search?q=journal')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      
      if (response.body.data.length > 0) {
        response.body.data.forEach(venue => {
          expect(venue.name.toLowerCase()).toContain('journal');
        });
      }
    });

    it('should sort venues by name', async () => {
      const response = await request()
        .get('/venues?sortBy=name&sortOrder=ASC&limit=10')
        .expect(200);

      if (response.body.data.length > 1) {
        for (let i = 1; i < response.body.data.length; i++) {
          expect(response.body.data[i-1].name.toLowerCase() <= response.body.data[i].name.toLowerCase()).toBe(true);
        }
      }
    });

    it('should return 400 for invalid limit', async () => {
      const response = await request()
        .get('/venues?limit=150')
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 for invalid type', async () => {
      const response = await request()
        .get('/venues?type=INVALID_TYPE')
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 for invalid sortBy', async () => {
      const response = await request()
        .get('/venues?sortBy=invalid_field')
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
    });

    it('should reject created_at sortBy (not allowed)', async () => {
      const response = await request()
        .get('/venues?sortBy=created_at')
        .expect(400);
      expect(response.body).toHaveProperty('status', 'error');
    });
  });

  describe('GET /venues/:id', () => {
    let venueId;

    beforeAll(async () => {
      // Get a venue ID from the list
      const response = await request()
        .get('/venues?limit=1');
      
      if (response.body.data.length > 0) {
        venueId = response.body.data[0].id;
      }
    });

    it('should return venue details by ID', async () => {
      if (!venueId) {
        console.log('No venues available, skipping test');
        return;
      }

      const response = await request()
        .get(`/venues/${venueId}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.data).toHaveProperty('id', venueId);
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('type');
      expect(response.body.data).toHaveProperty('works_count');
      expect(response.body.data).toHaveProperty('created_at');
      expect(response.body.data).toHaveProperty('updated_at');
      expect(response.body.data).toHaveProperty('publication_summary');
      expect(response.body.data.publication_summary).toHaveProperty('first_publication_year');
      expect(response.body.data.publication_summary).toHaveProperty('latest_publication_year');
      expect(response.body.data.publication_summary).toHaveProperty('publication_trend');
      expect(Array.isArray(response.body.data.publication_summary.publication_trend)).toBe(true);
      expect(response.body.data).toHaveProperty('top_subjects');
      expect(Array.isArray(response.body.data.top_subjects)).toBe(true);
      expect(response.body.data).toHaveProperty('subjects');
      expect(Array.isArray(response.body.data.subjects)).toBe(true);
      expect(response.body.data).toHaveProperty('terms');
      expect(Array.isArray(response.body.data.terms)).toBe(true);
      expect(response.body.data).toHaveProperty('keywords');
      expect(Array.isArray(response.body.data.keywords)).toBe(true);
      // Metrics object removed
      expect(response.body.data.metrics).toBeUndefined();
      expect(response.body.data).toHaveProperty('publisher');
      expect(response.body.meta).toHaveProperty('includes');
      expect(response.body.meta.includes).toMatchObject({
        subjects: true,
        terms: true,
        keywords: true,
        yearly_stats: false,
        top_authors: false,
        legacy_metrics: false
      });
    });

    it('should return 404 for non-existent venue', async () => {
      const response = await request()
        .get('/venues/999999')
        .expect(404);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 for invalid venue ID format', async () => {
      const response = await request()
        .get('/venues/invalid-id')
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Consistency', () => {
    it('roundtrip IDs from list to details returns 200 and matching IDs', async () => {
      const list = await request()
        .get('/venues?limit=10')
        .expect(200);

      const ids = (list.body.data || []).map(v => v.id).filter(Boolean);
      for (const id of ids) {
        const detail = await request()
          .get(`/venues/${id}`)
          .expect(200);
        expect(detail.body).toHaveProperty('data');
        expect(detail.body.data).toHaveProperty('id', id);
      }
    });

    it('reconciliation logic filters invalid IDs from Sphinx results', async () => {
      // This test validates that if Sphinx returns IDs that don't exist in MariaDB,
      // the reconciliation logic filters them out and the roundtrip test passes
      const list = await request()
        .get('/venues?limit=5')
        .expect(200);

      const ids = (list.body.data || []).map(v => v.id).filter(Boolean);
      expect(ids.length).toBeGreaterThan(0);

      // All returned IDs should be valid (reconciliation should have filtered invalid ones)
      for (const id of ids) {
        const detail = await request()
          .get(`/venues/${id}`)
          .expect(200);
        expect(detail.body).toHaveProperty('data');
        expect(detail.body.data).toHaveProperty('id', id);
      }

      // Check if reconciliation warnings are present in response meta
      if (list.body.meta && list.body.meta.warnings) {
        const reconciliationWarnings = list.body.meta.warnings.filter(w => 
          w.includes('reconciliation') || w.includes('Reconciliation')
        );
        if (reconciliationWarnings.length > 0) {
          console.log('Reconciliation warnings detected:', reconciliationWarnings);
        }
      }
    });
  });

  describe('GET /venues/:id/works', () => {
    let venueWithWorks;

    beforeAll(async () => {
      // Find a venue with works
      const response = await request()
        .get('/venues?limit=50');
      
      if (response.body.data.length > 0) {
        venueWithWorks = response.body.data.find(v => v.works_count > 0);
      }
    });

    it('should return works for a venue', async () => {
      if (!venueWithWorks) {
        console.log('No venues with works available, skipping test');
        return;
      }

      const response = await request()
        .get(`/venues/${venueWithWorks.id}/works`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);

      if (response.body.data.length > 0) {
        const work = response.body.data[0];
        expect(work).toHaveProperty('id');
        expect(work).toHaveProperty('title');
        expect(work).toHaveProperty('type');
        if (work.authors && work.authors.length > 0) {
          expect(work.authors[0]).toHaveProperty('is_corresponding');
        }
      }
    });

    it('should filter works by year', async () => {
      if (!venueWithWorks) {
        console.log('No venues with works available, skipping test');
        return;
      }

      const response = await request()
        .get(`/venues/${venueWithWorks.id}/works?year=2020`)
        .expect(200);

      if (response.body.data.length > 0) {
        response.body.data.forEach(work => {
          if (work.year) {
            expect(work.year).toBe(2020);
          }
        });
      }

      if (response.body.meta?.filters) {
        expect(response.body.meta.filters).toHaveProperty('year', 2020);
      }
    });

    it('should respect limit parameter for venue works', async () => {
      if (!venueWithWorks) {
        console.log('No venues with works available, skipping test');
        return;
      }

      const response = await request()
        .get(`/venues/${venueWithWorks.id}/works?limit=3`)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(3);
      expect(response.body.pagination.limit).toBe(3);
    });

    it('should return 400 for invalid venue ID in works endpoint', async () => {
      const response = await request()
        .get('/venues/invalid-id/works')
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /venues/statistics', () => {
    it('should return venue statistics', async () => {
      const response = await request()
        .get('/venues/statistics')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('total_venues');
      expect(response.body.data).toHaveProperty('journals');
      expect(response.body.data).toHaveProperty('conferences');
      expect(response.body.data).toHaveProperty('repositories');
      expect(response.body.data).toHaveProperty('book_series');
      expect(response.body.data).toHaveProperty('with_impact_factor');

      expect(typeof response.body.data.total_venues).toBe('number');
      expect(typeof response.body.data.journals).toBe('number');
      expect(typeof response.body.data.conferences).toBe('number');
      expect(typeof response.body.data.repositories).toBe('number');
      expect(typeof response.body.data.book_series).toBe('number');
    });

    it('should return impact factor statistics', async () => {
      const response = await request()
        .get('/venues/statistics')
        .expect(200);

      if (response.body.data.with_impact_factor > 0) {
        expect(response.body.data).toHaveProperty('avg_impact_factor');
        expect(response.body.data).toHaveProperty('max_impact_factor');
        expect(response.body.data).toHaveProperty('min_impact_factor');
        
        if (response.body.data.avg_impact_factor !== null) {
          expect(typeof response.body.data.avg_impact_factor).toBe('number');
        }
      }
    });
  });

  describe('GET /venues/search', () => {
    it('should search venues by name', async () => {
      const response = await request()
        .get('/venues/search?q=journal')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);

      if (response.body.data.length > 0) {
        response.body.data.forEach(venue => {
          const searchTerm = 'journal';
          const matchesName = venue.name.toLowerCase().includes(searchTerm);
          const matchesISSN = Boolean(venue.issn && venue.issn.toLowerCase().includes(searchTerm)) || Boolean(venue.identifiers?.issn && venue.identifiers.issn.toLowerCase().includes(searchTerm));
          const matchesEISSN = Boolean(venue.eissn && venue.eissn.toLowerCase().includes(searchTerm)) || Boolean(venue.identifiers?.eissn && venue.identifiers.eissn.toLowerCase().includes(searchTerm));

          expect(matchesName || matchesISSN || matchesEISSN).toBe(true);
        });
      }
    });

    it('should filter search results by type', async () => {
      const response = await request()
        .get('/venues/search?q=journal&type=JOURNAL')
        .expect(200);

      if (response.body.data.length > 0) {
        response.body.data.forEach(venue => {
          expect(venue.type).toBe('JOURNAL');
        });
      }
    });

    it('should respect limit in search results', async () => {
      const response = await request()
        .get('/venues/search?q=journal&limit=5')
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(5);
      expect(response.body.pagination.limit).toBe(5);
    });

    it('should return 400 for empty search query', async () => {
      const response = await request()
        .get('/venues/search?q=')
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 for missing search query', async () => {
      const response = await request()
        .get('/venues/search')
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 for invalid search type', async () => {
      const response = await request()
        .get('/venues/search?q=test&type=INVALID_TYPE')
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Performance Tests', () => {
    it('should respond to venue list request within acceptable time', async () => {
      const startTime = Date.now();
      
      await request()
        .get('/venues?limit=50')
        .expect(200);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      expect(responseTime).toBeLessThan(2000); // 2 seconds max
    });

    it('should handle large offset efficiently', async () => {
      const startTime = Date.now();
      
      await request()
        .get('/venues?limit=10&offset=1000')
        .expect(200);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      expect(responseTime).toBeLessThan(3000); // 3 seconds max for large offset
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in search', async () => {
      const term = encodeURIComponent('josé');
      const response = await request()
        .get(`/venues/search?q=${term}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
    });

    it('should handle very long search terms', async () => {
      const longTerm = 'a'.repeat(200);
      
      const response = await request()
        .get(`/venues/search?q=${longTerm}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
    });

    it('should return 400 for search term too long', async () => {
      const veryLongTerm = 'a'.repeat(300);
      
      const response = await request()
        .get(`/venues/search?q=${veryLongTerm}`)
        .expect(400);

      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });

    it('should handle zero results gracefully', async () => {
      const response = await request()
        .get('/venues/search?q=extremelyunlikelysearchtermthatwontmatchanything12345')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });
  });
});
