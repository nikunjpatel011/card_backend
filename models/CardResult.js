const mongoose = require('mongoose');

const cardResultSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      required: true,
      index: true
    },
    createdAt: {
      type: Date,
      required: true,
      index: true
    },
    completedAt: {
      type: Date,
      default: null,
      index: true
    },
    files: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    rawText: {
      type: String,
      default: ''
    },
    sheet: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    savedAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound indexes for better query performance
cardResultSchema.index({ status: 1, createdAt: -1 });
cardResultSchema.index({ savedAt: -1, completedAt: -1, createdAt: -1 });
cardResultSchema.index({ 'result.language': 1 });

module.exports = mongoose.model('CardResult', cardResultSchema);
