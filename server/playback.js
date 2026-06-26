import path from "node:path";
import { config } from "./config.js";
import { mpv } from "./mpv.js";
import { hasTrackEnded } from "./playback-end.js";
import { enterManualQueueOp, exitManualQueueOp, isManualQueueOp } from "./playback-guard.js";
import {
  assertManualQueueAllowed,
  formatQueueItem,
  popNextFromQueue,
  removeQueueItemAndAbove,
  removeQueueItemById,
} from "./queue-helpers.js";
import { withPlaybackLock } from "./playback-lock.js";
import { shuffleWithSpacing } from "./shuffle.js";
import { readStore, updateStore, mutateStore, flushStore } from "./store.js";

const listeners = new Set();

let position = 0;
let duration = 0;
let paused = true;
let volume = 75;
let pollTimer = null;
let playbackFlushTimer = null;
let advancingTrack = false;
let playStartedAt = 0;
let finishingTrack = false;

function saveTrackDuration(trackId, seconds) {
  if (!trackId || !Number.isFinite(seconds) || seconds <= 0) return;
  mutateStore((store) => {
    const track = store.tracks.find((t) => t.id === trackId);
    if (track && !track.duration) track.duration = seconds;
  });
  schedulePlaybackPersist();
}

function schedulePlaybackPersist() {
  if (playbackFlushTimer) return;
  playbackFlushTimer = setTimeout(() => {
    playbackFlushTimer = null;
    flushStore().catch(() => {});
  }, 2500);
}

function syncPlaybackState(immediate = false) {
  mutateStore((store) => {
    store.playback.position = position;
    store.playback.duration = duration;
    store.playback.volume = volume;
    if (paused) {
      store.playback.state = store.playback.currentTrackId ? "paused" : "stopped";
    } else {
      store.playback.state = "playing";
    }
  });
  if (immediate) flushStore().catch(() => {});
  else schedulePlaybackPersist();
}

function startPositionPoll() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (!mpv.connected || advancingTrack || isManualQueueOp()) return;
    try {
      const [pos, dur, isPaused, eofReached] = await Promise.all([
        mpv.getProperty("time-pos"),
        mpv.getProperty("duration"),
        mpv.getProperty("pause"),
        mpv.getProperty("eof-reached"),
      ]);
      if (pos != null && Number.isFinite(Number(pos))) position = Number(pos);
      if (dur != null && Number.isFinite(Number(dur))) duration = Number(dur);
      if (isPaused != null) paused = Boolean(isPaused);

      const store = await readStore();
      if (store.playback.currentTrackId && duration > 0) {
        saveTrackDuration(store.playback.currentTrackId, duration);
      }

      if (
        store.playback.currentTrackId &&
        !isManualQueueOp() &&
        hasTrackEnded({
          position,
          duration,
          paused,
          eofReached,
          startedAt: playStartedAt,
        })
      ) {
        await withPlaybackLock(async () => {
          if (advancingTrack || finishingTrack || isManualQueueOp()) return;
          advancingTrack = true;
          try {
            await onTrackFinished();
          } finally {
            advancingTrack = false;
          }
        });
        return;
      }

      syncPlaybackState();
      await notify();
    } catch {
      /* engine may be busy */
    }
  }, 800);
}

function stopPositionPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

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
  mpv.onEvent((event) => {
    handleMpvEvent(event).catch((err) => {
      console.error("MPV event error:", err.message);
    });
  });
}

async function handleMpvEvent(event) {
  if (event.event === "property-change") {
    if (event.name === "time-pos" && event.data != null) {
      position = Number(event.data);
      syncPlaybackState();
      return;
    }
    if (event.name === "duration" && event.data != null) {
      duration = Number(event.data);
      const store = await readStore();
      if (store.playback.currentTrackId) {
        saveTrackDuration(store.playback.currentTrackId, duration);
      }
    }
    if (event.name === "pause" && event.data != null) paused = Boolean(event.data);
    if (event.name === "volume" && event.data != null) volume = Number(event.data);
    syncPlaybackState();
    await notify();
  }
  if (event.event === "end-file" && event.reason === "eof" && !advancingTrack && !isManualQueueOp()) {
    const store = await readStore();
    if (!store.playback.currentTrackId) return;
    await withPlaybackLock(async () => {
      if (advancingTrack || finishingTrack || isManualQueueOp()) return;
      advancingTrack = true;
      try {
        await onTrackFinished();
      } finally {
        advancingTrack = false;
      }
    });
  }
  if (event.event === "file-loaded") {
    try {
      const dur = await mpv.getProperty("duration");
      if (dur != null && Number.isFinite(Number(dur))) {
        duration = Number(dur);
        const store = await readStore();
        if (store.playback.currentTrackId) {
          saveTrackDuration(store.playback.currentTrackId, duration);
        }
      }
    } catch {
      /* mpv busy */
    }
    syncPlaybackState();
    await notify();
  }
}

async function mpvHasLoadedFile() {
  try {
    const mpvPath = await mpv.getProperty("path");
    return Boolean(mpvPath && mpvPath !== "/" && mpvPath !== "(unavailable)");
  } catch {
    return false;
  }
}

async function playTrack(track) {
  if (!mpv.connected) {
    throw new Error("Audio-engine niet verbonden — herstart de server en controleer EUTERPE_MPV_PATH");
  }

  const store = await readStore();
  if (store.playback.currentTrackId != null && store.playback.state === "playing" && !paused) {
    try {
      await mpv.pause(true);
    } catch {
      /* mpv kan bezig zijn */
    }
  }

  const started = await mpv.startPlayback(trackPath(track), track.duration ?? 0);
  position = started.position;
  duration = started.duration;
  paused = false;
  playStartedAt = Date.now();

  if (duration > 0) saveTrackDuration(track.id, duration);

  await updateStore((store) => {
    store.playback.currentTrackId = track.id;
    store.playback.state = "playing";
    store.playback.position = position;
    store.playback.duration = duration;
  });

  startPositionPoll();
  await notify();
}

async function onTrackFinished() {
  if (isManualQueueOp() || finishingTrack) return;

  finishingTrack = true;
  try {
    let nextTrack = null;
    let inPlaylistMode = false;
    await updateStore((store) => {
      inPlaylistMode = Boolean(store.playback.activePlaylistId);
      store.playback.currentTrackId = null;
      store.playback.position = 0;
      store.playback.state = "stopped";
      nextTrack = popNextFromQueue(store);
      if (!nextTrack && inPlaylistMode) {
        reshufflePlaylist(store);
        nextTrack = popNextFromQueue(store);
      }
    });
    if (nextTrack) {
      await playTrack(nextTrack);
    } else {
      stopPositionPoll();
      if (playbackFlushTimer) {
        clearTimeout(playbackFlushTimer);
        playbackFlushTimer = null;
      }
      if (mpv.connected) await mpv.stop();
      paused = true;
      position = 0;
      playStartedAt = 0;
      await updateStore((store) => {
        store.playback.currentTrackId = null;
        store.playback.state = "stopped";
        store.playback.position = 0;
        if (!inPlaylistMode) store.playback.activePlaylistId = null;
      });
      await notify();
    }
  } finally {
    finishingTrack = false;
  }
}

export async function play() {
  return withPlaybackLock(async () => {
    if (!mpv.connected) {
      throw new Error("Audio-engine niet verbonden");
    }
    const store = await readStore();
    if (store.playback.currentTrackId) {
      const track = store.tracks.find((t) => t.id === store.playback.currentTrackId && !t.deleted_at);
      if (track && !(await mpvHasLoadedFile())) {
        await playTrack(track);
        return;
      }
      await mpv.pause(false);
      paused = false;
      playStartedAt = Date.now();
      startPositionPoll();
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
  });
}

export async function pause() {
  return withPlaybackLock(async () => {
    await mpv.pause(true);
    paused = true;
    await updateStore((s) => {
      s.playback.state = "paused";
    });
    await notify();
  });
}

export async function stop() {
  return withPlaybackLock(async () => {
    stopPositionPoll();
    if (playbackFlushTimer) {
      clearTimeout(playbackFlushTimer);
      playbackFlushTimer = null;
    }
    if (mpv.connected) await mpv.stop();
    paused = true;
    position = 0;
    playStartedAt = 0;
    await updateStore((s) => {
      s.playback.currentTrackId = null;
      s.playback.state = "stopped";
      s.playback.position = 0;
      if (s.playback.activePlaylistId != null) {
        s.playback.activePlaylistId = null;
        s.queue = [];
      }
    });
    await notify();
  });
}

export async function skip() {
  return withPlaybackLock(async () => {
    if (advancingTrack || finishingTrack) return;
    advancingTrack = true;
    try {
      await mpv.stop();
      await onTrackFinished();
    } finally {
      advancingTrack = false;
    }
  });
}

export async function setVolume(v) {
  await mpv.setVolume(v);
  volume = v;
  await updateStore((s) => {
    s.playback.volume = v;
  });
  await notify();
}

export async function removeFromQueue(queueItemId) {
  enterManualQueueOp();
  try {
    return await withPlaybackLock(async () => {
      await updateStore((store) => {
        assertManualQueueAllowed(store);
        if (!removeQueueItemById(store, queueItemId)) {
          throw Object.assign(new Error("Not found"), { status: 404 });
        }
      });
      await notify();
    });
  } finally {
    exitManualQueueOp();
  }
}

async function switchToTrack(track) {
  if (!mpv.connected) {
    throw new Error("Audio-engine niet verbonden");
  }

  const started = await mpv.startPlayback(trackPath(track), track.duration ?? 0);
  position = started.position;
  duration = started.duration;
  paused = false;
  playStartedAt = Date.now();

  if (duration > 0) saveTrackDuration(track.id, duration);

  await updateStore((store) => {
    store.playback.currentTrackId = track.id;
    store.playback.state = "playing";
    store.playback.position = position;
    store.playback.duration = duration;
  });

  startPositionPoll();
}

export async function playQueueItemNow(queueItemId) {
  enterManualQueueOp();
  try {
    return await withPlaybackLock(async () => {
      advancingTrack = true;
      try {
        let track = null;
        await updateStore((store) => {
          assertManualQueueAllowed(store);
          const item = removeQueueItemAndAbove(store, queueItemId);
          if (!item) {
            throw Object.assign(new Error("Niet in wachtrij"), { status: 404 });
          }
          track = store.tracks.find((t) => t.id === item.trackId && !t.deleted_at) || null;
        });
        if (!track) {
          throw Object.assign(new Error("Nummer niet gevonden"), { status: 404 });
        }
        await switchToTrack(track);
        await notify();
      } finally {
        advancingTrack = false;
      }
    });
  } finally {
    exitManualQueueOp();
  }
}

export async function playPlaylist(playlistId) {
  return withPlaybackLock(async () => {
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
      first = store.tracks.find((t) => t.id === order[0] && !t.deleted_at);
      if (first) popNextFromQueue(store);
    });
    if (first) await playTrack(first);
    else await notify();
  });
}

export async function syncAfterMpvStart() {
  const store = await readStore();
  if (!store.playback.currentTrackId) return;

  const track = store.tracks.find((t) => t.id === store.playback.currentTrackId && !t.deleted_at);
  if (!track) {
    await updateStore((s) => {
      s.playback.currentTrackId = null;
      s.playback.state = "stopped";
      s.playback.position = 0;
    });
    return;
  }

  if (store.playback.state === "playing") {
    await playTrack(track);
  } else if (store.playback.state === "paused") {
    await playTrack(track);
    await pause();
  }
}

export async function getStatusPayload() {
  const store = await readStore();
  const currentTrackRaw = store.tracks.find((t) => t.id === store.playback.currentTrackId);
  const currentTrack = currentTrackRaw && !currentTrackRaw.deleted_at ? currentTrackRaw : null;
  const queue = store.queue
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((item) => formatQueueItem(store, item))
    .filter((item) => item.track);

  return {
    state: store.playback.state,
    current_track: currentTrack,
    position: position ?? store.playback.position,
    duration: duration ?? store.playback.duration,
    volume: volume ?? store.playback.volume,
    queue,
    active_playlist_id: store.playback.activePlaylistId,
    active_playlist_name:
      store.playlists.find((p) => p.id === store.playback.activePlaylistId)?.name ?? null,
  };
}

// Test-only reset
export function _resetPlaybackStateForTests() {
  position = 0;
  duration = 0;
  paused = true;
  volume = 75;
  advancingTrack = false;
  finishingTrack = false;
  playStartedAt = 0;
  stopPositionPoll();
}
