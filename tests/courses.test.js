const app = require('../src/app');
const { createHttpClient } = require('./helpers/http-client');
const { expectSuccessEnvelope, expectStandardError } = require('./helpers/expectations');

const request = createHttpClient(app);

const fetchSampleCourse = async () => {
  const res = await request()
    .get('/courses?limit=1')
    .expect(200);

  expectSuccessEnvelope(res.body, { paginated: true });
  return res.body.data[0] || null;
};

describe('Courses API Contracts', () => {
  describe('GET /courses', () => {
    it('returns paginated course catalogue with metrics', async () => {
      const res = await request()
        .get('/courses?limit=5')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      expect(res.body.data.length).toBeLessThanOrEqual(5);

      res.body.data.forEach((course) => {
        expect(course).toEqual(
          expect.objectContaining({
            id: expect.any(Number),
            name: expect.any(String),
            code: expect.any(String),
            year: expect.any(Number),
            semester: expect.any(String),
            metrics: expect.objectContaining({
              instructor_count: expect.any(Number),
              bibliography_count: expect.any(Number)
            })
          })
        );
      });
    });

    it('respects filters and surfaces them in meta', async () => {
      const res = await request()
        .get('/courses?program_id=2&year=1968&semester=1&limit=3')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      expect(res.body.meta.request.path).toContain('program_id=2');
      expect(res.body.meta.request.path).toContain('year=1968');
      expect(res.body.meta.request.path).toContain('semester=1');
    });

    it('validates pagination guardrails', async () => {
      const res = await request()
        .get('/courses?limit=200')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      expect(res.body.data.length).toBeLessThanOrEqual(200);
    });
  });

  describe('GET /courses/:id', () => {
    let sample;

    beforeAll(async () => {
      sample = await fetchSampleCourse();
    });

    it('returns course detail with enriched fields', async () => {
      if (!sample) {
        return;
      }

      const res = await request()
        .get(`/courses/${sample.id}`)
        .expect(200);

      expectSuccessEnvelope(res.body, { dataType: 'object' });
      expect(res.body.data).toHaveProperty('id', sample.id);
    });

    it('returns 404 for unknown course', async () => {
      const res = await request()
        .get('/courses/99999999')
        .expect(404);

      expectStandardError(res.body);
    });
  });

  describe('Course sub-resources', () => {
    let sample;

    beforeAll(async () => {
      sample = await fetchSampleCourse();
    });

    it('lists course instructors with envelope', async () => {
      if (!sample) {
        return;
      }

      const res = await request()
        .get(`/courses/${sample.id}/instructors?limit=5`)
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      res.body.data.forEach((instructor) => {
        expect(instructor).toEqual(
          expect.objectContaining({
            person_id: expect.any(Number),
            preferred_name: expect.any(String),
            role: expect.any(String)
          })
        );
      });
    });

    it('lists course bibliography with envelope', async () => {
      if (!sample) {
        return;
      }

      const res = await request()
        .get(`/courses/${sample.id}/bibliography?limit=5`)
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      res.body.data.forEach((entry) => {
        expect(entry).toEqual(
          expect.objectContaining({
            work_id: expect.any(Number),
            title: expect.any(String),
            reading_type: expect.any(String)
          })
        );
      });
    });
  });
});
