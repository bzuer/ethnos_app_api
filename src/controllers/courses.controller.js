const coursesService = require('../services/courses.service');
const { ERROR_CODES } = require('../utils/responseBuilder');

class CoursesController {

  
  async getCourses(req, res) {
    try {
      const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);
      const offset = Math.max(0, parseInt(req.query.offset) || 0);
      const filters = {
        program_id: req.query.program_id,
        year: req.query.year,
        semester: req.query.semester,
        search: req.query.search,
        limit,
        offset
      };

      const result = await coursesService.getCourses(filters);
      
      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          filters: {
            program_id: filters.program_id || null,
            year: filters.year || null,
            semester: filters.semester || null,
            search: filters.search || null
          },
          performance: {
            query_time_ms: Date.now() - Date.now()
          }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.COURSES_LIST_FAILED
      });
    }
  }

  
  async getCourseById(req, res) {
    try {
      const courseId = req.params.id;
      const includeBibliography = req.query.include_bibliography !== 'false';
      const includeInstructors = req.query.include_instructors !== 'false';
      const includeSubjects = req.query.include_subjects !== 'false';
      
      const bibliographyLimit = parseInt(req.query.bibliography_limit) || 50;
      const instructorsLimit = parseInt(req.query.instructors_limit) || 20;
      const subjectsLimit = parseInt(req.query.subjects_limit) || 30;

      const courseDetails = await coursesService.getCourseDetailsById(
        courseId, 
        {
          includeBibliography,
          includeInstructors,
          includeSubjects,
          bibliographyLimit,
          instructorsLimit,
          subjectsLimit
        }
      );
      
      if (!courseDetails) {
        return res.fail(`Course not found with ID ${courseId}`, {
          statusCode: 404,
          code: ERROR_CODES.COURSE_NOT_FOUND
        });
      }

      return res.success(courseDetails, {
        meta: {
          includes: {
            bibliography: includeBibliography,
            instructors: includeInstructors,
            subjects: includeSubjects
          },
          limits: {
            bibliography: bibliographyLimit,
            instructors: instructorsLimit,
            subjects: subjectsLimit
          }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.COURSE_DETAILS_FAILED
      });
    }
  }

  
  async getCourseInstructors(req, res) {
    try {
      const filters = {
        role: req.query.role,
        limit: req.query.limit || 20,
        offset: req.query.offset || 0
      };

      const result = await coursesService.getCourseInstructors(req.params.id, filters);
      
      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          course_id: parseInt(req.params.id, 10),
          filters: {
            role: filters.role || null
          }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.COURSE_INSTRUCTORS_FAILED
      });
    }
  }

  
  async getCourseBibliography(req, res) {
    try {
      const filters = {
        reading_type: req.query.reading_type,
        week_number: req.query.week_number,
        limit: req.query.limit || 20,
        offset: req.query.offset || 0
      };

      const result = await coursesService.getCourseBibliography(req.params.id, filters);
      
      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          course_id: parseInt(req.params.id, 10),
          filters: {
            reading_type: filters.reading_type || null,
            week_number: filters.week_number || null
          }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.COURSE_BIBLIOGRAPHY_FAILED
      });
    }
  }

  
  async getCourseSubjects(req, res) {
    try {
      const filters = {
        vocabulary: req.query.vocabulary,
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      };

      const result = await coursesService.getCourseSubjects(req.params.id, filters);
      
      return res.success(result.data, {
        pagination: result.pagination,
        meta: {
          course_id: parseInt(req.params.id, 10),
          filters: {
            vocabulary: filters.vocabulary || null
          }
        }
      });
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.COURSE_SUBJECTS_FAILED
      });
    }
  }

  
  async getCoursesStatistics(req, res) {
    try {
      const statistics = await coursesService.getCoursesStatistics();
      
      return res.success(statistics);
    } catch (error) {
      return res.error(error, {
        code: ERROR_CODES.COURSES_STATISTICS_FAILED
      });
    }
  }
}

module.exports = new CoursesController();
