/** Tijd na start waarin EOF-detectie wordt genegeerd (mpv.net stale eof-reached). */
export const PLAY_END_GRACE_MS = 2000;

/** Minimale voortgang voordat einde wordt overwogen (seconden). */
export const MIN_PLAYBACK_BEFORE_END_SEC = 1;

export function hasTrackEnded({ position, duration, paused, eofReached, startedAt, now = Date.now() }) {
  if (now - startedAt < PLAY_END_GRACE_MS) return false;
  if (!Number.isFinite(duration) || duration < MIN_PLAYBACK_BEFORE_END_SEC) return false;
  if (!Number.isFinite(position) || position < duration - 0.5) return false;
  return Boolean(eofReached) || Boolean(paused);
}
