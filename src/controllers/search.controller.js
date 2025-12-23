const { validationResult } = require('express-validator');
const searchService = require('../services/search.service');
const { logger } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/responseBuilder');

class SearchController {
  
  async searchWorks(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Works search validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const { q: query } = req.query;
      const filters = {
        page: req.query.page,
        limit: req.query.limit,
        offset: req.query.offset,
        type: req.query.type,
        language: req.query.language,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        include_facets: ['1','true',true].includes((req.query.include_facets || '').toString().toLowerCase())
      };

      const startTime = Date.now();
      const result = await searchService.searchWorks(query, filters);
      const controllerTime = Date.now() - startTime;

      logger.info(`Works search completed: "${query}" - ${result.pagination.total} results in ${controllerTime}ms`);

      const meta = {
        ...(result.meta || {}),
        performance: {
          ...(((result && result.meta) ? result.meta.performance : {}) || {}),
          ...((result && result.performance) || {}),
          controller_time_ms: controllerTime
        }
      };

      return res.success(result.data, {
        pagination: result.pagination,
        meta
      });
    } catch (error) {
      logger.error('Error in works search controller:', error);
      if (typeof res.error === 'function') {
        return res.error(error, {
          meta: { context: 'searchWorks' }
        });
      }
      return next(error);
    }
  }

  
  async searchPersons(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Persons search validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const { q: query } = req.query;
      const filters = {
        page: req.query.page,
        limit: req.query.limit,
        offset: req.query.offset,
        verified: req.query.verified,
        engine: req.query.engine
      };

      const startTime = Date.now();
      const result = await searchService.searchPersons(query, filters);
      const controllerTime = Date.now() - startTime;

      logger.info(`Persons search completed: "${query}" - ${result.pagination.total} results in ${controllerTime}ms`);

      const meta = {
        ...(result.meta || {}),
        performance: {
          ...(result.performance || {}),
          controller_time_ms: controllerTime
        }
      };

      return res.success(result.data, {
        pagination: result.pagination,
        meta
      });
    } catch (error) {
      logger.error('Error in persons search controller:', error);
      if (typeof res.error === 'function') {
        return res.error(error, {
          meta: { context: 'searchPersons' }
        });
      }
      return next(error);
    }
  }


  
  async globalSearch(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Global search validation failed:', errors.array());
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const { q: query } = req.query;
      const filters = {
        limit: req.query.limit || 5
      };

      const startTime = Date.now();
      const result = await searchService.globalSearch(query, filters);
      const controllerTime = Date.now() - startTime;

      logger.info(`Global search completed: "${query}" in ${controllerTime}ms`);

      const meta = {
        ...(result.meta || {}),
        controller_time_ms: controllerTime
      };

      return res.success(result.data, { meta });
    } catch (error) {
      logger.error('Error in global search controller:', error);
      if (typeof res.error === 'function') {
        return res.error(error, {
          meta: { context: 'globalSearch' }
        });
      }
      return next(error);
    }
  }
}

module.exports = new SearchController();
