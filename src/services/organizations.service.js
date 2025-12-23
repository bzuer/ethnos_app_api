const { sequelize } = require('../models');
const { Op } = require('sequelize');
const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const sphinxService = require('./sphinx.service');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { formatOrganizationListItem, formatOrganizationDetails } = require('../dto/organization.dto');
const { withTimeout } = require('../utils/db');

class OrganizationsService {
  async getOrganizationById(id) {
    const t0 = Date.now();
    const cacheKey = `organization:v2:${id}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Organization ${id} retrieved from cache`);
        return cached;
      }

      const orgRows = await sequelize.query(withTimeout(`
        SELECT * FROM organizations WHERE id = :id
      `), {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      });

      if (!orgRows || orgRows.length === 0) {
        return null;
      }

      const organization = orgRows[0];

      let metrics = {
        affiliated_authors_count: parseInt(organization.researcher_count || 0, 10) || 0,
        works_count: parseInt(organization.publication_count || 0, 10) || 0,
        first_publication_year: null,
        latest_publication_year: null,
        total_citations: organization.total_citations || null,
        open_access_works_count: organization.open_access_works_count || null
      };
      let usedView = false;
      try {
        const [row] = await sequelize.query(withTimeout(`
          SELECT 
            unique_researchers,
            total_works,
            open_access_works,
            total_citations,
            first_publication_year,
            latest_publication_year
          FROM v_institution_productivity
          WHERE id = :id
          LIMIT 1
        `), { replacements: { id }, type: sequelize.QueryTypes.SELECT });
        if (row) {
          usedView = true;
          metrics = {
            affiliated_authors_count: parseInt(row.unique_researchers || 0, 10) || 0,
            works_count: parseInt(row.total_works || 0, 10) || 0,
            first_publication_year: row.first_publication_year || null,
            latest_publication_year: row.latest_publication_year || null,
            total_citations: row.total_citations !== undefined ? parseInt(row.total_citations, 10) : null,
            open_access_works_count: row.open_access_works !== undefined ? parseInt(row.open_access_works, 10) : null
          };
        }
      } catch (_) {
        usedView = false;
      }
      if (!usedView) {
        try {
          const [agg] = await sequelize.query(`
            SELECT 
              COUNT(DISTINCT a.person_id) AS affiliated_authors_count,
              COUNT(DISTINCT a.work_id) AS works_count,
              MIN(pub.year) AS first_publication_year,
              MAX(pub.year) AS latest_publication_year,
              SUM(CASE WHEN pub.open_access = 1 THEN 1 ELSE 0 END) AS open_access_works_count
            FROM authorships a
            LEFT JOIN publications pub ON pub.work_id = a.work_id
            WHERE a.affiliation_id = :id
          `, { replacements: { id }, type: sequelize.QueryTypes.SELECT });
          if (agg) {
            metrics = {
              affiliated_authors_count: parseInt(agg.affiliated_authors_count ?? metrics.affiliated_authors_count, 10) || 0,
              works_count: parseInt(agg.works_count ?? metrics.works_count, 10) || 0,
              first_publication_year: agg.first_publication_year || metrics.first_publication_year,
              latest_publication_year: agg.latest_publication_year || metrics.latest_publication_year,
              total_citations: metrics.total_citations || null,
              open_access_works_count: agg.open_access_works_count !== undefined && agg.open_access_works_count !== null
                ? parseInt(agg.open_access_works_count, 10) || 0
                : metrics.open_access_works_count || null
            };
          }
        } catch (e) {
          logger.warn(`Org ${id} metrics aggregation fallback to table fields`, { error: e.message });
        }
      }

      const recentWorks = await sequelize.query(withTimeout(`
        SELECT DISTINCT
          w.id,
          w.title,
          w.abstract,
          w.work_type,
          w.language,
          pub.year,
          pub.doi,
          pub.volume,
          pub.issue,
          pub.pages,
          pub.peer_reviewed,
          pub.open_access,
          v.id AS venue_id,
          v.name AS venue_name,
          v.type AS venue_type,
          was.author_string,
          CASE 
            WHEN was.author_string IS NOT NULL AND was.author_string != '' THEN 
              (LENGTH(was.author_string) - LENGTH(REPLACE(was.author_string, ';', '')) + 1)
            ELSE 0 
          END as author_count,
          CONCAT(p_first.given_names, ' ', p_first.family_name) as first_author_name
        FROM works w
        INNER JOIN authorships a ON w.id = a.work_id
        LEFT JOIN publications pub ON w.id = pub.work_id
        LEFT JOIN venues v ON pub.venue_id = v.id
        LEFT JOIN work_author_summary was ON w.id = was.work_id
        LEFT JOIN persons p_first ON was.first_author_id = p_first.id
        WHERE a.affiliation_id = :id
        ORDER BY COALESCE(pub.year, 2024) DESC, w.id DESC
        LIMIT 10
      `), {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      });

      let topAuthors = [];
      try {
        topAuthors = await sequelize.query(withTimeout(`
          SELECT 
            p.id as person_id,
            p.preferred_name,
            COUNT(DISTINCT a.work_id) AS works_count,
            MAX(pub.year) AS latest_publication_year
          FROM authorships a
          JOIN persons p ON p.id = a.person_id
          LEFT JOIN publications pub ON pub.work_id = a.work_id
          WHERE a.affiliation_id = :id
          GROUP BY p.id, p.preferred_name
          ORDER BY works_count DESC, p.preferred_name ASC
          LIMIT 10
        `), {
          replacements: { id },
          type: sequelize.QueryTypes.SELECT
        });
      } catch (e) {
        topAuthors = [];
      }

      let productionByType = [];
      try {
        productionByType = await sequelize.query(withTimeout(`
          SELECT 
            w.work_type AS type,
            COUNT(DISTINCT w.id) AS works_count
          FROM authorships a
          JOIN works w ON w.id = a.work_id
          WHERE a.affiliation_id = :id
          GROUP BY w.work_type
          ORDER BY works_count DESC
        `), {
          replacements: { id },
          type: sequelize.QueryTypes.SELECT
        });
      } catch (e) {
        productionByType = [];
      }

      let publicationTrend = [];
      try {
        publicationTrend = await sequelize.query(withTimeout(`
          SELECT 
            pub.year,
            COUNT(DISTINCT w.id) AS works_count
          FROM authorships a
          JOIN works w ON w.id = a.work_id
          JOIN publications pub ON pub.work_id = w.id
          WHERE a.affiliation_id = :id
            AND pub.year IS NOT NULL
          GROUP BY pub.year
          ORDER BY pub.year DESC
          LIMIT 10
        `), {
          replacements: { id },
          type: sequelize.QueryTypes.SELECT
        });
      } catch (e) {
        publicationTrend = [];
      }

      const shaped = formatOrganizationDetails({
        ...organization,
        metrics,
        production_summary: {
          by_work_type: productionByType,
          publication_trend: publicationTrend
        },
        top_authors: topAuthors,
        recent_works: recentWorks
      });
      
      await cacheService.set(cacheKey, shaped, 300);
      logger.info(`Organization ${id} cached for 5 minutes`);
      
      return shaped;
    } catch (error) {
      logger.error('Error fetching organization by ID:', error);
      throw error;
    }
  }

  async getOrganizations(filters = {}) {
    const t0 = Date.now();
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { search, country_code, type } = filters;
    
    const cacheKey = `organizations:v3:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Organizations list retrieved from cache');
        return cached;
      }

      const whereConditions = [];
      const countReplacements = {};

      if (search) {
        const sphinxEnabled = String(process.env.SPHINX_ENABLED || 'true').toLowerCase() !== 'false';
        const term = (search || '').trim();
        if (sphinxEnabled && term.length >= 2) {
          try {
            return await this.searchOrganizationsSphinx(term, { limit, offset, country_code, type });
          } catch (e) {
            logger.warn('Organizations Sphinx search failed in service; trying FULLTEXT', { error: e.message });
          }
        }
        try {
          return await this.searchOrganizationsFulltext(term, { limit, offset, country_code, type });
        } catch (e) {
          logger.warn('Organizations FULLTEXT search failed; using LIKE fallback', { error: e.message });
          return await this.fallbackOrganizationsSearch(term, { limit, offset, country_code, type });
        }
      }

      if (country_code) {
        whereConditions.push('o.country_code = :country_code');
        countReplacements.country_code = country_code;
      }

      if (type) {
        whereConditions.push('o.type = :type');
        countReplacements.type = type;
      }

      whereConditions.push("TRIM(o.name) != ''");
      const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const limitValue = Math.min(100, parseInt(limit, 10) || 20);
      const offsetValue = Math.max(0, parseInt(offset, 10) || 0);

      const preferByResearchers = process.env.NODE_ENV !== 'test' && process.env.DISABLE_ORG_RESEARCHER_SORT !== 'true';

      const [baseOrganizations, countResult] = await Promise.all([
        sequelize.query(`
          SELECT
            o.id,
            o.name,
            o.type,
            o.country_code,
            o.city,
            o.ror_id
          FROM organizations o
          ${preferByResearchers ? 'LEFT JOIN v_institution_productivity ip ON o.id = ip.id' : ''}
          ${whereClause}
          ORDER BY ${preferByResearchers ? 'COALESCE(ip.unique_researchers, 0) DESC, o.name ASC' : 'o.name ASC'}
          LIMIT :limit OFFSET :offset
        `, {
          replacements: { ...countReplacements, limit: limitValue, offset: offsetValue },
          type: sequelize.QueryTypes.SELECT
        }),
        sequelize.query(`
          SELECT COUNT(*) AS total
          FROM organizations o
          ${whereClause}
        `, {
          replacements: countReplacements,
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      const orgIds = baseOrganizations.map(org => org.id);
      const metricsMap = {};

      if (orgIds.length > 0) {
        const metricsQuery = `
          SELECT
            a.affiliation_id AS org_id,
            COUNT(DISTINCT a.work_id) AS works_count,
            COUNT(DISTINCT a.person_id) AS unique_researchers,
            MIN(pub.year) AS first_publication_year,
            MAX(pub.year) AS latest_publication_year,
            SUM(CASE WHEN pub.open_access = 1 THEN 1 ELSE 0 END) AS open_access_works_count
          FROM authorships a
          LEFT JOIN publications pub ON pub.work_id = a.work_id
          WHERE a.affiliation_id IN (:orgIds)
          GROUP BY a.affiliation_id
        `;

        const metricsRows = await sequelize.query(metricsQuery, {
          replacements: { orgIds },
          type: sequelize.QueryTypes.SELECT
        });

        metricsRows.forEach(row => {
          metricsMap[row.org_id] = {
            works_count: parseInt(row.works_count, 10) || 0,
            unique_researchers: parseInt(row.unique_researchers, 10) || 0,
            first_publication_year: row.first_publication_year,
            latest_publication_year: row.latest_publication_year,
            open_access_works_count: parseInt(row.open_access_works_count, 10) || 0
          };
        });
      }

      const total = countResult[0]?.total ? parseInt(countResult[0].total, 10) : 0;

      const data = baseOrganizations.map(org => {
        const metrics = metricsMap[org.id] || {};
        return formatOrganizationListItem({
          ...org,
          metrics: {
            works_count: metrics.works_count,
            affiliated_authors_count: metrics.unique_researchers,
            first_publication_year: metrics.first_publication_year,
            latest_publication_year: metrics.latest_publication_year,
            open_access_works_count: metrics.open_access_works_count
          }
        });
      });

      const result = {
        data,
        pagination: createPagination(page, limitValue, total),
        performance: {
          engine: 'MariaDB',
          query_type: 'list'
        }
      };
      result.performance.elapsed_ms = Date.now() - t0;

      await cacheService.set(cacheKey, result, 14400);
      logger.info('Organizations list cached for 4 hours');
      
      return result;
    } catch (error) {
      logger.error('Error fetching organizations:', error);
      throw error;
    }
  }

  
  async searchOrganizationsSphinx(searchTerm, options = {}) {
    const pagination = normalizePagination(options);
    const { page, limit, offset } = pagination;
    const { country_code, type } = options;
    const cacheKey = `organizations:sphinx:${searchTerm}:${limit}:${offset}:${country_code || 'all'}:${type || 'all'}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      const spx = await sphinxService.searchOrganizationIds(searchTerm, { limit, offset, country_code, type });
      const ids = Array.isArray(spx?.ids) ? spx.ids : [];
      const total = parseInt(spx?.total || 0, 10) || 0;

      if (ids.length === 0) {
        const empty = {
          data: [],
          pagination: createPagination(page, limit, total),
          performance: {
            engine: 'Sphinx',
            query_type: 'search',
            sphinx_query_ms: spx?.query_time || null,
            hydrated: 0
          },
          meta: {
            note: 'Sphinx returned no results; hydration skipped'
          }
        };
        await cacheService.set(cacheKey, empty, 3600);
        return empty;
      }

      const orderField = `FIELD(o.id, ${ids.map(() => '?').join(',')})`;
      const hydrated = await sequelize.query(`
        SELECT o.id, o.name, o.type, o.country_code, o.city, o.ror_id
        FROM organizations o
        WHERE o.id IN (${ids.map(() => '?').join(',')})
        ORDER BY ${orderField}
      `, { replacements: [...ids, ...ids], type: sequelize.QueryTypes.SELECT });

      const formattedResults = (hydrated || []).map(org => formatOrganizationListItem({
        ...org,
        metrics: {
          works_count: 0,
          affiliated_authors_count: 0,
          latest_publication_year: null,
          first_publication_year: null
        }
      }));

      const result = {
        data: formattedResults,
        pagination: createPagination(page, limit, total),
        performance: {
          engine: 'Sphinx+MariaDB',
          query_type: 'search_hydrate',
          sphinx_query_ms: spx?.query_time || null
        }
      };

      await cacheService.set(cacheKey, result, 3600);
      logger.info(`Organizations Sphinx search (IDs) cached: "${searchTerm}" - ${formattedResults.length} results`);
      return result;

    } catch (error) {
      logger.error(`Sphinx organizations search failed for term "${searchTerm}":`, error);
      try {
        return await this.searchOrganizationsFulltext(searchTerm, options);
      } catch (_) {
        return await this.fallbackOrganizationsSearch(searchTerm, options);
      }
    }
  }

  
  async searchOrganizationsFulltext(searchTerm, options = {}) {
    const pagination = normalizePagination(options);
    const { page, limit, offset } = pagination;
    const { country_code, type } = options;

    const whereClauses = [
      'MATCH(o.name) AGAINST(:q IN NATURAL LANGUAGE MODE)'
    ];
    const replacements = {
      q: searchTerm,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    };
    if (country_code) {
      whereClauses.push('o.country_code = :country_code');
      replacements.country_code = country_code;
    }
    if (type) {
      whereClauses.push('o.type = :type');
      replacements.type = type;
    }
    const whereClause = `WHERE ${whereClauses.join(' AND ')}`;

    const [rows, countRows] = await Promise.all([
      sequelize.query(`
        SELECT 
          o.id, o.name, o.type, o.country_code, o.city, o.ror_id,
          MATCH(o.name) AGAINST(:q IN NATURAL LANGUAGE MODE) AS relevance
        FROM organizations o
        ${whereClause}
        ORDER BY relevance DESC, o.id ASC
        LIMIT :limit OFFSET :offset
      `, { replacements, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(`
        SELECT COUNT(*) AS total
        FROM organizations o
        ${whereClause}
      `, { replacements: { q: replacements.q, country_code: replacements.country_code, type: replacements.type }, type: sequelize.QueryTypes.SELECT })
    ]);

    const total = parseInt(countRows?.[0]?.total || 0, 10);
    const data = rows.map(org => formatOrganizationListItem({
      ...org,
      relevance: org.relevance || null,
      metrics: { works_count: 0, affiliated_authors_count: 0, latest_publication_year: null, first_publication_year: null }
    }));

    return {
      data,
      pagination: createPagination(page, limit, total),
      performance: { engine: 'MariaDB-FULLTEXT', query_type: 'search_fulltext' }
    };
  }

  
  async fallbackOrganizationsSearch(searchTerm, options = {}) {
    const pagination = normalizePagination(options);
    const { page, limit, offset } = pagination;
    const { country_code, type } = options;
    
    logger.warn('Using MariaDB fallback for organizations search');

    const whereConditions = [];
    const replacements = { limit: parseInt(limit, 10), offset: parseInt(offset, 10) };

    whereConditions.push('o.name LIKE :search');
    replacements.search = `%${searchTerm}%`;

    if (country_code) {
      whereConditions.push('o.country_code = :country_code');
      replacements.country_code = country_code;
    }

    if (type) {
      whereConditions.push('o.type = :type');
      replacements.type = type;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [organizations, countResult] = await Promise.all([
      sequelize.query(`
        SELECT o.id, o.name, o.type, o.country_code, o.city, o.ror_id
        FROM organizations o
        ${whereClause}
        ORDER BY o.name ASC
        LIMIT :limit OFFSET :offset
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }),
      
      sequelize.query(`
        SELECT COUNT(*) as total
        FROM organizations o
        ${whereClause}
      `, {
        replacements: {
          search: replacements.search,
          country_code: replacements.country_code,
          type: replacements.type
        },
        type: sequelize.QueryTypes.SELECT
      })
    ]);

    const total = parseInt(countResult[0]?.total || 0, 10);

    const formattedResults = organizations.map(org => formatOrganizationListItem({
      ...org,
      metrics: {
        works_count: 0,
        affiliated_authors_count: 0,
        latest_publication_year: null,
        first_publication_year: null
      }
    }));

    return {
      data: formattedResults,
      pagination: createPagination(page, limit, total),
      performance: {
        engine: 'MariaDB-LIKE',
        query_type: 'search_fallback'
      },
      meta: {
        note: 'Using MariaDB fallback due to Sphinx error'
      }
    };
  }

  async getOrganizationWorks(organizationId, filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { type, year_from, year_to, language } = filters;
    
    const cacheKey = `organization:${organizationId}:works:${JSON.stringify(filters)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`Organization ${organizationId} works retrieved from cache`);
        return cached;
      }

      const orgExists = await sequelize.query(`
        SELECT id FROM organizations WHERE id = :organizationId
      `, {
        replacements: { organizationId },
        type: sequelize.QueryTypes.SELECT
      });

      if (!orgExists || orgExists.length === 0) {
        return null;
      }

      const whereConditions = ['a.affiliation_id = :organizationId'];
      const replacements = { 
        organizationId, 
        limit: parseInt(limit), 
        offset: parseInt(offset) 
      };

      if (type) {
        whereConditions.push('w.work_type = :type');
        replacements.type = type;
      }

      if (year_from) {
        whereConditions.push('pub.year >= :year_from');
        replacements.year_from = parseInt(year_from);
      }

      if (year_to) {
        whereConditions.push('pub.year <= :year_to');
        replacements.year_to = parseInt(year_to);
      }

      if (language) {
        whereConditions.push('w.language = :language');
        replacements.language = language;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      const [works, countResult] = await Promise.all([
        sequelize.query(`
          SELECT DISTINCT
            w.id,
            w.title,
            w.work_type,
            w.language,
            pub.peer_reviewed,
            pub.open_access,
            pub.year,
            pub.doi,
            pub.volume,
            pub.issue,
            pub.pages,
            v.id AS venue_id,
            v.name AS venue_name,
            v.type AS venue_type,
            was.author_string,
            CASE 
              WHEN was.author_string IS NOT NULL AND was.author_string != '' THEN 
                (LENGTH(was.author_string) - LENGTH(REPLACE(was.author_string, ';', '')) + 1)
              ELSE 0 
            END as author_count,
            CONCAT(p_first.given_names, ' ', p_first.family_name) as first_author_name
          FROM works w
          INNER JOIN authorships a ON w.id = a.work_id
          LEFT JOIN publications pub ON w.id = pub.work_id
          LEFT JOIN venues v ON pub.venue_id = v.id
          LEFT JOIN work_author_summary was ON w.id = was.work_id
          LEFT JOIN persons p_first ON was.first_author_id = p_first.id
          ${whereClause}
          ORDER BY COALESCE(pub.year, 2024) DESC, w.id DESC
          LIMIT :limit OFFSET :offset
        `, {
          replacements,
          type: sequelize.QueryTypes.SELECT
        }),
        
        sequelize.query(`
          SELECT COUNT(DISTINCT w.id) as total
          FROM works w
          INNER JOIN authorships a ON w.id = a.work_id
          LEFT JOIN publications pub ON w.id = pub.work_id
          ${whereClause}
        `, {
          replacements: Object.fromEntries(
            Object.entries(replacements).filter(([key]) => !['limit', 'offset'].includes(key))
          ),
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      const total = countResult[0].total;

      const data = works.map(work => {
        const authorsPreview = work.author_string
          ? work.author_string.split(';').map(author => author.trim()).filter(Boolean)
          : [];

        return {
          id: work.id,
          title: work.title,
          type: work.work_type,
          language: work.language,
          open_access: work.open_access === 1 || work.open_access === true,
          publication: {
            year: work.year,
            doi: work.doi,
            volume: work.volume,
            issue: work.issue,
            pages: work.pages,
            peer_reviewed: work.peer_reviewed === 1,
            open_access: work.open_access === 1
          },
          venue: work.venue_name ? {
            id: work.venue_id,
            name: work.venue_name,
            type: work.venue_type
          } : null,
          authors: {
            author_count: work.author_count || authorsPreview.length,
            first_author_name: work.first_author_name || authorsPreview[0] || null,
            authors_preview: authorsPreview.slice(0, 3)
          }
        };
      });

      const result = {
        data,
        pagination: createPagination(page, limit, total),
        performance: {
          engine: 'MariaDB',
          query_type: 'organization_works'
        }
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`Organization ${organizationId} works cached for 5 minutes`);
      
      return result;
    } catch (error) {
      logger.error(`Error fetching works for organization ${organizationId}:`, error);
      throw error;
    }
  }
}

module.exports = new OrganizationsService();
