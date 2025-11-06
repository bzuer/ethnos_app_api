/**
 * @swagger
 * tags:
 *   name: Venues
 *   description: Academic venues and publication platforms
 */

const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const { enhancedValidationHandler, commonValidations } = require('../middleware/validation');
const venuesController = require('../controllers/venues.controller');

/**
 * @swagger
 * /venues:
 *   get:
 *     summary: Get list of academic venues
 *     description: Retrieve a paginated list of academic venues including journals, conferences, repositories, and book series. Supports filtering and sorting.
 *     tags: [Venues]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page (max 100)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of items to skip (alternative to page parameter)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES]
 *         description: Filter by venue type
 *         example: JOURNAL
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *         description: Search term to filter venues by name
 *         example: Nature
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, type, impact_factor, works_count, id]
 *         description: Field to sort by
 *         example: works_count
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Sort order
 *         example: DESC
 *     responses:
 *       200:
 *         $ref: '#/components/responses/Success'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get(
  '/',
  [
    ...commonValidations.pagination,
    query('type')
      .optional()
      .isIn(['JOURNAL', 'CONFERENCE', 'REPOSITORY', 'BOOK_SERIES'])
      .withMessage('Type must be one of: JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES'),
    query('search')
      .optional()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search term must be between 1 and 200 characters'),
    query('sortBy')
      .optional()
      .isIn(['name', 'type', 'impact_factor', 'works_count', 'id'])
      .withMessage('Sort field must be one of: name, type, impact_factor, works_count, id'),
    query('sortOrder')
      .optional()
      .isIn(['ASC', 'DESC'])
      .withMessage('Sort order must be ASC or DESC'),
    query('include_legacy')
      .optional()
      .isBoolean()
      .withMessage('include_legacy must be a boolean')
      .toBoolean(),
    query('min_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('min_id must be a positive integer')
      .toInt()
  ],
  enhancedValidationHandler,
  venuesController.getAllVenues
);

/**
 * @swagger
 * /venues/statistics:
 *   get:
 *     summary: Get venue statistics
 *     description: Retrieve comprehensive statistics about venues in the system including type distribution and metrics
 *     tags: [Venues]
 *     responses:
 *       200:
 *         description: Venue statistics retrieved successfully
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
 *                     total_venues:
 *                       type: integer
 *                       example: 1563
 *                     by_type:
 *                       type: object
 *                       properties:
 *                         JOURNAL:
 *                           type: integer
 *                           example: 892
 *                         CONFERENCE:
 *                           type: integer
 *                           example: 445
 *                         REPOSITORY:
 *                           type: integer
 *                           example: 156
 *                         BOOK_SERIES:
 *                           type: integer
 *                           example: 70
 *                     avg_impact_factor:
 *                       type: number
 *                       format: float
 *                       example: 3.2
 *       500:
 *         description: Internal server error
 */
router.get(
  '/statistics',
  venuesController.getVenueStatistics
);

/**
 * @swagger
 * /venues/search:
 *   get:
 *     summary: Search venues
 *     description: Search for venues by name and filter by type
 *     tags: [Venues]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *         description: Search query for venue name
 *         example: Nature
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES]
 *         description: Filter by venue type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: Search results
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
 *                 pagination:
 *                   type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.get(
  '/search',
  [
    query('q')
      .notEmpty()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query is required and must be between 1 and 200 characters'),
    query('type')
      .optional()
      .isIn(['JOURNAL', 'CONFERENCE', 'REPOSITORY', 'BOOK_SERIES'])
      .withMessage('Type must be one of: JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    query('include_legacy')
      .optional()
      .isBoolean()
      .withMessage('include_legacy must be a boolean')
      .toBoolean()
  ],
  enhancedValidationHandler,
  venuesController.searchVenues
);

/**
 * @swagger
 * /venues/{id}:
 *   get:
 *     summary: Get venue by ID
 *     description: Retrieve detailed information about a specific venue
 *     tags: [Venues]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Venue ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Venue details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Venue'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:id',
  [
    param('id')
      .matches(/^\d+$/)
      .withMessage('Invalid venue ID')
      .isInt({ min: 1 })
      .withMessage('Venue ID must be a positive integer'),
    query('include_subjects')
      .optional()
      .isBoolean()
      .withMessage('include_subjects must be a boolean')
      .toBoolean(),
    query('include_yearly')
      .optional()
      .isBoolean()
      .withMessage('include_yearly must be a boolean')
      .toBoolean(),
    query('include_top_authors')
      .optional()
      .isBoolean()
      .withMessage('include_top_authors must be a boolean')
      .toBoolean(),
    query('include_legacy')
      .optional()
      .isBoolean()
      .withMessage('include_legacy must be a boolean')
      .toBoolean()
  ],
  enhancedValidationHandler,
  venuesController.getVenueById
);

/**
 * @swagger
 * /venues/{id}/works:
 *   get:
 *     summary: Get works published in a venue with citations and authors
 *     description: Retrieve all works published in a specific venue ordered by citation count and publication year, including complete author information
 *     tags: [Venues]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Venue ID
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2100
 *         description: Filter by publication year
 *     responses:
 *       200:
 *         description: Works in venue
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
 *                   type: object
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:id/works',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Venue ID must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    query('year')
      .optional()
      .isInt({ min: 1900, max: 2100 })
      .withMessage('Year must be between 1900 and 2100')
  ],
  enhancedValidationHandler,
  venuesController.getVenueWorks
);

/**
 * @swagger
 * /venues/{id}/publications:
 *   get:
 *     summary: Get publications in a venue (alias for works)
 *     description: Alternative endpoint for retrieving works published in a specific venue
 *     tags: [Venues]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Venue ID
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2100
 *         description: Filter by publication year
 *     responses:
 *       200:
 *         description: Publications in venue
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:id/publications',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Venue ID must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    query('year')
      .optional()
      .isInt({ min: 1900, max: 2100 })
      .withMessage('Year must be between 1900 and 2100')
  ],
  enhancedValidationHandler,
  venuesController.getVenueWorks
);

module.exports = router;
