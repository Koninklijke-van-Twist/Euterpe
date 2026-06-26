import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import * as playback from "./playback.js";
import { shouldAutoPlayOnEnqueue, assertManualQueueAllowed, formatQueueItem } from "./queue-helpers.js";
import { readStore, updateStore } from "./store.js";
import { getCachedCommitSha } from "./version.js";
import {
  addTrackToPlaylist,
  dedupeTrackIds,
  parsePlaylistDelete,
  parsePlaylistTrackAdd,
  parsePlaylistTrackDelete,
  removeTrackFromPlaylist,
} from "./playlist-helpers.js";
import {
  activeTracks,
  daysUntilPurge,
  moveTrackToTrash,
  purgeExpiredTrash,
  restoreTrack,
  trashedTracks,
} from "./trash.js";

const ALLOWED_EXT = new Set([".mp3", ".flac", ".ogg", ".wav", ".m4a", ".opus", ".aac"]);

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function noContent(res) {
  res.writeHead(204);
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const delim = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(delim) + delim.length + 2;

  while (start < buffer.length) {
    const end = buffer.indexOf(delim, start);
    if (end === -1) break;
    const part = buffer.slice(start, end - 2);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const headers = part.slice(0, headerEnd).toString("utf8");
    const body = part.slice(headerEnd + 4);
    const nameMatch = headers.match(/name="([^"]+)"/);
    const fileMatch = headers.match(/filename="([^"]+)"/);
    parts.push({ name: nameMatch?.[1], filename: fileMatch?.[1], body });
    start = end + delim.length + 2;
  }
  return parts;
}

function playlistOut(store, p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    tracks: p.trackIds.map((trackId, position) => ({
      id: position,
      position,
      track: store.tracks.find((t) => t.id === trackId && !t.deleted_at),
    })).filter((t) => t.track),
  };
}

export async function handleApi(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/api/tracks/trash") {
    await purgeExpiredTrash();
    const store = await readStore();
    return json(
      res,
      200,
      trashedTracks(store).map((t) => ({
        ...t,
        days_until_purge: daysUntilPurge(t),
      }))
    );
  }

  if (method === "GET" && pathname === "/api/tracks") {
    await purgeExpiredTrash();
    const store = await readStore();
    return json(res, 200, activeTracks(store));
  }

  if (method === "POST" && pathname === "/api/tracks/upload") {
    const raw = await readBody(req);
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) return json(res, 400, { detail: "Invalid multipart" });
    const parts = parseMultipart(raw, boundaryMatch[1]);
    const filePart = parts.find((p) => p.filename);
    if (!filePart) return json(res, 400, { detail: "No file" });

    const ext = path.extname(filePart.filename).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return json(res, 400, { detail: `Unsupported format: ${ext}` });
    }

    const filename = `${crypto.randomBytes(16).toString("hex")}${ext}`;
    await fs.writeFile(path.join(config.audioDir, filename), filePart.body);

    const title = path.basename(filePart.filename, ext);
    const track = await updateStore((store) => {
      const id = store.meta.nextTrackId++;
      const t = {
        id,
        filename,
        original_name: filePart.filename,
        title,
        artist: null,
        album: null,
        duration: null,
        file_size: filePart.body.length,
        created_at: new Date().toISOString(),
      };
      store.tracks.unshift(t);
      return t;
    });
    return json(res, 200, track);
  }

  if (method === "POST" && pathname.match(/^\/api\/tracks\/\d+\/restore$/)) {
    const id = Number(pathname.split("/")[3]);
    try {
      await restoreTrack(id);
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, err.status || 500, { detail: err.message });
    }
  }

  if (method === "DELETE" && pathname.match(/^\/api\/tracks\/\d+$/)) {
    const id = Number(pathname.split("/").pop());
    try {
      const store = await readStore();
      const wasPlaying = store.playback.currentTrackId === id;
      await moveTrackToTrash(id);
      if (wasPlaying) await playback.stop();
      return noContent(res);
    } catch (err) {
      return json(res, err.status || 500, { detail: err.message });
    }
  }

  if (method === "GET" && pathname === "/api/queue") {
    const status = await playback.getStatusPayload();
    return json(res, 200, status.queue);
  }

  if (method === "POST" && pathname === "/api/queue") {
    const body = JSON.parse((await readBody(req)).toString("utf8"));
    let autoPlay = false;
    const item = await updateStore((store) => {
      assertManualQueueAllowed(store);
      if (!store.tracks.some((t) => t.id === body.track_id && !t.deleted_at)) {
        throw Object.assign(new Error("Track not found"), { status: 404 });
      }
      autoPlay = shouldAutoPlayOnEnqueue(store);
      const position = body.position ?? store.queue.length;
      store.queue.forEach((q) => {
        if (q.position >= position) q.position += 1;
      });
      const entry = {
        id: store.meta.nextQueueId++,
        trackId: body.track_id,
        position,
        addedAt: new Date().toISOString(),
      };
      store.queue.push(entry);
      return entry;
    }).catch((err) => {
      json(res, err.status || 500, { detail: err.message });
      return null;
    });
    if (!item) return;
    if (autoPlay) {
      try {
        await playback.play();
      } catch (err) {
        console.warn("Auto-play na wachtrij mislukt:", err.message);
      }
    }
    await broadcastStatus();
    const status = await playback.getStatusPayload();
    const full = status.queue.find((q) => q.queue_id === item.id);
    if (full) return json(res, 200, full);
    const store = await readStore();
    return json(res, 200, { ...formatQueueItem(store, item), auto_played: autoPlay });
  }

  if (method === "POST" && pathname.match(/^\/api\/queue\/\d+\/play$/)) {
    const id = Number(pathname.split("/")[3]);
    if (!Number.isFinite(id)) {
      return json(res, 400, { detail: "Invalid queue id" });
    }
    try {
      await playback.playQueueItemNow(id);
      await broadcastStatus();
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, err.status || 500, { detail: err.message });
    }
  }

  if (method === "DELETE" && pathname.match(/^\/api\/queue\/\d+$/)) {
    const id = Number(pathname.split("/").pop());
    if (!Number.isFinite(id)) {
      return json(res, 400, { detail: "Invalid queue id" });
    }
    try {
      await playback.removeFromQueue(id);
      await broadcastStatus();
      return noContent(res);
    } catch (err) {
      return json(res, err.status || 500, { detail: err.message });
    }
  }

  if (method === "GET" && pathname === "/api/playback/status") {
    return json(res, 200, await playback.getStatusPayload());
  }

  if (method === "POST" && pathname === "/api/playback/play") {
    try {
      await playback.play();
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, 503, { detail: err.message });
    }
  }
  if (method === "POST" && pathname === "/api/playback/pause") {
    try {
      await playback.pause();
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, 503, { detail: err.message });
    }
  }
  if (method === "POST" && pathname === "/api/playback/stop") {
    try {
      await playback.stop();
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, 503, { detail: err.message });
    }
  }
  if (method === "POST" && pathname === "/api/playback/skip") {
    try {
      await playback.skip();
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, 503, { detail: err.message });
    }
  }
  if (method === "PUT" && pathname === "/api/playback/volume") {
    const body = JSON.parse((await readBody(req)).toString("utf8"));
    await playback.setVolume(body.volume);
    return json(res, 200, { ok: true, volume: body.volume });
  }

  if (method === "GET" && pathname === "/api/playlists") {
    const store = await readStore();
    return json(res, 200, store.playlists.map((p) => playlistOut(store, p)));
  }

  if (method === "POST" && pathname === "/api/playlists") {
    const body = JSON.parse((await readBody(req)).toString("utf8"));
    const playlist = await updateStore((store) => {
      const now = new Date().toISOString();
      const p = {
        id: store.meta.nextPlaylistId++,
        name: body.name,
        description: body.description || null,
        trackIds: [],
        createdAt: now,
        updatedAt: now,
      };
      store.playlists.push(p);
      return p;
    });
    const store = await readStore();
    return json(res, 200, playlistOut(store, playlist));
  }

  const playlistTrackDelete = method === "DELETE" ? parsePlaylistTrackDelete(pathname) : null;
  if (playlistTrackDelete) {
    const { playlistId, trackId } = playlistTrackDelete;
    const updated = await updateStore((store) => {
      const p = store.playlists.find((pl) => pl.id === playlistId);
      if (!p) throw Object.assign(new Error("Not found"), { status: 404 });
      if (!store.tracks.some((t) => t.id === trackId && !t.deleted_at)) {
        throw Object.assign(new Error("Track not found"), { status: 404 });
      }
      removeTrackFromPlaylist(p, trackId);
      p.updatedAt = new Date().toISOString();
      return p;
    }).catch((err) => {
      json(res, err.status || 500, { detail: err.message });
      return null;
    });
    if (!updated) return;
    const store = await readStore();
    return json(res, 200, playlistOut(store, updated));
  }

  const playlistTrackAddId = method === "POST" ? parsePlaylistTrackAdd(pathname) : null;
  if (playlistTrackAddId) {
    const body = JSON.parse((await readBody(req)).toString("utf8"));
    const trackId = Number(body.track_id);
    if (!Number.isFinite(trackId)) {
      return json(res, 400, { detail: "track_id required" });
    }
    const updated = await updateStore((store) => {
      const p = store.playlists.find((pl) => pl.id === playlistTrackAddId);
      if (!p) throw Object.assign(new Error("Not found"), { status: 404 });
      if (!store.tracks.some((t) => t.id === trackId && !t.deleted_at)) {
        throw Object.assign(new Error("Track not found"), { status: 404 });
      }
      addTrackToPlaylist(p, trackId);
      p.updatedAt = new Date().toISOString();
      return p;
    }).catch((err) => {
      json(res, err.status || 500, { detail: err.message });
      return null;
    });
    if (!updated) return;
    const store = await readStore();
    return json(res, 200, playlistOut(store, updated));
  }

  const playlistDeleteId = method === "DELETE" ? parsePlaylistDelete(pathname) : null;
  if (playlistDeleteId) {
    try {
      await updateStore((store) => {
        const idx = store.playlists.findIndex((p) => p.id === playlistDeleteId);
        if (idx === -1) throw Object.assign(new Error("Not found"), { status: 404 });
        store.playlists.splice(idx, 1);
      });
      return noContent(res);
    } catch (err) {
      return json(res, err.status || 500, { detail: err.message });
    }
  }

  if (method === "PUT" && pathname.match(/^\/api\/playlists\/\d+$/)) {
    const id = Number(pathname.split("/")[3]);
    const body = JSON.parse((await readBody(req)).toString("utf8"));
    const updated = await updateStore((store) => {
      const p = store.playlists.find((pl) => pl.id === id);
      if (!p) throw Object.assign(new Error("Not found"), { status: 404 });
      if (body.name != null) p.name = body.name;
      if (body.description != null) p.description = body.description;
      if (body.track_ids != null) p.trackIds = dedupeTrackIds(body.track_ids);
      p.updatedAt = new Date().toISOString();
      return p;
    }).catch((err) => {
      json(res, err.status || 500, { detail: err.message });
      return null;
    });
    if (!updated) return;
    const store = await readStore();
    return json(res, 200, playlistOut(store, updated));
  }

  if (method === "POST" && pathname.match(/^\/api\/playlists\/\d+\/play$/)) {
    const id = Number(pathname.split("/")[3]);
    const store = await readStore();
    if (!store.playlists.some((p) => p.id === id)) {
      return json(res, 404, { detail: "Not found" });
    }
    try {
      await playback.playPlaylist(id);
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, 503, { detail: err.message });
    }
  }

  if (method === "GET" && pathname === "/api/version") {
    const commit = getCachedCommitSha();
    return json(res, 200, { commit });
  }

  if (method === "POST" && pathname === "/api/admin/restart") {
    json(res, 200, { ok: true, message: "Server wordt afgesloten…" });
    setTimeout(async () => {
      const { mpv } = await import("./mpv.js");
      await mpv.shutdown();
      process.exit(0);
    }, 250);
    return;
  }

  json(res, 404, { detail: "Not found" });
}

const sseClients = new Set();

export function handleSse(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
}

export async function broadcastStatus() {
  const payload = JSON.stringify(await playback.getStatusPayload());
  for (const client of sseClients) {
    client.write(`data: ${payload}\n\n`);
  }
}

playback.onStatusChange(broadcastStatus);
