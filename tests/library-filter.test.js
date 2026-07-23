import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { filterLibraryTracks, uniqueArtists } from "../public/library-filter.js";

const root = path.resolve(import.meta.dirname, "..");

const tracks = [
  { id: 1, title: "Blood and Thunder", artist: "Mastodon", duration: 228, file_size: 1000, album: "Leviathan" },
  { id: 2, title: "Hand Of Blood", artist: "Bullet For My Valentine", duration: 200, file_size: 2000 },
  { id: 3, title: "Do Your Thing", artist: null, duration: 180, file_size: 3000 },
];

describe("uniqueArtists", () => {
  it("returns sorted distinct artists", () => {
    assert.deepEqual(uniqueArtists(tracks), ["Bullet For My Valentine", "Mastodon"]);
  });
});

describe("filterLibraryTracks", () => {
  it("filters by artist", () => {
    const out = filterLibraryTracks(tracks, { artist: "Mastodon" });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 1);
  });

  it("searches live across displayed fields", () => {
    const out = filterLibraryTracks(tracks, {
      query: "onbekend",
      formatTime: () => "3:00",
      formatBytes: () => "3.0 KB",
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 3);
  });

  it("combines artist filter and search", () => {
    const out = filterLibraryTracks(tracks, { artist: "Mastodon", query: "blood" });
    assert.equal(out.length, 1);
    assert.equal(out[0].title, "Blood and Thunder");
  });
});

describe("library filter ui", () => {
  it("index provides artist filter and search controls", () => {
    const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
    assert.match(html, /id="library-artist-filter"/);
    assert.match(html, /id="library-search"/);
  });
});
