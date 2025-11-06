const bibliographyService = require('../services/bibliography.service');
const { handleError } = require('../middleware/errorHandler');

class BibliographyController {

  /**
   * @swagger
   * /bibliography:
   *   get:
   *     summary: Get bibliography entries
   *     description: Retrieve paginated list of bibliography entries with comprehensive filtering
   *     tags: [Bibliography]
   *     parameters:
   *       - in: query
   *         name: course_id
   *         schema:
   *           type: integer
   *         description: Filter by specific course
   *       - in: query
   *         name: work_id
   *         schema:
   *           type: integer
   *         description: Filter by specific work
   *       - in: query
   *         name: instructor_id
   *         schema:
   *           type: integer
   *         description: Filter by specific instructor
   *       - in: query
   *         name: reading_type
   *         schema:
   *           type: string
   *           enum: ['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY']
   *         description: Filter by reading type
   *       - in: query
   *         name: week_number
   *         schema:
   *           type: integer
   *         description: Filter by week number
   *       - in: query
   *         name: year_from
   *         schema:
   *           type: integer
   *         description: Filter courses from this academic year
   *       - in: query
   *         name: year_to
   *         schema:
   *           type: integer
   *         description: Filter courses to this academic year
   *       - in: query
   *         name: program_id
   *         schema:
   *           type: integer
   *         description: Filter by program ID
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search in work titles, course names, or course codes
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of bibliography entries to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of bibliography entries to skip
   *       - in: query
   *         name: light
   *         schema:
   *           type: boolean
   *           default: false
   *         description: If true, returns a lightweight list without instructor aggregation
   *     responses:
   *       200:
   *         description: Successfully retrieved bibliography entries
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 bibliography:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/BibliographyEntry'
   *                 pagination:
   *                   $ref: '#/components/schemas/PaginationMeta'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getBibliography(req, res) {
    try {
      const filters = {
        course_id: req.query.course_id,
        work_id: req.query.work_id,
        instructor_id: req.query.instructor_id,
        reading_type: req.query.reading_type,
        week_number: req.query.week_number,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        program_id: req.query.program_id,
        search: req.query.search,
        limit: req.query.limit || 20,
        offset: req.query.offset || 0,
        // Light mode: remove joins pesadas (instructors) e apenas campos essenciais
        light: req.query.light
      };

      const result = await bibliographyService.getBibliography(filters);
      return res.success(result.bibliography || result.data || [], {
        pagination: result.pagination,
        meta: { source: 'bibliography.service' }
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  /**
   * @swagger
   * /works/{id}/bibliography:
   *   get:
   *     summary: Get work bibliography usage
   *     description: Retrieve courses that use a specific work in their bibliography
   *     tags: [Bibliography]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Work ID
   *       - in: query
   *         name: year_from
   *         schema:
   *           type: integer
   *         description: Filter courses from this academic year
   *       - in: query
   *         name: year_to
   *         schema:
   *           type: integer
   *         description: Filter courses to this academic year
   *       - in: query
   *         name: reading_type
   *         schema:
   *           type: string
   *           enum: ['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY']
   *         description: Filter by reading type
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of courses to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of courses to skip
   *     responses:
   *       200:
   *         description: Successfully retrieved work bibliography usage
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/WorkBibliography'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getWorkBibliography(req, res) {
    try {
      const filters = {
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        reading_type: req.query.reading_type,
        limit: req.query.limit || 20,
        offset: req.query.offset || 0
      };

      const courses = await bibliographyService.getWorkBibliography(req.params.id, filters);
      return res.success(Array.isArray(courses) ? courses : (courses?.data || []));
    } catch (error) {
      handleError(res, error);
    }
  }

  /**
   * @swagger
   * /bibliography/analysis:
   *   get:
   *     summary: Get bibliography analysis
   *     description: Retrieve analytical insights about bibliography usage, trends, and patterns
   *     tags: [Bibliography]
   *     parameters:
   *       - in: query
   *         name: year_from
   *         schema:
   *           type: integer
   *         description: Filter analysis from this academic year
   *       - in: query
   *         name: year_to
   *         schema:
   *           type: integer
   *         description: Filter analysis to this academic year
   *       - in: query
   *         name: program_id
   *         schema:
   *           type: integer
   *         description: Filter analysis by program ID
   *       - in: query
   *         name: reading_type
   *         schema:
   *           type: string
   *           enum: ['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY']
   *         description: Filter analysis by reading type
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 50
   *           default: 20
   *         description: Number of top results to return in each analysis
   *     responses:
   *       200:
   *         description: Successfully retrieved bibliography analysis
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BibliographyAnalysis'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getBibliographyAnalysis(req, res) {
    try {
      const filters = {
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        program_id: req.query.program_id,
        reading_type: req.query.reading_type,
        limit: req.query.limit || 20
      };

      const analysis = await bibliographyService.getBibliographyAnalysis(filters);
      res.json(analysis);
    } catch (error) {
      handleError(res, error);
    }
  }

  /**
   * @swagger
   * /bibliography/statistics:
   *   get:
   *     summary: Get bibliography statistics
   *     description: Retrieve statistical information about bibliography entries
   *     tags: [Bibliography]
   *     responses:
   *       200:
   *         description: Successfully retrieved bibliography statistics
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/BibliographyStatistics'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getBibliographyStatistics(req, res) {
    try {
      const statistics = await bibliographyService.getBibliographyStatistics();
      res.json(statistics);
    } catch (error) {
      handleError(res, error);
    }
  }
}

module.exports = new BibliographyController();
