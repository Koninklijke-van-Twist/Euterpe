/** Serialiseert playback- en wachtrijmutaties om race conditions te voorkomen. */
let chain = Promise.resolve();

export function withPlaybackLock(fn) {
  const run = chain.then(() => fn());
  chain = run.then(
    () => {},
    () => {}
  );
  return run;
}

export function _resetPlaybackLockForTests() {
  chain = Promise.resolve();
}
