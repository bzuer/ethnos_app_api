const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const worksController = require('../controllers/works.controller');

const validateWorkId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Work ID must be a positive integer')
];

const validateWorksQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20'),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  
  query('search')
    .optional(),
  
  query('type')
    .optional(),
  
  query('year_from')
    .optional()
    .isInt({ min: 1000, max: 2030 })
    .withMessage('Year from must be a valid year'),
  
  query('year_to')
    .optional()
    .isInt({ min: 1000, max: 2030 })
    .withMessage('Year to must be a valid year'),
  
];


/**
 * @swagger
 * /works:
 *   get:
 *     summary: Get list of academic works
 *     description: Retrieve a paginated list of academic publications including papers, books, theses, and conference proceedings. Supports filtering by various criteria.
 *     tags: [Works]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 20
 *         description: Number of results per page (max 20)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 3
 *           maxLength: 255
 *         description: Search term to filter works by title or content
 *         example: machine learning
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: Filter by work type (article, book, thesis, etc.)
 *         example: ARTICLE
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *           maximum: 2030
 *         description: Filter works published from this year onwards
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *           maximum: 2030
 *         description: Filter works published up to this year
 *         example: 2023
 *       - in: query
 *         name: is_open_access
 *         schema:
 *           type: boolean
 *         description: Filter by open access availability
 *         example: true
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */

/**
 * @swagger
 * /works/vitrine:
 *   get:
 *     summary: Get works list optimized for browsing (vitrine)
 *     description: High-performance endpoint for browsing works using pre-compiled summary table. Optimized for speed with minimal JOINs.
 *     tags: [Works]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page (max 100)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: Filter by work type
 *         example: ARTICLE
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1000
 *           maximum: 2030
 *         description: Filter works from this year
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1000
 *           maximum: 2030
 *         description: Filter works up to this year
 *         example: 2023
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           maxLength: 3
 *         description: Filter by language code
 *         example: en
 *     responses:
 *       200:
 *         description: Works vitrine retrieved successfully
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
 *                     $ref: '#/components/schemas/Work'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     query_source:
 *                       type: string
 *                       example: sphinx_works_summary
 *                     performance:
 *                       $ref: '#/components/schemas/PerformanceMeta'
 */
router.get('/vitrine', validateWorksQuery, worksController.getWorksVitrine);

router.get('/', validateWorksQuery, worksController.getWorks);

/**
 * @swagger
 * /works/{id}:
 *   get:
 *     summary: Get specific academic work by ID
 *     description: Retrieve detailed information about a specific academic publication by its unique identifier.
 *     tags: [Works]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Unique identifier of the work
 *         example: 123456
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
/**
 * @swagger
 * /works/{id}:
 *   get:
 *     parameters:
 *       - in: query
 *         name: include_citations
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include inline citations (cited_by) in the work payload
 *       - in: query
 *         name: include_references
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include inline references list in the work payload
 */
router.get('/:id', validateWorkId, worksController.getWork);

/**
 * @swagger
 * /works/{id}/bibliography:
 *   get:
 *     summary: Get work bibliography usage
 *     description: Retrieve courses where this work is used in bibliography, with instructor information
 *     tags: [Works]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Work ID
 *         example: 2684644
 *       - in: query
 *         name: reading_type
 *         schema:
 *           type: string
 *           enum: [REQUIRED, RECOMMENDED, SUPPLEMENTARY, OPTIONAL]
 *         description: Filter by reading type
 *         example: RECOMMENDED
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *         description: Filter courses from this year
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2030
 *         description: Filter courses up to this year
 *         example: 2025
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
 *     responses:
 *       200:
 *         description: Work bibliography usage retrieved successfully
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
 *                     type: object
 *                     properties:
 *                       course_id:
 *                         type: integer
 *                         example: 465
 *                       course_name:
 *                         type: string
 *                         example: "Antropologia do Parentesco"
 *                       course_year:
 *                         type: integer
 *                         example: 2025
 *                       program_id:
 *                         type: integer
 *                         example: 2
 *                       reading_type:
 *                         type: string
 *                         enum: [REQUIRED, RECOMMENDED, SUPPLEMENTARY, OPTIONAL]
 *                         example: RECOMMENDED
 *                       instructor_count:
 *                         type: integer
 *                         example: 2
 *                       instructors:
 *                         type: string
 *                         example: "João Silva; Maria Santos"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id/bibliography', validateWorkId, worksController.getWorkBibliography);

module.exports = router;
