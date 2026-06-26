import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

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

export async function initStore() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.audioDir, { recursive: true });
  try {
    const raw = await fs.readFile(storePath, "utf8");
    cache = JSON.parse(raw);
  } catch {
    cache = defaultStore();
    await persist();
  }
}

function persist() {
  writeChain = writeChain.then(() =>
    fs.writeFile(storePath, JSON.stringify(cache, null, 2), "utf8")
  );
  return writeChain;
}

export async function readStore() {
  return cache;
}

export async function updateStore(mutator) {
  const result = mutator(cache);
  await persist();
  return result !== undefined ? result : cache;
}

export function nextId(key) {
  const id = cache.meta[key];
  cache.meta[key] = id + 1;
  return id;
}
