const fs = require('fs/promises');
const path = require('path');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function cleanupFiles(filePaths) {
  const uniquePaths = [...new Set(filePaths.filter(Boolean))];
  await Promise.allSettled(
    uniquePaths.map((filePath) => fs.unlink(filePath))
  );
}

function safeBaseName(fileName) {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'image';
}

module.exports = {
  ensureDir,
  cleanupFiles,
  safeBaseName
};
