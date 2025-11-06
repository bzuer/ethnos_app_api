const request = require('supertest');
const app = require('../src/app');

describe('Subjects Endpoints', () => {

  describe('GET /subjects', () => {
    it('should return subjects list with pagination', async () => {
      const response = await request(app)
        .get('/subjects?limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('subjects');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.subjects)).toBe(true);
      expect(response.body.subjects.length).toBeLessThanOrEqual(10);
      
      if (response.body.subjects.length > 0) {
        const subject = response.body.subjects[0];
        expect(subject).toHaveProperty('id');
        expect(subject).toHaveProperty('term');
        expect(subject).toHaveProperty('vocabulary');
        expect(subject).toHaveProperty('works_count');
        expect(subject).toHaveProperty('courses_count');
        expect(subject).toHaveProperty('children_count');
      }
    });

    it('should filter subjects by vocabulary', async () => {
      const response = await request(app)
        .get('/subjects?vocabulary=KEYWORD&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('subjects');
      if (response.body.subjects.length > 0) {
        response.body.subjects.forEach(subject => {
          expect(subject.vocabulary).toBe('KEYWORD');
        });
      }
    });

    it('should filter subjects by parent_id', async () => {
      const response = await request(app)
        .get('/subjects?parent_id=null&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('subjects');
      if (response.body.subjects.length > 0) {
        response.body.subjects.forEach(subject => {
          expect(subject.parent_id).toBe(null);
        });
      }
    });

    it('should search subjects by term', async () => {
      const response = await request(app)
        .get('/subjects?search=war&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('subjects');
      if (response.body.subjects.length > 0) {
        const subject = response.body.subjects[0];
        expect(subject.term.toLowerCase()).toContain('war');
      }
    });

    it('should filter subjects with children', async () => {
      const response = await request(app)
        .get('/subjects?has_children=true&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('subjects');
      if (response.body.subjects.length > 0) {
        response.body.subjects.forEach(subject => {
          expect(subject.children_count).toBeGreaterThan(0);
        });
      }
    });

    it('should filter subjects without children', async () => {
      const response = await request(app)
        .get('/subjects?has_children=false&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('subjects');
      if (response.body.subjects.length > 0) {
        response.body.subjects.forEach(subject => {
          expect(subject.children_count).toBe(0);
        });
      }
    });
  });

  describe('GET /subjects/:id', () => {
    it('should return subject details for valid ID', async () => {
      const subjectsResponse = await request(app)
        .get('/subjects?limit=1')
        .expect(200);

      if (subjectsResponse.body.subjects.length > 0) {
        const subjectId = subjectsResponse.body.subjects[0].id;
        
        const response = await request(app)
          .get(`/subjects/${subjectId}`)
          .expect(200);

        expect(response.body).toHaveProperty('id', subjectId);
        expect(response.body).toHaveProperty('term');
        expect(response.body).toHaveProperty('vocabulary');
        expect(response.body).toHaveProperty('works_count');
        expect(response.body).toHaveProperty('courses_count');
        expect(response.body).toHaveProperty('children_count');
        expect(response.body).toHaveProperty('avg_relevance_score');
      }
    });

    it('should return 404 for invalid subject ID', async () => {
      await request(app)
        .get('/subjects/999999')
        .expect(404);
    });
  });

  describe('GET /subjects/:id/children', () => {
    it('should return subject children', async () => {
      // First find a subject with children
      const subjectsResponse = await request(app)
        .get('/subjects?has_children=true&limit=1')
        .expect(200);

      if (subjectsResponse.body.subjects.length > 0) {
        const subjectId = subjectsResponse.body.subjects[0].id;
        
        const response = await request(app)
          .get(`/subjects/${subjectId}/children?limit=5`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        if (response.body.length > 0) {
          const child = response.body[0];
          expect(child).toHaveProperty('id');
          expect(child).toHaveProperty('term');
          expect(child).toHaveProperty('parent_id', subjectId);
          expect(child).toHaveProperty('vocabulary');
        }
      }
    });
  });

  describe('GET /subjects/:id/hierarchy', () => {
    it('should return subject hierarchy', async () => {
      const subjectsResponse = await request(app)
        .get('/subjects?limit=1')
        .expect(200);

      if (subjectsResponse.body.subjects.length > 0) {
        const subjectId = subjectsResponse.body.subjects[0].id;
        
        const response = await request(app)
          .get(`/subjects/${subjectId}/hierarchy`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        if (response.body.length > 0) {
          const hierarchyItem = response.body[response.body.length - 1]; // Last item should be the requested subject
          expect(hierarchyItem).toHaveProperty('id', subjectId);
          expect(hierarchyItem).toHaveProperty('term');
          expect(hierarchyItem).toHaveProperty('vocabulary');
        }
      }
    });
  });

  describe('GET /subjects/:id/works', () => {
    it('should return subject works', async () => {
      // Find a subject with works
      const subjectsResponse = await request(app)
        .get('/subjects?limit=10')
        .expect(200);

      const subjectWithWorks = subjectsResponse.body.subjects.find(s => s.works_count > 0);
      
      if (subjectWithWorks) {
        const response = await request(app)
          .get(`/subjects/${subjectWithWorks.id}/works?limit=5`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        if (response.body.length > 0) {
          const work = response.body[0];
          expect(work).toHaveProperty('id');
          expect(work).toHaveProperty('title');
          expect(work).toHaveProperty('relevance_score');
          expect(work).toHaveProperty('assigned_by');
          expect(work).toHaveProperty('used_in_courses');
        }
      }
    });

    it('should filter works by minimum relevance', async () => {
      const subjectsResponse = await request(app)
        .get('/subjects?limit=10')
        .expect(200);

      const subjectWithWorks = subjectsResponse.body.subjects.find(s => s.works_count > 0);
      
      if (subjectWithWorks) {
        const response = await request(app)
          .get(`/subjects/${subjectWithWorks.id}/works?min_relevance=0.5&limit=5`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        response.body.forEach(work => {
          expect(work.relevance_score).toBeGreaterThanOrEqual(0.5);
        });
      }
    });
  });

  describe('GET /subjects/:id/courses', () => {
    it('should return subject courses', async () => {
      // Find a subject with courses
      const subjectsResponse = await request(app)
        .get('/subjects?limit=10')
        .expect(200);

      const subjectWithCourses = subjectsResponse.body.subjects.find(s => s.courses_count > 0);
      
      if (subjectWithCourses) {
        const response = await request(app)
          .get(`/subjects/${subjectWithCourses.id}/courses?limit=5`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        if (response.body.length > 0) {
          const course = response.body[0];
          expect(course).toHaveProperty('id');
          expect(course).toHaveProperty('name');
          expect(course).toHaveProperty('code');
          expect(course).toHaveProperty('year');
          expect(course).toHaveProperty('works_with_subject');
          expect(course).toHaveProperty('instructor_count');
        }
      }
    });

    it('should filter courses by year range', async () => {
      const subjectsResponse = await request(app)
        .get('/subjects?limit=10')
        .expect(200);

      const subjectWithCourses = subjectsResponse.body.subjects.find(s => s.courses_count > 0);
      
      if (subjectWithCourses) {
        const response = await request(app)
          .get(`/subjects/${subjectWithCourses.id}/courses?year_from=1968&year_to=1970`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        response.body.forEach(course => {
          expect(course.year).toBeGreaterThanOrEqual(1968);
          expect(course.year).toBeLessThanOrEqual(1970);
        });
      }
    });
  });

  describe('GET /subjects/statistics', () => {
    it('should return subjects statistics', async () => {
      const response = await request(app)
        .get('/subjects/statistics')
        .expect(200);

      expect(response.body).toHaveProperty('total_subjects');
      expect(response.body).toHaveProperty('root_subjects');
      expect(response.body).toHaveProperty('child_subjects');
      expect(response.body).toHaveProperty('vocabularies_count');
      expect(response.body).toHaveProperty('subjects_with_works');
      expect(response.body).toHaveProperty('total_work_subject_relations');
      expect(response.body).toHaveProperty('vocabulary_distribution');
      expect(response.body).toHaveProperty('top_subjects');
      
      expect(Array.isArray(response.body.vocabulary_distribution)).toBe(true);
      expect(Array.isArray(response.body.top_subjects)).toBe(true);
      
      if (response.body.vocabulary_distribution.length > 0) {
        const vocabItem = response.body.vocabulary_distribution[0];
        expect(vocabItem).toHaveProperty('vocabulary');
        expect(vocabItem).toHaveProperty('subject_count');
        expect(vocabItem).toHaveProperty('root_count');
        expect(vocabItem).toHaveProperty('works_count');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid limit parameter', async () => {
      await request(app)
        .get('/subjects?limit=abc')
        .expect(200); // Should use default limit
    });

    it('should handle invalid parent_id parameter', async () => {
      await request(app)
        .get('/subjects?parent_id=abc')
        .expect(200); // Should ignore invalid parameter
    });

    it('should handle invalid has_children parameter', async () => {
      await request(app)
        .get('/subjects?has_children=maybe')
        .expect(200); // Should ignore invalid parameter
    });
  });

  describe('Performance', () => {
    it('should respond within reasonable time for subjects listing', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/subjects?limit=20')
        .expect(200);
        
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(5000); // 5 seconds max
    });

    it('should respond within reasonable time for subject details', async () => {
      const subjectsResponse = await request(app)
        .get('/subjects?limit=1')
        .expect(200);

      if (subjectsResponse.body.subjects.length > 0) {
        const subjectId = subjectsResponse.body.subjects[0].id;
        const startTime = Date.now();
        
        await request(app)
          .get(`/subjects/${subjectId}`)
          .expect(200);
          
        const responseTime = Date.now() - startTime;
        expect(responseTime).toBeLessThan(3000); // 3 seconds max
      }
    });

    it('should respond within reasonable time for subject hierarchy', async () => {
      const subjectsResponse = await request(app)
        .get('/subjects?limit=1')
        .expect(200);

      if (subjectsResponse.body.subjects.length > 0) {
        const subjectId = subjectsResponse.body.subjects[0].id;
        const startTime = Date.now();
        
        await request(app)
          .get(`/subjects/${subjectId}/hierarchy`)
          .expect(200);
          
        const responseTime = Date.now() - startTime;
        expect(responseTime).toBeLessThan(2000); // 2 seconds max
      }
    });
  });
});