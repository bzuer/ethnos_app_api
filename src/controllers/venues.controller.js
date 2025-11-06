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
  /**
   * @swagger
   * /venues:
   *   get:
   *     tags:
   *       - Venues
   *     summary: Get all venues with pagination and filtering
   *     description: Retrieve a paginated list of academic venues (journals, conferences, repositories, book series) with optional filtering by type and search term
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of venues to return per page
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of venues to skip
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES]
   *         description: Filter venues by type
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search term to filter venues by name
   *       - in: query
   *         name: sortBy
   *         schema:
   *           type: string
   *           enum: [name, type, impact_factor, works_count]
   *           default: name
   *         description: Field to sort by
   *       - in: query
   *         name: sortOrder
   *         schema:
   *           type: string
   *           enum: [ASC, DESC]
   *           default: ASC
   *         description: Sort order
   *     responses:
   *       200:
   *         description: List of venues retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 venues:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: integer
   *                         description: Venue ID
   *                       name:
   *                         type: string
   *                         description: Venue name
   *                       type:
   *                         type: string
   *                         enum: [JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES]
   *                         description: Venue type
   *                       issn:
   *                         type: string
   *                         nullable: true
   *                         description: ISSN identifier
   *                       eissn:
   *                         type: string
   *                         nullable: true
   *                         description: Electronic ISSN identifier
   *                       scopus_source_id:
   *                         type: string
   *                         nullable: true
   *                         description: Scopus source identifier
  *                       publisher:
  *                         type: object
  *                         nullable: true
  *                         description: Publisher organization metadata
  *                         properties:
  *                           id:
  *                             type: integer
  *                             nullable: true
  *                           name:
  *                             type: string
  *                             nullable: true
  *                           type:
  *                             type: string
  *                             nullable: true
  *                             enum: [UNIVERSITY, INSTITUTE, PUBLISHER, FUNDER, COMPANY, OTHER]
  *                           country_code:
  *                             type: string
  *                             nullable: true
  *                             description: ISO-2 country code
  *                       identifiers:
  *                         type: object
  *                         description: Standardized identifiers
  *                         properties:
  *                           issn:
  *                             type: string
  *                             nullable: true
  *                           eissn:
  *                             type: string
  *                             nullable: true
  *                           scopus_source_id:
  *                             type: string
  *                             nullable: true
  *                           external:
  *                             type: object
  *                             additionalProperties:
  *                               type: string
  *                             description: Map of external identifier type to value
  *                       open_access:
  *                         type: boolean
  *                         nullable: true
  *                       aggregation_type:
  *                         type: string
  *                         nullable: true
  *                       coverage_start_year:
  *                         type: integer
  *                         nullable: true
  *                       coverage_end_year:
  *                         type: integer
  *                         nullable: true
  *                       works_count:
  *                         type: integer
  *                         description: Number of works published in this venue
  *                       legacy_metrics:
  *                         type: object
  *                         nullable: true
  *                         description: Optional legacy bibliometric scores when requested
  *                         properties:
  *                           impact_factor:
  *                             type: number
  *                             nullable: true
  *                           sjr:
  *                             type: number
  *                             nullable: true
  *                           snip:
  *                             type: number
  *                             nullable: true
  *                           citescore:
  *                             type: number
  *                             nullable: true
   *                       created_at:
   *                         type: string
   *                         format: date-time
   *                         description: Creation timestamp
   *                       updated_at:
   *                         type: string
   *                         format: date-time
   *                         description: Last update timestamp
   *                 pagination:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                       description: Total number of venues
   *                     limit:
   *                       type: integer
   *                       description: Number of venues per page
   *                     offset:
   *                       type: integer
   *                       description: Number of venues skipped
   *                     pages:
   *                       type: integer
   *                       description: Total number of pages
   *       400:
   *         description: Invalid request parameters
   *       500:
   *         description: Internal server error
   */
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

      const meta = {
        ...(result.meta || {}),
        includes: {
          legacy_metrics: includeLegacyMetrics
        }
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

  /**
   * @swagger
   * /venues/{id}:
   *   get:
   *     tags:
   *       - Venues
   *     summary: Get venue by ID
   *     description: Retrieve detailed information about a specific venue including publication statistics
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Venue ID
   *     responses:
   *       200:
   *         description: Venue details retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: integer
   *                   description: Venue ID
   *                 name:
   *                   type: string
   *                   description: Venue name
   *                 type:
   *                   type: string
   *                   enum: [JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES]
   *                   description: Venue type
   *                 issn:
   *                   type: string
   *                   nullable: true
   *                   description: ISSN identifier
   *                 eissn:
   *                   type: string
   *                   nullable: true
   *                   description: Electronic ISSN identifier
   *                 scopus_source_id:
   *                   type: string
   *                   nullable: true
   *                   description: Scopus source identifier
  *                 publisher:
  *                   type: object
  *                   nullable: true
  *                   description: Publisher organization metadata
  *                   properties:
  *                     id:
  *                       type: integer
  *                       nullable: true
  *                     name:
  *                       type: string
  *                       nullable: true
  *                     type:
  *                       type: string
  *                       nullable: true
  *                       enum: [UNIVERSITY, INSTITUTE, PUBLISHER, FUNDER, COMPANY, OTHER]
  *                     country_code:
  *                       type: string
  *                       nullable: true
  *                       description: ISO-2 country code
  *                 identifiers:
  *                   type: object
  *                   description: Standard and external identifiers
  *                   properties:
  *                     issn:
  *                       type: string
  *                       nullable: true
  *                     eissn:
  *                       type: string
  *                       nullable: true
  *                     scopus_source_id:
  *                       type: string
  *                       nullable: true
  *                     external:
  *                       type: object
  *                       additionalProperties:
  *                         type: string
  *                       description: Map of identifier type to value
  *                 last_validated_at:
  *                   type: string
  *                   format: date-time
  *                   nullable: true
  *                 validation_status:
   *                   type: string
   *                   enum: [PENDING, VALIDATED, NOT_FOUND, FAILED]
   *                 citescore:
   *                   type: number
   *                   nullable: true
   *                   deprecated: true
   *                 sjr:
   *                   type: number
   *                   nullable: true
   *                   deprecated: true
   *                 snip:
   *                   type: number
   *                   nullable: true
   *                   deprecated: true
   *                 open_access:
   *                   type: boolean
   *                 aggregation_type:
   *                   type: string
   *                   nullable: true
   *                 coverage_start_year:
   *                   type: integer
   *                   nullable: true
   *                 coverage_end_year:
   *                   type: integer
   *                   nullable: true
  *                 works_count:
  *                   type: integer
  *                   description: Total unique works indexed in the database for this venue
  *                 legacy_metrics:
  *                   type: object
  *                   nullable: true
  *                   description: Optional legacy bibliometric scores (enabled via include_legacy=true)
  *                   properties:
  *                     impact_factor:
  *                       type: number
  *                       nullable: true
  *                     sjr:
  *                       type: number
  *                       nullable: true
  *                     snip:
  *                       type: number
  *                       nullable: true
  *                     citescore:
  *                       type: number
  *                       nullable: true
  *                 publication_summary:
  *                   type: object
  *                   description: Coverage in the database and recent trend
   *                   properties:
   *                     first_publication_year:
   *                       type: integer
   *                       nullable: true
   *                       description: Coverage start year (from database)
   *                     latest_publication_year:
   *                       type: integer
   *                       nullable: true
   *                       description: Coverage end year (from database)
   *                     publication_trend:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           year:
   *                             type: integer
   *                           works_count:
   *                             type: integer
   *                           oa_works_count:
   *                             type: integer
   *                 top_subjects:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       subject_id: { type: integer }
   *                       term: { type: string }
   *                       score: { type: number }
   *                     open_access_publications:
   *                       type: integer
   *                       description: Publications flagged as open access
   *                       example: 420
   *                     open_access_percentage:
   *                       type: number
   *                       format: float
   *                       nullable: true
   *                       description: Share of publications that are open access
   *                       example: 27.53
   *                     total_citations:
   *                       type: integer
   *                       description: Aggregate citation count for works in the venue
   *                       example: 18345
   *                     avg_citations:
   *                       type: number
   *                       format: float
   *                       nullable: true
   *                       description: Average citations per work (null when unavailable)
   *                       example: 12.04
   *                     total_downloads:
   *                       type: integer
   *                       description: Total download count across venue works
   *                       example: 92341
   *                     first_publication_year:
   *                       type: integer
   *                       nullable: true
   *                       description: Oldest publication year recorded for the venue
   *                       example: 1984
   *                     latest_publication_year:
   *                       type: integer
   *                       nullable: true
   *                       description: Most recent publication year recorded for the venue
   *                       example: 2025
   *                 created_at:
   *                   type: string
   *                   format: date-time
   *                   description: Creation timestamp
   *                 updated_at:
   *                   type: string
   *                   format: date-time
   *                   description: Last update timestamp
   *       404:
   *         description: Venue not found
   *       500:
   *         description: Internal server error
  */
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

  /**
   * @swagger
   * /venues/{id}/publications:
   *   get:
   *     tags:
   *       - Venues
   *     summary: Get publications in a venue
   *     description: Retrieve a paginated list of publications (works with venue-specific metadata) published in a specific venue
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Venue ID
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of publications to return per page
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of publications to skip
   *       - in: query
   *         name: year
   *         schema:
   *           type: integer
   *         description: Filter publications by publication year
   *     responses:
   *       200:
   *         description: Publications retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 publications:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Publication'
   *                 pagination:
   *                   $ref: '#/components/schemas/Pagination'
   *       400:
   *         description: Invalid parameters
   *       404:
   *         description: Venue not found
   *       500:
   *         description: Internal server error
  */
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

  /**
   * @swagger
   * /venues/statistics:
   *   get:
   *     tags:
   *       - Venues
   *     summary: Get venue statistics
   *     description: Retrieve statistical information about all venues in the database
   *     responses:
   *       200:
   *         description: Venue statistics retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 total_venues:
   *                   type: integer
   *                   description: Total number of venues
   *                 journals:
   *                   type: integer
   *                   description: Number of journals
   *                 conferences:
   *                   type: integer
   *                   description: Number of conferences
   *                 repositories:
   *                   type: integer
   *                   description: Number of repositories
   *                 book_series:
   *                   type: integer
   *                   description: Number of book series
   *                 with_impact_factor:
   *                   type: integer
   *                   description: Number of venues with impact factor
   *                 avg_impact_factor:
   *                   type: number
   *                   nullable: true
   *                   description: Average impact factor
   *                 max_impact_factor:
   *                   type: number
   *                   nullable: true
   *                   description: Maximum impact factor
   *                 min_impact_factor:
   *                   type: number
   *                   nullable: true
   *                   description: Minimum impact factor
   *       500:
   *         description: Internal server error
  */
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

  /**
   * @swagger
   * /venues/search:
   *   get:
   *     tags:
   *       - Venues
   *     summary: Search venues
   *     description: Search for venues by name, ISSN, or eISSN with optional type filtering
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *         description: Search term for venue name, ISSN, or eISSN
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES]
   *         description: Filter by venue type
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of results to return per page
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of results to skip
   *     responses:
   *       200:
   *         description: Search results retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 venues:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: integer
   *                         description: Venue ID
   *                       name:
   *                         type: string
   *                         description: Venue name
   *                       type:
   *                         type: string
   *                         enum: [JOURNAL, CONFERENCE, REPOSITORY, BOOK_SERIES]
   *                         description: Venue type
   *                       issn:
   *                         type: string
   *                         nullable: true
   *                         description: ISSN identifier
   *                       eissn:
   *                         type: string
   *                         nullable: true
   *                         description: Electronic ISSN identifier
   *                       scopus_source_id:
   *                         type: string
   *                         nullable: true
   *                         description: Scopus source identifier
  *                       publisher:
  *                         type: object
  *                         nullable: true
  *                         properties:
  *                           id: { type: integer, nullable: true }
  *                           name: { type: string, nullable: true }
  *                           type:
  *                             type: string
  *                             nullable: true
  *                             enum: [UNIVERSITY, INSTITUTE, PUBLISHER, FUNDER, COMPANY, OTHER]
  *                           country_code: { type: string, nullable: true }
  *                       identifiers:
  *                         type: object
  *                         properties:
  *                           issn: { type: string, nullable: true }
  *                           eissn: { type: string, nullable: true }
  *                           scopus_source_id: { type: string, nullable: true }
  *                           external:
  *                             type: object
  *                             additionalProperties: { type: string }
  *                       legacy_metrics:
  *                         type: object
  *                         nullable: true
  *                         properties:
  *                           impact_factor: { type: number, nullable: true }
  *                           sjr: { type: number, nullable: true }
  *                           snip: { type: number, nullable: true }
  *                           citescore: { type: number, nullable: true }
  *                       open_access:
  *                         type: boolean
   *                       aggregation_type:
   *                         type: string
   *                         nullable: true
   *                       coverage_start_year:
   *                         type: integer
   *                         nullable: true
   *                       coverage_end_year:
   *                         type: integer
   *                         nullable: true
   *                       works_count:
   *                         type: integer
   *                         description: Number of works published
   *                 pagination:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                       description: Total number of matching venues
   *                     limit:
   *                       type: integer
   *                       description: Number of venues per page
   *                     offset:
   *                       type: integer
   *                       description: Number of venues skipped
   *                     pages:
   *                       type: integer
   *                       description: Total number of pages
   *                 searchTerm:
   *                   type: string
   *                   description: The search term used
   *       400:
   *         description: Missing or invalid search parameters
   *       500:
   *         description: Internal server error
  */
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
      
      const meta = {
        ...(result.meta || {}),
        includes: {
          legacy_metrics: includeLegacyMetrics
        }
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

/**
 * @swagger
 * components:
 *   schemas:
 *     Publication:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Work ID
 *         title:
 *           type: string
 *           description: Work title
 *         subtitle:
 *           type: string
 *           nullable: true
 *           description: Work subtitle
 *         work_type:
 *           type: string
 *           description: Type of work
 *         language:
 *           type: string
 *           nullable: true
 *           description: Language of publication
 *         temp_doi:
 *           type: string
 *           nullable: true
 *           description: Temporary DOI from works table
 *         year:
 *           type: integer
 *           nullable: true
 *           description: Publication year
 *         volume:
 *           type: string
 *           nullable: true
 *           description: Volume number
 *         issue:
 *           type: string
 *           nullable: true
 *           description: Issue number
 *         pages:
 *           type: string
 *           nullable: true
 *           description: Page range
 *         doi:
 *           type: string
 *           nullable: true
 *           description: DOI from publications table
 *         open_access:
 *           type: boolean
 *           description: Open access status
 *         peer_reviewed:
 *           type: boolean
 *           description: Peer review status
 *         publication_date:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Specific publication date
 *     Pagination:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           description: Total number of items
 *         limit:
 *           type: integer
 *           description: Number of items per page
 *         offset:
 *           type: integer
 *           description: Number of items skipped
 *         pages:
 *           type: integer
 *           description: Total number of pages
 *         hasNext:
 *           type: boolean
 *           description: Whether there are more pages
 *         hasPrev:
 *           type: boolean
 *           description: Whether there are previous pages
 */

module.exports = new VenuesController();
