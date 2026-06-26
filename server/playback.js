import path from "node:path";
import { config } from "./config.js";
import { mpv } from "./mpv.js";
import { shuffleWithSpacing } from "./shuffle.js";
import { readStore, updateStore } from "./store.js";

const listeners = new Set();

let position = 0;
let duration = 0;
let paused = true;
let volume = 75;

export function onStatusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function notify() {
  for (const fn of listeners) await fn();
}

function trackPath(track) {
  return path.join(config.audioDir, track.filename);
}

function popNextFromQueue(store) {
  if (!store.queue.length) return null;
  store.queue.sort((a, b) => a.position - b.position);
  const [item] = store.queue.splice(0, 1);
  store.queue.forEach((q, i) => {
    q.position = i;
  });
  return store.tracks.find((t) => t.id === item.trackId) || null;
}

function reshufflePlaylist(store) {
  const playlist = store.playlists.find((p) => p.id === store.playback.activePlaylistId);
  if (!playlist?.trackIds?.length) {
    store.playback.activePlaylistId = null;
    return;
  }
  const order = shuffleWithSpacing(playlist.trackIds, store.playback.shuffleHistory || []);
  store.playback.shuffleHistory = order;
  store.queue = order.map((trackId, position) => ({
    id: store.meta.nextQueueId++,
    trackId,
    position,
    addedAt: new Date().toISOString(),
  }));
}

export function attachMpvEvents() {
  mpv.onEvent(async (event) => {
    if (event.event === "property-change") {
      if (event.name === "time-pos" && event.data != null) position = Number(event.data);
      if (event.name === "duration" && event.data != null) duration = Number(event.data);
      if (event.name === "pause" && event.data != null) paused = Boolean(event.data);
      if (event.name === "volume" && event.data != null) volume = Number(event.data);
      await syncPlaybackState();
      await notify();
    }
    if (event.event === "end-file" && event.reason === "eof") {
      await onTrackFinished();
    }
    if (event.event === "file-loaded") {
      await syncPlaybackState();
      await notify();
    }
  });
}

async function syncPlaybackState() {
  await updateStore((store) => {
    store.playback.position = position;
    store.playback.duration = duration;
    store.playback.volume = volume;
    if (paused) {
      store.playback.state = store.playback.currentTrackId ? "paused" : "stopped";
    } else {
      store.playback.state = "playing";
    }
  });
}

async function playTrack(track) {
  await updateStore((store) => {
    store.playback.currentTrackId = track.id;
    store.playback.state = "playing";
    store.playback.position = 0;
    store.playback.duration = track.duration || 0;
  });
  await mpv.loadFile(trackPath(track));
  await mpv.pause(false);
  paused = false;
  await notify();
}

async function onTrackFinished() {
  let nextTrack = null;
  await updateStore((store) => {
    store.playback.currentTrackId = null;
    store.playback.position = 0;
    store.playback.state = "stopped";
    nextTrack = popNextFromQueue(store);
    if (!nextTrack && store.playback.activePlaylistId) {
      reshufflePlaylist(store);
      nextTrack = popNextFromQueue(store);
    }
  });
  if (nextTrack) await playTrack(nextTrack);
  else await notify();
}

export async function play() {
  const store = await readStore();
  if (store.playback.currentTrackId) {
    await mpv.pause(false);
    paused = false;
    await updateStore((s) => {
      s.playback.state = "playing";
    });
  } else {
    let track = null;
    await updateStore((s) => {
      track = popNextFromQueue(s);
    });
    if (track) await playTrack(track);
  }
  await notify();
}

export async function pause() {
  await mpv.pause(true);
  paused = true;
  await updateStore((s) => {
    s.playback.state = "paused";
  });
  await notify();
}

export async function stop() {
  await mpv.stop();
  paused = true;
  position = 0;
  await updateStore((s) => {
    s.playback.currentTrackId = null;
    s.playback.state = "stopped";
    s.playback.position = 0;
  });
  await notify();
}

export async function skip() {
  await mpv.stop();
  await onTrackFinished();
}

export async function setVolume(v) {
  await mpv.setVolume(v);
  volume = v;
  await updateStore((s) => {
    s.playback.volume = v;
  });
  await notify();
}

export async function playPlaylist(playlistId) {
  let first = null;
  await updateStore((store) => {
    const playlist = store.playlists.find((p) => p.id === playlistId);
    if (!playlist?.trackIds?.length) return;
    const order = shuffleWithSpacing(playlist.trackIds, store.playback.shuffleHistory || []);
    store.playback.activePlaylistId = playlistId;
    store.playback.shuffleHistory = order;
    store.playback.currentTrackId = null;
    store.queue = order.map((trackId, position) => ({
      id: store.meta.nextQueueId++,
      trackId,
      position,
      addedAt: new Date().toISOString(),
    }));
    first = store.tracks.find((t) => t.id === order[0]);
    if (first) popNextFromQueue(store);
  });
  if (first) await playTrack(first);
  else await notify();
}

export async function getStatusPayload() {
  const store = await readStore();
  const currentTrack = store.tracks.find((t) => t.id === store.playback.currentTrackId) || null;
  const queue = store.queue
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      ...item,
      track: store.tracks.find((t) => t.id === item.trackId),
    }))
    .filter((item) => item.track);

  return {
    state: store.playback.state,
    current_track: currentTrack,
    position: position || store.playback.position,
    duration: duration || store.playback.duration,
    volume: volume || store.playback.volume,
    queue,
    active_playlist_id: store.playback.activePlaylistId,
  };
}
