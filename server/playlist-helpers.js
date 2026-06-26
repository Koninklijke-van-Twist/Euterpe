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

export function parsePlaylistTrackAdd(pathname) {
  const m = pathname.match(/^\/api\/playlists\/(\d+)\/tracks$/);
  return m ? Number(m[1]) : null;
}

export function parsePlaylistTrackDelete(pathname) {
  const m = pathname.match(/^\/api\/playlists\/(\d+)\/tracks\/(\d+)$/);
  return m ? { playlistId: Number(m[1]), trackId: Number(m[2]) } : null;
}
