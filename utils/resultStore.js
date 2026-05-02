const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const createMutex = require('./mutex');
const { ensureDir } = require('./fileUtils');

const withLock = createMutex();

async function readResults() {
  try {
    const content = await fs.readFile(config.data.resultsFile, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeResults(results) {
  await ensureDir(path.dirname(config.data.resultsFile));
  await fs.writeFile(config.data.resultsFile, `${JSON.stringify(results, null, 2)}\n`);
}

async function appendResult(record) {
  return withLock(async () => {
    const results = await readResults();
    results.push(record);
    await writeResults(results);
    return record;
  });
}

async function listResults() {
  return withLock(readResults);
}

async function getResult(jobId) {
  return withLock(async () => {
    const results = await readResults();
    return results.find((result) => result.jobId === jobId) || null;
  });
}

async function updateResult(jobId, updater) {
  return withLock(async () => {
    const results = await readResults();
    const index = results.findIndex((result) => result.jobId === jobId);

    if (index === -1) {
      return null;
    }

    results[index] = updater(results[index]);
    await writeResults(results);
    return results[index];
  });
}

module.exports = {
  appendResult,
  listResults,
  getResult,
  updateResult
};
