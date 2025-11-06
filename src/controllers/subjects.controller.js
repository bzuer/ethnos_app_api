const subjectsService = require('../services/subjects.service');
const { handleError } = require('../middleware/errorHandler');

class SubjectsController {

  /**
   * @swagger
   * /subjects:
   *   get:
   *     summary: Get list of subjects
   *     description: Retrieve paginated list of subjects/topics with hierarchical navigation support
   *     tags: [Subjects]
 *     parameters:
   *       - in: query
   *         name: vocabulary
   *         schema:
   *           type: string
   *           enum: ['KEYWORD', 'MESH', 'LCSH', 'DDC', 'UDC', 'CUSTOM']
   *         description: Filter by vocabulary type
   *       - in: query
   *         name: parent_id
   *         schema:
   *           type: string
   *         description: Filter by parent subject ID (use "null" for root subjects)
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search in subject terms
   *       - in: query
   *         name: has_children
   *         schema:
   *           type: string
   *           enum: ['true', 'false']
   *         description: Filter subjects that have/don't have child subjects
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 50
   *         description: Number of subjects to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of subjects to skip
 *       - in: query
 *         name: light
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, returns a lightweight list without aggregated metrics
   *     responses:
   *       200:
   *         description: Successfully retrieved subjects
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 subjects:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Subject'
   *                 pagination:
   *                   $ref: '#/components/schemas/PaginationMeta'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getSubjects(req, res) {
    try {
      const filters = {
        vocabulary: req.query.vocabulary,
        parent_id: req.query.parent_id,
        search: req.query.search,
        has_children: req.query.has_children,
        limit: req.query.limit || 50,
        offset: req.query.offset || 0,
        // Light mode: lista simples sem métricas pesadas (counts agregados)
        light: req.query.light
      };

      const result = await subjectsService.getSubjects(filters);
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  }

  /**
   * @swagger
   * /subjects/{id}:
   *   get:
   *     summary: Get subject details
   *     description: Retrieve detailed information about a specific subject
   *     tags: [Subjects]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Subject ID
   *     responses:
   *       200:
   *         description: Successfully retrieved subject details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SubjectDetails'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getSubjectById(req, res) {
    try {
      const subject = await subjectsService.getSubjectById(req.params.id);
      
      if (!subject) {
        return res.status(404).json({ 
          error: 'Subject not found',
          message: `No subject found with ID ${req.params.id}`
        });
      }

      res.json(subject);
    } catch (error) {
      handleError(res, error);
    }
  }

  /**
   * @swagger
   * /subjects/{id}/children:
   *   get:
   *     summary: Get subject children
   *     description: Retrieve child subjects of a specific subject (hierarchical navigation)
   *     tags: [Subjects]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Parent subject ID
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 50
   *         description: Number of children to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of children to skip
   *     responses:
   *       200:
   *         description: Successfully retrieved subject children
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Subject'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getSubjectChildren(req, res) {
    try {
      const filters = {
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      };

      const children = await subjectsService.getSubjectChildren(req.params.id, filters);
      res.json(children);
    } catch (error) {
      handleError(res, error);
    }
  }

  /**
   * @swagger
   * /subjects/{id}/hierarchy:
   *   get:
   *     summary: Get subject hierarchy
   *     description: Retrieve full hierarchical path from root to subject (breadcrumb navigation)
   *     tags: [Subjects]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Subject ID
   *     responses:
   *       200:
   *         description: Successfully retrieved subject hierarchy
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Subject'
   *               description: Array of subjects from root to current subject
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getSubjectHierarchy(req, res) {
    try {
      const hierarchy = await subjectsService.getSubjectHierarchy(req.params.id);
      res.json(hierarchy);
    } catch (error) {
      handleError(res, error);
    }
  }

  /**
   * @swagger
   * /subjects/{id}/works:
   *   get:
   *     summary: Get subject works
   *     description: Retrieve works associated with a specific subject
   *     tags: [Subjects]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Subject ID
   *       - in: query
   *         name: min_relevance
   *         schema:
   *           type: number
   *           minimum: 0
   *           maximum: 1
   *         description: Minimum relevance score
   *       - in: query
   *         name: year_from
   *         schema:
   *           type: integer
   *         description: Filter works from this publication year
   *       - in: query
   *         name: year_to
   *         schema:
   *           type: integer
   *         description: Filter works to this publication year
   *       - in: query
   *         name: document_type
   *         schema:
   *           type: string
   *         description: Filter by document type
   *       - in: query
   *         name: language
   *         schema:
   *           type: string
   *         description: Filter by language
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of works to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of works to skip
   *     responses:
   *       200:
   *         description: Successfully retrieved subject works
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/SubjectWork'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getSubjectWorks(req, res) {
    try {
      const filters = {
        min_relevance: req.query.min_relevance,
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        document_type: req.query.document_type,
        language: req.query.language,
        limit: req.query.limit || 20,
        offset: req.query.offset || 0
      };

      const works = await subjectsService.getSubjectWorks(req.params.id, filters);
      res.json(works);
    } catch (error) {
      handleError(res, error);
    }
  }

  /**
   * @swagger
   * /subjects/{id}/courses:
   *   get:
   *     summary: Get subject courses
   *     description: Retrieve courses that cover a specific subject based on bibliography
   *     tags: [Subjects]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Subject ID
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
   *         description: Successfully retrieved subject courses
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/SubjectCourse'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getSubjectCourses(req, res) {
    try {
      const filters = {
        year_from: req.query.year_from,
        year_to: req.query.year_to,
        program_id: req.query.program_id,
        reading_type: req.query.reading_type,
        limit: req.query.limit || 20,
        offset: req.query.offset || 0
      };

      const courses = await subjectsService.getSubjectCourses(req.params.id, filters);
      res.json(courses);
    } catch (error) {
      handleError(res, error);
    }
  }

  /**
   * @swagger
   * /subjects/statistics:
   *   get:
   *     summary: Get subjects statistics
   *     description: Retrieve statistical information about subjects and vocabularies
   *     tags: [Subjects]
   *     responses:
   *       200:
   *         description: Successfully retrieved subjects statistics
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SubjectsStatistics'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getSubjectsStatistics(req, res) {
    try {
      const statistics = await subjectsService.getSubjectsStatistics();
      res.json(statistics);
    } catch (error) {
      handleError(res, error);
    }
  }
}

module.exports = new SubjectsController();
