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

export function removeQueueItemById(store, queueItemId) {
  const id = Number(queueItemId);
  if (!Number.isFinite(id)) return false;
  store.queue.sort((a, b) => a.position - b.position);
  const idx = store.queue.findIndex((q) => q.id === id);
  if (idx === -1) return false;
  store.queue.splice(idx, 1);
  store.queue.forEach((q, i) => {
    q.position = i;
  });
  return true;
}

export function removeQueueItemAndAbove(store, queueItemId) {
  const id = Number(queueItemId);
  if (!Number.isFinite(id)) return null;
  store.queue.sort((a, b) => a.position - b.position);
  const idx = store.queue.findIndex((q) => q.id === id);
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
