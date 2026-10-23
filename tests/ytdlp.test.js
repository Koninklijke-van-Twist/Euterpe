import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  assertFetchUrl,
  downloadArgs,
  parseSearchOutput,
  parseSpotifyUrl,
  pickDownloadedFile,
  queryFromSpotifyOembed,
  runYtDlp,
  searchArgs,
  searchRemote,
} from "../server/ytdlp.js";

describe("yt-dlp search", () => {
  it("builds a youtube search without a shell", () => {
    const args = searchArgs("never gonna --help");
    assert.equal(args.at(-1), "ytsearch8:never gonna --help");
    assert.equal(args[0], "--flat-playlist");
  });

  it("parses flat search json and skips holes", () => {
    const raw = `WARNING\n${JSON.stringify({
      entries: [
        null,
        { id: "dQw4w9WgXcQ", title: "Never", channel: "Rick", duration: 213 },
        { id: "nope", title: "Geen url" },
      ],
    })}`;
    const results = parseSearchOutput(raw);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      id: "dQw4w9WgXcQ",
      title: "Never",
      artist: "Rick",
      duration: 213,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      source: "youtube",
    });
  });

  it("searches youtube text via yt-dlp", async () => {
    const calls = [];
    const results = await searchRemote("youtube", "daft punk", {
      run: async (args) => {
        calls.push(args);
        return { stdout: JSON.stringify({ entries: [{ id: "abc12345678", title: "One", uploader: "Daft" }] }) };
      },
    });
    assert.equal(calls[0].at(-1), "ytsearch8:daft punk");
    assert.equal(results[0].url, "https://www.youtube.com/watch?v=abc12345678");
  });

  it("turns a spotify track link into a youtube search", async () => {
    const calls = [];
    await searchRemote("spotify", "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b?si=x", {
      fetchImpl: async () => ({ ok: true, json: async () => ({ title: "Blinding Lights", author_name: "The Weeknd" }) }),
      run: async (args) => {
        calls.push(args);
        return { stdout: JSON.stringify({ entries: [{ id: "abc12345678", title: "Blinding Lights" }] }) };
      },
    });
    assert.equal(calls[0].at(-1), "ytsearch8:The Weeknd - Blinding Lights");
  });

  it("keeps a spotify episode on yt-dlp itself", async () => {
    let ran = false;
    const results = await searchRemote("spotify", "spotify:episode:4Z7GAJ50bgctf6uclHlWKo", {
      fetchImpl: async () => ({ ok: false }),
      run: async () => {
        ran = true;
        return { stdout: "" };
      },
    });
    assert.equal(ran, false);
    assert.equal(results[0].url, "https://open.spotify.com/episode/4Z7GAJ50bgctf6uclHlWKo");
    assert.equal(results[0].source, "spotify");
  });

  it("rejects an empty query and an unknown source", async () => {
    await assert.rejects(() => searchRemote("youtube", "  "), (err) => err.status === 400);
    await assert.rejects(() => searchRemote("soundcloud", "x"), (err) => err.status === 400);
  });
});

describe("yt-dlp download target", () => {
  it("allows youtube and a spotify episode, blocks other urls", () => {
    assert.equal(assertFetchUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(
      assertFetchUrl("https://open.spotify.com/episode/4Z7GAJ50bgctf6uclHlWKo"),
      "https://open.spotify.com/episode/4Z7GAJ50bgctf6uclHlWKo"
    );
    assert.throws(() => assertFetchUrl("https://open.spotify.com/track/abc"), (err) => err.status === 400);
    assert.throws(() => assertFetchUrl("file:///etc/passwd"), (err) => err.status === 400);
    assert.throws(() => assertFetchUrl("https://evil.example/watch?v=dQw4w9WgXcQ"), (err) => err.status === 400);
  });

  it("reads a title from spotify oembed", () => {
    assert.equal(queryFromSpotifyOembed({ title: "Song", author_name: "Artist" }), "Artist - Song");
    assert.equal(parseSpotifyUrl("https://open.spotify.com/intl-nl/album/abc123")?.href, "https://open.spotify.com/album/abc123");
  });

  it("passes the output template as one argument", () => {
    const args = downloadArgs("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "/data/audio/abc.%(ext)s");
    assert.equal(args.at(-1), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.ok(args.includes("/data/audio/abc.%(ext)s"));
    assert.equal(args.includes("-x"), true);
  });

  it("ignores a printed path outside the audio dir", () => {
    const audioDir = path.join("/tmp", "euterpe-audio");
    const ok = path.join(audioDir, "a.m4a");
    const picked = pickDownloadedFile(`/etc/passwd\n${ok}`, audioDir, (p) => p === ok);
    assert.equal(picked, ok);
    assert.throws(() => pickDownloadedFile("/etc/passwd", audioDir, () => true), (err) => err.status === 502);
  });

  it("reports a missing yt-dlp binary", async () => {
    await assert.rejects(() => runYtDlp("euterpe-yt-dlp-missing", ["--version"], { timeoutMs: 5000 }), (err) => err.status === 503);
  });
});

describe("remote search ui", () => {
  const root = path.resolve(import.meta.dirname, "..");

  it("index provides youtube and spotify search", () => {
    const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
    const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
    assert.match(html, /id="remote-source"/);
    assert.match(html, /id="remote-query"/);
    assert.match(app, /\/api\/remote\/search/);
    assert.match(app, /\/api\/remote\/fetch/);
  });
});
