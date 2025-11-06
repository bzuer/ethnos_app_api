/**
 * @swagger
 * tags:
 *   name: Signatures
 *   description: Name signatures and author identification
 */

const express = require('express');
const router = express.Router();
const { query, param } = require('express-validator');
const signaturesController = require('../controllers/signatures.controller');
const { relationalLimiter } = require('../middleware/rateLimiting');

/**
 * @swagger
 * /signatures:
 *   get:
 *     summary: Get list of name signatures
 *     description: Retrieve a paginated list of author name signatures with filtering and sorting options
 *     tags: [Signatures]
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
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Search term to filter signatures
 *         example: Smith
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [signature, created_at, id]
 *         description: Field to sort by
 *         example: signature
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Sort order
 *         example: ASC
 *       - in: query
 *         name: light
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, omits expensive counts to speed up listing
 *     responses:
 *       200:
 *         description: List of signatures retrieved successfully
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
 *                     $ref: '#/components/schemas/Signature'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     offset:
 *                       type: integer
 *                       example: 0
 *                     total:
 *                       type: integer
 *                       example: 378134
 *                     hasNext:
 *                       type: boolean
 *                       example: true
 *                     hasPrev:
 *                       type: boolean
 *                       example: false
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.get(
  '/',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    query('search')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search term must be between 1 and 100 characters'),
    query('sortBy')
      .optional()
      .isIn(['signature', 'created_at', 'id'])
      .withMessage('Sort field must be one of: signature, created_at, id'),
    query('sortOrder')
      .optional()
      .isIn(['ASC', 'DESC'])
      .withMessage('Sort order must be ASC or DESC')
  ],
  signaturesController.getAllSignatures
);

/**
 * @swagger
 * /signatures/statistics:
 *   get:
 *     summary: Get signature statistics
 *     description: Retrieve comprehensive statistics about signatures in the system
 *     tags: [Signatures]
 *     responses:
 *       200:
 *         description: Signature statistics retrieved successfully
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
 *                     total_signatures:
 *                       type: integer
 *                       example: 378134
 *                     average_signature_length:
 *                       type: number
 *                       format: float
 *                       example: 10.17
 *                     total_characters:
 *                       type: integer
 *                       example: 3847823
 *                     shortest_signature:
 *                       type: integer
 *                       example: 1
 *                     longest_signature:
 *                       type: integer
 *                       example: 255
 *       500:
 *         description: Internal server error
 */
router.get(
  '/statistics',
  signaturesController.getSignatureStatistics
);

/**
 * @swagger
 * /signatures/search:
 *   get:
 *     summary: Search signatures
 *     description: Search for signatures by name with exact and fuzzy matching options
 *     tags: [Signatures]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Search query for signature name
 *         example: J. Smith
 *       - in: query
 *         name: exact
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Whether to perform exact matching
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
 *                     $ref: '#/components/schemas/Signature'
 *                 pagination:
 *                   type: object
 *                 query:
 *                   type: string
 *                   example: J. Smith
 *                 exact_match:
 *                   type: boolean
 *                   example: false
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.get(
  '/search',
  [
    query('q')
      .notEmpty()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query is required and must be between 1 and 100 characters'),
    query('exact')
      .optional()
      .isBoolean()
      .withMessage('Exact parameter must be a boolean'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],
  signaturesController.searchSignatures
);

/**
 * @swagger
 * /signatures/{id}:
 *   get:
 *     summary: Get signature by ID
 *     description: Retrieve detailed information about a specific signature
 *     tags: [Signatures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Signature ID
 *         example: 123
 *     responses:
 *       200:
 *         description: Signature details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Signature'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:id',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Signature ID must be a positive integer')
  ],
  signaturesController.getSignatureById
);

/**
 * @swagger
 * /signatures/{id}/persons:
 *   get:
 *     summary: Get persons associated with a signature
 *     description: Retrieve all persons associated with a specific signature
 *     tags: [Signatures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Signature ID
 *         example: 123
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
 *         description: Associated persons
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * @swagger
 * /signatures/{id}/works:
 *   get:
 *     summary: Get works associated with a signature
 *     description: Retrieve all academic works (publications) associated with a specific signature
 *     tags: [Signatures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Signature ID
 *         example: 92152
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
 *                           person_id:
 *                             type: integer
 *                             description: Person ID
 *                           person_name:
 *                             type: string
 *                             description: Person name
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
 *         description: Signature not found
 *       500:
 *         description: Internal server error
 */
const validateWorksQuery = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Signature ID must be a positive integer'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

router.get('/:id/works', validateWorksQuery, relationalLimiter, signaturesController.getSignatureWorks);

router.get(
  '/:id/persons',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Signature ID must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],
  relationalLimiter,
  signaturesController.getSignaturePersons
);

module.exports = router;
