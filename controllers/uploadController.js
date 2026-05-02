const queueManager = require('../queue/queueManager');
const usageStore = require('../utils/usageStore');
const ApiError = require('../utils/apiError');
const { cleanupFiles } = require('../utils/fileUtils');

function getUploadedFiles(req) {
  if (!req.files) {
    return [];
  }

  return Object.values(req.files).flat();
}

function getFilesByField(filesByField, fieldNames) {
  return fieldNames.flatMap((fieldName) => filesByField[fieldName] || []);
}

function toQueuedFile(file, role) {
  return {
    role,
    path: file.path,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  };
}

function buildCardGroups(filesByField) {
  const groups = [];
  const singleImages = getFilesByField(filesByField, ['image', 'images']);
  const fronts = getFilesByField(filesByField, ['front', 'fronts', 'frontImages']);
  const backs = getFilesByField(filesByField, ['back', 'backs', 'backImages']);

  for (const image of singleImages) {
    groups.push([toQueuedFile(image, 'image')]);
  }

  const pairCount = Math.max(fronts.length, backs.length);
  for (let index = 0; index < pairCount; index += 1) {
    const cardFiles = [];

    if (fronts[index]) {
      cardFiles.push(toQueuedFile(fronts[index], 'front'));
    }

    if (backs[index]) {
      cardFiles.push(toQueuedFile(backs[index], 'back'));
    }

    if (cardFiles.length > 0) {
      groups.push(cardFiles);
    }
  }

  return groups;
}

async function uploadCards(req, res) {
  const uploadedFiles = getUploadedFiles(req);
  const cardGroups = buildCardGroups(req.files || {});

  if (uploadedFiles.length === 0 || cardGroups.length === 0) {
    await cleanupFiles(uploadedFiles.map((file) => file.path));
    throw new ApiError(400, 'Upload at least one JPG or PNG image.');
  }

  const reservation = await usageStore.tryReserve(cardGroups.length);
  if (!reservation.allowed) {
    await cleanupFiles(uploadedFiles.map((file) => file.path));
    res.status(429).json({
      success: false,
      error: {
        message: reservation.message
      },
      usage: reservation.usage
    });
    return;
  }

  const jobs = queueManager.addJobs(cardGroups);

  res.status(202).json({
    success: true,
    message: 'Upload accepted. Cards are queued for OCR processing.',
    acceptedCards: jobs.length,
    jobs,
    usage: reservation.usage
  });
}

module.exports = {
  uploadCards
};
