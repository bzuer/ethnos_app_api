const express = require('express');
const router = express.Router();
const sphinxService = require('../services/sphinx.service');
const { validationResult, query } = require('express-validator');
const { performanceMonitoring } = require('../middleware/monitoring');
const { normalizePagination, createPagination } = require('../utils/pagination');
const { logger } = require('../middleware/errorHandler');

/**
 * @swagger
 * /search/sphinx:
 *   get:
 *     tags:
 *       - Search (Sphinx POC)
 *     summary: Search works using Sphinx Search Engine (POC)
 *     description: Full-text search through academic works using Sphinx with advanced relevance ranking and faceted filtering
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Search query string
 *         example: "social development research"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of results to skip
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *         description: Filter by publication year
 *       - in: query
 *         name: work_type
 *         schema:
 *           type: string
 *           enum: [ARTICLE, BOOK, CHAPTER, CONFERENCE, REPORT, THESIS, OTHER]
 *         description: Filter by work type
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by language code
 *       - in: query
 *         name: peer_reviewed
 *         schema:
 *           type: boolean
 *         description: Filter by peer review status
 *       - in: query
 *         name: facets
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include faceted search results
 *     responses:
 *       200:
 *         description: Search results with relevance scores
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           title:
 *                             type: string
 *                           subtitle:
 *                             type: string
 *                           abstract:
 *                             type: string
 *                           author_string:
 *                             type: string
 *                           venue_name:
 *                             type: string
 *                           doi:
 *                             type: string
 *                           year:
 *                             type: integer
 *                           work_type:
 *                             type: string
 *                           language:
 *                             type: string
 *                           peer_reviewed:
 *                             type: boolean
 *                           relevance_score:
 *                             type: number
 *                             description: Sphinx relevance score (higher = more relevant)
 *                     query_time:
 *                       type: integer
 *                       description: Query execution time in milliseconds
 *                     total:
 *                       type: integer
 *                       description: Number of results returned
 *                     facets:
 *                       type: object
 *                       description: Faceted search results (if requested)
 *                       properties:
 *                         years:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               value:
 *                                 type: integer
 *                               count:
 *                                 type: integer
 *                         work_types:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               value:
 *                                 type: string
 *                               count:
 *                                 type: integer
 *                         languages:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               value:
 *                                 type: string
 *                               count:
 *                                 type: integer
 *                 performance:
 *                   type: object
 *                   properties:
 *                     search_engine:
 *                       type: string
 *                       example: "Sphinx"
 *                     query_time_ms:
 *                       type: integer
 *                     total_time_ms:
 *                       type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/search/sphinx',
    [
        query('q')
            .isLength({ min: 2 })
            .withMessage('Query must be at least 2 characters long'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('offset')
            .optional()
            .isInt({ min: 0 })
            .withMessage('Offset must be non-negative'),
        query('year')
            .optional()
            .isInt({ min: 1900, max: 2030 })
            .withMessage('Year must be between 1900 and 2030'),
        query('work_type')
            .optional()
            .isIn(['ARTICLE', 'BOOK', 'CHAPTER', 'CONFERENCE', 'REPORT', 'THESIS', 'OTHER'])
            .withMessage('Invalid work type'),
        query('peer_reviewed')
            .optional()
            .isBoolean()
            .withMessage('peer_reviewed must be boolean'),
        query('facets')
            .optional()
            .isBoolean()
            .withMessage('facets must be boolean')
    ],
    performanceMonitoring,
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Validation failed',
                    details: errors.array()
                });
            }

            const {
                q: query,
                year,
                work_type,
                language,
                peer_reviewed,
                facets = false
            } = req.query;

            const pagination = normalizePagination(req.query);
            const startTime = Date.now();

            const filters = {};
            if (year) filters.year = parseInt(year);
            if (work_type) filters.work_type = work_type;
            if (language) filters.language = language;
            if (peer_reviewed !== undefined) filters.peer_reviewed = peer_reviewed === 'true';

            let searchResults;
            let facetResults = null;
            let searchEngine = 'Sphinx';
            let fallbackNotice = null;

            try {
                searchResults = await sphinxService.searchWorks(query, filters, {
                    limit: pagination.limit,
                    offset: pagination.offset
                });

                if (facets === 'true' || facets === true) {
                    facetResults = await sphinxService.getFacets(query);
                }
            } catch (sphinxError) {
                logger.warn('Sphinx search unavailable, falling back to MariaDB', {
                    error: sphinxError.message
                });

                searchEngine = 'MariaDB';
                fallbackNotice = sphinxError.message;

                const searchService = require('../services/search.service');
                const fallbackStart = Date.now();
                const fallbackResult = await searchService.searchWorks(query, {
                    page: pagination.page,
                    limit: pagination.limit,
                    offset: pagination.offset,
                    type: work_type,
                    language,
                    year_from: req.query.year_from,
                    year_to: req.query.year_to
                });

                searchResults = {
                    results: fallbackResult.data,
                    total: fallbackResult.pagination.total,
                    returned: fallbackResult.data.length,
                    query_time: Date.now() - fallbackStart,
                    meta: {
                        limit: pagination.limit,
                        offset: pagination.offset
                    }
                };
            }

            const totalTime = Date.now() - startTime;

            res.json({
                status: 'success',
                data: {
                    results: searchResults.results,
                    total: searchResults.total,
                    query_time: searchResults.query_time,
                    facets: facetResults
                },
                performance: {
                    search_engine: searchEngine,
                    query_time_ms: searchResults.query_time,
                    total_time_ms: totalTime,
                    documents_searched: searchEngine === 'Sphinx' ? '~9000' : 'mariadb_fulltext',
                    relevance_algorithm: searchEngine === 'Sphinx' ? 'BM25 with field weighting' : 'MariaDB FULLTEXT'
                },
                meta: {
                    query,
                    filters,
                    pagination: createPagination(pagination.page, pagination.limit, searchResults.total),
                    fallback: fallbackNotice
                }
            });

        } catch (error) {
            next(error);
        }
    }
);

/**
 * @swagger
 * /search/sphinx/status:
 *   get:
 *     tags:
 *       - Search (Sphinx POC)
 *     summary: Get Sphinx Search engine status
 *     description: Retrieve status and performance metrics from Sphinx Search engine
 *     responses:
 *       200:
 *         description: Sphinx status information
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
 *                     connected:
 *                       type: boolean
 *                     uptime:
 *                       type: integer
 *                       description: Uptime in seconds
 *                     queries:
 *                       type: integer
 *                       description: Total queries processed
 *                     avg_query_time:
 *                       type: number
 *                       description: Average query time
 *                     connections:
 *                       type: integer
 *                       description: Total connections made
 *                     performance:
 *                       type: object
 *                       properties:
 *                         query_wall:
 *                           type: number
 *                         queries_per_second:
 *                           type: string
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/search/sphinx/status', async (req, res, next) => {
    try {
        const status = await sphinxService.getStatus();
        
        res.json({
            status: 'success',
            data: status
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /search/sphinx/compare:
 *   get:
 *     tags:
 *       - Search (Sphinx POC)
 *     summary: Compare Sphinx vs MariaDB search performance
 *     description: Run the same query on both Sphinx and MariaDB FULLTEXT to compare performance
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Search query for comparison
 *     responses:
 *       200:
 *         description: Performance comparison results
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
 *                     sphinx:
 *                       type: object
 *                       properties:
 *                         results:
 *                           type: integer
 *                         time_ms:
 *                           type: integer
 *                         engine:
 *                           type: string
 *                     mariadb:
 *                       type: object
 *                       properties:
 *                         results:
 *                           type: integer
 *                         time_ms:
 *                           type: integer
 *                         engine:
 *                           type: string
 *                     performance_ratio:
 *                       type: number
 *                       description: How many times faster Sphinx is
 */
router.get('/search/sphinx/compare',
    [
        query('q')
            .isLength({ min: 2 })
            .withMessage('Query must be at least 2 characters long')
    ],
    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Validation failed',
                    details: errors.array()
                });
            }

            const { q: query } = req.query;
            const searchService = require('../services/search.service');

            let sphinxResults;
            let sphinxTime;
            let sphinxError = null;
            const sphinxStart = Date.now();
            try {
                sphinxResults = await sphinxService.searchWorks(query, {}, { limit: 20 });
                sphinxTime = Date.now() - sphinxStart;
            } catch (err) {
                sphinxTime = Date.now() - sphinxStart;
                sphinxError = err;
                sphinxResults = { results: [] };
            }

            const mariadbStart = Date.now();
            let mariadbResults;
            let mariadbTime;
            try {
                mariadbResults = await searchService.searchWorks(query, { limit: 20 });
                mariadbTime = Date.now() - mariadbStart;
            } catch (error) {
                mariadbTime = Date.now() - mariadbStart;
                mariadbResults = { data: { results: [] } };
            }

            const performanceRatio = sphinxTime > 0 ? (mariadbTime / sphinxTime) : null;

            res.json({
                status: 'success',
                data: {
                    query: query,
                    sphinx: {
                        results: sphinxResults.results.length,
                        time_ms: sphinxTime,
                        engine: sphinxError ? 'Sphinx (unavailable)' : 'Sphinx 2.2.11',
                        relevance_scoring: !sphinxError,
                        field_weighting: !sphinxError,
                        error: sphinxError ? sphinxError.message : null
                    },
                    mariadb: {
                        results: mariadbResults?.data?.results?.length || 0,
                        time_ms: mariadbTime,
                        engine: 'MariaDB FULLTEXT',
                        relevance_scoring: false,
                        field_weighting: false
                    },
                    performance_ratio: performanceRatio !== null ? parseFloat(performanceRatio.toFixed(2)) : null,
                    recommendation: performanceRatio !== null ? 
                        (performanceRatio > 2 ? `Sphinx is ${performanceRatio.toFixed(1)}x faster` : 'Performance similar') :
                        'Sphinx comparison unavailable'
                }
            });

        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;
