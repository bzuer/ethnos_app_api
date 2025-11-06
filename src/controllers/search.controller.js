const { validationResult } = require('express-validator');
const searchService = require('../services/search.service');
const { logger } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/responseBuilder');

class SearchController {
  /**
   * @swagger
   * /search/works:
   *   get:
   *     tags: [Search]
   *     summary: Fulltext search for works
   *     description: Searches works using Sphinx when available, with MariaDB fallback. Returns paginated results, applied filters, and performance metadata.
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *         description: Search query (min length 2)
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 20
   *           default: 10
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *         description: Filter by work type
   *       - in: query
   *         name: language
   *         schema:
   *           type: string
   *         description: ISO 639 code
   *       - in: query
   *         name: year_from
   *         schema:
   *           type: integer
   *       - in: query
   *         name: year_to
   *         schema:
   *           type: integer
  *     responses:
  *       200:
  *         description: Works search results
  *         content:
  *           application/json:
  *             schema:
  *               type: object
  *               properties:
  *                 status: { type: string }
  *                 data:
  *                   type: array
  *                   items: { $ref: '#/components/schemas/Work' }
  *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
  *                 meta:
  *                   type: object
  *                   properties:
  *                     query: { type: string }
  *                     search_type: { type: string, example: fulltext }
  *                     performance:
  *                       type: object
  *                       properties:
  *                         engine: { type: string, example: 'Sphinx+MariaDB' }
  *                         query_type: { type: string, example: 'search_hydrate' }
  *                         controller_time_ms: { type: integer, example: 42 }
  *                         elapsed_ms: { type: integer, example: 75 }
  *             example:
  *               status: success
  *               data:
  *                 - id: 123
  *                   title: Sample Paper on Anthropology
  *                   type: ARTICLE
  *                   language: en
  *                   publication_year: 2023
  *                   authors_preview: ["Maria S. Santos", "João C. Lima"]
  *                   venue: { name: American Anthropologist, type: JOURNAL }
  *                 - id: 124
  *                   title: Another Sample
  *                   type: ARTICLE
  *                   language: en
  *                   publication_year: 2022
  *                   authors_preview: ["Ana P. Costa"]
  *               pagination:
  *                 page: 1
  *                 limit: 10
  *                 total: 725
  *                 totalPages: 73
  *                 hasNext: true
  *                 hasPrev: false
  *               meta:
  *                 query: anthropology
  *                 search_type: fulltext
  *                 performance:
  *                   engine: Sphinx+MariaDB
  *                   query_type: search_hydrate
  *                   controller_time_ms: 41
  *                   elapsed_ms: 77
   */
  async searchWorks(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Works search validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const { q: query } = req.query;
      const filters = {
        page: req.query.page,
        limit: req.query.limit,
        offset: req.query.offset,
        type: req.query.type,
        language: req.query.language,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        include_facets: ['1','true',true].includes((req.query.include_facets || '').toString().toLowerCase())
      };

      const startTime = Date.now();
      const result = await searchService.searchWorks(query, filters);
      const controllerTime = Date.now() - startTime;

      logger.info(`Works search completed: "${query}" - ${result.pagination.total} results in ${controllerTime}ms`);

      const meta = {
        ...(result.meta || {}),
        performance: {
          // Merge nested performance first, then top-level (adds controller, etc.)
          ...(((result && result.meta) ? result.meta.performance : {}) || {}),
          ...((result && result.performance) || {}),
          controller_time_ms: controllerTime
        }
      };

      return res.success(result.data, {
        pagination: result.pagination,
        meta
      });
    } catch (error) {
      logger.error('Error in works search controller:', error);
      if (typeof res.error === 'function') {
        return res.error(error, {
          meta: { context: 'searchWorks' }
        });
      }
      return next(error);
    }
  }

  /**
   * @swagger
   * /search/persons:
   *   get:
   *     tags: [Search]
   *     summary: Fulltext search for persons
   *     description: Searches persons with Sphinx when available, with MariaDB fallback. Returns paginated results and performance metadata.
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: verified
   *         schema:
   *           type: boolean
  *     responses:
  *       200:
  *         description: Persons search results
  *         content:
  *           application/json:
  *             example:
  *               status: success
  *               data:
  *                 - id: 42
  *                   preferred_name: "Dr. Maria Silva Santos"
  *                   identifiers: { orcid: "0000-0001-2345-6789" }
  *                   metrics: { works_count: 15, latest_publication_year: 2024 }
  *               pagination:
  *                 page: 1
  *                 limit: 10
  *                 total: 120
  *                 totalPages: 12
  *                 hasNext: true
  *                 hasPrev: false
  *               meta:
  *                 query: "maria"
  *                 verified: true
  *                 performance:
  *                   engine: Sphinx
  *                   query_type: search
  *                   controller_time_ms: 35
   */
  async searchPersons(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Persons search validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const { q: query } = req.query;
      const filters = {
        page: req.query.page,
        limit: req.query.limit,
        offset: req.query.offset,
        verified: req.query.verified,
        engine: req.query.engine
      };

      const startTime = Date.now();
      const result = await searchService.searchPersons(query, filters);
      const controllerTime = Date.now() - startTime;

      logger.info(`Persons search completed: "${query}" - ${result.pagination.total} results in ${controllerTime}ms`);

      const meta = {
        ...(result.meta || {}),
        performance: {
          ...(result.performance || {}),
          controller_time_ms: controllerTime
        }
      };

      return res.success(result.data, {
        pagination: result.pagination,
        meta
      });
    } catch (error) {
      logger.error('Error in persons search controller:', error);
      if (typeof res.error === 'function') {
        return res.error(error, {
          meta: { context: 'searchPersons' }
        });
      }
      return next(error);
    }
  }


  /**
   * @swagger
   * /search/global:
   *   get:
   *     tags: [Search]
   *     summary: Global search (works, persons)
   *     description: Executes parallel search in works and persons and returns top results for each category. Organizations search disabled for performance.
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 10
   *           default: 5
  *     responses:
  *       200:
  *         description: Global search results grouped by source with performance metadata.
  *         content:
  *           application/json:
  *             example:
  *               status: success
  *               data:
  *                 works:
  *                   total: 725
  *                   results:
  *                     - { id: 123, title: Sample Paper on Anthropology, type: ARTICLE }
  *                 persons:
  *                   total: 120
  *                   results:
  *                     - { id: 42, preferred_name: "Dr. Maria Silva Santos" }
  *                 organizations:
  *                   total: 0
  *                   results: []
  *               meta:
  *                 query: anthropology
  *                 query_time_ms: 740
  *                 sources:
  *                   works: { engine: Sphinx+MariaDB, query_type: search_hydrate, elapsed_ms: 77 }
  *                   persons: { engine: Sphinx, query_type: search, elapsed_ms: 55 }
  *                   organizations: null
   */
  async globalSearch(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Global search validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const { q: query } = req.query;
      const filters = {
        limit: req.query.limit || 5
      };

      const startTime = Date.now();
      const result = await searchService.globalSearch(query, filters);
      const controllerTime = Date.now() - startTime;

      logger.info(`Global search completed: "${query}" in ${controllerTime}ms`);

      const meta = {
        ...(result.meta || {}),
        controller_time_ms: controllerTime
      };

      return res.success(result.data, { meta });
    } catch (error) {
      logger.error('Error in global search controller:', error);
      if (typeof res.error === 'function') {
        return res.error(error, {
          meta: { context: 'globalSearch' }
        });
      }
      return next(error);
    }
  }
}

module.exports = new SearchController();
