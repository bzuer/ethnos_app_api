const subjectsService = require('../services/subjects.service');
const { handleError } = require('../middleware/errorHandler');

class SubjectsController {

  
  async getSubjects(req, res) {
    try {
      const filters = {
        vocabulary: req.query.vocabulary,
        parent_id: req.query.parent_id,
        search: req.query.search,
        has_children: req.query.has_children,
        limit: req.query.limit || 50,
        offset: req.query.offset || 0,
        light: req.query.light
      };

      const result = await subjectsService.getSubjects(filters);
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  }

  
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

  
  async getSubjectHierarchy(req, res) {
    try {
      const hierarchy = await subjectsService.getSubjectHierarchy(req.params.id);
      res.json(hierarchy);
    } catch (error) {
      handleError(res, error);
    }
  }

  
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
