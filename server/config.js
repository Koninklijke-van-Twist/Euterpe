import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  try {
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* geen .env — prima */
  }
}

loadEnvFile();

function defaultMpvPath() {
  if (process.env.EUTERPE_MPV_PATH) return process.env.EUTERPE_MPV_PATH;
  // Windows: mpvnet (libmpv) is gebruikelijker dan mpv in PATH
  return process.platform === "win32" ? "mpvnet" : "mpv";
}

export const config = {
  port: Number(process.env.EUTERPE_PORT || 8000),
  secret: process.env.EUTERPE_SECRET || "change-me-in-production",
  dataDir: process.env.EUTERPE_DATA_DIR || path.join(root, "data"),
  audioDir: process.env.EUTERPE_AUDIO_DIR || path.join(root, "data", "audio"),
  mpvPath: defaultMpvPath(),
  mpvSocket: process.env.EUTERPE_MPV_SOCKET || path.join(root, "data", "mpv.sock"),
  publicDir: path.join(root, "public"),
  isWindows: process.platform === "win32",
};
