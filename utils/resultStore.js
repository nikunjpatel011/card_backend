const CardResult = require('../models/CardResult');
const { connectDatabase } = require('./database');

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeRecord(record) {
  return {
    ...record,
    createdAt: toDate(record.createdAt),
    completedAt: toDate(record.completedAt),
    savedAt: toDate(record.savedAt)
  };
}

function serializeRecord(record) {
  if (!record) {
    return null;
  }

  return {
    jobId: record.jobId,
    status: record.status,
    createdAt: record.createdAt?.toISOString?.() || record.createdAt,
    completedAt: record.completedAt?.toISOString?.() || record.completedAt || null,
    files: record.files || [],
    result: record.result || null,
    rawText: record.rawText || '',
    sheet: record.sheet || null,
    savedAt: record.savedAt?.toISOString?.() || record.savedAt || null
  };
}

async function appendResult(record) {
  await connectDatabase();

  const saved = await CardResult.findOneAndUpdate(
    { jobId: record.jobId },
    { $set: normalizeRecord(record) },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  return serializeRecord(saved);
}

async function listResults(options = {}) {
  await connectDatabase();

  const { limit = 100, skip = 0 } = options;

  const results = await CardResult
    .find()
    .sort({ savedAt: -1, completedAt: -1, createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .select('-rawText')  // Skip rawText to reduce data size
    .lean();

  return results.map(serializeRecord);
}

async function getStats() {
  await connectDatabase();

  const [totalCount, statusCounts, languageCounts] = await Promise.all([
    // Total count
    CardResult.countDocuments(),

    // Status counts
    CardResult.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]),

    // Language distribution (from result field)
    CardResult.aggregate([
      {
        $match: {
          'result.language': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$result.language',
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  // Get today's stats
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayStats = await CardResult.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDay }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Format status counts
  const statusMap = {};
  statusCounts.forEach(item => {
    statusMap[item._id] = item.count;
  });

  // Format language counts
  const languageMap = {};
  languageCounts.forEach(item => {
    languageMap[item._id] = item.count;
  });

  // Format today's stats
  const todayMap = {};
  let todayTotal = 0;
  todayStats.forEach(item => {
    todayMap[item._id] = item.count;
    todayTotal += item.count;
  });

  return {
    total: totalCount,
    byStatus: {
      pending: statusMap.pending || 0,
      processing: statusMap.processing || 0,
      completed: statusMap.completed || 0,
      failed: statusMap.failed || 0
    },
    byLanguage: {
      EN: languageMap.EN || 0,
      HI: languageMap.HI || 0,
      GU: languageMap.GU || 0
    },
    today: {
      total: todayTotal,
      pending: todayMap.pending || 0,
      processing: todayMap.processing || 0,
      completed: todayMap.completed || 0,
      failed: todayMap.failed || 0
    }
  };
}

async function getRecentResults(limit = 10) {
  await connectDatabase();

  const results = await CardResult
    .find()
    .sort({ savedAt: -1, completedAt: -1, createdAt: -1 })
    .limit(limit)
    .select('-rawText')
    .lean();

  return results.map(serializeRecord);
}

async function getResult(jobId) {
  await connectDatabase();

  const result = await CardResult.findOne({ jobId }).lean();
  return serializeRecord(result);
}

async function updateResult(jobId, updater) {
  await connectDatabase();

  const existing = await getResult(jobId);
  if (!existing) {
    return null;
  }

  const next = updater(existing);
  const updated = await CardResult.findOneAndUpdate(
    { jobId },
    { $set: normalizeRecord(next) },
    { new: true, runValidators: true }
  ).lean();

  return serializeRecord(updated);
}

module.exports = {
  appendResult,
  listResults,
  getResult,
  updateResult,
  getStats,
  getRecentResults
};
