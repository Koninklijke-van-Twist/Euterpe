import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  extractTrackMetadata,
  parseFilenameMetadata,
  parseId3Metadata,
} from "../server/track-metadata.js";

const root = path.resolve(import.meta.dirname, "..");

describe("parseFilenameMetadata", () => {
  it("parses Artist - Title", () => {
    assert.deepEqual(parseFilenameMetadata("Mastodon - Blood and Thunder.mp3"), {
      title: "Blood and Thunder",
      artist: "Mastodon",
    });
  });

  it("strips leading track numbers", () => {
    assert.deepEqual(parseFilenameMetadata("01. Artist - Song.flac"), {
      title: "Song",
      artist: "Artist",
    });
  });

  it("keeps title-only filenames", () => {
    assert.deepEqual(parseFilenameMetadata("Blood and Thunder.mp3"), {
      title: "Blood and Thunder",
      artist: null,
    });
  });
});

describe("parseId3Metadata", () => {
  it("reads UTF-16 ID3v2.3 TIT2/TPE1/TALB from SpotiDownloader sample", () => {
    const dir = path.join(
      process.env.USERPROFILE || "",
      "Downloads",
      "SpotiDownloader.com - Need for Speed_ Most Wanted (2005)"
    );
    const sample = path.join(dir, "Blood and Thunder.mp3");
    if (!fs.existsSync(sample)) {
      // CI / machines without the soundtrack — skip gracefully via minimal fixture
      const title = Buffer.from([0x01, 0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]); // "Hi"
      const artist = Buffer.from([0x01, 0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]); // "AB"
      const album = Buffer.from([0x01, 0xff, 0xfe, 0x58, 0x00]); // "X"
      const frames = [];
      for (const [id, body] of [
        ["TIT2", title],
        ["TPE1", artist],
        ["TALB", album],
      ]) {
        const frame = Buffer.alloc(10 + body.length);
        frame.write(id, 0, "ascii");
        frame.writeUInt32BE(body.length, 4);
        body.copy(frame, 10);
        frames.push(frame);
      }
      const body = Buffer.concat(frames);
      const header = Buffer.alloc(10);
      header.write("ID3", 0, "ascii");
      header[3] = 3;
      header[4] = 0;
      const size = body.length;
      header[6] = (size >> 21) & 0x7f;
      header[7] = (size >> 14) & 0x7f;
      header[8] = (size >> 7) & 0x7f;
      header[9] = size & 0x7f;
      const meta = parseId3Metadata(Buffer.concat([header, body]));
      assert.equal(meta.title, "Hi");
      assert.equal(meta.artist, "AB");
      assert.equal(meta.album, "X");
      return;
    }

    const buf = fs.readFileSync(sample);
    const meta = parseId3Metadata(buf);
    assert.equal(meta.title, "Blood and Thunder");
    assert.equal(meta.artist, "Mastodon");
    assert.ok(meta.album);
  });
});

describe("extractTrackMetadata", () => {
  it("prefers ID3 artist over filename-only title", () => {
    const title = Buffer.from([0x03, ...Buffer.from("Song", "utf8")]);
    const artist = Buffer.from([0x03, ...Buffer.from("Band", "utf8")]);
    const frames = [];
    for (const [id, body] of [
      ["TIT2", title],
      ["TPE1", artist],
    ]) {
      const frame = Buffer.alloc(10 + body.length);
      frame.write(id, 0, "ascii");
      frame.writeUInt32BE(body.length, 4);
      body.copy(frame, 10);
      frames.push(frame);
    }
    const body = Buffer.concat(frames);
    const header = Buffer.alloc(10);
    header.write("ID3", 0, "ascii");
    header[3] = 3;
    const size = body.length;
    header[6] = (size >> 21) & 0x7f;
    header[7] = (size >> 14) & 0x7f;
    header[8] = (size >> 7) & 0x7f;
    header[9] = size & 0x7f;
    const meta = extractTrackMetadata(Buffer.concat([header, body]), "Song.mp3");
    assert.equal(meta.title, "Song");
    assert.equal(meta.artist, "Band");
  });
});
