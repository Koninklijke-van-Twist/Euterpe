import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const SEARCH_LIMIT = 8;
const YT_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

function statusError(message, status) {
  return Object.assign(new Error(message), { status });
}

export function sanitizeQuery(query) {
  const q = String(query ?? "").replace(/[\r\n\t]/g, " ").trim();
  if (!q || q.length > 200) throw statusError("Zoekterm ontbreekt of is te lang", 400);
  return q;
}

export function parseSpotifyUrl(input) {
  const raw = String(input ?? "").trim();
  const uri = raw.match(/^spotify:(track|album|playlist|episode):([A-Za-z0-9]+)$/i);
  let kind;
  let id;
  if (uri) {
    kind = uri[1].toLowerCase();
    id = uri[2];
  } else {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    const m = `${url.origin}${url.pathname}`.match(
      /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|episode)\/([A-Za-z0-9]+)/i
    );
    if (!m) return null;
    kind = m[1].toLowerCase();
    id = m[2];
  }
  return { kind, id, href: `https://open.spotify.com/${kind}/${id}` };
}

export function parseYoutubeUrl(input) {
  let url;
  try {
    url = new URL(String(input ?? "").trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!YT_HOSTS.has(host)) return null;
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  }
  if (url.pathname === "/watch" && url.searchParams.get("v")) {
    return `https://www.youtube.com/watch?v=${url.searchParams.get("v")}`;
  }
  if (url.pathname.startsWith("/shorts/")) {
    const id = url.pathname.split("/")[2];
    if (id) return `https://www.youtube.com/watch?v=${id}`;
  }
  return url.toString();
}

export function assertFetchUrl(input) {
  const youtube = parseYoutubeUrl(input);
  if (youtube) return youtube;
  const spotify = parseSpotifyUrl(input);
  if (spotify?.kind === "episode") return spotify.href;
  if (spotify) {
    throw statusError("Spotify-muziek heeft geen directe stream. Kies een YouTube-resultaat.", 400);
  }
  throw statusError("Alleen YouTube-links en Spotify-afleveringen", 400);
}

export function queryFromSpotifyOembed(data) {
  const title = String(data?.title || "").trim();
  const author = String(data?.author_name || "").trim();
  const q = [author, title].filter(Boolean).join(" - ");
  if (!q) throw statusError("Spotify-link gaf geen titel", 502);
  return q;
}

export function searchArgs(query) {
  return ["--flat-playlist", "--dump-single-json", "--no-warnings", `ytsearch${SEARCH_LIMIT}:${sanitizeQuery(query)}`];
}

export function infoArgs(url) {
  return ["--dump-single-json", "--skip-download", "--no-warnings", "--no-playlist", "--playlist-end", String(SEARCH_LIMIT), url];
}

export function downloadArgs(url, outputTemplate) {
  return [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "-x",
    "--audio-format",
    "m4a",
    "--print",
    "filepath",
    "--print",
    "after_move:filepath",
    "-o",
    outputTemplate,
    url,
  ];
}

function watchUrl(entry) {
  const raw = entry.webpage_url || entry.url || "";
  if (typeof raw === "string" && /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//i.test(raw)) {
    return parseYoutubeUrl(raw) || raw;
  }
  if (/^[\w-]{11}$/.test(entry.id)) return `https://www.youtube.com/watch?v=${entry.id}`;
  return null;
}

export function parseSearchOutput(stdout) {
  const start = String(stdout).indexOf("{");
  const end = String(stdout).lastIndexOf("}");
  if (start === -1 || end === -1) throw statusError("yt-dlp gaf geen zoekresultaat", 502);
  let data;
  try {
    data = JSON.parse(String(stdout).slice(start, end + 1));
  } catch {
    throw statusError("yt-dlp gaf geen zoekresultaat", 502);
  }
  const entries = Array.isArray(data.entries) ? data.entries : data.id ? [data] : [];
  const results = [];
  for (const entry of entries) {
    if (!entry?.id) continue;
    const url = entry.ie_key === "Spotify" ? entry.webpage_url : watchUrl(entry);
    if (!url) continue;
    results.push({
      id: String(entry.id),
      title: entry.title || "Onbekend",
      artist: entry.channel || entry.uploader || entry.artist || "",
      duration: Number.isFinite(entry.duration) ? entry.duration : null,
      url,
      source: "youtube",
    });
  }
  return results.slice(0, SEARCH_LIMIT);
}

export function pickDownloadedFile(stdout, audioDir, existsSync = fs.existsSync) {
  const root = path.resolve(audioDir);
  const lines = String(stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const resolved = path.resolve(lines[i]);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) continue;
    if (existsSync(resolved)) return resolved;
  }
  throw statusError("yt-dlp gaf geen audiobestand terug", 502);
}

export function runYtDlp(bin, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, statusError("yt-dlp duurde te lang", 504));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (e) => {
      const missing = e.code === "ENOENT";
      finish(
        reject,
        statusError(
          missing
            ? "yt-dlp niet gevonden. Installeer yt-dlp en ffmpeg, of zet EUTERPE_YTDLP_PATH."
            : e.message,
          missing ? 503 : 500
        )
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code !== 0) {
        const msg = stderr.trim().split("\n").filter(Boolean).pop() || `yt-dlp stopte met code ${code}`;
        finish(reject, statusError(msg, 502));
        return;
      }
      finish(resolve, { stdout, stderr });
    });
  });
}

async function fetchSpotifyOembed(href, fetchImpl) {
  const res = await fetchImpl(`https://open.spotify.com/oembed?url=${encodeURIComponent(href)}`, {
    headers: { "User-Agent": "Euterpe" },
  });
  if (!res.ok) throw statusError("Spotify-link kon niet worden gelezen", 502);
  return res.json();
}

function defaultRun(args, timeoutMs) {
  return runYtDlp(config.ytDlpPath, args, { timeoutMs });
}

// Spotify-muziek is DRM; yt-dlp downloadt alleen podcastafleveringen. Tracks matchen we via YouTube.
export async function searchRemote(source, query, deps = {}) {
  const run = deps.run || defaultRun;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  if (source !== "youtube" && source !== "spotify") throw statusError("Bron moet youtube of spotify zijn", 400);
  const q = sanitizeQuery(query);
  const spotify = source === "spotify" ? parseSpotifyUrl(q) : null;

  if (spotify?.kind === "episode") {
    let title = "Spotify-aflevering";
    let artist = "Spotify";
    try {
      const meta = await fetchSpotifyOembed(spotify.href, fetchImpl);
      title = meta.title || title;
      artist = meta.author_name || artist;
    } catch {
      /* yt-dlp kan de aflevering alsnog ophalen */
    }
    return [{ id: spotify.id, title, artist, duration: null, url: spotify.href, source: "spotify" }];
  }

  let text = q;
  if (spotify) {
    const meta = await fetchSpotifyOembed(spotify.href, fetchImpl);
    text = sanitizeQuery(queryFromSpotifyOembed(meta));
  } else if (source === "youtube") {
    const watch = parseYoutubeUrl(q);
    if (watch) {
      const { stdout } = await run(infoArgs(watch), 25000);
      const results = parseSearchOutput(stdout);
      if (!results.length) throw statusError("Geen video gevonden", 404);
      return results;
    }
  }

  const { stdout } = await run(searchArgs(text), 25000);
  return parseSearchOutput(stdout);
}

export async function downloadAudio(pageUrl, audioDir, run = defaultRun) {
  const url = assertFetchUrl(pageUrl);
  const base = crypto.randomBytes(16).toString("hex");
  const template = path.join(audioDir, `${base}.%(ext)s`);
  const { stdout } = await run(downloadArgs(url, template), 180000);
  const filepath = pickDownloadedFile(stdout, audioDir);
  const stat = await fs.promises.stat(filepath);
  return {
    path: filepath,
    filename: path.basename(filepath),
    file_size: stat.size,
    ext: path.extname(filepath).toLowerCase(),
  };
}
