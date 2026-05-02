const express = require('express');
const statusController = require('../controllers/statusController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/status', asyncHandler(statusController.getStatus));

module.exports = router;
