const worksService = require('../services/works.service');
const { validationResult } = require('express-validator');
const { ERROR_CODES } = require('../utils/responseBuilder');
const { logger } = require('../middleware/errorHandler');


class WorksController {
  
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
