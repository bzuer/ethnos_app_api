const { validationResult } = require('express-validator');
const metricsService = require('../services/metrics.service');
const { ERROR_CODES } = require('../utils/responseBuilder');

class MetricsController {
  /**
   * @swagger
   * /metrics/annual:
   *   get:
   *     tags: [Metrics]
   *     summary: Get annual publication statistics
   *     description: Retrieve yearly publication statistics with filtering options
   *     parameters:
   *       - in: query
   *         name: year_from
   *         schema:
   *           type: integer
   *           minimum: 1900
   *           maximum: 2030
   *         description: Start year for statistics
   *       - in: query
   *         name: year_to
   *         schema:
   *           type: integer
   *           minimum: 1900
   *           maximum: 2030
   *         description: End year for statistics
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of years to return
  *     responses:
  *       200:
  *         description: Annual statistics retrieved successfully
  *         content:
  *           application/json:
   *             example:
   *               status: success
   *               data:
   *                 - year: 2024
   *                   total_works: 48210
   *                   unique_authors: 29540
   *                   unique_organizations: 9050
   *                   open_access_count: 20110
   *                   open_access_percentage: 41.7
   *                   avg_authors_per_work: 3.4
   *                 - year: 2023
   *                   total_works: 45620
   *                   unique_authors: 28950
   *                   unique_organizations: 8750
   *                   open_access_count: 19388
   *                   open_access_percentage: 42.5
   *                   avg_authors_per_work: 3.2
   *               meta:
   *                 summary:
   *                   total_years: 25
   *                   date_range: 1999-2024
   *                   total_works_all_years: 650645
   *                 performance:
   *                   controller_time_ms: 132
   *                 generated_at: '2025-10-13T12:00:00.000Z'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getAnnualStats(req, res) {
    try {
      const t0 = Date.now();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const filters = {
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        limit: req.query.limit || 20
      };

      const result = await metricsService.getAnnualStats(filters);

      return res.success(result.data, {
        meta: {
          summary: result.summary,
          filters: {
            year_from: filters.year_from || null,
            year_to: filters.year_to || null,
            limit: filters.limit
          },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  /**
   * @swagger
   * /metrics/venues:
   *   get:
   *     tags: [Metrics]
   *     summary: Get top venue rankings
   *     description: Retrieve rankings of top publication venues by number of publications
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of venues to return
   *     responses:
  *       200:
  *         description: Venue rankings retrieved successfully
  *         content:
  *           application/json:
   *             example:
   *               status: success
   *               data:
   *                 - venue_id: 142
   *                   venue_name: Nature Machine Intelligence
   *                   venue_type: JOURNAL
   *                   total_publications: 2856
   *                   unique_authors: 5420
   *                   avg_citations_per_work: 18.5
   *                   open_access_percentage: 35.2
   *                   ranking: 1
   *               meta:
   *                 summary:
   *                   total_venues_ranked: 1563
   *                   top_venue_publications: 2856
   *                 performance:
   *                   controller_time_ms: 98
   *                 generated_at: '2025-10-13T12:00:00.000Z'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getTopVenues(req, res) {
    try {
      const t0 = Date.now();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const filters = {
        limit: req.query.limit || 20
      };

      const result = await metricsService.getTopVenues(filters);

      return res.success(result.data, {
        meta: {
          summary: result.summary,
          filters: { limit: filters.limit },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  /**
   * @swagger
   * /metrics/institutions:
   *   get:
   *     tags: [Metrics]
   *     summary: Get institution productivity rankings
   *     description: Retrieve productivity metrics for institutions, optionally filtered by country
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of institutions to return
   *       - in: query
   *         name: country_code
   *         schema:
   *           type: string
   *           minLength: 2
   *           maxLength: 3
   *         description: Filter by country code (ISO 2 or 3 letter code)
   *     responses:
   *       200:
   *         description: Institution productivity retrieved successfully
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
   *                       organization_id:
   *                         type: integer
   *                         example: 12345
   *                       organization_name:
   *                         type: string
   *                         example: Universidade de São Paulo
   *                       organization_type:
   *                         type: string
   *                         example: UNIVERSITY
   *                       country:
   *                         type: string
   *                         example: Brazil
   *                       total_works:
   *                         type: integer
   *                         example: 125420
   *                       unique_authors:
   *                         type: integer
   *                         example: 8250
   *                       h_index:
   *                         type: integer
   *                         example: 245
   *                       total_citations:
   *                         type: integer
   *                         example: 1856420
   *                       avg_citations_per_work:
   *                         type: number
   *                         format: float
   *                         example: 14.8
   *                       productivity_score:
   *                         type: number
   *                         format: float
   *                         example: 89.5
   *                       ranking:
   *                         type: integer
   *                         example: 3
   *                 summary:
   *                   type: object
   *                   properties:
   *                     total_institutions:
   *                       type: integer
   *                       example: 235833
   *                     country_filter:
   *                       type: string
   *                       example: Brazil
   *                     top_institution_works:
   *                       type: integer
   *                       example: 125420
   *                 meta:
   *                   type: object
   *                   properties:
   *                     query_time_ms:
   *                       type: integer
   *                       example: 220
   *                     filters_applied:
   *                       type: array
   *                       items:
   *                         type: string
   *                       example: ["limit", "country_code"]
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getInstitutionProductivity(req, res) {
    try {
      const t0 = Date.now();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const filters = {
        limit: req.query.limit || 20,
        country_code: req.query.country_code
      };

      const result = await metricsService.getInstitutionProductivity(filters);

      return res.success(result.data, {
        meta: {
          summary: result.summary,
          filters: {
            limit: filters.limit,
            country_code: filters.country_code || null
          },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  /**
   * @swagger
   * /metrics/persons:
   *   get:
   *     tags: [Metrics]
   *     summary: Get person production rankings
   *     description: Retrieve productivity metrics for individual researchers, optionally filtered by organization
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of persons to return
   *       - in: query
   *         name: organization_id
   *         schema:
   *           type: integer
   *         description: Filter by organization ID
   *     responses:
   *       200:
   *         description: Person production metrics retrieved successfully
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
   *                       person_id:
   *                         type: integer
   *                         example: 5952
   *                       full_name:
   *                         type: string
   *                         example: Dr. Maria Silva Santos
   *                       primary_organization:
   *                         type: string
   *                         example: Universidade de São Paulo
   *                       organization_country:
   *                         type: string
   *                         example: Brazil
   *                       total_works:
   *                         type: integer
   *                         example: 45
   *                       h_index:
   *                         type: integer
   *                         example: 12
   *                       total_citations:
   *                         type: integer
   *                         example: 678
   *                       avg_citations_per_work:
   *                         type: number
   *                         format: float
   *                         example: 15.1
   *                       first_publication_year:
   *                         type: integer
   *                         example: 2018
   *                       latest_publication_year:
   *                         type: integer
   *                         example: 2023
   *                       years_active:
   *                         type: integer
   *                         example: 6
   *                       productivity_score:
   *                         type: number
   *                         format: float
   *                         example: 7.5
   *                       ranking:
   *                         type: integer
   *                         example: 847
   *                 summary:
   *                   type: object
   *                   properties:
   *                     total_persons:
   *                       type: integer
   *                       example: 385670
   *                     organization_filter:
   *                       type: string
   *                       example: Universidade de São Paulo
   *                     top_person_works:
   *                       type: integer
   *                       example: 45
   *                 meta:
   *                   type: object
   *                   properties:
   *                     query_time_ms:
   *                       type: integer
   *                       example: 156
   *                     filters_applied:
   *                       type: array
   *                       items:
   *                         type: string
   *                       example: ["limit"]
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getPersonProduction(req, res) {
    try {
      const t0 = Date.now();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const filters = {
        limit: req.query.limit || 20,
        organization_id: req.query.organization_id
      };

      const result = await metricsService.getPersonProduction(filters);

      return res.success(result.data, {
        meta: {
          summary: result.summary,
          filters: {
            limit: filters.limit,
            organization_id: filters.organization_id || null
          },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  /**
   * @swagger
   * /metrics/collaborations:
   *   get:
   *     tags: [Metrics]
   *     summary: Get collaboration metrics
   *     description: Retrieve metrics on research collaborations between authors
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of collaboration pairs to return
   *       - in: query
   *         name: min_collaborations
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 2
   *         description: Minimum number of collaborations required
   *     responses:
   *       200:
   *         description: Collaboration metrics retrieved successfully
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
   *                       person_1_id:
   *                         type: integer
   *                         example: 5952
   *                       person_1_name:
   *                         type: string
   *                         example: Dr. Maria Silva Santos
   *                       person_2_id:
   *                         type: integer
   *                         example: 9876
   *                       person_2_name:
   *                         type: string
   *                         example: Dr. João Carlos Oliveira
   *                       total_collaborations:
   *                         type: integer
   *                         example: 8
   *                         description: Number of works co-authored
   *                       collaboration_span_years:
   *                         type: integer
   *                         example: 5
   *                         description: Years of active collaboration
   *                       first_collaboration_year:
   *                         type: integer
   *                         example: 2018
   *                       latest_collaboration_year:
   *                         type: integer
   *                         example: 2023
   *                       avg_citations_together:
   *                         type: number
   *                         format: float
   *                         example: 24.5
   *                         description: Average citations for collaborative works
   *                       total_citations_together:
   *                         type: integer
   *                         example: 196
   *                       collaboration_strength:
   *                         type: string
   *                         enum: [very_strong, strong, moderate, weak]
   *                         example: strong
   *                 summary:
   *                   type: object
   *                   properties:
   *                     total_collaboration_pairs:
   *                       type: integer
   *                       example: 125680
   *                     min_collaborations_filter:
   *                       type: integer
   *                       example: 2
   *                     strongest_collaboration_count:
   *                       type: integer
   *                       example: 8
   *                 filters:
   *                   type: object
   *                   properties:
   *                     min_collaborations:
   *                       type: integer
   *                       example: 2
   *                     limit:
   *                       type: integer
   *                       example: 20
   *                 meta:
   *                   type: object
   *                   properties:
   *                     query_time_ms:
   *                       type: integer
   *                       example: 340
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getCollaborations(req, res) {
    try {
      const t0 = Date.now();
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.fail('Validation failed', {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION,
          errors: errors.array()
        });
      }

      const filters = {
        limit: req.query.limit || 20,
        min_collaborations: req.query.min_collaborations || 2
      };

      const result = await metricsService.getCollaborations(filters);

      return res.success(result.data, {
        meta: {
          summary: result.summary,
          filters: {
            limit: filters.limit,
            min_collaborations: filters.min_collaborations
          },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }

  /**
   * @swagger
   * /metrics/dashboard:
   *   get:
   *     tags: [Metrics]
   *     summary: Get dashboard summary statistics
   *     description: Retrieve comprehensive summary statistics for the dashboard overview
   *     responses:
   *       200:
   *         description: Dashboard summary retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/DashboardStats'
   *                 - type: object
   *                   properties:
   *                     meta:
   *                       type: object
   *                       properties:
   *                         query_time_ms:
   *                           type: integer
   *                           example: 180
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getDashboardSummary(req, res) {
    try {
      const t0 = Date.now();
      const result = await metricsService.getDashboardSummary();

      return res.success(result, {
        meta: {
          cache_info: {
            cached: true,
            ttl_seconds: 1800
          },
          generated_at: new Date().toISOString(),
          performance: { controller_time_ms: Date.now() - t0 }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.INTERNAL
      });
    }
  }
}

module.exports = new MetricsController();
