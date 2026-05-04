const config = require('../config');
const { createSession, validateSession, deleteSession } = require('../utils/authMiddleware');
const ApiError = require('../utils/apiError');

async function login(req, res) {
  const { username, password } = req.body;
  
  if (!username || !password) {
    throw new ApiError(400, 'Username and password are required.');
  }
  
  // Validate credentials
  if (username !== config.auth.username || password !== config.auth.password) {
    throw new ApiError(401, 'Invalid username or password.');
  }
  
  // Create session
  const sessionId = createSession(username);
  
  res.json({
    success: true,
    message: 'Login successful.',
    sessionId,
    user: {
      username
    }
  });
}

async function logout(req, res) {
  const sessionId = req.headers['x-session-id'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (sessionId) {
    deleteSession(sessionId);
  }
  
  res.json({
    success: true,
    message: 'Logout successful.'
  });
}

async function checkAuth(req, res) {
  // If auth is disabled, return success
  if (!config.auth.enabled) {
    res.json({
      success: true,
      authenticated: true,
      authEnabled: false
    });
    return;
  }
  
  const sessionId = req.headers['x-session-id'] || req.headers['authorization']?.replace('Bearer ', '');
  const session = validateSession(sessionId);
  
  if (!session) {
    res.json({
      success: true,
      authenticated: false,
      authEnabled: true
    });
    return;
  }
  
  res.json({
    success: true,
    authenticated: true,
    authEnabled: true,
    user: {
      username: session.username
    }
  });
}

module.exports = {
  login,
  logout,
  checkAuth
};
