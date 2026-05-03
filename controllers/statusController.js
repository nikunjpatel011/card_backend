const queueManager = require('../queue/queueManager');
const usageStore = require('../utils/usageStore');
const resultStore = require('../utils/resultStore');
const ApiError = require('../utils/apiError');

async function getStatus(req, res) {
  const { jobId } = req.query;

  if (jobId) {
    const job = queueManager.getJob(jobId);

    if (!job) {
      throw new ApiError(404, 'Job not found.');
    }

    res.json({
      success: true,
      job
    });
    return;
  }

  res.json({
    success: true,
    status: queueManager.getStatusSnapshot(),
    usage: await usageStore.getUsage()
  });
}

async function getDailyStats(req, res) {
  const results = await resultStore.listResults();
  
  // Get today's date at midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Filter results for today
  const todayResults = results.filter((result) => {
    if (!result.completedAt) return false;
    const completedDate = new Date(result.completedAt);
    completedDate.setHours(0, 0, 0, 0);
    return completedDate.getTime() === today.getTime();
  });
  
  // Get live queue status
  const queueStatus = queueManager.getStatusSnapshot();
  
  // Count by status
  const stats = {
    pending: queueStatus.pending || 0,
    processing: queueStatus.processing || 0,
    completed: todayResults.filter((r) => r.status === 'completed').length,
    failed: todayResults.filter((r) => r.status === 'failed').length,
    total: todayResults.length
  };
  
  res.json({
    success: true,
    stats,
    date: today.toISOString()
  });
}

module.exports = {
  getStatus,
  getDailyStats
};
