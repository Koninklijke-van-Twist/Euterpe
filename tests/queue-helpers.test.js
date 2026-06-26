import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertManualQueueAllowed,
  countPlayableQueueItems,
  formatQueueItem,
  isIdlePlayback,
  normalizeQueueIds,
  popNextFromQueue,
  pruneOrphanQueueItems,
  removeQueueItemAndAbove,
  removeQueueItemById,
  shouldAutoPlayOnEnqueue,
} from "../server/queue-helpers.js";
import { makeStore, makeTrack } from "./helpers/store-fixture.js";

describe("queue-helpers", () => {
  it("popNextFromQueue returns tracks in order and skips trashed", () => {
    const store = makeStore({
      tracks: [
        makeTrack(1),
        makeTrack(2, { deleted_at: "2026-01-01T00:00:00.000Z" }),
        makeTrack(3),
      ],
      queue: [
        { id: 10, trackId: 1, position: 0 },
        { id: 11, trackId: 2, position: 1 },
        { id: 12, trackId: 3, position: 2 },
      ],
    });

    assert.equal(popNextFromQueue(store)?.id, 1);
    assert.equal(popNextFromQueue(store)?.id, 3);
    assert.equal(popNextFromQueue(store), null);
    assert.equal(store.queue.length, 0);
  });

  it("removeQueueItemAndAbove skips items before target", () => {
    const store = makeStore({
      queue: [
        { id: 1, trackId: 10, position: 0 },
        { id: 2, trackId: 20, position: 1 },
        { id: 3, trackId: 30, position: 2 },
      ],
    });

    const item = removeQueueItemAndAbove(store, 3);
    assert.equal(item.trackId, 30);
    assert.deepEqual(
      store.queue.map((q) => q.trackId),
      []
    );
  });

  it("shouldAutoPlayOnEnqueue when idle and queue empty", () => {
    const store = makeStore({ tracks: [makeTrack(1)] });
    assert.equal(shouldAutoPlayOnEnqueue(store), true);

    store.queue.push({ id: 1, trackId: 1, position: 0 });
    assert.equal(shouldAutoPlayOnEnqueue(store), false);

    store.queue = [];
    store.playback.currentTrackId = 1;
    assert.equal(shouldAutoPlayOnEnqueue(store), false);

    store.playback.currentTrackId = null;
    store.playback.state = "playing";
    assert.equal(shouldAutoPlayOnEnqueue(store), false);
  });

  it("shouldAutoPlayOnEnqueue ignores orphan queue entries", () => {
    const store = makeStore({
      tracks: [makeTrack(1)],
      queue: [{ id: 1, trackId: 99, position: 0 }],
    });
    assert.equal(countPlayableQueueItems(store), 0);
    assert.equal(shouldAutoPlayOnEnqueue(store), true);
    assert.equal(store.queue.length, 0);
  });

  it("pruneOrphanQueueItems removes missing tracks", () => {
    const store = makeStore({
      tracks: [makeTrack(10)],
      queue: [
        { id: 1, trackId: 10, position: 0 },
        { id: 2, trackId: 99, position: 1 },
      ],
    });
    assert.equal(pruneOrphanQueueItems(store), true);
    assert.deepEqual(
      store.queue.map((q) => q.trackId),
      [10]
    );
    assert.equal(store.queue[0].position, 0);
  });

  it("removeQueueItemById removes single entry", () => {
    const store = makeStore({
      queue: [
        { id: 1, trackId: 10, position: 0 },
        { id: 2, trackId: 20, position: 1 },
      ],
    });
    assert.equal(removeQueueItemById(store, 1), true);
    assert.deepEqual(
      store.queue.map((q) => q.id),
      [2]
    );
    assert.equal(store.queue[0].position, 0);
    assert.equal(removeQueueItemById(store, 99), false);
  });

  it("removeQueueItemAndAbove accepts string queue id", () => {
    const store = makeStore({
      queue: [
        { id: 5, trackId: 10, position: 0 },
        { id: 6, trackId: 20, position: 1 },
      ],
    });
    const item = removeQueueItemAndAbove(store, "6");
    assert.equal(item.trackId, 20);
    assert.equal(store.queue.length, 0);
  });

  it("isIdlePlayback", () => {
    const store = makeStore();
    assert.equal(isIdlePlayback(store), true);
    store.playback.state = "paused";
    assert.equal(isIdlePlayback(store), false);
  });

  it("shouldAutoPlayOnEnqueue blocked in playlist mode", () => {
    const store = makeStore({ playback: { activePlaylistId: 2, state: "stopped" } });
    assert.equal(shouldAutoPlayOnEnqueue(store), true);
    assert.throws(() => assertManualQueueAllowed(store));
  });

  it("formatQueueItem exposes queue_id separate from track id", () => {
    const store = makeStore({
      tracks: [makeTrack(9)],
      queue: [{ id: 120, trackId: 9, position: 0, addedAt: "2026-01-01T00:00:00.000Z" }],
    });
    const out = formatQueueItem(store, store.queue[0]);
    assert.equal(out.queue_id, 120);
    assert.equal(out.track_id, 9);
    assert.equal(out.track.id, 9);
  });

  it("removeQueueItemById targets queue id when same track appears twice", () => {
    const store = makeStore({
      queue: [
        { id: 10, trackId: 9, position: 0 },
        { id: 11, trackId: 9, position: 1 },
      ],
    });
    assert.equal(removeQueueItemById(store, 11), true);
    assert.deepEqual(
      store.queue.map((q) => q.id),
      [10]
    );
  });

  it("normalizeQueueIds fixes duplicate queue ids", () => {
    const store = makeStore({
      meta: { nextTrackId: 1, nextQueueId: 12, nextPlaylistId: 1 },
      queue: [
        { id: 9, trackId: 9, position: 0 },
        { id: 9, trackId: 9, position: 1 },
      ],
    });
    assert.equal(normalizeQueueIds(store), true);
    assert.equal(store.queue[0].id, 9);
    assert.equal(store.queue[1].id, 12);
    assert.equal(store.meta.nextQueueId, 13);
  });
});
