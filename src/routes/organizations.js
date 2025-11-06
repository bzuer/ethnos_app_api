const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const organizationsController = require('../controllers/organizations.controller');

const validateOrganizationId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Organization ID must be a positive integer')
];

const validateOrganizationsQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Search term must be between 2 and 255 characters'),
  
  query('country')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Country must be between 2 and 100 characters'),
  
  query('region')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Region must be between 2 and 100 characters'),
  
  query('type')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Type must be between 2 and 50 characters')
];

const validateOrganizationWorksQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('type')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Work type must be between 2 and 50 characters'),
  
  query('year_from')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() })
    .withMessage('Year from must be a valid year'),
  
  query('year_to')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() })
    .withMessage('Year to must be a valid year'),
  
  query('language')
    .optional()
    .trim()
    .isLength({ min: 2, max: 10 })
    .withMessage('Language must be between 2 and 10 characters')
];

/**
 * @swagger
 * /organizations:
 *   get:
 *     summary: Get list of academic institutions and organizations
 *     description: Retrieve a paginated list of academic institutions including universities, research institutes, companies, and government organizations. Supports filtering by location, type, and name.
 *     tags: [Organizations]
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
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 255
 *         description: Search term to filter organizations by name
 *         example: Stanford University
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: Filter by country
 *         example: United States
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: Filter by geographical region
 *         example: North America
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 50
 *         description: Filter by organization type
 *         example: University
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
router.get('/', validateOrganizationsQuery, organizationsController.getOrganizations);

/**
 * @swagger
 * /organizations/{id}:
 *   get:
 *     summary: Get specific organization by ID
 *     description: Retrieve detailed information about a specific academic institution or organization by their unique identifier.
 *     tags: [Organizations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Unique identifier of the organization
 *         example: 1234
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
router.get('/:id', validateOrganizationId, organizationsController.getOrganization);

/**
 * @swagger
 * /organizations/{id}/works:
 *   get:
 *     summary: Get works published by organization members
 *     description: Retrieve a paginated list of academic works (publications, papers, articles) authored by members affiliated with the specified organization. Supports filtering by work type, publication year, and language.
 *     tags: [Organizations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Unique identifier of the organization
 *         example: 1234
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
 *           minLength: 2
 *           maxLength: 50
 *         description: Filter by work type (e.g., article, book, conference paper)
 *         example: article
 *       - in: query
 *         name: year_from
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2024
 *         description: Filter works published from this year onwards
 *         example: 2020
 *       - in: query
 *         name: year_to
 *         schema:
 *           type: integer
 *           minimum: 1900
 *           maximum: 2024
 *         description: Filter works published up to this year
 *         example: 2024
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 10
 *         description: Filter by publication language
 *         example: en
 *     responses:
 *       200:
 *         description: Organization works retrieved successfully
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
 *                       id:
 *                         type: integer
 *                         example: 12345
 *                       title:
 *                         type: string
 *                         example: "Machine Learning Applications in Healthcare"
 *                       type:
 *                         type: string
 *                         example: "article"
 *                       language:
 *                         type: string
 *                         example: "en"
 *                       peer_reviewed:
 *                         type: boolean
 *                         example: true
 *                       open_access:
 *                         type: boolean
 *                         example: true
 *                       publication:
 *                         type: object
 *                         properties:
 *                           year:
 *                             type: integer
 *                             example: 2023
 *                           doi:
 *                             type: string
 *                             example: "10.1000/182"
 *                           journal:
 *                             type: string
 *                             example: "Journal of Medical AI"
 *                           volume:
 *                             type: string
 *                             example: "15"
 *                           issue:
 *                             type: string
 *                             example: "3"
 *                           pages:
 *                             type: string
 *                             example: "123-145"
 *                       authors:
 *                         type: object
 *                         properties:
 *                           author_string:
 *                             type: string
 *                             example: "Smith, John; Doe, Jane; Johnson, Bob"
 *                           author_count:
 *                             type: integer
 *                             example: 3
 *                           first_author_name:
 *                             type: string
 *                             example: "John Smith"
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     total:
 *                       type: integer
 *                       example: 1250
 *                     totalPages:
 *                       type: integer
 *                       example: 63
 *                     hasNext:
 *                       type: boolean
 *                       example: true
 *                     hasPrev:
 *                       type: boolean
 *                       example: false
 *       400:
 *         description: Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Organization not found or has no works
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         description: Internal server error
 */
router.get('/:id/works', validateOrganizationId, validateOrganizationWorksQuery, organizationsController.getOrganizationWorks);

module.exports = router;
