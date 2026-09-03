import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  formatAutoStopTime,
  hasActivePlaybackToStop,
  isPastAutoStopTime,
  normalizeAutoStopSettings,
  parseAutoStopTime,
  shouldEnforceAutoStop,
} from "../server/auto-stop.js";

const root = path.resolve(import.meta.dirname, "..");

describe("auto-stop helpers", () => {
  it("parses and formats HH:MM", () => {
    assert.deepEqual(parseAutoStopTime("9:05"), { hours: 9, minutes: 5 });
    assert.equal(formatAutoStopTime({ hours: 9, minutes: 5 }), "09:05");
    assert.equal(parseAutoStopTime("25:00"), null);
    assert.equal(parseAutoStopTime("12:60"), null);
  });

  it("normalizes settings with defaults", () => {
    assert.deepEqual(normalizeAutoStopSettings({}), {
      autoStopEnabled: false,
      autoStopTime: "22:00",
    });
    assert.deepEqual(normalizeAutoStopSettings({ autoStopEnabled: 1, autoStopTime: "21:30" }), {
      autoStopEnabled: true,
      autoStopTime: "21:30",
    });
  });

  it("detects when local time is past stop time", () => {
    const settings = { autoStopEnabled: true, autoStopTime: "22:00" };
    assert.equal(isPastAutoStopTime(settings, new Date(2026, 0, 1, 21, 59)), false);
    assert.equal(isPastAutoStopTime(settings, new Date(2026, 0, 1, 22, 0)), true);
    assert.equal(isPastAutoStopTime(settings, new Date(2026, 0, 1, 23, 15)), true);
    assert.equal(
      isPastAutoStopTime({ autoStopEnabled: false, autoStopTime: "22:00" }, new Date(2026, 0, 1, 23, 0)),
      false
    );
  });

  it("enforces only when something is still active", () => {
    const now = new Date(2026, 0, 1, 22, 30);
    const idle = {
      settings: { autoStopEnabled: true, autoStopTime: "22:00" },
      playback: { currentTrackId: null, activePlaylistId: null, state: "stopped" },
      queue: [],
    };
    assert.equal(shouldEnforceAutoStop(idle, now), false);

    const active = {
      ...idle,
      playback: { currentTrackId: 3, activePlaylistId: 1, state: "playing" },
      queue: [{ id: 1, trackId: 3 }],
    };
    assert.equal(hasActivePlaybackToStop(active), true);
    assert.equal(shouldEnforceAutoStop(active, now), true);
  });
});

describe("auto-stop ui", () => {
  it("index provides auto-stop controls under playlists", () => {
    const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
    assert.match(html, /id="auto-stop-enabled"/);
    assert.match(html, /id="auto-stop-time"/);
    assert.match(html, /Auto stop music at time/);
  });
});
