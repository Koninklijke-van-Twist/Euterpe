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

export function countPlayableQueueItems(store) {
  return store.queue.filter((q) =>
    store.tracks.some((t) => t.id === q.trackId && !t.deleted_at)
  ).length;
}

export function pruneOrphanQueueItems(store) {
  const before = store.queue.length;
  store.queue = store.queue.filter((q) =>
    store.tracks.some((t) => t.id === q.trackId && !t.deleted_at)
  );
  if (store.queue.length !== before) {
    store.queue.forEach((q, i) => {
      q.position = i;
    });
  }
  return store.queue.length !== before;
}

export function shouldAutoPlayOnEnqueue(store) {
  pruneOrphanQueueItems(store);
  return isIdlePlayback(store) && countPlayableQueueItems(store) === 0;
}

export function isIdlePlayback(store) {
  return !store.playback.currentTrackId && store.playback.state === "stopped";
}

export function isPlaylistModeActive(store) {
  return store.playback.activePlaylistId != null;
}

export function assertManualQueueAllowed(store) {
  if (!isPlaylistModeActive(store)) return;
  throw Object.assign(
    new Error("Afspeellijst is actief — stop met ⏹ om handmatig af te spelen"),
    { status: 409 }
  );
}

export function formatQueueItem(store, item) {
  const track = store.tracks.find((t) => t.id === item.trackId && !t.deleted_at) ?? null;
  return {
    queue_id: item.id,
    track_id: item.trackId,
    position: item.position,
    added_at: item.addedAt,
    track,
  };
}

/** Zorgt voor unieke wachtrij-ids (ook bij dubbele trackId of legacy data). */
export function normalizeQueueIds(store) {
  if (!Array.isArray(store.queue)) {
    store.queue = [];
    return true;
  }

  const seen = new Set();
  let changed = false;
  let maxId = 0;

  for (const item of store.queue) {
    if (item.trackId == null && item.id != null) {
      const asTrack = store.tracks.some((t) => t.id === item.id && !t.deleted_at);
      if (asTrack) {
        item.trackId = item.id;
        changed = true;
      }
    }
    if (item.id == null || seen.has(item.id)) {
      item.id = store.meta.nextQueueId++;
      changed = true;
    }
    seen.add(item.id);
    maxId = Math.max(maxId, item.id);
  }

  if (store.meta.nextQueueId <= maxId) {
    store.meta.nextQueueId = maxId + 1;
    changed = true;
  }

  return changed;
}
