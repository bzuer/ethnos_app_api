const express = require('express');
const router = express.Router();
const instructorsController = require('../controllers/instructors.controller');
const rateLimit = require('../middleware/rateLimiting');

// Apply rate limiting to all instructors routes
router.use(rateLimit.generalLimiter);

// Instructors listing and search
router.get('/', instructorsController.getInstructors);

// Instructors statistics
router.get('/statistics', instructorsController.getInstructorsStatistics);

// Individual instructor details
router.get('/:id', instructorsController.getInstructorById);

// Instructor relationships
router.get('/:id/statistics', instructorsController.getInstructorStatistics);
router.get('/:id/courses', instructorsController.getInstructorCourses);
router.get('/:id/subjects', instructorsController.getInstructorSubjects);
router.get('/:id/bibliography', instructorsController.getInstructorBibliography);

module.exports = router;