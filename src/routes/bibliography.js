const express = require('express');
const router = express.Router();
const bibliographyController = require('../controllers/bibliography.controller');
const rateLimit = require('../middleware/rateLimiting');

// Apply rate limiting to all bibliography routes
router.use(rateLimit.generalLimiter);

// Bibliography listing and search
router.get('/', bibliographyController.getBibliography);

// Bibliography analysis and statistics
router.get('/analysis', bibliographyController.getBibliographyAnalysis);
router.get('/statistics', bibliographyController.getBibliographyStatistics);

module.exports = router;