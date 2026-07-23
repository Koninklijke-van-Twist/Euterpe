export function normalizeArtistKey(artist) {
  const s = String(artist ?? "").trim();
  return s || null;
}

export function uniqueArtists(tracks) {
  const set = new Set();
  for (const t of tracks) {
    const a = normalizeArtistKey(t.artist);
    if (a) set.add(a);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" }));
}

/**
 * Live library filter: artist dropdown + free-text over visible fields.
 * @param {Array} tracks
 * @param {{ artist?: string | null, query?: string, formatTime?: (n:number)=>string, formatBytes?: (n:number)=>string }} opts
 */
export function filterLibraryTracks(tracks, opts = {}) {
  const artistFilter = normalizeArtistKey(opts.artist);
  const q = String(opts.query ?? "")
    .trim()
    .toLowerCase();
  const formatTime = opts.formatTime || ((n) => String(n ?? ""));
  const formatBytes = opts.formatBytes || ((n) => String(n ?? ""));

  return tracks.filter((t) => {
    const artist = normalizeArtistKey(t.artist);
    if (artistFilter && artist !== artistFilter) return false;
    if (!q) return true;

    const hay = [
      t.title,
      artist || "Onbekend",
      t.album,
      formatTime(t.duration),
      formatBytes(t.file_size),
      t.original_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return hay.includes(q);
  });
}
