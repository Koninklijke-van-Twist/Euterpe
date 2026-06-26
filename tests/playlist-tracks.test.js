import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  addTrackToPlaylist,
  dedupeTrackIds,
  parsePlaylistTrackAdd,
  parsePlaylistTrackDelete,
  playlistContainsTrack,
  removeTrackFromPlaylist,
} from "../server/playlist-helpers.js";

const root = path.resolve(import.meta.dirname, "..");

describe("playlist helpers", () => {
  it("dedupes track ids", () => {
    assert.deepEqual(dedupeTrackIds([3, 1, 3, 2, 1]), [3, 1, 2]);
  });

  it("adds a track only once", () => {
    const playlist = { trackIds: [1] };
    assert.equal(addTrackToPlaylist(playlist, 2), true);
    assert.equal(addTrackToPlaylist(playlist, 2), false);
    assert.deepEqual(playlist.trackIds, [1, 2]);
  });

  it("removes a track when present", () => {
    const playlist = { trackIds: [1, 2, 3] };
    assert.equal(removeTrackFromPlaylist(playlist, 2), true);
    assert.equal(removeTrackFromPlaylist(playlist, 2), false);
    assert.deepEqual(playlist.trackIds, [1, 3]);
  });

  it("detects playlist membership", () => {
    const playlist = { trackIds: [4, 5] };
    assert.equal(playlistContainsTrack(playlist, 4), true);
    assert.equal(playlistContainsTrack(playlist, 9), false);
  });

  it("parses playlist track routes", () => {
    assert.equal(parsePlaylistTrackAdd("/api/playlists/7/tracks"), 7);
    assert.equal(parsePlaylistTrackAdd("/api/playlists/7/play"), null);
    assert.deepEqual(parsePlaylistTrackDelete("/api/playlists/7/tracks/12"), {
      playlistId: 7,
      trackId: 12,
    });
    assert.equal(parsePlaylistTrackDelete("/api/playlists/7"), null);
  });
});

describe("playlist picker ui", () => {
  it("index provides playlist picker modal markup", () => {
    const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
    assert.match(html, /id="playlist-picker-modal"/);
    assert.match(html, /id="playlist-picker-list"/);
  });

  it("track list has add-to-playlist button hook", () => {
    const src = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
    assert.match(src, /data-add-to-playlists/);
    assert.match(src, /data-pl-picker/);
  });
});
