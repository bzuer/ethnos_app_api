const { validationResult } = require('express-validator');
const collaborationsService = require('../services/collaborations.service');
const { logger } = require('../middleware/errorHandler');

class CollaborationsController {
  /**
   * @swagger
   * /persons/{id}/collaborators:
   *   get:
   *     tags: [Collaborations]
   *     summary: Get collaborators for a person
   *     description: Retrieve all co-authors and collaboration partners for a specific researcher
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
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
   *         description: Items per page
   *       - in: query
   *         name: min_collaborations
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *         description: Minimum number of collaborations
   *       - in: query
   *         name: sort_by
   *         schema:
   *           type: string
   *           enum: [collaborations, recent, strength]
   *           default: collaborations
   *         description: Sort criteria
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
   *                     total_collaborators:
   *                       type: integer
   *                     collaborators:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Collaboration'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getPersonCollaborators(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Person collaborators validation failed:', errors.array());
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const personId = req.params.id;
      const filters = {
        page: req.query.page,
        limit: req.query.limit,
        min_collaborations: req.query.min_collaborations,
        sort_by: req.query.sort_by
      };

      const startTime = Date.now();
      const result = await collaborationsService.getPersonCollaborators(personId, filters);
      const queryTime = Date.now() - startTime;

      if (!result) {
        logger.warn(`Collaborators not found for person ${personId}`);
        return res.status(404).json({
          status: 'error',
          message: `Collaborators for person with ID ${personId} not found`
        });
      }

      logger.info(`Person ${personId} collaborators retrieved: ${result.collaborators.length} collaborators in ${queryTime}ms`);

      res.json({
        status: 'success',
        data: result,
        meta: {
          query_time_ms: queryTime,
          source: 'collaboration_analysis'
        }
      });
    } catch (error) {
      logger.error('Error in person collaborators controller:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve person collaborators'
      });
    }
  }

  /**
   * @swagger
   * /persons/{id}/network:
   *   get:
   *     tags: [Collaborations]
   *     summary: Get collaboration network for a person
   *     description: Retrieve network graph of collaboration relationships at specified depth
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Person ID
   *       - in: query
   *         name: depth
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 3
   *           default: 2
   *         description: Network depth (degrees of separation)
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
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     person_id:
   *                       type: integer
   *                     network_stats:
   *                       type: object
   *                       properties:
   *                         total_nodes:
   *                           type: integer
   *                         total_edges:
   *                           type: integer
   *                         depth_levels:
   *                           type: integer
   *                     nodes:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Person'
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
   *                           collaboration_strength:
   *                             type: string
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getCollaborationNetwork(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Collaboration network validation failed:', errors.array());
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const personId = req.params.id;
      const depth = req.query.depth || 2;

      const startTime = Date.now();
      const result = await collaborationsService.getCollaborationNetwork(personId, depth);
      const queryTime = Date.now() - startTime;

      if (!result) {
        logger.warn(`Collaboration network not found for person ${personId}`);
        return res.status(404).json({
          status: 'error',
          message: `Collaboration network for person with ID ${personId} not found`
        });
      }

      logger.info(`Person ${personId} collaboration network retrieved: ${result.network_stats.total_nodes} nodes, ${result.network_stats.total_edges} edges in ${queryTime}ms`);

      res.json({
        status: 'success',
        data: result,
        meta: {
          query_time_ms: queryTime,
          source: 'network_analysis',
          complexity: result.network_stats
        }
      });
    } catch (error) {
      logger.error('Error in collaboration network controller:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve collaboration network'
      });
    }
  }

  /**
   * @swagger
   * /collaborations/top:
   *   get:
   *     tags: [Collaborations]
   *     summary: Get top collaboration pairs
   *     description: Retrieve the most productive collaboration partnerships across the platform
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 50
   *         description: Number of top collaborations to return
   *       - in: query
   *         name: min_collaborations
   *         schema:
   *           type: integer
   *           minimum: 2
   *           default: 3
   *         description: Minimum number of collaborative works
   *       - in: query
   *         name: year_from
   *         schema:
   *           type: integer
   *           minimum: 1900
   *           maximum: 2030
   *         description: Filter from year
   *       - in: query
   *         name: year_to
   *         schema:
   *           type: integer
   *           minimum: 1900
   *           maximum: 2030
   *         description: Filter to year
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
   *                   example: success
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       person1_id:
   *                         type: integer
   *                       person1_name:
   *                         type: string
   *                       person2_id:
   *                         type: integer
   *                       person2_name:
   *                         type: string
   *                       collaboration_metrics:
   *                         $ref: '#/components/schemas/Collaboration/properties/collaboration_metrics'
   *                       collaboration_strength:
   *                         type: string
   *                         enum: [very_strong, strong, moderate, weak]
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getTopCollaborations(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Top collaborations validation failed:', errors.array());
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const filters = {
        limit: req.query.limit,
        min_collaborations: req.query.min_collaborations,
        year_from: req.query.year_from,
        year_to: req.query.year_to
      };

      const startTime = Date.now();
      const result = await collaborationsService.getTopCollaborations(filters);
      const queryTime = Date.now() - startTime;

      logger.info(`Top collaborations retrieved: ${result.top_collaborations.length} partnerships in ${queryTime}ms`);

      res.json({
        status: 'success',
        data: result,
        meta: {
          query_time_ms: queryTime,
          source: 'collaboration_ranking'
        }
      });
    } catch (error) {
      logger.error('Error in top collaborations controller:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve top collaborations'
      });
    }
  }
}

module.exports = new CollaborationsController();