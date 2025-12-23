const { validationResult } = require('express-validator');
const collaborationsService = require('../services/collaborations.service');
const { logger } = require('../middleware/errorHandler');

class CollaborationsController {
  
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