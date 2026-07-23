import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { normalizeQueueIds } from "./queue-helpers.js";
import { extractTrackMetadata } from "./track-metadata.js";

const storePath = path.join(config.dataDir, "store.json");

const defaultStore = () => ({
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
});

let cache = null;
let writeChain = Promise.resolve();

async function backfillMissingMetadata(store) {
  let changed = false;
  for (const track of store.tracks) {
    if (track.artist != null && track.album != null) continue;
    if (!track.filename) continue;
    try {
      const buf = await fs.readFile(path.join(config.audioDir, track.filename));
      const meta = extractTrackMetadata(buf, track.original_name || track.filename);
      if (track.artist == null && meta.artist) {
        track.artist = meta.artist;
        changed = true;
      }
      if (track.album == null && meta.album) {
        track.album = meta.album;
        changed = true;
      }
      if (meta.title && (!track.title || track.title === "Onbekend")) {
        track.title = meta.title;
        changed = true;
      }
    } catch {
      /* bestand ontbreekt of onleesbaar */
    }
  }
  return changed;
}

export async function initStore() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.audioDir, { recursive: true });
  try {
    const raw = await fs.readFile(storePath, "utf8");
    cache = JSON.parse(raw);
    let dirty = normalizeQueueIds(cache);
    if (await backfillMissingMetadata(cache)) dirty = true;
    if (dirty) await flushStore();
  } catch {
    cache = defaultStore();
    await flushStore();
  }
}

function writeStoreFile() {
  const tmp = `${storePath}.tmp`;
  const data = JSON.stringify(cache, null, 2);
  return (async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await fs.writeFile(tmp, data, "utf8");
        await fs.rename(tmp, storePath);
        return;
      } catch (err) {
        if (attempt === 4) throw err;
        await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
      }
    }
  })();
}

function persist() {
  writeChain = writeChain
    .then(() => writeStoreFile())
    .catch((err) => {
      console.error("Kon store.json niet schrijven:", err.message);
    });
  return writeChain;
}

export async function flushStore() {
  await persist();
}

export async function readStore() {
  return cache;
}

export function mutateStore(mutator) {
  const result = mutator(cache);
  return result !== undefined ? result : cache;
}

export async function updateStore(mutator, { persist: shouldPersist = true } = {}) {
  const result = mutator(cache);
  if (shouldPersist) await persist();
  return result !== undefined ? result : cache;
}

export function nextId(key) {
  const id = cache.meta[key];
  cache.meta[key] = id + 1;
  return id;
}
