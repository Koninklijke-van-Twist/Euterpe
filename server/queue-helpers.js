export function popNextFromQueue(store) {
  while (store.queue.length) {
    store.queue.sort((a, b) => a.position - b.position);
    const [item] = store.queue.splice(0, 1);
    store.queue.forEach((q, i) => {
      q.position = i;
    });
    const track = store.tracks.find((t) => t.id === item.trackId && !t.deleted_at);
    if (track) return track;
  }
  return null;
}

export function removeQueueItemAndAbove(store, queueItemId) {
  store.queue.sort((a, b) => a.position - b.position);
  const idx = store.queue.findIndex((q) => q.id === queueItemId);
  if (idx === -1) return null;
  store.queue.splice(0, idx);
  const [item] = store.queue.splice(0, 1);
  store.queue.forEach((q, i) => {
    q.position = i;
  });
  return item;
}

export function shouldAutoPlayOnEnqueue(store) {
  return (
    !store.playback.currentTrackId &&
    store.playback.state === "stopped" &&
    store.queue.length === 0
  );
}

export function isIdlePlayback(store) {
  return !store.playback.currentTrackId && store.playback.state === "stopped";
}
