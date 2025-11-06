const { pool } = require('../config/database');
const cache = require('./cache.service');
const { createPagination } = require('../utils/pagination');
const {
  formatCourseListItem,
  formatCourseDetails,
  formatCourseInstructor,
  formatBibliographyEntry,
  formatCourseSubject
} = require('../dto/course.dto');

class CoursesService {
  
  async getCourses(filters = {}) {
    const cacheKey = `courses:list:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const {
      program_id,
      year,
      semester,
      search,
      limit = 20,
      offset = 0
    } = filters;

    let query = `
      SELECT 
        c.id,
        c.program_id,
        c.code,
        c.name,
        c.credits,
        c.semester,
        c.year,
        c.created_at,
        c.source_file,
        COUNT(DISTINCT ci.canonical_person_id) as instructor_count,
        COUNT(DISTINCT cb.work_id) as bibliography_count,
        GROUP_CONCAT(DISTINCT p.preferred_name ORDER BY p.preferred_name SEPARATOR '; ') as instructors
      FROM courses c
      LEFT JOIN course_instructors ci ON c.id = ci.course_id
      LEFT JOIN persons p ON ci.canonical_person_id = p.id
      LEFT JOIN course_bibliography cb ON c.id = cb.course_id
      WHERE 1=1
    `;

    const params = [];

    if (program_id) {
      query += ' AND c.program_id = ?';
      params.push(program_id);
    }

    if (year) {
      query += ' AND c.year = ?';
      params.push(year);
    }

    if (semester) {
      query += ' AND c.semester = ?';
      params.push(semester);
    }

    if (search) {
      query += ' AND (c.name LIKE ? OR c.code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += `
      GROUP BY c.id, c.program_id, c.code, c.name, c.credits, c.semester, c.year, c.created_at, c.source_file
      ORDER BY c.year DESC, c.semester, c.name
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const [courses] = await pool.execute(query, params);

    const countQuery = `
      SELECT COUNT(DISTINCT c.id) as total
      FROM courses c
      WHERE 1=1
      ${program_id ? 'AND c.program_id = ?' : ''}
      ${year ? 'AND c.year = ?' : ''}
      ${semester ? 'AND c.semester = ?' : ''}
      ${search ? 'AND (c.name LIKE ? OR c.code LIKE ?)' : ''}
    `;

    const countParams = [];
    if (program_id) countParams.push(program_id);
    if (year) countParams.push(year);
    if (semester) countParams.push(semester);
    if (search) countParams.push(`%${search}%`, `%${search}%`);

    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    // Apply DTOs to format course data
    const formattedCourses = courses.map(formatCourseListItem);
    
    // Calculate page number from offset
    const page = Math.floor(parseInt(offset) / parseInt(limit)) + 1;
    const pagination = createPagination(page, parseInt(limit), total);

    const result = {
      data: formattedCourses,
      pagination
    };

    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getCourseById(id) {
    const cacheKey = `course:${id}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT 
        c.id,
        c.program_id,
        c.code,
        c.name,
        c.credits,
        c.semester,
        c.year,
        c.created_at,
        c.source_file,
        COUNT(DISTINCT ci.canonical_person_id) as instructor_count,
        COUNT(DISTINCT cb.work_id) as bibliography_count,
        COUNT(DISTINCT ws.subject_id) as subject_count
      FROM courses c
      LEFT JOIN course_instructors ci ON c.id = ci.course_id
      LEFT JOIN course_bibliography cb ON c.id = cb.course_id
      LEFT JOIN course_bibliography cb2 ON c.id = cb2.course_id
      LEFT JOIN work_subjects ws ON cb2.work_id = ws.work_id
      WHERE c.id = ?
      GROUP BY c.id, c.program_id, c.code, c.name, c.credits, c.semester, c.year, c.created_at, c.source_file
    `;

    const [courses] = await pool.execute(query, [id]);
    if (!courses.length) return null;

    const course = formatCourseListItem(courses[0]);
    await cache.set(cacheKey, course, 3600);
    return course;
  }

  async getCourseDetailsById(id, options = {}) {
    const cacheKey = `course:details:${id}:${JSON.stringify(options)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const {
      includeBibliography = true,
      includeInstructors = true,
      includeSubjects = true,
      bibliographyLimit = 50,
      instructorsLimit = 20,
      subjectsLimit = 30
    } = options;

    const course = await this.getCourseById(id);
    if (!course) return null;

    const result = {};

    if (includeBibliography) {
      const bibliography = await this.getCourseBibliography(id, { limit: bibliographyLimit, offset: 0 });
      result.bibliography = bibliography.data;

      const bibliographyStatsQuery = `
        SELECT 
          reading_type,
          COUNT(*) as count,
          MIN(week_number) as first_week,
          MAX(week_number) as last_week
        FROM course_bibliography 
        WHERE course_id = ?
        GROUP BY reading_type
      `;
      const [bibliographyStats] = await pool.execute(bibliographyStatsQuery, [id]);
      
      const weekStatsQuery = `
        SELECT 
          week_number,
          COUNT(*) as count,
          GROUP_CONCAT(DISTINCT reading_type) as reading_types
        FROM course_bibliography 
        WHERE course_id = ? AND week_number IS NOT NULL
        GROUP BY week_number
        ORDER BY week_number
      `;
      const [weekStats] = await pool.execute(weekStatsQuery, [id]);

      result.bibliography_statistics = {
        by_type: bibliographyStats.reduce((acc, item) => {
          acc[item.reading_type] = {
            count: item.count,
            first_week: item.first_week,
            last_week: item.last_week
          };
          return acc;
        }, {}),
        by_week: weekStats
      };
    }

    if (includeInstructors) {
      const instructors = await this.getCourseInstructors(id, { limit: instructorsLimit, offset: 0 });
      result.instructors = instructors.data;

      const instructorStatsQuery = `
        SELECT 
          role,
          COUNT(*) as count
        FROM course_instructors 
        WHERE course_id = ?
        GROUP BY role
      `;
      const [instructorStats] = await pool.execute(instructorStatsQuery, [id]);
      
      result.instructor_statistics = {
        by_role: instructorStats.reduce((acc, item) => {
          acc[item.role] = item.count;
          return acc;
        }, {})
      };
    }

    if (includeSubjects) {
      const subjects = await this.getCourseSubjects(id, { limit: subjectsLimit, offset: 0 });
      result.subjects = subjects.data;

      const subjectStatsQuery = `
        SELECT 
          s.vocabulary,
          COUNT(DISTINCT s.id) as unique_subjects,
          COUNT(DISTINCT cb.work_id) as works_covered
        FROM subjects s
        JOIN work_subjects ws ON s.id = ws.subject_id
        JOIN course_bibliography cb ON ws.work_id = cb.work_id
        WHERE cb.course_id = ?
        GROUP BY s.vocabulary
      `;
      const [subjectStats] = await pool.execute(subjectStatsQuery, [id]);
      
      result.subject_statistics = {
        by_vocabulary: subjectStats.reduce((acc, item) => {
          acc[item.vocabulary] = {
            unique_subjects: item.unique_subjects,
            works_covered: item.works_covered
          };
          return acc;
        }, {})
      };
    }

    // Format final course details with all enrichments
    const formattedCourse = formatCourseDetails(course, result);
    
    await cache.set(cacheKey, formattedCourse, 1800);
    return formattedCourse;
  }

  async getCourseInstructors(courseId, filters = {}) {
    const cacheKey = `course:${courseId}:instructors:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { role, limit = 20, offset = 0 } = filters;

    let query = `
      SELECT 
        ci.course_id,
        ci.person_id,
        ci.canonical_person_id,
        ci.role,
        p.preferred_name,
        p.given_names,
        p.family_name,
        p.orcid,
        p.is_verified
      FROM course_instructors ci
      JOIN persons p ON ci.canonical_person_id = p.id
      WHERE ci.course_id = ?
    `;

    const params = [courseId];

    if (role) {
      query += ' AND ci.role = ?';
      params.push(role);
    }

    query += ' ORDER BY ci.role, p.preferred_name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [instructors] = await pool.execute(query, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM course_instructors ci
      JOIN persons p ON ci.canonical_person_id = p.id
      WHERE ci.course_id = ?
      ${role ? 'AND ci.role = ?' : ''}
    `;
    const countParams = [courseId];
    if (role) countParams.push(role);
    
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    const formattedInstructors = instructors.map(formatCourseInstructor);
    const pagination = createPagination(
      Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      parseInt(limit),
      total
    );

    const result = {
      data: formattedInstructors,
      pagination
    };

    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getCourseBibliography(courseId, filters = {}) {
    const cacheKey = `course:${courseId}:bibliography:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { reading_type, week_number, limit = 20, offset = 0 } = filters;

    let query = `
      SELECT 
        cb.course_id,
        cb.work_id,
        cb.reading_type,
        cb.week_number,
        cb.notes,
        w.title,
        p.year as publication_year,
        w.language,
        w.work_type as document_type,
        was.author_string,
        per.preferred_name as first_author_name
      FROM course_bibliography cb
      JOIN works w ON cb.work_id = w.id
      LEFT JOIN publications p ON w.id = p.work_id
      LEFT JOIN work_author_summary was ON w.id = was.work_id
      LEFT JOIN persons per ON was.first_author_id = per.id
      WHERE cb.course_id = ?
    `;

    const params = [courseId];

    if (reading_type) {
      query += ' AND cb.reading_type = ?';
      params.push(reading_type);
    }

    if (week_number) {
      query += ' AND cb.week_number = ?';
      params.push(week_number);
    }

    query += ' ORDER BY cb.week_number, cb.reading_type, w.title LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [bibliography] = await pool.execute(query, params);

    // Process authors for each bibliography item
    for (const item of bibliography) {
      if (item.author_string) {
        const authors = item.author_string.split(';').map(name => name.trim());
        item.authors = authors;
        item.author_count = authors.length;
      } else {
        item.authors = [];
        item.author_count = 0;
      }
    }

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM course_bibliography cb
      WHERE cb.course_id = ?
      ${reading_type ? 'AND cb.reading_type = ?' : ''}
      ${week_number ? 'AND cb.week_number = ?' : ''}
    `;
    const countParams = [courseId];
    if (reading_type) countParams.push(reading_type);
    if (week_number) countParams.push(week_number);
    
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    const formattedBibliography = bibliography.map(formatBibliographyEntry);
    const pagination = createPagination(
      Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      parseInt(limit),
      total
    );

    const result = {
      data: formattedBibliography,
      pagination
    };

    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getCourseSubjects(courseId, filters = {}) {
    const cacheKey = `course:${courseId}:subjects:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { vocabulary, limit = 50, offset = 0 } = filters;

    let query = `
      SELECT DISTINCT
        s.id,
        s.term,
        s.vocabulary,
        s.parent_id,
        COUNT(DISTINCT cb.work_id) as work_count
      FROM subjects s
      JOIN work_subjects ws ON s.id = ws.subject_id
      JOIN course_bibliography cb ON ws.work_id = cb.work_id
      WHERE cb.course_id = ?
    `;

    const params = [courseId];

    if (vocabulary) {
      query += ' AND s.vocabulary = ?';
      params.push(vocabulary);
    }

    query += ' GROUP BY s.id, s.term, s.vocabulary, s.parent_id ORDER BY work_count DESC, s.term LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [subjects] = await pool.execute(query, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM subjects s
      JOIN work_subjects ws ON s.id = ws.subject_id
      JOIN course_bibliography cb ON ws.work_id = cb.work_id
      WHERE cb.course_id = ?
      ${vocabulary ? 'AND s.vocabulary = ?' : ''}
    `;
    const countParams = [courseId];
    if (vocabulary) countParams.push(vocabulary);
    
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    const formattedSubjects = subjects.map(formatCourseSubject);
    const pagination = createPagination(
      Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      parseInt(limit),
      total
    );

    const result = {
      data: formattedSubjects,
      pagination
    };

    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getCoursesStatistics() {
    const cacheKey = 'courses:statistics';
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT 
        COUNT(*) as total_courses,
        COUNT(DISTINCT program_id) as programs_count,
        MIN(year) as earliest_year,
        MAX(year) as latest_year,
        COUNT(DISTINCT semester) as semesters_count,
        AVG(credits) as avg_credits,
        COUNT(CASE WHEN credits IS NOT NULL THEN 1 END) as courses_with_credits
      FROM courses
    `;

    const [stats] = await pool.execute(query);
    
    const yearDistQuery = `
      SELECT 
        year,
        COUNT(*) as course_count,
        COUNT(DISTINCT program_id) as program_count
      FROM courses 
      WHERE year IS NOT NULL
      GROUP BY year 
      ORDER BY year DESC 
      LIMIT 10
    `;

    const [yearDist] = await pool.execute(yearDistQuery);

    const semesterDistQuery = `
      SELECT 
        semester,
        COUNT(*) as course_count
      FROM courses 
      WHERE semester IS NOT NULL
      GROUP BY semester
    `;

    const [semesterDist] = await pool.execute(semesterDistQuery);

    const result = {
      ...stats[0],
      year_distribution: yearDist,
      semester_distribution: semesterDist
    };

    await cache.set(cacheKey, result, 3600);
    return result;
  }
}

module.exports = new CoursesService();