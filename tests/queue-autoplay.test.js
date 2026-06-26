import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatQueueItem, shouldAutoPlayOnEnqueue } from "../server/queue-helpers.js";
import { makeStore, makeTrack } from "./helpers/store-fixture.js";

describe("queue enqueue autoplay", () => {
  it("auto-plays when idle and only orphan queue rows exist", () => {
    const store = makeStore({
      tracks: [makeTrack(5)],
      queue: [{ id: 50, trackId: 999, position: 0 }],
      playback: { state: "stopped", currentTrackId: null },
    });

    assert.equal(shouldAutoPlayOnEnqueue(store), true);
    assert.equal(store.queue.length, 0);
  });

  it("formatQueueItem keeps queue_id distinct from track id", () => {
    const store = makeStore({
      tracks: [makeTrack(9)],
      queue: [{ id: 120, trackId: 9, position: 0, addedAt: "2026-01-01T00:00:00.000Z" }],
    });
    const out = formatQueueItem(store, store.queue[0]);
    assert.equal(out.queue_id, 120);
    assert.equal(out.track.id, 9);
  });
});
