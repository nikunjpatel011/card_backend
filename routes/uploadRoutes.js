const express = require('express');
const uploadController = require('../controllers/uploadController');
const asyncHandler = require('../utils/asyncHandler');
const { uploadFields } = require('../utils/uploadMiddleware');

const router = express.Router();

router.post('/upload', uploadFields, asyncHandler(uploadController.uploadCards));

module.exports = router;
