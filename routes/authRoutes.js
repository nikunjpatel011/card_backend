const express = require('express');
const authController = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/auth/login', asyncHandler(authController.login));
router.post('/auth/logout', asyncHandler(authController.logout));
router.get('/auth/check', asyncHandler(authController.checkAuth));

module.exports = router;
