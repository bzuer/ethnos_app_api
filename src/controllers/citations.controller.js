const { validationResult } = require('express-validator');
const citationsService = require('../services/citations.service');
const { logger } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/responseBuilder');

class CitationsController {
  
  async getWorkCitations(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Work citations validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const workId = req.params.id;
      const filters = {
        page: req.query.page,
        limit: req.query.limit,
        type: req.query.type
      };

      const startTime = Date.now();
      const result = await citationsService.getWorkCitations(workId, filters);
      const queryTime = Date.now() - startTime;

      if (!result) {
        logger.warn(`Citations not found for work ${workId}`);
        return res.fail(`Citations for work with ID ${workId} not found`, {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND
        });
      }

      logger.info(`Work ${workId} citations retrieved: ${result.citing_works.length} citations in ${queryTime}ms`);

      const meta = {
        query_time_ms: queryTime,
        source: 'citations_analysis',
        filters: result.filters
      };

      const { pagination, ...data } = result;
      return res.success(data, {
        pagination,
        meta
      });
    } catch (error) {
      logger.error('Error in work citations controller:', error);
      return res.error(error);
    }
  }

  
  async getWorkReferences(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Work references validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const workId = req.params.id;
      const filters = {
        page: req.query.page,
        limit: req.query.limit
      };

      const startTime = Date.now();
      const result = await citationsService.getWorkReferences(workId, filters);
      const queryTime = Date.now() - startTime;

      if (!result) {
        logger.warn(`References not found for work ${workId}`);
        return res.fail(`References for work with ID ${workId} not found`, {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND
        });
      }

      logger.info(`Work ${workId} references retrieved: ${result.referenced_works.length} references in ${queryTime}ms`);

      const meta = {
        query_time_ms: queryTime,
        source: 'references_analysis'
      };

      const { pagination, ...data } = result;
      return res.success(data, {
        pagination,
        meta
      });
    } catch (error) {
      logger.error('Error in work references controller:', error);
      return res.error(error);
    }
  }

  
  async getWorkMetrics(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Work metrics validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const workId = req.params.id;

      const startTime = Date.now();
      const result = await citationsService.getWorkMetrics(workId);
      const queryTime = Date.now() - startTime;

      if (!result) {
        logger.warn(`Metrics not found for work ${workId}`);
        return res.fail(`Metrics for work with ID ${workId} not found`, {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND
        });
      }

      logger.info(`Work ${workId} metrics retrieved: ${result.citation_metrics.total_citations_received} citations in ${queryTime}ms`);

      const meta = {
        query_time_ms: queryTime,
        source: 'bibliometric_analysis'
      };

      return res.success(result, {
        meta
      });
    } catch (error) {
      logger.error('Error in work metrics controller:', error);
      return res.error(error);
    }
  }

  
  async getCitationNetwork(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Citation network validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const workId = req.params.id;
      const depth = req.query.depth || 1;

      const startTime = Date.now();
      const result = await citationsService.getCitationNetwork(workId, depth);
      const queryTime = Date.now() - startTime;

      if (!result) {
        logger.warn(`Citation network not found for work ${workId}`);
        return res.fail(`Citation network for work with ID ${workId} not found`, {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND
        });
      }

      logger.info(`Work ${workId} citation network retrieved: ${result.network_stats.total_nodes} nodes, ${result.network_stats.total_edges} edges in ${queryTime}ms`);

      const meta = {
        query_time_ms: queryTime,
        source: 'network_analysis',
        complexity: result.network_stats
      };

      return res.success(result, {
        meta
      });
    } catch (error) {
      logger.error('Error in citation network controller:', error);
      return res.error(error);
    }
  }
}

module.exports = new CitationsController();
