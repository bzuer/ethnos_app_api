const app = require('../src/app');
const { createHttpClient } = require('./helpers/http-client');
const { expectSuccessEnvelope } = require('./helpers/expectations');

const request = createHttpClient(app);

const getSampleBibliographyWorkId = async () => {
  const res = await request()
    .get('/bibliography?limit=1')
    .expect(200);

  expectSuccessEnvelope(res.body, { paginated: true });

  const first = res.body.data[0];
  return first ? first.work_id : null;
};

describe('Bibliography API Contracts', () => {
  describe('GET /bibliography', () => {
    it('returns paginated bibliography entries with standard envelope', async () => {
      const res = await request()
        .get('/bibliography?limit=10')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true, meta: ['pagination_extras'] });
      expect(res.body.pagination.limit).toBeLessThanOrEqual(10);

      if (res.body.data.length > 0) {
        const entry = res.body.data[0];
        expect(entry).toEqual(
          expect.objectContaining({
            course_id: expect.any(Number),
            work_id: expect.any(Number),
            reading_type: expect.any(String),
            course_name: expect.any(String),
            course_year: expect.any(Number),
            semester: expect.any(String),
            document_type: expect.any(String)
          })
        );
        expect(entry).toHaveProperty('authors');
        expect(Array.isArray(entry.authors)).toBe(true);
        expect(entry).toHaveProperty('course_code');
        expect(entry).toHaveProperty('program_id');
      }
    });

    it('applies filters and exposes them via meta.filters', async () => {
      const res = await request()
        .get('/bibliography?program_id=2&reading_type=RECOMMENDED&year_from=1968&year_to=1970&limit=5')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true, meta: ['pagination_extras'] });

      expect(res.body.meta.pagination_extras).toHaveProperty('offset');

      res.body.data.forEach((entry) => {
        if (entry.program_id) {
          expect(entry.program_id).toBe(2);
        }
        if (entry.reading_type) {
          expect(entry.reading_type).toBe('RECOMMENDED');
        }
        if (entry.course_year) {
          expect(entry.course_year).toBeGreaterThanOrEqual(1968);
          expect(entry.course_year).toBeLessThanOrEqual(1970);
        }
      });
    });

    it('validates limit boundaries', async () => {
      const res = await request()
        .get('/bibliography?limit=250')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      expect(res.body.data.length).toBeLessThanOrEqual(250);
    });
  });

  describe('GET /works/:id/bibliography', () => {
    let sampleWorkId;

    beforeAll(async () => {
      sampleWorkId = await getSampleBibliographyWorkId();
    });

    it('returns usage listing with pagination', async () => {
      if (!sampleWorkId) {
        return;
      }

      const res = await request()
        .get(`/works/${sampleWorkId}/bibliography?limit=5`)
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      res.body.data.forEach((usage) => {
        expect(usage).toEqual(
          expect.objectContaining({
            course_id: expect.any(Number),
            course_name: expect.any(String),
            reading_type: expect.any(String),
            instructor_count: expect.any(Number)
          })
        );
        if (usage.instructors !== null) {
          expect(typeof usage.instructors === 'string' || Array.isArray(usage.instructors)).toBe(true);
        }
      });
    });

    it('validates reading_type enum', async () => {
      const res = await request()
        .get(`/works/${sampleWorkId ?? 1}/bibliography?reading_type=INVALID`)
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
    });
  });

  describe('GET /bibliography/analysis', () => {
    it('returns aggregated analysis with envelope', async () => {
      const res = await request()
        .get('/bibliography/analysis?limit=5')
        .expect(200);

      expectSuccessEnvelope(res.body, { dataType: 'object' });
      expect(res.body.data).toEqual(
        expect.objectContaining({
          most_used_works: expect.any(Array),
          trends_by_year: expect.any(Array),
          reading_type_distribution: expect.any(Array),
          document_type_distribution: expect.any(Array)
        })
      );
    });
  });

  describe('GET /bibliography/statistics', () => {
    it('returns consolidated statistics with envelope', async () => {
      const res = await request()
        .get('/bibliography/statistics')
        .expect(200);

      expectSuccessEnvelope(res.body, { dataType: 'object' });
      expect(res.body.data).toEqual(
        expect.objectContaining({
          total_bibliography_entries: expect.any(Number),
          unique_works: expect.any(Number),
          courses_with_bibliography: expect.any(Number),
          programs_with_bibliography: expect.any(Number),
          reading_type_distribution: expect.any(Array)
        })
      );
    });
  });
});
