const venuesService = require('../services/venues.service');
const { validationResult } = require('express-validator');
const { logger } = require('../middleware/errorHandler');
const { normalizePagination } = require('../utils/pagination');
const { ERROR_CODES } = require('../utils/responseBuilder');

const parseBooleanParam = (value, defaultValue = false) => {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no'].includes(normalized)) {
      return false;
    }
  }

  return defaultValue;
};

const parseIntegerParam = (value, defaultValue = undefined) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

class VenuesController {
  
  async getAllVenues(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const pagination = normalizePagination({
        page: req.query.page,
        limit: req.query.limit !== undefined ? req.query.limit : 20,
        offset: req.query.offset
      });
      const includeLegacyMetrics = parseBooleanParam(req.query.include_legacy, false);
      const minId = parseIntegerParam(req.query.min_id);

      const options = {
        ...pagination,
        type: req.query.type,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        includeLegacyMetrics,
        min_id: minId
      };

      const result = await venuesService.getVenues(options);

      const includes = {
        ...(result.meta?.includes || {}),
        legacy_metrics: includeLegacyMetrics,
        subjects: true,
        terms: true,
        keywords: true
      };

      const meta = {
        ...(result.meta || {}),
        includes
      };

      logger.info('Retrieved venues list', {
        total: result.pagination?.total,
        limit: result.pagination?.limit,
        type: options.type,
        search: options.search,
        includeLegacyMetrics
      });

      return res.success(result.data, {
        pagination: result.pagination,
        meta
      });
    } catch (error) {
      logger.error('Error in getAllVenues', { error: error.message });
      next(error);
    }
  }

  
  async getVenueById(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const id = parseIntegerParam(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.fail('Invalid venue ID', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          meta: { id: req.params.id }
        });
      }

      const includeSubjects = parseBooleanParam(req.query.include_subjects, true);
      const includeYearly = parseBooleanParam(req.query.include_yearly, true);
      const includeTopAuthors = parseBooleanParam(req.query.include_top_authors, true);
      const includeLegacyMetrics = parseBooleanParam(req.query.include_legacy, true);
      const includeRecentWorks = parseBooleanParam(req.query.include_recent_works, true);

      const result = await venuesService.getVenueById(id, {
        includeSubjects,
        includeYearly,
        includeTopAuthors,
        includeLegacyMetrics,
        includeRecentWorks
      });
      
      if (!result) {
        return res.fail(`Venue with ID ${id} not found`, {
          statusCode: 404,
          code: ERROR_CODES.NOT_FOUND,
          meta: { id }
        });
      }

      const meta = {
        ...(result.meta || {}),
        includes: {
          subjects: includeSubjects,
          terms: includeSubjects,
          keywords: includeSubjects,
          yearly_stats: includeYearly,
          top_authors: includeTopAuthors,
          legacy_metrics: includeLegacyMetrics,
          recent_works: includeRecentWorks
        }
      };

      logger.info('Retrieved venue detail', {
        id,
        includes: meta.includes
      });

      return res.success(result.data, {
        meta
      });
    } catch (error) {
      logger.error(`Error in getVenueById for ID ${req.params.id}:`, { error: error.message });
      next(error);
    }
  }

  
  async getVenueWorks(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const id = parseIntegerParam(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.fail('Invalid venue ID', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          meta: { id: req.params.id }
        });
      }

      const pagination = normalizePagination({
        page: req.query.page,
        limit: req.query.limit !== undefined ? req.query.limit : 20,
        offset: req.query.offset
      });
      const year = parseIntegerParam(req.query.year, null);

      const result = await venuesService.getVenueWorks(id, {
        ...pagination,
        year
      });
      
      const meta = {};
      if (year !== null) {
        meta.filters = { year };
      }

      logger.info('Retrieved venue works', {
        venueId: id,
        count: result.data.length,
        total: result.pagination.total,
        year
      });

      return res.success(result.data, {
        pagination: result.pagination,
        meta: Object.keys(meta).length ? meta : undefined
      });
    } catch (error) {
      logger.error(`Error in getVenueWorks for venue ${req.params.id}:`, { error: error.message });
      next(error);
    }
  }

  
  async getVenueStatistics(req, res, next) {
    try {
      const stats = await venuesService.getVenueStatistics();
      
      logger.info('Retrieved venue statistics', {
        endpoint: '/venues/statistics',
        totalVenues: stats.total_venues
      });

      return res.success(stats);
    } catch (error) {
      logger.error('Error in getVenueStatistics:', { error: error.message });
      next(error);
    }
  }

  
  async searchVenues(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
      const trimmedQuery = rawQuery.trim();

      if (!trimmedQuery) {
        return res.fail('Search query (q) parameter is required', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION
        });
      }

      if (trimmedQuery.length > 256) {
        return res.fail('Search query (q) must be 256 characters or fewer', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION
        });
      }

      const pagination = normalizePagination({
        page: req.query.page,
        limit: req.query.limit !== undefined ? req.query.limit : 20,
        offset: req.query.offset
      });

      const includeLegacyMetrics = parseBooleanParam(req.query.include_legacy, false);

      const options = {
        ...pagination,
        type: req.query.type,
        includeLegacyMetrics
      };

      const result = await venuesService.searchVenues(trimmedQuery, options);
      
      const searchIncludes = {
        ...(result.meta?.includes || {}),
        legacy_metrics: includeLegacyMetrics,
        subjects: true,
        terms: true,
        keywords: true
      };

      const meta = {
        ...(result.meta || {}),
        includes: searchIncludes
      };

      logger.info('Search venues executed', {
        query: trimmedQuery,
        type: options.type,
        count: result.data.length,
        total: result.pagination.total
      });

      return res.success(result.data, {
        pagination: result.pagination,
        meta
      });
    } catch (error) {
      logger.error(`Error in searchVenues for query "${req.query.q}":`, { error: error.message });
      next(error);
    }
  }
}



module.exports = new VenuesController();
