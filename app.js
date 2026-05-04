const express = require('express');
const cors = require('cors');
const config = require('./config');
const authRoutes = require('./routes/authRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const statusRoutes = require('./routes/statusRoutes');
const resultsRoutes = require('./routes/resultsRoutes');
const { authMiddleware } = require('./utils/authMiddleware');
const errorHandler = require('./utils/errorHandler');

const app = express();

function isDevelopmentHost(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    return true;
  }

  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
    return true;
  }

  const private172Match = hostname.match(/^172\.(\d{1,2})\./);
  return Boolean(private172Match && Number(private172Match[1]) >= 16 && Number(private172Match[1]) <= 31);
}

function isAllowedOrigin(origin) {
  if (!origin || config.cors.origins.includes('*') || config.cors.origins.includes(origin)) {
    return true;
  }

  if (config.env === 'development') {
    try {
      const { hostname, protocol } = new URL(origin);
      return (protocol === 'http:' || protocol === 'https:') && isDevelopmentHost(hostname);
    } catch {
      return false;
    }
  }

  return false;
}

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  }
}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Auth routes (no middleware needed)
app.use(authRoutes);

// Protected routes (require authentication)
app.use(authMiddleware);
app.use(uploadRoutes);
app.use(statusRoutes);
app.use(resultsRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found.'
    }
  });
});

app.use(errorHandler);

module.exports = app;
