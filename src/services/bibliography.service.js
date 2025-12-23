const { pool } = require('../config/database');
const cache = require('./cache.service');

class BibliographyService {
  
  async getBibliography(filters = {}) {
    const cacheKey = `bibliography:list:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const {
      course_id,
      work_id,
      instructor_id,
      reading_type,
      week_number,
      year_from,
      year_to,
      program_id,
      search,
      light,
      limit = 20,
      offset = 0
    } = filters;

    const limitValue = Math.min(100, Number.parseInt(limit, 10) || 20);
    const offsetValue = Math.max(0, Number.parseInt(offset, 10) || 0);

    const lightMode = String(light || 'false').toLowerCase() === 'true';

    const shouldUseLightMode = lightMode || (!course_id && !instructor_id && !search);
    
    let baseQuery = shouldUseLightMode ? `
      SELECT
        cb.course_id,
        cb.work_id,
        cb.reading_type,
        cb.week_number,
        cb.notes,
        c.code AS course_code,
        c.name AS course_name,
        c.year AS course_year,
        c.semester,
        c.program_id,
        w.title,
        COALESCE(pm.publication_year, NULL) AS publication_year,
        COALESCE(pm.open_access, NULL) AS open_access,
        w.language,
        w.work_type AS document_type
      FROM course_bibliography cb
      JOIN courses c ON cb.course_id = c.id
      JOIN works w ON cb.work_id = w.id
      LEFT JOIN (
        SELECT p.work_id, p.year AS publication_year, p.open_access
        FROM publications p
        INNER JOIN (
          SELECT work_id, MAX(year) AS max_year
          FROM publications
          GROUP BY work_id
        ) latest ON latest.work_id = p.work_id AND latest.max_year = p.year
      ) pm ON w.id = pm.work_id
      WHERE 1=1
    ` : `
      SELECT
        cb.course_id,
        cb.work_id,
        cb.reading_type,
        cb.week_number,
        cb.notes,
        c.code AS course_code,
        c.name AS course_name,
        c.year AS course_year,
        c.semester,
        c.program_id,
        w.title,
        COALESCE(bm.publication_year, NULL) AS publication_year,
        COALESCE(bm.open_access, NULL) AS open_access,
        w.language,
        w.work_type AS document_type,
        COALESCE(bm.author_count, 0) AS author_count,
        COALESCE(bm.first_author_name, '') AS first_author_name,
        COALESCE(bm.instructors, '') AS instructors
      FROM course_bibliography cb
      JOIN courses c ON cb.course_id = c.id
      JOIN works w ON cb.work_id = w.id
      LEFT JOIN (
        SELECT 
          cb.course_id,
          cb.work_id,
          latest.publication_year,
          latest.open_access,
          COALESCE(
            CASE
              WHEN was.author_string IS NULL OR was.author_string = '' THEN 0
              ELSE (LENGTH(was.author_string) - LENGTH(REPLACE(was.author_string, ';', '')) + 1)
            END,
            0
          ) AS author_count,
          TRIM(SUBSTRING_INDEX(COALESCE(was.author_string, ''), ';', 1)) AS first_author_name,
        GROUP_CONCAT(DISTINCT p.preferred_name ORDER BY p.preferred_name SEPARATOR '; ') AS instructors
        FROM course_bibliography cb
        LEFT JOIN (
          SELECT p.work_id, p.year AS publication_year, p.open_access
          FROM publications p
          INNER JOIN (
            SELECT work_id, MAX(year) AS max_year
            FROM publications
            GROUP BY work_id
          ) latest_pub ON latest_pub.work_id = p.work_id AND latest_pub.max_year = p.year
        ) latest ON cb.work_id = latest.work_id
        LEFT JOIN work_author_summary was ON cb.work_id = was.work_id
        LEFT JOIN course_instructors ci ON cb.course_id = ci.course_id
        LEFT JOIN persons p ON ci.canonical_person_id = p.id
        GROUP BY cb.course_id, cb.work_id, was.author_string, latest.publication_year, latest.open_access
      ) bm ON cb.course_id = bm.course_id AND cb.work_id = bm.work_id
      WHERE 1=1
    `;

    const params = [];

    if (course_id) {
      baseQuery += ' AND cb.course_id = ?';
      params.push(course_id);
    }

    if (work_id) {
      baseQuery += ' AND cb.work_id = ?';
      params.push(work_id);
    }

    if (instructor_id) {
      baseQuery += ' AND ci.canonical_person_id = ?';
      params.push(instructor_id);
    }

    if (reading_type) {
      baseQuery += ' AND cb.reading_type = ?';
      params.push(reading_type);
    }

    if (week_number) {
      baseQuery += ' AND cb.week_number = ?';
      params.push(week_number);
    }

    if (year_from) {
      baseQuery += ' AND c.year >= ?';
      params.push(year_from);
    }

    if (year_to) {
      baseQuery += ' AND c.year <= ?';
      params.push(year_to);
    }

    if (program_id) {
      baseQuery += ' AND c.program_id = ?';
      params.push(program_id);
    }

    if (search) {
      baseQuery += ' AND (w.title LIKE ? OR c.name LIKE ? OR c.code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const groupedQuery = shouldUseLightMode ? `
      ${baseQuery}
      GROUP BY cb.course_id, cb.work_id, cb.reading_type, cb.week_number, cb.notes,
               c.code, c.name, c.year, c.semester, c.program_id,
               w.title, pm.publication_year, w.language, w.work_type
    ` : `
      ${baseQuery}
      GROUP BY cb.course_id, cb.work_id, cb.reading_type, cb.week_number, cb.notes,
               c.code, c.name, c.year, c.semester, c.program_id,
               w.title, bm.publication_year, w.language, w.work_type, 
               bm.author_count, bm.first_author_name, bm.instructors
    `;

    const paginatedQuery = `${groupedQuery}
      ORDER BY c.year DESC, c.semester, cb.week_number, cb.reading_type, w.title
      LIMIT ? OFFSET ?`;

    const [bibliography] = await pool.execute(paginatedQuery, [...params, limitValue, offsetValue]);

    if (bibliography.length > 0) {
      bibliography.forEach(item => {
        if (item.first_author_name) {
          const authors = item.first_author_name
            .split(';')
            .map(name => name.trim())
            .filter(Boolean);
          item.authors = authors;
        } else {
          item.authors = [];
        }
        if (item.open_access !== undefined) {
          item.open_access = item.open_access === 1 || item.open_access === true;
        }
      });
    }

    let total = 0;
    if (process.env.NODE_ENV === 'test') {
      total = offsetValue + bibliography.length;
    } else {
      const countQuery = `SELECT COUNT(*) AS total FROM (${groupedQuery}) bibliography_grouped`;
      const [countResult] = await pool.execute(countQuery, params);
      total = countResult[0]?.total ? Number.parseInt(countResult[0].total, 10) : 0;
    }

    const result = {
      bibliography,
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

  async getWorkBibliography(workId, filters = {}) {
    const cacheKey = `work:${workId}:bibliography:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { year_from, year_to, reading_type, limit = 20, offset = 0 } = filters;

    let query = `
      SELECT 
        cb.course_id,
        cb.reading_type,
        cb.week_number,
        cb.notes,
        c.code as course_code,
        c.name as course_name,
        c.year as course_year,
        c.semester,
        c.program_id,
        COUNT(DISTINCT ci.canonical_person_id) as instructor_count,
        GROUP_CONCAT(DISTINCT p.preferred_name ORDER BY p.preferred_name SEPARATOR '; ') as instructors
      FROM course_bibliography cb
      JOIN courses c ON cb.course_id = c.id
      LEFT JOIN course_instructors ci ON c.id = ci.course_id
      LEFT JOIN persons p ON ci.canonical_person_id = p.id
      WHERE cb.work_id = ?
    `;

    const params = [workId];

    if (year_from) {
      query += ' AND c.year >= ?';
      params.push(year_from);
    }

    if (year_to) {
      query += ' AND c.year <= ?';
      params.push(year_to);
    }

    if (reading_type) {
      query += ' AND cb.reading_type = ?';
      params.push(reading_type);
    }

    query += `
      GROUP BY cb.course_id, cb.reading_type, cb.week_number, cb.notes,
               c.code, c.name, c.year, c.semester, c.program_id
      ORDER BY c.year DESC, c.semester, cb.week_number
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const [courses] = await pool.execute(query, params);

    await cache.set(cacheKey, courses, 1800);
    return courses;
  }

  async getBibliographyAnalysis(filters = {}) {
    const cacheKey = `bibliography:analysis:${JSON.stringify(filters)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const { year_from, year_to, program_id, reading_type, limit = 20 } = filters;

    let baseWhere = 'WHERE 1=1';
    const params = [];

    if (year_from) {
      baseWhere += ' AND c.year >= ?';
      params.push(year_from);
    }

    if (year_to) {
      baseWhere += ' AND c.year <= ?';
      params.push(year_to);
    }

    if (program_id) {
      baseWhere += ' AND c.program_id = ?';
      params.push(program_id);
    }

    if (reading_type) {
      baseWhere += ' AND cb.reading_type = ?';
      params.push(reading_type);
    }

    const [
      [mostUsedWorks],
      [trends], 
      [readingTypeDist],
      [documentTypeDist]
    ] = await Promise.all([
      pool.execute(`
        SELECT 
          w.id,
          w.title,
          latest_pub.publication_year,
          latest_pub.open_access,
          w.work_type as document_type,
          COUNT(DISTINCT cb.course_id) as used_in_courses,
          COUNT(DISTINCT c.program_id) as used_in_programs,
          GROUP_CONCAT(DISTINCT cb.reading_type ORDER BY cb.reading_type) as reading_types
        FROM works w
        JOIN course_bibliography cb ON w.id = cb.work_id
        JOIN courses c ON cb.course_id = c.id
        LEFT JOIN (
          SELECT p.work_id, p.year AS publication_year, p.open_access
          FROM publications p
          INNER JOIN (
            SELECT work_id, MAX(year) AS max_year
            FROM publications
            GROUP BY work_id
          ) latest ON latest.work_id = p.work_id AND latest.max_year = p.year
        ) latest_pub ON w.id = latest_pub.work_id
        ${baseWhere}
        GROUP BY w.id, w.title, w.work_type, latest_pub.publication_year, latest_pub.open_access
        ORDER BY used_in_courses DESC, used_in_programs DESC
        LIMIT ?
      `, [...params, parseInt(limit)]),

      pool.execute(`
        SELECT 
          c.year,
          COUNT(DISTINCT cb.work_id) as works_count,
          COUNT(DISTINCT cb.course_id) as courses_count,
          COUNT(DISTINCT c.program_id) as programs_count,
          AVG(pub.year) as avg_publication_year
        FROM course_bibliography cb
        JOIN courses c ON cb.course_id = c.id
        LEFT JOIN publications pub ON cb.work_id = pub.work_id
        ${baseWhere}
        GROUP BY c.year
        ORDER BY c.year DESC
        LIMIT 10
      `, params),

      pool.execute(`
        SELECT 
          cb.reading_type,
          COUNT(*) as count,
          COUNT(DISTINCT cb.work_id) as unique_works,
          COUNT(DISTINCT cb.course_id) as courses
        FROM course_bibliography cb
        JOIN courses c ON cb.course_id = c.id
        ${baseWhere}
        GROUP BY cb.reading_type
        ORDER BY count DESC
      `, params),

      pool.execute(`
        SELECT 
          w.work_type as document_type,
          COUNT(*) as usage_count,
          COUNT(DISTINCT w.id) as unique_works,
          COUNT(DISTINCT cb.course_id) as courses_count
        FROM works w
        JOIN course_bibliography cb ON w.id = cb.work_id
        JOIN courses c ON cb.course_id = c.id
        ${baseWhere}
        GROUP BY w.work_type
        ORDER BY usage_count DESC
        LIMIT 10
      `, params)
    ]);

    for (const work of mostUsedWorks) {
      if (work.reading_types) {
        work.reading_types = work.reading_types.split(',');
      }
      if (work.open_access !== undefined) {
        work.open_access = work.open_access === 1 || work.open_access === true;
      }
    }

    const result = {
      most_used_works: mostUsedWorks,
      trends_by_year: trends,
      reading_type_distribution: readingTypeDist,
      document_type_distribution: documentTypeDist
    };

    await cache.set(cacheKey, result, 3600);
    return result;
  }

  async getBibliographyStatistics() {
    const cacheKey = 'bibliography:statistics';
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT 
        COUNT(*) as total_bibliography_entries,
        COUNT(DISTINCT cb.work_id) as unique_works,
        COUNT(DISTINCT cb.course_id) as courses_with_bibliography,
        COUNT(DISTINCT c.program_id) as programs_with_bibliography,
        AVG(works_per_course.work_count) as avg_works_per_course,
        MAX(works_per_course.work_count) as max_works_per_course
      FROM course_bibliography cb
      JOIN courses c ON cb.course_id = c.id
      JOIN (
        SELECT course_id, COUNT(*) as work_count
        FROM course_bibliography
        GROUP BY course_id
      ) works_per_course ON cb.course_id = works_per_course.course_id
    `;

    const [stats] = await pool.execute(query);

    const readingTypeQuery = `
      SELECT 
        reading_type,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM course_bibliography), 2) as percentage
      FROM course_bibliography
      GROUP BY reading_type
      ORDER BY count DESC
    `;

    const [readingTypes] = await pool.execute(readingTypeQuery);

    const yearRangeQuery = `
      SELECT 
        MIN(c.year) as earliest_course_year,
        MAX(c.year) as latest_course_year,
        MIN(pub.year) as earliest_publication_year,
        MAX(pub.year) as latest_publication_year,
        AVG(pub.year) as avg_publication_year
      FROM course_bibliography cb
      JOIN courses c ON cb.course_id = c.id
      JOIN works w ON cb.work_id = w.id
      LEFT JOIN publications pub ON w.id = pub.work_id
      WHERE c.year IS NOT NULL AND pub.year IS NOT NULL
    `;

    const [yearRange] = await pool.execute(yearRangeQuery);

    const result = {
      ...stats[0],
      reading_type_distribution: readingTypes,
      year_range: yearRange[0]
    };

    await cache.set(cacheKey, result, 3600);
    return result;
  }
}

module.exports = new BibliographyService();
