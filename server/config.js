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

function resolveMpvPath() {
  const configured = process.env.EUTERPE_MPV_PATH;
  const looksLikePath =
    configured &&
    (configured.includes(path.sep) ||
      configured.includes("/") ||
      configured.toLowerCase().endsWith(".exe"));

  if (looksLikePath) {
    if (fs.existsSync(configured)) return configured;
    return configured;
  }

  const name = configured || (process.platform === "win32" ? "mpvnet" : "mpv");

  if (process.platform === "win32" && (name === "mpvnet" || name === "mpv.net")) {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "mpv.net", "mpvnet.exe"),
      path.join(process.env.ProgramFiles || "", "mpv.net", "mpvnet.exe"),
    ];
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
  }

  return name;
}

export const config = {
  port: Number(process.env.EUTERPE_PORT || 8000),
  secret: process.env.EUTERPE_SECRET || "change-me-in-production",
  dataDir: process.env.EUTERPE_DATA_DIR || path.join(root, "data"),
  audioDir: process.env.EUTERPE_AUDIO_DIR || path.join(root, "data", "audio"),
  mpvPath: resolveMpvPath(),
  mpvSocket: process.env.EUTERPE_MPV_SOCKET || path.join(root, "data", "mpv.sock"),
  publicDir: path.join(root, "public"),
  isWindows: process.platform === "win32",
};
