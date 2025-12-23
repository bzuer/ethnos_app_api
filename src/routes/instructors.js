const express = require('express');
const router = express.Router();
const instructorsController = require('../controllers/instructors.controller');
const rateLimit = require('../middleware/rateLimiting');

router.use(rateLimit.generalLimiter);

router.get('/', instructorsController.getInstructors);

router.get('/statistics', instructorsController.getInstructorsStatistics);

router.get('/:id', instructorsController.getInstructorById);

router.get('/:id/statistics', instructorsController.getInstructorStatistics);
router.get('/:id/courses', instructorsController.getInstructorCourses);
router.get('/:id/subjects', instructorsController.getInstructorSubjects);
router.get('/:id/bibliography', instructorsController.getInstructorBibliography);

module.exports = router;