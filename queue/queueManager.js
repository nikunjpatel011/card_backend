const crypto = require('crypto');
const ocrService = require('../services/ocrService');
const parserService = require('../services/parserService');
const sheetService = require('../services/sheetService');
const usageStore = require('../utils/usageStore');
const resultStore = require('../utils/resultStore');
const { cleanupFiles } = require('../utils/fileUtils');

const queue = [];
const jobs = new Map();
let isProcessing = false;

function now() {
  return new Date().toISOString();
}

function toPublicJob(job, options = {}) {
  if (!job) {
    return null;
  }

  const publicJob = {
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    files: job.fileSummary,
    result: job.result || null,
    saved: Boolean(job.savedAt),
    savedAt: job.savedAt || null,
    error: job.error || null
  };

  if (options.includeRawText && job.rawText) {
    publicJob.rawText = job.rawText;
  }

  return publicJob;
}

function createJob(files) {
  const id = crypto.randomUUID();

  return {
    id,
    status: 'pending',
    createdAt: now(),
    updatedAt: now(),
    files,
    fileSummary: files.map((file) => ({
      role: file.role,
      originalName: file.originalName,
      mimetype: file.mimetype,
      size: file.size
    })),
    result: null,
    rawText: '',
    sheet: null,
    savedAt: null,
    error: null
  };
}

function addJobs(cardGroups) {
  const createdJobs = cardGroups.map(createJob);

  for (const job of createdJobs) {
    jobs.set(job.id, job);
    queue.push(job.id);
  }

  processQueue();
  return createdJobs.map((job) => toPublicJob(job));
}

async function markFailed(job, error) {
  job.status = 'failed';
  job.error = {
    message: error.message || 'Processing failed.'
  };
  job.updatedAt = now();
  await usageStore.releaseReservation();
}

async function processJob(job) {
  job.status = 'processing';
  job.updatedAt = now();

  try {
    const rawText = await ocrService.recognizeCard(job.files);
    const result  = await parserService.parseBusinessCard(rawText);  // async (Gemini)
    const sheet = await sheetService.appendCard(result);
    const savedAt = now();

    job.status = 'completed';
    job.rawText = rawText;
    job.result = result;
    job.sheet = sheet;
    job.savedAt = savedAt;
    job.updatedAt = now();

    await resultStore.appendResult({
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.updatedAt,
      files: job.fileSummary,
      result,
      rawText,
      sheet,
      savedAt
    });
    await usageStore.completeReservation();
  } catch (error) {
    await markFailed(job, error);
  } finally {
    await cleanupFiles(job.files.map((file) => file.path));
    job.files = [];
  }
}

async function processQueue() {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  while (queue.length > 0) {
    const jobId = queue.shift();
    const job = jobs.get(jobId);

    if (!job) {
      continue;
    }

    await processJob(job);
  }

  isProcessing = false;
}

function getJob(jobId, options = {}) {
  return toPublicJob(jobs.get(jobId), options);
}

function getStatusSnapshot() {
  const allJobs = [...jobs.values()];
  const counts = allJobs.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});

  return {
    isProcessing,
    queueLength: queue.length,
    counts,
    jobs: allJobs.map((job) => toPublicJob(job))
  };
}

module.exports = {
  addJobs,
  getJob,
  getStatusSnapshot,
  updateSavedJob(jobId, result, sheet) {
    const job = jobs.get(jobId);

    if (!job) {
      return null;
    }

    job.result = result;
    job.sheet = sheet;
    job.savedAt = now();
    job.updatedAt = now();

    return toPublicJob(job);
  }
};
