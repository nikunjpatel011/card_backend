const queueManager = require('../queue/queueManager');
const sheetService = require('../services/sheetService');
const resultStore = require('../utils/resultStore');
const ApiError = require('../utils/apiError');

function stripRawText(record, includeRawText) {
  if (includeRawText) {
    return record;
  }

  const { rawText, ...safeRecord } = record;
  return safeRecord;
}

async function getResults(req, res) {
  const { jobId, limit, skip } = req.query;
  const includeRawText = req.query.includeRawText === 'true';

  if (jobId) {
    const liveJob = queueManager.getJob(jobId, { includeRawText });

    if (liveJob) {
      const statusCode = liveJob.status === 'pending' || liveJob.status === 'processing'
        ? 202
        : 200;

      res.status(statusCode).json({
        success: liveJob.status !== 'failed',
        job: liveJob
      });
      return;
    }

    const persistedResult = await resultStore.getResult(jobId);
    if (!persistedResult) {
      throw new ApiError(404, 'Result not found.');
    }

    res.json({
      success: true,
      result: stripRawText(persistedResult, includeRawText)
    });
    return;
  }

  const options = {
    limit: limit ? parseInt(limit, 10) : 100,
    skip: skip ? parseInt(skip, 10) : 0
  };

  const results = await resultStore.listResults(options);

  res.json({
    success: true,
    count: results.length,
    results: results.map((result) => stripRawText(result, includeRawText))
  });
}

async function getResultsStats(req, res) {
  const stats = await resultStore.getStats();

  res.json({
    success: true,
    stats
  });
}

async function getRecentResults(req, res) {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
  const includeRawText = req.query.includeRawText === 'true';

  const results = await resultStore.getRecentResults(limit);

  res.json({
    success: true,
    count: results.length,
    results: results.map((result) => stripRawText(result, includeRawText))
  });
}

function cleanCardData(body) {
  const phones = Array.isArray(body.phones)
    ? body.phones
    : String(body.phones || '')
      .split(',')
      .map((phone) => phone.trim());

  return {
    name: String(body.name || '').trim(),
    phones: phones.map((phone) => String(phone).trim()).filter(Boolean),
    email: String(body.email || '').trim(),
    company: String(body.company || '').trim(),
    address: String(body.address || body.location || '').trim(),
    state: String(body.state || '').trim(),
    city: String(body.city || '').trim()
  };
}

async function saveResult(req, res) {
  const { jobId } = req.params;
  const existing = await resultStore.getResult(jobId);

  if (!existing) {
    throw new ApiError(404, 'Result not found.');
  }

  if (existing.savedAt) {
    res.status(409).json({
      success: false,
      error: {
        message: 'This result is already saved to Google Sheets.'
      },
      result: stripRawText(existing, false)
    });
    return;
  }

  const result = cleanCardData(req.body || {});

  if (!result.name && !result.email && result.phones.length === 0 && !result.company && !result.address && !result.state && !result.city) {
    throw new ApiError(400, 'At least one contact field is required before saving.');
  }

  let sheet;
  try {
    sheet = await sheetService.appendCard(result);
  } catch (error) {
    throw new ApiError(502, 'Failed to save result to Google Sheets.', error.message);
  }

  const savedAt = new Date().toISOString();
  const updated = await resultStore.updateResult(jobId, (record) => ({
    ...record,
    result,
    sheet,
    savedAt
  }));

  const liveJob = queueManager.updateSavedJob(jobId, result, sheet);

  res.json({
    success: true,
    message: 'Result saved to Google Sheets.',
    job: liveJob,
    result: stripRawText(updated, false)
  });
}

module.exports = {
  getResults,
  saveResult,
  getResultsStats,
  getRecentResults
};
