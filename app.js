const express = require('express');
const cors = require('cors');
const config = require('./config');
const uploadRoutes = require('./routes/uploadRoutes');
const statusRoutes = require('./routes/statusRoutes');
const resultsRoutes = require('./routes/resultsRoutes');
const errorHandler = require('./utils/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.cors.origins.includes('*') || config.cors.origins.includes(origin)) {
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
