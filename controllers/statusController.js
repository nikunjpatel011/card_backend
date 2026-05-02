const queueManager = require('../queue/queueManager');
const usageStore = require('../utils/usageStore');
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

module.exports = {
  getStatus
};
