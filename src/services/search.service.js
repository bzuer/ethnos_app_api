const cacheService = require('./cache.service');
const { logger } = require('../middleware/errorHandler');
const personsService = require('./persons.service');
const worksService = require('./works.service');
const organizationsService = require('./organizations.service');
const sphinxService = require('./sphinx.service');
const { createPagination, normalizePagination } = require('../utils/pagination');


class SearchService {
  async searchWorks(query, filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { type, language, year_from, year_to } = filters;
    const trimmedQuery = (query || '').trim();
    const includeFacets = filters.include_facets === true;

    const cacheKey = `search:works:${trimmedQuery}:${page}:${limit}:${offset}:${type || 'all'}:${language || 'all'}:${year_from || 'all'}:${year_to || 'all'}:${includeFacets}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Works search retrieved from cache');
        return cached;
      }

      const worksFilters = {
        page,
        limit,
        offset,
        search: trimmedQuery,
        type,
        language,
        year_from,
        year_to
      };

      const worksResult = await worksService.getWorks(worksFilters);

      let facets;
      const sphinxEnabled = String(process.env.SPHINX_ENABLED || 'true').toLowerCase() !== 'false';
      if (
        includeFacets &&
        sphinxEnabled &&
        trimmedQuery.length >= 2 &&
        worksResult?.performance?.engine &&
        worksResult.performance.engine.toUpperCase().includes('SPHINX')
      ) {
        try {
          facets = await sphinxService.getFacets(trimmedQuery);
        } catch (error) {
          logger.warn('Failed to fetch Sphinx facets for works search', { error: error.message });
        }
      }

      const data = (worksResult.data || []).map(item => ({
        ...item,
        relevance: null
      }));

      const result = {
        data,
        pagination: worksResult.pagination || createPagination(page, limit, data.length),
        meta: {
          query: trimmedQuery,
          search_type: 'fulltext',
          ...(facets ? { facets } : {})
        },
        performance: {
          ...((worksResult && worksResult.performance) || (worksResult && worksResult.meta && worksResult.meta.performance) || {}),
          controller: 'searchWorks'
        }
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`Works search cached: "${trimmedQuery}" - ${result.pagination.total} results`);
      return result;
    } catch (error) {
      logger.error('Error in works search:', error);
      throw error;
    }
  }

  async searchPersons(query, filters = {}) {
    const pagination = normalizePagination(filters);
    const { page, limit, offset } = pagination;
    const { verified, engine } = filters;
    const trimmedQuery = (query || '').trim();
    const cacheKey = `search:persons:${trimmedQuery}:${page}:${limit}:${offset}:${verified ?? 'all'}:${engine || 'auto'}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Persons search retrieved from cache');
        return cached;
      }

      const sphinxEnabled = String(process.env.SPHINX_ENABLED || 'true').toLowerCase() !== 'false';
      const wantsSphinx = (engine || '').toLowerCase() === 'sphinx';
      const prefersSphinx = wantsSphinx || (sphinxEnabled && (engine || '').toLowerCase() !== 'mariadb');

      let serviceResult = null;

      if (prefersSphinx && trimmedQuery.length >= 2) {
        try {
          serviceResult = await personsService.searchPersonsSphinx(trimmedQuery, {
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
            verified
          });
          logger.info(`Persons Sphinx search completed: "${trimmedQuery}" - ${serviceResult.data.length} results`);
        } catch (error) {
          logger.warn('Sphinx persons search failed, falling back to MariaDB', { error: error.message });
        }
      }

      if (!serviceResult) {
        serviceResult = await personsService.fallbackPersonsSearch(trimmedQuery, {
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          verified
        });
        logger.info(`Persons MariaDB search completed: "${trimmedQuery}" - ${serviceResult.data.length} results`);
      }

      const data = (serviceResult.data || []).map(person => ({
        ...person,
        relevance: person.relevance !== undefined && person.relevance !== null
          ? person.relevance
          : null
      }));

      const result = {
        data,
        pagination: serviceResult.pagination || createPagination(page, limit, data.length),
        meta: {
          query: trimmedQuery,
          search_type: 'fulltext',
          ...(verified !== undefined ? { verified } : {}),
          ...(serviceResult.meta || {})
        },
        performance: {
          ...(serviceResult.performance || {}),
          controller: 'searchPersons'
        }
      };

      await cacheService.set(cacheKey, result, 300);
      return result;
    } catch (error) {
      logger.error('Error in persons search:', error);
      throw error;
    }
  }


  async globalSearch(query, filters = {}) {
    const { limit = 5 } = filters;
    const trimmedQuery = (query || '').trim();

    const cacheKey = `search:global:${trimmedQuery}:${limit}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('Global search retrieved from cache');
        return cached;
      }

      const start = process.hrtime.bigint();

      const [works, persons] = await Promise.all([
        this.searchWorks(trimmedQuery, { page: 1, limit, offset: 0 }),
        this.searchPersons(trimmedQuery, { page: 1, limit, offset: 0 })
      ]);

      const totalTimeMs = Number(((process.hrtime.bigint() - start) / BigInt(1e6)).toString());

      const result = {
        data: {
          works: {
            total: works.pagination.total,
            results: works.data.slice(0, limit)
          },
          persons: {
            total: persons.pagination.total,
            results: persons.data.slice(0, limit)
          },
          organizations: {
            total: 0,
            results: [],
            note: "Organizations search disabled for performance optimization"
          }
        },
        meta: {
          query: trimmedQuery,
          query_time_ms: totalTimeMs,
          sources: {
            works: works.performance || null,
            persons: persons.performance || null,
            organizations: null
          }
        }
      };

      await cacheService.set(cacheKey, result, 300);
      logger.info(`Global search cached: "${trimmedQuery}"`);
      
      return result;
    } catch (error) {
      logger.error('Error in global search:', error);
      throw error;
    }
  }
}

module.exports = new SearchService();
