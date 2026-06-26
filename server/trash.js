import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { readStore, updateStore } from "./store.js";

export const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function isTrashed(track) {
  return Boolean(track?.deleted_at);
}

export function activeTracks(store) {
  return store.tracks.filter((t) => !isTrashed(t));
}

export function trashedTracks(store) {
  return store.tracks.filter((t) => isTrashed(t));
}

export function trashExpiresAt(track) {
  return new Date(Date.parse(track.deleted_at) + TRASH_RETENTION_MS).toISOString();
}

export function daysUntilPurge(track) {
  const ms = Date.parse(trashExpiresAt(track)) - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export async function purgeExpiredTrash() {
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const removed = [];

  await updateStore((store) => {
    const keep = [];
    for (const track of store.tracks) {
      if (!track.deleted_at) {
        keep.push(track);
        continue;
      }
      if (Date.parse(track.deleted_at) < cutoff) {
        removed.push(track);
        continue;
      }
      keep.push(track);
    }
    store.tracks = keep;

    if (removed.length) {
      const removedIds = new Set(removed.map((t) => t.id));
      store.queue = store.queue.filter((q) => !removedIds.has(q.trackId));
      store.playlists.forEach((p) => {
        p.trackIds = p.trackIds.filter((id) => !removedIds.has(id));
      });
      if (store.playback.currentTrackId && removedIds.has(store.playback.currentTrackId)) {
        store.playback.currentTrackId = null;
        store.playback.state = "stopped";
        store.playback.position = 0;
      }
    }
  });

  for (const track of removed) {
    await fs.unlink(path.join(config.audioDir, track.filename)).catch(() => {});
  }

  return removed.length;
}

export async function moveTrackToTrash(trackId) {
  const now = new Date().toISOString();
  await updateStore((store) => {
    const track = store.tracks.find((t) => t.id === trackId && !isTrashed(t));
    if (!track) throw Object.assign(new Error("Not found"), { status: 404 });
    track.deleted_at = now;
    store.queue = store.queue.filter((q) => q.trackId !== trackId);
    if (store.playback.currentTrackId === trackId) {
      store.playback.currentTrackId = null;
      store.playback.state = "stopped";
      store.playback.position = 0;
    }
  });
}

export async function restoreTrack(trackId) {
  await updateStore((store) => {
    const track = store.tracks.find((t) => t.id === trackId && isTrashed(t));
    if (!track) throw Object.assign(new Error("Not found"), { status: 404 });
    delete track.deleted_at;
    const active = activeTracks(store);
    const exists = active.some(
      (t) => t.id !== trackId && t.filename === track.filename
    );
    if (exists) {
      throw Object.assign(new Error("Bestand bestaat al in bibliotheek"), { status: 409 });
    }
  });
}
