const express = require('express');
const router = express.Router();
const subjectsController = require('../controllers/subjects.controller');
const rateLimit = require('../middleware/rateLimiting');

// Apply rate limiting to all subjects routes
router.use(rateLimit.generalLimiter);

// Subjects listing and search
router.get('/', subjectsController.getSubjects);

// Subjects statistics
router.get('/statistics', subjectsController.getSubjectsStatistics);

// Individual subject details
router.get('/:id', subjectsController.getSubjectById);

// Subject navigation and relationships
router.get('/:id/children', subjectsController.getSubjectChildren);
router.get('/:id/hierarchy', subjectsController.getSubjectHierarchy);
router.get('/:id/works', subjectsController.getSubjectWorks);
router.get('/:id/courses', subjectsController.getSubjectCourses);

module.exports = router;