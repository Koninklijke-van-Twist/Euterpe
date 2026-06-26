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
