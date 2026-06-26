import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertManualQueueAllowed,
  isPlaylistModeActive,
} from "../server/queue-helpers.js";
import { makeStore } from "./helpers/store-fixture.js";

describe("playlist mode", () => {
  it("detects active playlist", () => {
    const store = makeStore();
    assert.equal(isPlaylistModeActive(store), false);
    store.playback.activePlaylistId = 3;
    assert.equal(isPlaylistModeActive(store), true);
  });

  it("blocks manual queue edits while playlist is active", () => {
    const store = makeStore({ playback: { activePlaylistId: 1, state: "playing" } });
    assert.throws(() => assertManualQueueAllowed(store), /Afspeellijst is actief/);
    store.playback.activePlaylistId = null;
    assert.doesNotThrow(() => assertManualQueueAllowed(store));
  });
});
