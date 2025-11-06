/**
 * @swagger
 * tags:
 *   name: Collaborations
 *   description: Research collaboration networks and partnerships
 */

const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const collaborationsController = require('../controllers/collaborations.controller');

const validatePersonId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Person ID must be a positive integer')
];

const validateCollaborationFilters = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
    
  query('min_collaborations')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Minimum collaborations must be between 1 and 50'),
    
  query('sort_by')
    .optional()
    .isIn(['collaboration_count', 'latest_collaboration_year', 'avg_citations_together'])
    .withMessage('Sort by must be one of: collaboration_count, latest_collaboration_year, avg_citations_together')
];

const validateTopCollaborations = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
    
  query('min_collaborations')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Minimum collaborations must be between 1 and 50'),
    
  query('year_from')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year from must be a valid year'),
    
  query('year_to')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Year to must be a valid year')
];

const validateNetworkDepth = [
  query('depth')
    .optional()
    .isInt({ min: 1, max: 3 })
    .withMessage('Network depth must be between 1 and 3')
];

/**
 * @swagger
 * /persons/{id}/collaborators:
 *   get:
 *     summary: Get collaborators for a person
 *     tags: [Collaborations]
 *     description: Retrieve all research collaborators for a specific person with collaboration metrics
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Person ID
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: min_collaborations
 *         in: query
 *         description: Minimum number of collaborations to include
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 2
 *       - name: sort_by
 *         in: query
 *         description: Sort criteria
 *         schema:
 *           type: string
 *           enum: [collaboration_count, latest_collaboration_year, avg_citations_together]
 *           default: collaboration_count
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *     responses:
 *       200:
 *         description: Collaborators retrieved successfully
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
 *                     person_id:
 *                       type: integer
 *                     collaborators:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           collaborator_id:
 *                             type: integer
 *                           collaborator_name:
 *                             type: string
 *                           collaboration_metrics:
 *                             type: object
 *                             properties:
 *                               total_collaborations:
 *                                 type: integer
 *                               collaboration_span_years:
 *                                 type: integer
 *                               avg_citations_together:
 *                                 type: number
 *                               open_access_percentage:
 *                                 type: number
 *                           collaboration_strength:
 *                             type: string
 *                             enum: [very_strong, strong, moderate, weak]
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/persons/:id/collaborators', [...validatePersonId, ...validateCollaborationFilters], collaborationsController.getPersonCollaborators);

/**
 * @swagger
 * /persons/{id}/network:
 *   get:
 *     summary: Get collaboration network for a person
 *     tags: [Collaborations]
 *     description: Build collaboration network showing research relationships
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Person ID
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: depth
 *         in: query
 *         description: Network depth (1-3 levels)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 3
 *           default: 2
 *     responses:
 *       200:
 *         description: Collaboration network retrieved successfully
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
 *                     central_person_id:
 *                       type: integer
 *                     network_depth:
 *                       type: integer
 *                     nodes:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           type:
 *                             type: string
 *                             enum: [central, direct_collaborator, second_degree_collaborator]
 *                           level:
 *                             type: integer
 *                     edges:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           source:
 *                             type: integer
 *                           target:
 *                             type: integer
 *                           weight:
 *                             type: integer
 *                           relationship:
 *                             type: string
 *                     network_stats:
 *                       type: object
 *                       properties:
 *                         total_nodes:
 *                           type: integer
 *                         total_edges:
 *                           type: integer
 *                         direct_collaborators:
 *                           type: integer
 *                         network_density:
 *                           type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/persons/:id/network', [...validatePersonId, ...validateNetworkDepth], collaborationsController.getCollaborationNetwork);

/**
 * @swagger
 * /collaborations/top:
 *   get:
 *     summary: Get top research collaborations
 *     tags: [Collaborations]
 *     description: Retrieve the most productive research partnerships
 *     parameters:
 *       - name: min_collaborations
 *         in: query
 *         description: Minimum collaborations required
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 5
 *       - name: year_from
 *         in: query
 *         description: Filter collaborations from this year
 *         schema:
 *           type: integer
 *           example: 2020
 *       - name: year_to
 *         in: query
 *         description: Filter collaborations up to this year
 *         schema:
 *           type: integer
 *           example: 2024
 *       - $ref: '#/components/parameters/limitParam'
 *     responses:
 *       200:
 *         description: Top collaborations retrieved successfully
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
 *                     top_collaborations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           collaboration_pair:
 *                             type: object
 *                             properties:
 *                               person1:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   name:
 *                                     type: string
 *                               person2:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   name:
 *                                     type: string
 *                           collaboration_metrics:
 *                             type: object
 *                           collaboration_strength:
 *                             type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_partnerships:
 *                           type: integer
 *                         avg_collaborations:
 *                           type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.get('/collaborations/top', validateTopCollaborations, collaborationsController.getTopCollaborations);

module.exports = router;