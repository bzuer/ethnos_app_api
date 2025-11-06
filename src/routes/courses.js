const express = require('express');
const router = express.Router();
const coursesController = require('../controllers/courses.controller');
const rateLimit = require('../middleware/rateLimiting');
const { query, param } = require('express-validator');
const { enhancedValidationHandler } = require('../middleware/validation');

// Apply rate limiting to all courses routes
router.use(rateLimit.generalLimiter);

// Course listing validation
const validateCoursesList = [
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search must be between 1 and 100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative')
    .toInt()
];

const validateCourseId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Course ID must be a positive integer')
    .toInt(),
  enhancedValidationHandler
];

// Course listing and search
router.get('/', validateCoursesList, coursesController.getCourses);

// Course statistics
router.get('/statistics', coursesController.getCoursesStatistics);

// Individual course details
router.get('/:id', validateCourseId, coursesController.getCourseById);

// Course relationships
router.get('/:id/instructors', validateCourseId, coursesController.getCourseInstructors);
router.get('/:id/bibliography', validateCourseId, coursesController.getCourseBibliography);
router.get('/:id/subjects', validateCourseId, coursesController.getCourseSubjects);

module.exports = router;
