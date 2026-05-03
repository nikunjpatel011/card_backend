const express = require('express');
const statusController = require('../controllers/statusController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/status', asyncHandler(statusController.getStatus));
router.get('/daily-stats', asyncHandler(statusController.getDailyStats));

module.exports = router;
