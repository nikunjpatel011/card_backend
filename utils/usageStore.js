const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const createMutex = require('./mutex');
const { ensureDir } = require('./fileUtils');

const withLock = createMutex();

function todayKey() {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: config.limits.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function freshUsage() {
  return {
    date: todayKey(),
    processed: 0,
    reserved: 0
  };
}

async function readRawUsage() {
  try {
    const content = await fs.readFile(config.data.usageFile, 'utf8');
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed !== 'object') {
      return freshUsage();
    }

    return {
      date: parsed.date,
      processed: Number(parsed.processed) || 0,
      reserved: Number(parsed.reserved) || 0
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return freshUsage();
    }
    throw error;
  }
}

function normalizeUsage(usage) {
  if (usage.date !== todayKey()) {
    return freshUsage();
  }

  return {
    date: usage.date,
    processed: Math.max(0, usage.processed),
    reserved: Math.max(0, usage.reserved)
  };
}

async function writeUsage(usage) {
  await ensureDir(path.dirname(config.data.usageFile));
  await fs.writeFile(config.data.usageFile, `${JSON.stringify(usage, null, 2)}\n`);
}

function withRemaining(usage) {
  const usedOrReserved = usage.processed + usage.reserved;
  return {
    ...usage,
    limit: config.limits.dailyCards,
    remaining: Math.max(0, config.limits.dailyCards - usedOrReserved),
    timezone: config.limits.timezone
  };
}

async function getUsage() {
  return withLock(async () => {
    const usage = normalizeUsage(await readRawUsage());
    await writeUsage(usage);
    return withRemaining(usage);
  });
}

async function tryReserve(count) {
  return withLock(async () => {
    const usage = normalizeUsage(await readRawUsage());
    const requested = Number(count) || 0;
    const remaining = config.limits.dailyCards - usage.processed - usage.reserved;

    if (requested <= 0) {
      return {
        allowed: false,
        usage: withRemaining(usage),
        message: 'No cards were submitted.'
      };
    }

    if (requested > remaining) {
      await writeUsage(usage);
      return {
        allowed: false,
        usage: withRemaining(usage),
        message: `Daily card limit reached. Remaining capacity today: ${Math.max(0, remaining)}.`
      };
    }

    usage.reserved += requested;
    await writeUsage(usage);

    return {
      allowed: true,
      usage: withRemaining(usage)
    };
  });
}

async function completeReservation() {
  return withLock(async () => {
    const usage = normalizeUsage(await readRawUsage());
    usage.reserved = Math.max(0, usage.reserved - 1);
    usage.processed += 1;
    await writeUsage(usage);
    return withRemaining(usage);
  });
}

async function releaseReservation() {
  return withLock(async () => {
    const usage = normalizeUsage(await readRawUsage());
    usage.reserved = Math.max(0, usage.reserved - 1);
    await writeUsage(usage);
    return withRemaining(usage);
  });
}

async function resetReservationsOnStartup() {
  return withLock(async () => {
    const usage = normalizeUsage(await readRawUsage());
    usage.reserved = 0;
    await writeUsage(usage);
    return withRemaining(usage);
  });
}

module.exports = {
  getUsage,
  tryReserve,
  completeReservation,
  releaseReservation,
  resetReservationsOnStartup
};
