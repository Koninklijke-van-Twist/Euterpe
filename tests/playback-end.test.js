import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasTrackEnded, PLAY_END_GRACE_MS } from "../server/playback-end.js";

describe("playback-end", () => {
  const startedAt = 1000;

  it("ignores EOF during grace period", () => {
    assert.equal(
      hasTrackEnded({
        position: 60,
        duration: 60,
        paused: true,
        eofReached: true,
        startedAt,
        now: startedAt + PLAY_END_GRACE_MS - 1,
      }),
      false
    );
  });

  it("detects end at EOF after grace when near duration", () => {
    assert.equal(
      hasTrackEnded({
        position: 59.8,
        duration: 60,
        paused: false,
        eofReached: true,
        startedAt,
        now: startedAt + PLAY_END_GRACE_MS + 1,
      }),
      true
    );
  });

  it("does not end at start (position 0) even if eof-reached is stale", () => {
    assert.equal(
      hasTrackEnded({
        position: 0,
        duration: 60,
        paused: false,
        eofReached: true,
        startedAt,
        now: startedAt + PLAY_END_GRACE_MS + 5000,
      }),
      false
    );
  });

  it("detects end when paused near duration", () => {
    assert.equal(
      hasTrackEnded({
        position: 59.9,
        duration: 60,
        paused: true,
        eofReached: false,
        startedAt,
        now: startedAt + PLAY_END_GRACE_MS + 1,
      }),
      true
    );
  });
});
