export function makeStore(overrides = {}) {
  return {
    meta: { nextTrackId: 1, nextQueueId: 1, nextPlaylistId: 1 },
    tracks: [],
    queue: [],
    playlists: [],
    playback: {
      currentTrackId: null,
      position: 0,
      duration: 0,
      state: "stopped",
      volume: 75,
      activePlaylistId: null,
      shuffleHistory: [],
    },
    ...overrides,
  };
}

export function makeTrack(id, extra = {}) {
  return {
    id,
    filename: `track-${id}.mp3`,
    title: `Track ${id}`,
    artist: null,
    duration: 60,
    deleted_at: undefined,
    ...extra,
  };
}
