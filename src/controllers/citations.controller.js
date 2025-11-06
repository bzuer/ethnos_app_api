const { validationResult } = require('express-validator');
const citationsService = require('../services/citations.service');
const { logger } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/responseBuilder');

class CitationsController {
  /**
   * @swagger
   * /works/{id}/citations:
   *   get:
   *     tags: [Citations]
   *     summary: Get citations for a work
   *     description: Retrieve all works that cite the specified work, with pagination and filtering options
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Work ID
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
   *         name: type
   *         schema:
   *           type: string
   *           enum: [POSITIVE, NEUTRAL, NEGATIVE, SELF]
   *         description: Citation type filter
   *     responses:
   *       200:
   *         description: Citations retrieved successfully
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
   *                     work_id:
   *                       type: integer
   *                     total_citations:
   *                       type: integer
   *                     citing_works:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Citation'
   *                 meta:
   *                   type: object
   *                   properties:
   *                     query_time_ms:
   *                       type: integer
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
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

  /**
   * @swagger
   * /works/{id}/references:
   *   get:
   *     tags: [Citations]
   *     summary: Get references from a work
   *     description: Retrieve all works referenced by the specified work (bibliography)
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Work ID
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
   *     responses:
   *       200:
   *         description: References retrieved successfully
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
   *                     work_id:
   *                       type: integer
   *                     total_references:
   *                       type: integer
   *                     referenced_works:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Work'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
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

  /**
   * @swagger
   * /works/{id}/metrics:
   *   get:
   *     tags: [Citations]
   *     summary: Get bibliometric metrics for a work
   *     description: Retrieve comprehensive citation metrics and bibliometric indicators for a specific work
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Work ID
   *     responses:
   *       200:
   *         description: Metrics retrieved successfully
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
   *                     work_id:
   *                       type: integer
   *                     citation_metrics:
   *                       type: object
   *                       properties:
   *                         total_citations_received:
   *                           type: integer
   *                         total_references_made:
   *                           type: integer
   *                         h_index_contribution:
   *                           type: integer
   *                         first_citation_year:
   *                           type: integer
   *                         latest_citation_year:
   *                           type: integer
   *                         citation_velocity:
   *                           type: number
   *                           format: float
   *                 meta:
   *                   type: object
   *                   properties:
   *                     query_time_ms:
   *                       type: integer
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
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

  /**
   * @swagger
   * /works/{id}/network:
   *   get:
   *     tags: [Citations]
   *     summary: Get citation network for a work
   *     description: Retrieve citation network graph showing connections between works at specified depth
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Work ID
   *       - in: query
   *         name: depth
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 3
   *           default: 1
   *         description: Network depth (levels of connections)
   *     responses:
   *       200:
   *         description: Citation network retrieved successfully
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
   *                     work_id:
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
   *                         $ref: '#/components/schemas/Work'
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
   *                           type:
   *                             type: string
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
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
