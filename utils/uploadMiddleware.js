const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const ApiError = require('./apiError');
const { safeBaseName } = require('./fileUtils');

const storage = multer.diskStorage({
  destination: config.upload.dir,
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const fileName = `${Date.now()}-${crypto.randomUUID()}-${safeBaseName(file.originalname)}${extension}`;
    callback(null, fileName);
  }
});

function fileFilter(req, file, callback) {
  const extension = path.extname(file.originalname).toLowerCase();
  const isAllowedType = config.upload.allowedMimeTypes.has(file.mimetype);
  const isAllowedExtension = config.upload.allowedExtensions.has(extension);

  if (!isAllowedType || !isAllowedExtension) {
    callback(new ApiError(400, 'Only JPG and PNG image uploads are allowed.'));
    return;
  }

  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSizeBytes,
    files: config.upload.maxFilesPerRequest
  }
});

const uploadFields = upload.fields([
  { name: 'image', maxCount: config.upload.maxFilesPerRequest },
  { name: 'images', maxCount: config.upload.maxFilesPerRequest },
  { name: 'front', maxCount: config.upload.maxFilesPerRequest },
  { name: 'back', maxCount: config.upload.maxFilesPerRequest },
  { name: 'fronts', maxCount: config.upload.maxFilesPerRequest },
  { name: 'backs', maxCount: config.upload.maxFilesPerRequest },
  { name: 'frontImages', maxCount: config.upload.maxFilesPerRequest },
  { name: 'backImages', maxCount: config.upload.maxFilesPerRequest }
]);

module.exports = {
  uploadFields
};
