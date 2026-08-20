export function dedupeTrackIds(trackIds) {
  return [...new Set(trackIds)];
}

export function playlistContainsTrack(playlist, trackId) {
  return playlist.trackIds.includes(trackId);
}

export function addTrackToPlaylist(playlist, trackId) {
  if (playlist.trackIds.includes(trackId)) return false;
  playlist.trackIds.push(trackId);
  return true;
}

export function removeTrackFromPlaylist(playlist, trackId) {
  const before = playlist.trackIds.length;
  playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
  return playlist.trackIds.length !== before;
}

/** Verwijder trackId uit alle playlists (bij soft-delete / ontbrekend bestand). */
export function removeTrackIdFromAllPlaylists(store, trackId) {
  let changed = false;
  for (const p of store.playlists || []) {
    if (removeTrackFromPlaylist(p, trackId)) changed = true;
  }
  return changed;
}

/** Behoud alleen trackIds die bestaan en niet in de prullenbak zitten. */
export function pruneUnplayablePlaylistTracks(store) {
  let changed = false;
  for (const p of store.playlists || []) {
    const before = p.trackIds.length;
    p.trackIds = p.trackIds.filter((id) =>
      store.tracks.some((t) => t.id === id && !t.deleted_at)
    );
    if (p.trackIds.length !== before) changed = true;
  }
  return changed;
}

export function playablePlaylistTrackIds(store, playlist) {
  return (playlist?.trackIds || []).filter((id) =>
    store.tracks.some((t) => t.id === id && !t.deleted_at)
  );
}

export function parsePlaylistDelete(pathname) {
  const m = pathname.match(/^\/api\/playlists\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function parsePlaylistTrackAdd(pathname) {
  const m = pathname.match(/^\/api\/playlists\/(\d+)\/tracks$/);
  return m ? Number(m[1]) : null;
}

export function parsePlaylistTrackDelete(pathname) {
  const m = pathname.match(/^\/api\/playlists\/(\d+)\/tracks\/(\d+)$/);
  return m ? { playlistId: Number(m[1]), trackId: Number(m[2]) } : null;
}
