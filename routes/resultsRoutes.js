const express = require('express');
const resultsController = require('../controllers/resultsController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/results', asyncHandler(resultsController.getResults));
router.get('/results/stats', asyncHandler(resultsController.getResultsStats));
router.get('/results/recent', asyncHandler(resultsController.getRecentResults));
router.post('/results/:jobId/save', asyncHandler(resultsController.saveResult));

module.exports = router;
