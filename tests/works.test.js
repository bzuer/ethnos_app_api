const app = require('../src/app');
const { createHttpClient } = require('./helpers/http-client');
const { expectSuccessEnvelope, expectStandardError } = require('./helpers/expectations');

const request = createHttpClient(app);

const fetchSampleWork = async () => {
  const res = await request()
    .get('/works?limit=1')
    .expect(200);

  expectSuccessEnvelope(res.body, { paginated: true, meta: ['pagination_extras'] });
  return res.body.data[0] || null;
};

describe('Works API Contracts', () => {
  describe('GET /works', () => {
    it('returns paginated works respecting the DTO contract', async () => {
      const res = await request()
        .get('/works?limit=10')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true, meta: ['pagination_extras'] });
      expect(res.body.pagination.limit).toBeLessThanOrEqual(10);

      res.body.data.forEach((work) => {
        expect(work).toMatchObject({
          id: expect.any(Number),
          title: expect.any(String),
          type: expect.any(String),
          authors_preview: expect.any(Array),
          venue: expect.objectContaining({
            name: expect.any(String)
          }),
          // Campos expandidos específicos do endpoint /works
          data_source: expect.any(String)
        });
        expect(work).toHaveProperty('publication_year');
        if (work.publication_year !== null) {
          expect(typeof work.publication_year).toBe('number');
        }
        expect(work).toHaveProperty('first_author');
        if (work.first_author !== null) {
          expect(typeof work.first_author).toBe('string');
        }
        expect(work).not.toHaveProperty('work_type');
        
        // Verificar campos expandidos específicos do /works
        expect(work).toHaveProperty('first_author_id');
        expect(work).toHaveProperty('first_author_identifiers');
        expect(work).toHaveProperty('search_engine');
      });
    });

    it('applies type filter and records it in meta', async () => {
      const res = await request()
        .get('/works?type=ARTICLE&limit=5')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true, meta: ['pagination_extras'] });
      expect(res.body.data.length).toBeGreaterThan(0);
      
      // Verificar que todos os works retornados são do tipo ARTICLE
      res.body.data.forEach((work) => {
        expect(work.type).toBe('ARTICLE');
      });
    });

    it('validates limit bounds', async () => {
      const res = await request()
        .get('/works?limit=200')
        .expect(400);

      expectStandardError(res.body);
    });
  });

  describe('GET /works/:id', () => {
    let sample;

    beforeAll(async () => {
      sample = await fetchSampleWork();
    });

    it('returns detailed work payload with relationships', async () => {
      if (!sample) {
        return;
      }

      const res = await request()
        .get(`/works/${sample.id}`)
        .expect(200);

      expectSuccessEnvelope(res.body, { dataType: 'object' });
      const detail = res.body.data;

      expect(detail.id).toBe(sample.id);
      expect(typeof detail.title).toBe('string');
      expect(typeof detail.type).toBe('string');
      expect(detail).toHaveProperty('publication');
      expect(detail).toHaveProperty('identifiers');
      expect(detail).toHaveProperty('metrics');
      expect(detail).toHaveProperty('authors');
      expect(Array.isArray(detail.authors)).toBe(true);
      expect(detail).toHaveProperty('subjects');
      expect(Array.isArray(detail.subjects)).toBe(true);
      expect(detail).toHaveProperty('funding');
      expect(Array.isArray(detail.funding)).toBe(true);
      expect(detail).toHaveProperty('files');
      expect(Array.isArray(detail.files)).toBe(true);

      detail.authors.forEach((author) => {
        expect(author).toHaveProperty('preferred_name');
        expect(author).toHaveProperty('role');
        expect(author).toHaveProperty('position');
        if (author.position !== null) {
          expect(typeof author.position).toBe('number');
        }
        expect(author).toHaveProperty('is_corresponding');
        expect([true, false, null]).toContain(author.is_corresponding);
        if (author.affiliation) {
          expect(author.affiliation).toEqual(
            expect.objectContaining({
              id: expect.any(Number),
              name: expect.any(String)
            })
          );
        }
      });
    });

    it('rejects invalid id format', async () => {
      const res = await request()
        .get('/works/invalid-id')
        .expect(400);

      expectStandardError(res.body);
    });
  });
});
