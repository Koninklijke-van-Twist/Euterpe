import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playbackStartReady } from "../server/playback-start.js";

describe("playbackStartReady", () => {
  it("accepts known duration while playing", () => {
    assert.equal(playbackStartReady({ position: 0, duration: 180, paused: false }), true);
  });

  it("accepts advancing position", () => {
    assert.equal(playbackStartReady({ position: 0.2, duration: 0, paused: false }), true);
  });

  it("rejects paused state", () => {
    assert.equal(playbackStartReady({ position: 0, duration: 180, paused: true }), false);
  });

  it("rejects idle at start with no duration", () => {
    assert.equal(playbackStartReady({ position: 0, duration: 0, paused: false }), false);
  });
});
