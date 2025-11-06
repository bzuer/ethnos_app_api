const worksService = require('../services/works.service');
const { validationResult } = require('express-validator');
const { ERROR_CODES } = require('../utils/responseBuilder');
const { logger } = require('../middleware/errorHandler');

/**
 * @swagger
 * components:
 *   schemas:
 *     WorkListResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: success
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Work'
 *         pagination:
 *           $ref: '#/components/schemas/Pagination'
  *         meta:
  *           type: object
  *           properties:
  *             performance:
  *               type: object
  *               properties:
  *                 engine: { type: string, example: 'MariaDB' }
  *                 query_type: { type: string, example: 'vitrine' }
  *                 elapsed_ms: { type: integer, example: 125 }
  *                 primary_query_ms: { type: integer, nullable: true }
  *                 publications_query_ms: { type: integer, nullable: true }
 *     WorkDetailResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: success
 *         data:
 *           $ref: '#/components/schemas/Work'
  *         meta:
  *           type: object
  *           properties:
  *             performance:
  *               type: object
  *               properties:
  *                 elapsed_ms: { type: integer, example: 58 }
 */
class WorksController {
  /**
   * @swagger
   * /works/{id}:
   *   get:
   *     tags: [Works]
   *     summary: Get work by ID
   *     description: Retrieve detailed information about a specific academic work including authors, publication details, and metadata
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Work ID
   *         example: 123456
   *     responses:
   *       200:
   *         description: Work details retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/WorkDetailResponse'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getWork(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const includeCitations = String(req.query.include_citations ?? 'true').toLowerCase() !== 'false';
      const includeReferences = String(req.query.include_references ?? 'true').toLowerCase() !== 'false';
      const work = await worksService.getWorkById(id, { includeCitations, includeReferences });
      
      if (!work) {
        return res.fail(`Work with ID ${id} not found`, {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND,
          meta: { id }
        });
      }

      return res.success(work);
    } catch (error) {
      logger.error('Error retrieving work', {
        id: req.params.id,
        error: error.message
      });
      next(error);
    }
  }

  /**
   * @swagger
   * /works:
   *   get:
   *     tags: [Works]
   *     summary: Get list of academic works
   *     description: Retrieve a paginated list of academic works with filtering and sorting options
   *     parameters:
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
   *           maximum: 20
   *           default: 10
   *         description: Number of results per page
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, REPORT, DATASET, OTHER]
   *         description: Filter by work type
   *       - in: query
   *         name: language
   *         schema:
   *           type: string
   *         description: Filter by language (ISO 639 code)
   *       - in: query
   *         name: year_from
   *         schema:
   *           type: integer
   *           minimum: 1900
   *           maximum: 2030
   *         description: Filter by minimum publication year
   *       - in: query
   *         name: year_to
   *         schema:
   *           type: integer
   *           minimum: 1900
   *           maximum: 2030
   *         description: Filter by maximum publication year
   *       - in: query
   *         name: open_access
   *         schema:
   *           type: boolean
   *         description: Filter by open access availability
   *     responses:
   *       200:
   *         description: Works retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/WorkListResponse'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getWorks(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const filters = {
        page: req.query.page,
        limit: req.query.limit,
        offset: req.query.offset,
        search: req.query.search,
        type: req.query.type,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        open_access: req.query.open_access,
        language: req.query.language
      };

      const result = await worksService.getWorks(filters);
      
      return res.success(result.data, {
        pagination: result.pagination,
        meta: result.performance
      });
    } catch (error) {
      logger.error('Error retrieving works list', {
        error: error.message
      });
      next(error);
    }
  }

  /**
   * High-performance works listing using sphinx_works_summary table
   * Optimized for browsing with minimal JOINs and pre-compiled data
   */
  async getWorksVitrine(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const filters = {
        page: req.query.page,
        limit: req.query.limit,
        offset: req.query.offset,
        type: req.query.type,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        language: req.query.language
      };

      const result = await worksService.getWorksVitrine(filters);
      
      return res.success(result.data, {
        pagination: result.pagination,
        meta: result.meta
      });
    } catch (error) {
      logger.error('Error retrieving works vitrine', {
        error: error.message
      });
      next(error);
    }
  }

  async getWorkBibliography(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Invalid parameters', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const id = parseInt(req.params.id, 10);
      const filters = {
        reading_type: req.query.reading_type,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        page: req.query.page,
        limit: req.query.limit,
        offset: req.query.offset
      };

      const result = await worksService.getWorkBibliography(id, filters);
      return res.success(result.data, {
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error retrieving work bibliography', {
        id: req.params.id,
        error: error.message
      });
      next(error);
    }
  }
}

module.exports = new WorksController();
