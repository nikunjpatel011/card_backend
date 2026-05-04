const mongoose = require('mongoose');
const config = require('../config');

let connectionPromise = null;

async function connectDatabase() {
  if (!config.mongodb.uri) {
    throw new Error('MONGODB_URI is required to store card results in MongoDB.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(config.mongodb.uri, {
      dbName: config.mongodb.dbName || undefined,
      serverSelectionTimeoutMS: 10000
    });
  }

  await connectionPromise;
  return mongoose.connection;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  connectionPromise = null;
}

module.exports = {
  connectDatabase,
  disconnectDatabase
};
