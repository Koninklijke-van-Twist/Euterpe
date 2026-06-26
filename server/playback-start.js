export function playbackStartReady({ position, duration, paused }) {
  if (paused) return false;
  const p = Number(position) || 0;
  const d = Number(duration) || 0;
  return d >= 0.5 || p > 0.05;
}

export function playbackStartErrorHint() {
  return (
    "Afspelen start niet — controleer audio op de server (aplay -l, speaker-test). " +
    "Zet eventueel EUTERPE_MPV_AO=alsa en EUTERPE_MPV_AUDIO_DEVICE=alsa/default in /etc/euterpe/env."
  );
}
