const express = require('express');
const router = express.Router();
const subjectsController = require('../controllers/subjects.controller');
const rateLimit = require('../middleware/rateLimiting');

router.use(rateLimit.generalLimiter);

router.get('/', subjectsController.getSubjects);

router.get('/statistics', subjectsController.getSubjectsStatistics);

router.get('/:id', subjectsController.getSubjectById);

router.get('/:id/children', subjectsController.getSubjectChildren);
router.get('/:id/hierarchy', subjectsController.getSubjectHierarchy);
router.get('/:id/works', subjectsController.getSubjectWorks);
router.get('/:id/courses', subjectsController.getSubjectCourses);

module.exports = router;