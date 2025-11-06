/**
 * @swagger
 * tags:
 *   name: Metrics
 *   description: Statistical analysis and bibliometric indicators
 */

const express = require('express');
const router = express.Router();
const { requireInternalAccessKey } = require('../middleware/accessKey');
const { query } = require('express-validator');
const metricsController = require('../controllers/metrics.controller');

const validateLimit = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const validateAnnualStats = [
  ...validateLimit,
  
  query('year_from')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be a valid year'),
  
  query('year_to')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year to must be a valid year')
];

const validateInstitutionProductivity = [
  ...validateLimit,
  
  query('country_code')
    .optional()
    .isLength({ min: 2, max: 2 })
    .withMessage('Country code must be 2 characters')
];

const validatePersonProduction = [
  ...validateLimit,
  
  query('organization_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Organization ID must be a positive integer')
];

const validateCollaborations = [
  ...validateLimit,
  
  query('min_collaborations')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Minimum collaborations must be between 1 and 50')
];

/**
 * @swagger
 * /metrics/dashboard:
 *   get:
 *     summary: Dashboard overview with key statistics
 *     tags: [Metrics]
 *     description: Get comprehensive overview including total counts and recent trends
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 totals:
 *                   type: object
 *                   properties:
 *                     total_works:
 *                       type: integer
 *                       example: 650645
 *                     total_persons:
 *                       type: integer
 *                       example: 385670
 *                     total_organizations:
 *                       type: integer
 *                       example: 235833
 *                 recent_trends:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       year:
 *                         type: integer
 *                       total_publications:
 *                         type: integer
 *                       unique_authors:
 *                         type: integer
 *                 meta:
 *                   type: object
 *                   properties:
 *                     query_time_ms:
 *                       type: integer
 */
router.use(requireInternalAccessKey);
router.get('/dashboard', metricsController.getDashboardSummary);

/**
 * @swagger
 * /metrics/annual:
 *   get:
 *     summary: Annual publication statistics
 *     tags: [Metrics]
 *     description: Get yearly statistics from the v_annual_stats view
 *     parameters:
 *       - name: year_from
 *         in: query
 *         description: Starting year for filtering
 *         schema:
 *           type: integer
 *           example: 2020
 *       - name: year_to
 *         in: query
 *         description: Ending year for filtering
 *         schema:
 *           type: integer
 *           example: 2024
 *       - $ref: '#/components/parameters/limitParam'
 *     responses:
 *       200:
 *         description: Annual statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       year:
 *                         type: integer
 *                       total_publications:
 *                         type: integer
 *                       open_access_count:
 *                         type: integer
 *                       articles:
 *                         type: integer
 *                       unique_authors:
 *                         type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.get('/annual', validateAnnualStats, metricsController.getAnnualStats);

/**
 * @swagger
 * /metrics/venues:
 *   get:
 *     summary: Top venues by publication impact
 *     description: Get the top academic venues ranked by publication count, citation metrics, and impact factors.
 *     tags: [Metrics]
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         description: Number of venues to return (max 100)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Top venues list
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
 *                     $ref: '#/components/schemas/Venue'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/venues', validateLimit, metricsController.getTopVenues);

/**
 * @swagger
 * /metrics/institutions:
 *   get:
 *     summary: Institution productivity ranking
 *     description: Get academic institutions ranked by research productivity, publication count, citation metrics, and H-index.
 *     tags: [Metrics]
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         description: Number of institutions to return (max 100)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - name: country_code
 *         in: query
 *         required: false
 *         description: Filter by country code
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 3
 *           example: "BR"
 *     responses:
 *       200:
 *         description: Institution productivity ranking
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
 *                     $ref: '#/components/schemas/Organization'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/institutions', validateInstitutionProductivity, metricsController.getInstitutionProductivity);

/**
 * @swagger
 * /metrics/persons:
 *   get:
 *     summary: Person production analytics
 *     description: Get researchers ranked by publication productivity, citation metrics, H-index, and collaboration indicators.
 *     tags: [Metrics]
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         description: Number of persons to return (max 100)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - name: min_works
 *         in: query
 *         required: false
 *         description: Minimum number of works
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 5
 *     responses:
 *       200:
 *         description: Person production metrics
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/persons', validatePersonProduction, metricsController.getPersonProduction);

/**
 * @swagger
 * /metrics/collaborations:
 *   get:
 *     summary: Collaboration network statistics
 *     description: Get statistics on research collaboration networks, including top collaborator pairs, collaboration patterns, and network metrics.
 *     tags: [Metrics]
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         description: Number of collaborations to return (max 100)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - name: min_collaborations
 *         in: query
 *         required: false
 *         description: Minimum number of collaborative works
 *         schema:
 *           type: integer
 *           minimum: 2
 *           default: 3
 *     responses:
 *       200:
 *         description: Collaboration network statistics
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
 *                     $ref: '#/components/schemas/Collaboration'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/collaborations', validateCollaborations, metricsController.getCollaborations);

/**
 * @swagger
 * /metrics/sphinx:
 *   get:
 *     summary: Get Sphinx search engine performance metrics
 *     tags: [Metrics]
 *     description: Comprehensive performance and health metrics for the Sphinx search engine
 *     responses:
 *       200:
 *         description: Sphinx performance metrics
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
 *                     queries_per_second:
 *                       type: number
 *                     avg_response_time:
 *                       type: number
 *                     error_rate:
 *                       type: number
 *                     index_size_mb:
 *                       type: number
 *                     uptime_seconds:
 *                       type: integer
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
const sphinxMonitoring = require('../services/sphinxMonitoring.service');

router.get('/sphinx', async (req, res) => {
    try {
        await sphinxMonitoring.start();
        const metrics = sphinxMonitoring.getMetrics();
        
        res.json({
            status: 'success',
            data: metrics
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to get Sphinx metrics',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /metrics/sphinx/detailed:
 *   get:
 *     summary: Get detailed Sphinx performance metrics with query history
 *     tags: [Metrics]
 *     description: Detailed Sphinx metrics including recent query performance and distribution analysis
 *     responses:
 *       200:
 *         description: Detailed Sphinx metrics
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
 *                     metrics:
 *                       type: object
 *                     recent_queries:
 *                       type: array
 *                       items:
 *                         type: object
 *                     performance_distribution:
 *                       type: object
 */
router.get('/sphinx/detailed', async (req, res) => {
    try {
        await sphinxMonitoring.start();
        const detailedMetrics = sphinxMonitoring.getDetailedMetrics();
        
        res.json({
            status: 'success',
            data: detailedMetrics
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to get detailed Sphinx metrics',
            error: error.message
        });
    }
});

module.exports = router;
