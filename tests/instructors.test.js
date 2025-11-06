const app = require('../src/app');
const { createHttpClient } = require('./helpers/http-client');
const { expectSuccessEnvelope, expectStandardError } = require('./helpers/expectations');

const request = createHttpClient(app);

const fetchInstructorSample = async () => {
  const res = await request()
    .get('/instructors?limit=1')
    .expect(200);

  expectSuccessEnvelope(res.body, { paginated: true });
  return res.body.data[0] || null;
};

describe('Instructors API Contracts', () => {
  describe('GET /instructors', () => {
    it('returns paginated instructors with teaching metrics', async () => {
      const res = await request()
        .get('/instructors?limit=5')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      expect(res.body.data.length).toBeLessThanOrEqual(5);

      res.body.data.forEach((instructor) => {
        expect(instructor).toEqual(
          expect.objectContaining({
            person_id: expect.any(Number),
            preferred_name: expect.any(String),
            identifiers: expect.any(Object),
            is_verified: expect.any(Boolean),
            roles: expect.any(Array),
            teaching_metrics: expect.objectContaining({
              courses_taught: expect.any(Number),
              programs_count: expect.any(Number),
              teaching_span: expect.objectContaining({
                earliest_year: expect.any(Number),
                latest_year: expect.any(Number)
              })
            })
          })
        );
      });
    });

    it('applies filters and exposes them via meta', async () => {
      const res = await request()
        .get('/instructors?program_id=2&role=PROFESSOR&year_from=1968&year_to=1970&limit=3')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      expect(res.body.meta.request.path).toContain('program_id=2');
      expect(res.body.meta.request.path).toContain('role=PROFESSOR');
      expect(res.body.meta.request.path).toContain('year_from=1968');
      expect(res.body.meta.request.path).toContain('year_to=1970');
      expect(res.body.data.length).toBeLessThanOrEqual(3);
    });

    it('validates pagination bounds', async () => {
      const res = await request()
        .get('/instructors?limit=250')
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      expect(res.body.data.length).toBeLessThanOrEqual(250);
    });
  });

  describe('GET /instructors/:id', () => {
    let sample;

    beforeAll(async () => {
      sample = await fetchInstructorSample();
    });

    it('returns instructor profile with teaching summary', async () => {
      if (!sample) {
        return;
      }

      const res = await request()
        .get(`/instructors/${sample.person_id}`)
        .expect(200);

      expectSuccessEnvelope(res.body, { dataType: 'object' });
      expect(res.body.data).toEqual(
        expect.objectContaining({
          person_id: sample.person_id,
          preferred_name: expect.any(String),
          roles: expect.any(Array)
        })
      );
    });

    it('returns 404 for unknown instructor', async () => {
      const res = await request()
        .get('/instructors/99999999')
        .expect(404);

      expectStandardError(res.body);
    });
  });

  describe('Instructor sub-resources', () => {
    let sample;

    beforeAll(async () => {
      sample = await fetchInstructorSample();
    });

    it('lists instructor courses with pagination envelope', async () => {
      if (!sample) {
        return;
      }

      const res = await request()
        .get(`/instructors/${sample.person_id}/courses?limit=5`)
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      res.body.data.forEach((course) => {
        expect(course).toEqual(
          expect.objectContaining({
            id: expect.any(Number),
            name: expect.any(String),
            code: expect.any(String),
            year: expect.any(Number),
            role: expect.any(String)
          })
        );
      });
    });

    it('lists instructor subjects with envelope', async () => {
      if (!sample) {
        return;
      }

      const res = await request()
        .get(`/instructors/${sample.person_id}/subjects?limit=5`)
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      res.body.data.forEach((subject) => {
        expect(subject).toEqual(
          expect.objectContaining({
            id: expect.any(Number),
            term: expect.any(String),
            vocabulary: expect.any(String),
            courses_count: expect.any(Number),
            works_count: expect.any(Number)
          })
        );
      });
    });

    it('lists instructor bibliography contributions with envelope', async () => {
      if (!sample) {
        return;
      }

      const res = await request()
        .get(`/instructors/${sample.person_id}/bibliography?limit=5`)
        .expect(200);

      expectSuccessEnvelope(res.body, { paginated: true });
      res.body.data.forEach((entry) => {
        expect(entry).toEqual(
          expect.objectContaining({
            work_id: expect.any(Number),
            reading_type: expect.any(String),
            title: expect.any(String)
          })
        );
      });
    });
  });
});
