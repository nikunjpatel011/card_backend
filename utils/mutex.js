function createMutex() {
  let current = Promise.resolve();

  return async function withLock(task) {
    const run = current.then(task, task);
    current = run.catch(() => {});
    return run;
  };
}

module.exports = createMutex;
