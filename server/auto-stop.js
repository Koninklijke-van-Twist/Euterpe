/** @returns {{ hours: number, minutes: number } | null} */
export function parseAutoStopTime(value) {
  const m = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function formatAutoStopTime({ hours, minutes }) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeAutoStopSettings(raw = {}) {
  const enabled = Boolean(raw.autoStopEnabled);
  const parsed = parseAutoStopTime(raw.autoStopTime);
  return {
    autoStopEnabled: enabled,
    autoStopTime: parsed ? formatAutoStopTime(parsed) : "22:00",
  };
}

/** True when auto-stop is enabled and local clock is at/after the stop time today. */
export function isPastAutoStopTime(settings, now = new Date()) {
  const normalized = normalizeAutoStopSettings(settings);
  if (!normalized.autoStopEnabled) return false;
  const parsed = parseAutoStopTime(normalized.autoStopTime);
  if (!parsed) return false;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const minutesStop = parsed.hours * 60 + parsed.minutes;
  return minutesNow >= minutesStop;
}

/** True when playback/queue/playlist still has something that should be cleared. */
export function hasActivePlaybackToStop(store) {
  if (!store) return false;
  if (store.playback?.currentTrackId != null) return true;
  if (store.playback?.activePlaylistId != null) return true;
  if (store.playback?.state && store.playback.state !== "stopped") return true;
  if (Array.isArray(store.queue) && store.queue.length > 0) return true;
  return false;
}

export function shouldEnforceAutoStop(store, now = new Date()) {
  const settings = store?.settings || {};
  return isPastAutoStopTime(settings, now) && hasActivePlaybackToStop(store);
}
