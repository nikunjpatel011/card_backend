const path = require('path');
require('dotenv').config();

const rootDir = path.resolve(__dirname, '..');

function readNumber(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function readBoolean(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function resolveFromRoot(value, defaultValue) {
  const rawPath = value || defaultValue;
  return path.isAbsolute(rawPath) ? rawPath : path.join(rootDir, rawPath);
}

const uploadDir = resolveFromRoot(process.env.UPLOAD_DIR, 'uploads');

const googleConfig = {
  enabled: readBoolean('SHEETS_ENABLED', true),
  spreadsheetId: process.env.GOOGLE_SHEET_ID || '',
  sheetName: process.env.GOOGLE_SHEET_NAME || 'Sheet1',
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''
};

module.exports = {
  rootDir,
  env: process.env.NODE_ENV || 'development',
  port: readNumber('PORT', 5000),
  cors: {
    origins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  },
  auth: {
    enabled: readBoolean('AUTH_ENABLED', true),
    username: process.env.AUTH_USERNAME || 'nimkro',
    password: process.env.AUTH_PASSWORD || 'nimkro@123',
    sessionSecret: process.env.SESSION_SECRET || 'nimkro-secret-key-change-in-production'
  },
  mongodb: {
    uri: process.env.MONGODB_URI || '',
    dbName: process.env.MONGODB_DB_NAME || ''
  },
  upload: {
    dir: uploadDir,
    optimizedDir: path.join(uploadDir, 'optimized'),
    maxFileSizeBytes: readNumber('MAX_FILE_SIZE_MB', 8) * 1024 * 1024,
    maxFilesPerRequest: readNumber('MAX_FILES_PER_REQUEST', 20),
    allowedMimeTypes: new Set(['image/jpeg', 'image/png']),
    allowedExtensions: new Set(['.jpg', '.jpeg', '.png'])
  },
  ocr: {
    ocrSpaceApiKey: process.env.OCR_SPACE_API_KEY || '',
    useGeminiVision: readBoolean('OCR_USE_GEMINI_VISION', true),
    fallbackToOcrSpace: readBoolean('OCR_FALLBACK_TO_OCR_SPACE', false),
    maxImageWidth:  readNumber('OCR_MAX_IMAGE_WIDTH', 1800),
    jpegQuality:    Math.min(readNumber('OCR_JPEG_QUALITY', 82), 100),
    requestTimeoutMs: readNumber('OCR_REQUEST_TIMEOUT_MS', 90000),
    maxRetries: readNumber('OCR_MAX_RETRIES', 2),
    retryDelayMs: readNumber('OCR_RETRY_DELAY_MS', 1500),
    ocrEngine: process.env.OCR_ENGINE || '2',
    fallbackOcrEngine: process.env.OCR_FALLBACK_ENGINE || '1',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model:  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    ocrModel: process.env.GEMINI_OCR_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  limits: {
    dailyCards: readNumber('DAILY_CARD_LIMIT', 200),
    timezone: process.env.DAILY_LIMIT_TIMEZONE || 'Asia/Kolkata'
  },
  google: googleConfig,
  data: {
    usageFile: path.join(rootDir, 'data', 'usage.json')
  }
};
