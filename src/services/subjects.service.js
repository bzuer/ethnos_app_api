const { pool } = require('../config/database');
const cache = require('./cache.service');

class SubjectsService {
  
  async getSubjects(filters = {}) {
    const cacheKey = `subjects:list:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const {
      vocabulary,
      parent_id,
      search,
      has_children,
      limit = 50,
      offset = 0,
      light
    } = filters;

    const limitValue = Math.min(100, Number.parseInt(limit, 10) || 50);
    const offsetValue = Math.max(0, Number.parseInt(offset, 10) || 0);

    if (String(light || 'false').toLowerCase() === 'true') {
      const whereParts = [];
      const whereParams = [];
      if (vocabulary) { whereParts.push('s.vocabulary = ?'); whereParams.push(vocabulary); }
      if (parent_id !== undefined) {
        if (parent_id === null || parent_id === 'null') {
          whereParts.push('s.parent_id IS NULL');
        } else {
          whereParts.push('s.parent_id = ?');
          whereParams.push(parent_id);
        }
      }
      if (search) { whereParts.push('s.term LIKE ?'); whereParams.push(`%${search}%`); }
      const whereLite = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const liteQuery = `
        SELECT s.id, s.term, s.vocabulary, s.parent_id, s.created_at
        FROM subjects s
        ${whereLite}
        ORDER BY s.term ASC
        LIMIT ? OFFSET ?
      `;
      const liteParams = [...whereParams, Math.min(100, Number.parseInt(limit, 10) || 50), Math.max(0, Number.parseInt(offset, 10) || 0)];
      const [rows] = await pool.execute(liteQuery, liteParams);
      const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM subjects s ${whereLite}`, whereParams);
      const total = countRows?.[0]?.total ? Number.parseInt(countRows[0].total, 10) : 0;
      const result = {
        subjects: rows,
        pagination: {
          total,
          limit: liteParams[liteParams.length - 2],
          offset: liteParams[liteParams.length - 1],
          has_next: (liteParams[liteParams.length - 1] + liteParams[liteParams.length - 2]) < total
        }
      };
      await cache.set(cacheKey, result, 1800);
      return result;
    }

    const baseSelect = `
      SELECT
        s.id,
        s.term,
        s.vocabulary,
        s.parent_id,
        s.created_at,
        COALESCE(ws.works_count, 0) AS works_count,
        COALESCE(cb.courses_count, 0) AS courses_count,
        COALESCE(cc.children_count, 0) AS children_count,
        parent.term AS parent_term
      FROM subjects s
      LEFT JOIN (
        SELECT subject_id, COUNT(DISTINCT work_id) AS works_count
        FROM work_subjects
        GROUP BY subject_id
      ) ws ON s.id = ws.subject_id
      LEFT JOIN (
        SELECT ws.subject_id, COUNT(DISTINCT cb.course_id) AS courses_count
        FROM work_subjects ws
        LEFT JOIN course_bibliography cb ON ws.work_id = cb.work_id
        GROUP BY ws.subject_id
      ) cb ON s.id = cb.subject_id
      LEFT JOIN (
        SELECT parent_id, COUNT(*) AS children_count
        FROM subjects
        WHERE parent_id IS NOT NULL
        GROUP BY parent_id
      ) cc ON s.id = cc.parent_id
      LEFT JOIN subjects parent ON s.parent_id = parent.id
    `;

    const filtersClauses = [];
    const filterParams = [];

    if (vocabulary) {
      filtersClauses.push('s.vocabulary = ?');
      filterParams.push(vocabulary);
    }

    if (parent_id !== undefined) {
      if (parent_id === null || parent_id === 'null') {
        filtersClauses.push('s.parent_id IS NULL');
      } else {
        filtersClauses.push('s.parent_id = ?');
        filterParams.push(parent_id);
      }
    }

    if (search) {
      filtersClauses.push('s.term LIKE ?');
      filterParams.push(`%${search}%`);
    }

    if (has_children === 'true') {
      filtersClauses.push('COALESCE(cc.children_count, 0) > 0');
    } else if (has_children === 'false') {
      filtersClauses.push('COALESCE(cc.children_count, 0) = 0');
    }

    const whereClause = filtersClauses.length ? `WHERE ${filtersClauses.join(' AND ')}` : '';

    const subjectsQuery = `
      ${baseSelect}
      ${whereClause}
      ORDER BY works_count DESC, courses_count DESC, s.term
      LIMIT ? OFFSET ?
    `;

    const [subjects] = await pool.execute(subjectsQuery, [...filterParams, limitValue, offsetValue]);

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        ${baseSelect}
        ${whereClause}
      ) subjects_with_metrics
    `;

    const [countRows] = await pool.execute(countQuery, filterParams);
    const total = countRows[0]?.total ? Number.parseInt(countRows[0].total, 10) : 0;

    const result = {
      subjects,
      pagination: {
        total,
        limit: limitValue,
        offset: offsetValue,
        has_next: (offsetValue + limitValue) < total
      }
    };

    await cache.set(cacheKey, result, 1800);
    return result;
  }

  async getSubjectById(id) {
    const cacheKey = `subject:${id}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT 
        s.id,
        s.term,
        s.vocabulary,
        s.parent_id,
        s.created_at,
        COUNT(DISTINCT ws.work_id) as works_count,
        COUNT(DISTINCT cb.course_id) as courses_count,
        COUNT(DISTINCT children.id) as children_count,
        parent.term as parent_term,
        parent.vocabulary as parent_vocabulary,
        AVG(ws.relevance_score) as avg_relevance_score
      FROM subjects s
      LEFT JOIN work_subjects ws ON s.id = ws.subject_id
      LEFT JOIN course_bibliography cb ON ws.work_id = cb.work_id
      LEFT JOIN subjects children ON s.id = children.parent_id
      LEFT JOIN subjects parent ON s.parent_id = parent.id
      WHERE s.id = ?
      GROUP BY s.id, s.term, s.vocabulary, s.parent_id, s.created_at, parent.term, parent.vocabulary
    `;

    const [subjects] = await pool.execute(query, [id]);
    if (!subjects.length) return null;

    const subject = subjects[0];
    await cache.set(cacheKey, subject, 3600);
    return subject;
  }

  async getSubjectChildren(id, filters = {}) {
    const cacheKey = `subject:${id}:children:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { limit = 50, offset = 0 } = filters;

    const query = `
      SELECT 
        s.id,
        s.term,
        s.vocabulary,
        s.parent_id,
        s.created_at,
        COUNT(DISTINCT ws.work_id) as works_count,
        COUNT(DISTINCT cb.course_id) as courses_count,
        COUNT(DISTINCT children.id) as children_count
      FROM subjects s
      LEFT JOIN work_subjects ws ON s.id = ws.subject_id
      LEFT JOIN course_bibliography cb ON ws.work_id = cb.work_id
      LEFT JOIN subjects children ON s.id = children.parent_id
      WHERE s.parent_id = ?
      GROUP BY s.id, s.term, s.vocabulary, s.parent_id, s.created_at
      ORDER BY works_count DESC, s.term
      LIMIT ? OFFSET ?
    `;

    const [children] = await pool.execute(query, [id, parseInt(limit), parseInt(offset)]);

    await cache.set(cacheKey, children, 1800);
    return children;
  }

  async getSubjectHierarchy(id) {
    const cacheKey = `subject:${id}:hierarchy`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const hierarchy = [];
    let currentId = id;

    while (currentId) {
      const query = `
        SELECT 
          s.id,
          s.term,
          s.vocabulary,
          s.parent_id,
          COUNT(DISTINCT ws.work_id) as works_count
        FROM subjects s
        LEFT JOIN work_subjects ws ON s.id = ws.subject_id
        WHERE s.id = ?
        GROUP BY s.id, s.term, s.vocabulary, s.parent_id
      `;

      const [subjects] = await pool.execute(query, [currentId]);
      if (!subjects.length) break;

      const subject = subjects[0];
      hierarchy.unshift(subject);
      currentId = subject.parent_id;
    }

    await cache.set(cacheKey, hierarchy, 3600);
    return hierarchy;
  }

  async getSubjectWorks(id, filters = {}) {
    const cacheKey = `subject:${id}:works:v2:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { 
      min_relevance,
      year_from,
      year_to,
      document_type,
      language,
      limit = 20, 
      offset = 0 
    } = filters;

    let query = `
      SELECT 
        w.id,
        w.title,
        pub.year as publication_year,
        w.language,
        w.work_type as document_type,
        pub.open_access,
        CAST(ws.relevance_score AS DOUBLE) as relevance_score,
        ws.assigned_by,
        COUNT(DISTINCT cb.course_id) as used_in_courses
      FROM works w
      JOIN work_subjects ws ON w.id = ws.work_id
      LEFT JOIN publications pub ON w.id = pub.work_id
      LEFT JOIN course_bibliography cb ON w.id = cb.work_id
      WHERE ws.subject_id = ?
    `;

    const params = [id];

    if (min_relevance) {
      query += ' AND ws.relevance_score >= ?';
      params.push(parseFloat(min_relevance));
    }

    if (year_from) {
      query += ' AND pub.year >= ?';
      params.push(year_from);
    }

    if (year_to) {
      query += ' AND pub.year <= ?';
      params.push(year_to);
    }

    if (document_type) {
      query += ' AND w.work_type = ?';
      params.push(document_type);
    }

    if (language) {
      query += ' AND w.language = ?';
      params.push(language);
    }

    query += `
      GROUP BY w.id, w.title, pub.year, w.language, w.work_type, ws.relevance_score, ws.assigned_by
      ORDER BY ws.relevance_score DESC, used_in_courses DESC, pub.year DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const [works] = await pool.execute(query, params);

    for (const w of works) {
      if (w.relevance_score !== undefined) {
        w.relevance_score = parseFloat(w.relevance_score);
      }
      if (w.open_access !== undefined) {
        w.open_access = w.open_access === 1 || w.open_access === true;
      }
    }

    await cache.set(cacheKey, works, 1800);
    return works;
  }

  async getSubjectCourses(id, filters = {}) {
    const cacheKey = `subject:${id}:courses:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { 
      year_from,
      year_to,
      program_id,
      reading_type,
      limit = 20, 
      offset = 0 
    } = filters;

    let query = `
      SELECT DISTINCT
        c.id,
        c.program_id,
        c.code,
        c.name,
        c.credits,
        c.semester,
        c.year,
        cb.reading_type,
        COUNT(DISTINCT cb.work_id) as works_with_subject,
        COUNT(DISTINCT ci.canonical_person_id) as instructor_count
      FROM courses c
      JOIN course_bibliography cb ON c.id = cb.course_id
      JOIN work_subjects ws ON cb.work_id = ws.work_id
      LEFT JOIN course_instructors ci ON c.id = ci.course_id
      WHERE ws.subject_id = ?
    `;

    const params = [id];

    if (year_from) {
      query += ' AND c.year >= ?';
      params.push(year_from);
    }

    if (year_to) {
      query += ' AND c.year <= ?';
      params.push(year_to);
    }

    if (program_id) {
      query += ' AND c.program_id = ?';
      params.push(program_id);
    }

    if (reading_type) {
      query += ' AND cb.reading_type = ?';
      params.push(reading_type);
    }

    query += `
      GROUP BY c.id, c.program_id, c.code, c.name, c.credits, c.semester, c.year, cb.reading_type
      ORDER BY works_with_subject DESC, c.year DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const [courses] = await pool.execute(query, params);

    await cache.set(cacheKey, courses, 1800);
    return courses;
  }

  async getSubjectsStatistics() {
    const cacheKey = 'subjects:statistics';
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT 
        COUNT(*) as total_subjects,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_subjects,
        COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as child_subjects,
        COUNT(DISTINCT vocabulary) as vocabularies_count,
        COUNT(DISTINCT CASE WHEN ws.work_id IS NOT NULL THEN s.id END) as subjects_with_works,
        COUNT(DISTINCT ws.work_id) as total_work_subject_relations
      FROM subjects s
      LEFT JOIN work_subjects ws ON s.id = ws.subject_id
    `;

    const [stats] = await pool.execute(query);

    const vocabularyDistQuery = `
      SELECT 
        vocabulary,
        COUNT(*) as subject_count,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_count,
        COUNT(DISTINCT ws.work_id) as works_count
      FROM subjects s
      LEFT JOIN work_subjects ws ON s.id = ws.subject_id
      GROUP BY vocabulary
      ORDER BY subject_count DESC
    `;

    const [vocabularyDist] = await pool.execute(vocabularyDistQuery);

    const topSubjectsQuery = `
      SELECT 
        s.term,
        s.vocabulary,
        COUNT(DISTINCT ws.work_id) as works_count,
        COUNT(DISTINCT cb.course_id) as courses_count,
        AVG(ws.relevance_score) as avg_relevance
      FROM subjects s
      LEFT JOIN work_subjects ws ON s.id = ws.subject_id
      LEFT JOIN course_bibliography cb ON ws.work_id = cb.work_id
      GROUP BY s.id, s.term, s.vocabulary
      HAVING works_count > 0
      ORDER BY works_count DESC, courses_count DESC
      LIMIT 20
    `;

    const [topSubjects] = await pool.execute(topSubjectsQuery);

    const result = {
      ...stats[0],
      vocabulary_distribution: vocabularyDist,
      top_subjects: topSubjects
    };

    await cache.set(cacheKey, result, 3600);
    return result;
  }
}

module.exports = new SubjectsService();
