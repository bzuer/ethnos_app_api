const bibliographyService = require('../services/bibliography.service');
const { handleError } = require('../middleware/errorHandler');

class BibliographyController {

  
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
