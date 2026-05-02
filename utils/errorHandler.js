const multer = require('multer');
const ApiError = require('./apiError');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Uploaded image is too large.'
      : error.message;

    res.status(400).json({
      success: false,
      error: {
        message,
        code: error.code
      }
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error.'
    }
  });
}

module.exports = errorHandler;
