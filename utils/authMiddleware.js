const config = require('../config');

// Simple session store (in-memory)
const sessions = new Map();

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function createSession(username) {
  const sessionId = generateSessionId();
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  
  sessions.set(sessionId, {
    username,
    expiresAt
  });
  
  return sessionId;
}

function validateSession(sessionId) {
  if (!sessionId) {
    return null;
  }
  
  const session = sessions.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  
  return session;
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

// Clean expired sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(sessionId);
    }
  }
}, 60 * 60 * 1000);

function authMiddleware(req, res, next) {
  // If auth is disabled, allow all requests
  if (!config.auth.enabled) {
    next();
    return;
  }
  
  // Allow these endpoints without authentication
  const publicPaths = [
    '/auth/login',
    '/auth/logout',
    '/auth/check',
    '/health'
  ];
  
  if (publicPaths.includes(req.path)) {
    next();
    return;
  }
  
  // Check session
  const sessionId = req.headers['x-session-id'] || req.headers['authorization']?.replace('Bearer ', '');
  const session = validateSession(sessionId);
  
  if (!session) {
    res.status(401).json({
      success: false,
      error: {
        message: 'Unauthorized. Please login first.'
      }
    });
    return;
  }
  
  req.session = session;
  next();
}

module.exports = {
  authMiddleware,
  createSession,
  validateSession,
  deleteSession
};
