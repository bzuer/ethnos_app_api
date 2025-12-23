const express = require('express');
const router = express.Router();
const bibliographyController = require('../controllers/bibliography.controller');
const rateLimit = require('../middleware/rateLimiting');

router.use(rateLimit.generalLimiter);

router.get('/', bibliographyController.getBibliography);

router.get('/analysis', bibliographyController.getBibliographyAnalysis);
router.get('/statistics', bibliographyController.getBibliographyStatistics);

module.exports = router;