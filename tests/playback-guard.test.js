import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  enterManualQueueOp,
  exitManualQueueOp,
  isManualQueueOp,
  _resetManualQueueOpForTests,
} from "../server/playback-guard.js";

describe("playback-guard", () => {
  beforeEach(() => _resetManualQueueOpForTests());

  it("blocks track-end handling during manual queue op", () => {
    assert.equal(isManualQueueOp(), false);
    enterManualQueueOp();
    assert.equal(isManualQueueOp(), true);
    exitManualQueueOp();
    assert.equal(isManualQueueOp(), false);
  });

  it("supports nested manual queue ops", () => {
    enterManualQueueOp();
    enterManualQueueOp();
    exitManualQueueOp();
    assert.equal(isManualQueueOp(), true);
    exitManualQueueOp();
    assert.equal(isManualQueueOp(), false);
  });
});
