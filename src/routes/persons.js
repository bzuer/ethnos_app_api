const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const personsController = require('../controllers/persons.controller');
const { relationalLimiter } = require('../middleware/rateLimiting');

const validatePersonId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Person ID must be a positive integer')
];

const validatePersonsQuery = [
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
  
  query('affiliation')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Affiliation must be between 2 and 255 characters'),
  
  query('country')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Country must be between 2 and 100 characters'),

  query('signature')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Signature must be between 2 and 100 characters'),

  query('verified')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('Verified must be true or false')
];

/**
 * @swagger
 * /persons:
 *   get:
 *     summary: Get list of researchers and authors
 *     description: Retrieve a paginated list of academic researchers and authors. Supports filtering by name, affiliation, country, and verification status.
 *     tags: [Persons]
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
 *         description: Search term to filter persons by name
 *         example: John Smith
 *       - in: query
 *         name: affiliation
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 255
 *         description: Filter by institutional affiliation
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
 *         name: signature
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *         description: Filter by author signature or identifier
 *         example: j.smith
 *       - in: query
 *         name: verified
 *         schema:
 *           type: boolean
 *         description: Filter by verification status
 *         example: true
 *     responses:
 *       200:
 *         description: List of persons retrieved successfully
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
 *                       example: 385678
 *                     totalPages:
 *                       type: integer
 *                       example: 19284
 *                     hasNext:
 *                       type: boolean
 *                       example: true
 *                     hasPrev:
 *                       type: boolean
 *                       example: false
 *       400:
 *         description: Invalid query parameters
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
router.get('/', validatePersonsQuery, personsController.getPersons);

/**
 * @swagger
 * /persons/{id}:
 *   get:
 *     summary: Get specific researcher by ID
 *     description: Retrieve detailed information about a specific researcher or author by their unique identifier.
 *     tags: [Persons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Unique identifier of the person
 *         example: 5952
 *     responses:
 *       200:
 *         description: Person details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Person'
 *       400:
 *         description: Invalid person ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Person not found
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
router.get('/:id', validatePersonId, personsController.getPerson);

/**
 * @swagger
 * /persons/{id}/signatures:
 *   get:
 *     summary: Get signatures linked to a person
 *     description: Retrieve all name signatures associated with a specific person
 *     tags: [Persons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Person ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Results per page
 *     responses:
 *       200:
 *         description: Signatures retrieved successfully
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
 *                         description: Signature ID
 *                       signature:
 *                         type: string
 *                         description: Name signature
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       persons_count:
 *                         type: integer
 *                         description: Total persons with this signature
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *       404:
 *         description: Person not found
 *       500:
 *         description: Internal server error
 */
const validateSignaturesQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

/**
 * @swagger
 * /persons/{id}/works:
 *   get:
 *     summary: Get works authored/edited by a person
 *     description: Retrieve all academic works (publications) authored or edited by a specific person
 *     tags: [Persons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Person ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Results per page
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [AUTHOR, EDITOR]
 *         description: Filter by role (AUTHOR or EDITOR)
 *     responses:
 *       200:
 *         description: Works retrieved successfully
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
 *                         description: Work ID
 *                       title:
 *                         type: string
 *                         description: Work title
 *                       subtitle:
 *                         type: string
 *                         description: Work subtitle
 *                       type:
 *                         type: string
 *                         description: Type of work
 *                       language:
 *                         type: string
 *                         description: Publication language
 *                       doi:
 *                         type: string
 *                         description: DOI identifier
 *                       authorship:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                             enum: [AUTHOR, EDITOR]
 *                             description: Person's role in this work
 *                           position:
 *                             type: integer
 *                             description: Position in author list
 *                           is_corresponding:
 *                             type: boolean
 *                             description: Whether this person is corresponding author
 *                       publication:
 *                         type: object
 *                         properties:
 *                           year:
 *                             type: integer
 *                             description: Publication year
 *                           journal:
 *                             type: string
 *                             description: Journal name
 *                           volume:
 *                             type: string
 *                             description: Volume number
 *                           issue:
 *                             type: string
 *                             description: Issue number
 *                           pages:
 *                             type: string
 *                             description: Page range
 *                       authors:
 *                         type: object
 *                         properties:
 *                           total_count:
 *                             type: integer
 *                             description: Total number of authors
 *                           author_string:
 *                             type: string
 *                             description: Full author list string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *       404:
 *         description: Person not found
 *       500:
 *         description: Internal server error
 */
const validateWorksQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('role')
    .optional()
    .isIn(['AUTHOR', 'EDITOR'])
    .withMessage('Role must be AUTHOR or EDITOR')
];

router.get('/:id/works', relationalLimiter, validatePersonId, validateWorksQuery, personsController.getPersonWorks);

router.get('/:id/signatures', relationalLimiter, validatePersonId, validateSignaturesQuery, personsController.getPersonSignatures);

module.exports = router;