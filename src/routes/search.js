/**
 * @swagger
 * tags:
 *   name: Search
 *   description: Full-text search across works and persons (organizations disabled for performance)
 */

const express = require('express');
const { query } = require('express-validator');
const router = express.Router();
const searchController = require('../controllers/search.controller');
const { commonValidations, enhancedValidationHandler } = require('../middleware/validation');
const sphinxService = require('../services/sphinx.service');
const sphinxHealthCheck = require('../services/sphinxHealthCheck.service');
const { logger } = require('../middleware/errorHandler');
const { createPagination, normalizePagination } = require('../utils/pagination');
const { ERROR_CODES } = require('../utils/responseBuilder');

const validateWorksSearch = [
  ...commonValidations.searchQuery,
  ...commonValidations.pagination,
  query('type')
    .optional()
    .isIn(['ARTICLE', 'BOOK', 'CHAPTER', 'THESIS', 'PREPRINT', 'CONFERENCE_PAPER', 'REVIEW', 'EDITORIAL'])
    .withMessage('Work type must be valid'),
  query('language')
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage('Language must be a valid language code'),
  query('year_from')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be valid')
    .toInt(),
  query('year_to')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year to must be valid')
    .toInt(),
  query('include_facets')
    .optional()
    .isIn(['1', '0', 'true', 'false'])
    .withMessage('include_facets must be boolean-like (1/0/true/false)')
];

/**
 * @swagger
 * /search/works:
 *   get:
 *     summary: Search works using full-text search
 *     tags: [Search]
 *     description: Search academic works by title, subtitle, and abstract using MySQL FULLTEXT indexes
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         description: Search query (minimum 2 characters)
 *         schema:
 *           type: string
 *           minLength: 2
 *           example: "machine learning"
 *       - name: type
 *         in: query
 *         description: Filter by work type
 *         schema:
 *           type: string
 *           example: "ARTICLE"
 *       - name: language
 *         in: query
 *         description: Filter by language
 *         schema:
 *           type: string
 *           example: "en"
 *       - name: year_from
 *         in: query
 *         description: Filter by minimum publication year
 *         schema:
 *           type: integer
 *           example: 2020
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - name: include_facets
 *         in: query
 *         description: When set, includes Sphinx-computed facets (requires Sphinx)
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.get('/works', validateWorksSearch, enhancedValidationHandler, searchController.searchWorks);

/**
 * @swagger
 * /search/global:
 *   get:
 *     summary: Global search across all entities
 *     tags: [Search]
 *     description: Perform simultaneous search across works and persons (organizations search disabled for performance)
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         description: Search query
 *         schema:
 *           type: string
 *           minLength: 2
 *           example: "artificial intelligence"
 *       - name: limit
 *         in: query
 *         description: Limit per entity type
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 5
 *     responses:
 *       200:
 *         description: Combined search results from all entities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 works:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     results:
 *                       type: array
 *                 persons:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     results:
 *                       type: array
 *                 organizations:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     results:
 *                       type: array
 *                 meta:
 *                   type: object
 *                   properties:
 *                     query_time_ms:
 *                       type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.get('/global', commonValidations.searchQuery, enhancedValidationHandler, searchController.globalSearch);


/**
 * @swagger
 * /search/persons:
 *   get:
 *     summary: Search persons/researchers by name
 *     description: Search for researchers and authors using full-text search across name fields. Returns results with relevance scoring and supports filtering by affiliation and verification status.
 *     tags: [Search]
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         description: Search query for person names (minimum 2 characters)
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 255
 *           example: "John Smith"
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *     responses:
 *       200:
 *         description: Person search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Person'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/persons', commonValidations.searchQuery, commonValidations.pagination, enhancedValidationHandler, searchController.searchPersons);


/**
 * @swagger
 * /search/advanced:
 *   get:
 *     summary: Advanced faceted search with filters
 *     tags: [Search]
 *     description: Enhanced search with faceted results including years, work types, languages, venues, and authors
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         description: Search query
 *         schema:
 *           type: string
 *           minLength: 2
 *           example: "machine learning"
 *       - name: limit
 *         in: query
 *         description: Number of results to return
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Advanced search results with facets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                     facets:
 *                       type: object
 *                       properties:
 *                         years:
 *                           type: array
 *                         work_types:
 *                           type: array
 *                         languages:
 *                           type: array
 *                         venues:
 *                           type: array
 *                         authors:
 *                           type: array
 *                     meta:
 *                       type: object
 *                       properties:
 *                         search_engine:
 *                           type: string
 *                         faceted_search:
 *                           type: boolean
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
const advancedSearch = async (req, res, next) => {
  try {
    const query = (req.query.q || '').trim();
    const pagination = normalizePagination(req.query);
    const { limit, offset, page } = pagination;

    const sphinxActive = String(process.env.SEARCH_ENGINE || 'SPHINX').toUpperCase() !== 'MARIADB';
    const useSphinx = sphinxActive && !sphinxHealthCheck.rollbackActive;

    if (!useSphinx) {
      return res.fail('Advanced search requires Sphinx engine', {
        statusCode: 503,
        code: ERROR_CODES.INTERNAL,
        meta: {
          query,
          search_engine: process.env.SEARCH_ENGINE || 'MARIADB'
        }
      });
    }

    const filters = {
      work_type: req.query.work_type,
      language: req.query.language,
      year_from: req.query.year_from,
      year_to: req.query.year_to,
      peer_reviewed: req.query.peer_reviewed === 'true' ? true :
        req.query.peer_reviewed === 'false' ? false : undefined,
      venue_name: req.query.venue
    };

    Object.keys(filters).forEach((key) => {
      if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
        delete filters[key];
      }
    });

    const start = Date.now();
    const results = await sphinxService.searchWithFacets(query, filters, {
      limit,
      offset
    });
    const controllerTime = Date.now() - start;

    const data = {
      results: Array.isArray(results?.results) ? results.results : [],
      facets: results?.facets || {}
    };

    return res.success(data, {
      pagination: createPagination(page, limit, results?.total || data.results.length),
      meta: {
        query,
        search_type: 'fulltext_faceted',
        filters_applied: Object.keys(filters).length,
        performance: {
          engine: 'Sphinx',
          query_time_ms: results?.query_time || null,
          controller_time_ms: controllerTime
        }
      }
    });
  } catch (error) {
    logger.error('Advanced search failed', {
      query: req.query.q,
      error: error.message
    });

    if (typeof res.error === 'function') {
      return res.error(error, {
        meta: { context: 'advancedSearch' }
      });
    }
    return next(error);
  }
};

router.get('/advanced', commonValidations.searchQuery, enhancedValidationHandler, advancedSearch);

router.get('/health', async (req, res, next) => {
  try {
    const healthStatus = sphinxHealthCheck.getHealthStatus();
    const sphinxStatus = await sphinxService.getStatus();

    return res.success({
      search_engine: process.env.SEARCH_ENGINE || 'SPHINX',
      sphinx: {
        ...sphinxStatus,
        health: healthStatus
      },
      endpoints: {
        basic_search: '/search/works',
        advanced_search: '/search/advanced',
        sphinx_direct: '/search/sphinx',
        sphinx_compare: '/search/sphinx/compare'
      }
    });
  } catch (error) {
    logger.error('Search health check failed', { error: error.message });
    if (typeof res.error === 'function') {
      return res.error(error, { meta: { context: 'searchHealth' } });
    }
    return next(error);
  }
});

const autocompleteService = require('../services/autocomplete.service');

/**
 * @swagger
 * /search/autocomplete:
 *   get:
 *     summary: Get autocomplete suggestions for search queries
 *     tags: [Search]
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         description: Search query for suggestions
 *         schema:
 *           type: string
 *           minLength: 2
 *       - name: type
 *         in: query
 *         description: Type of suggestions
 *         schema:
 *           type: string
 *           enum: [all, titles, authors, venues]
 *           default: all
 *       - name: limit
 *         in: query
 *         description: Maximum suggestions to return
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 10
 *     responses:
 *       200:
 *         description: Autocomplete suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     suggestions:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.get('/autocomplete', async (req, res, next) => {
  try {
    const { q, type = 'all', limit = 10 } = req.query;
    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 20));
    const trimmedQuery = (q || '').trim();

    if (!trimmedQuery || trimmedQuery.length < 2) {
      return res.success({
        suggestions: [],
        message: 'Query too short'
      }, {
        meta: {
          query: trimmedQuery,
          type,
          limit: parsedLimit
        }
      });
    }

    const suggestions = await autocompleteService.getSuggestions(trimmedQuery, type, parsedLimit);
    autocompleteService.recordSearchQuery(trimmedQuery, suggestions.suggestions?.length || 0);

    return res.success(suggestions, {
      meta: {
        query: trimmedQuery,
        type,
        limit: parsedLimit,
        performance: {
          engine: 'Sphinx'
        }
      }
    });
  } catch (error) {
    logger.error('Autocomplete failed', { error: error.message });
    if (typeof res.error === 'function') {
      return res.error(error, { meta: { context: 'autocomplete' } });
    }
    return next(error);
  }
});

/**
 * @swagger
 * /search/popular:
 *   get:
 *     summary: Get popular search terms
 *     tags: [Search]
 *     responses:
 *       200:
 *         description: Popular search terms
 */
router.get('/popular', async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 50));
    const popularTerms = await autocompleteService.getPopularTerms(limit);

    return res.success({
      popular_terms: popularTerms,
      generated_at: new Date().toISOString()
    }, {
      meta: {
        limit,
        source: 'autocomplete_popular'
      }
    });
  } catch (error) {
    logger.error('Popular terms failed', { error: error.message });
    if (typeof res.error === 'function') {
      return res.error(error, { meta: { context: 'popularSearchTerms' } });
    }
    return next(error);
  }
});

module.exports = router;
