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

/** @param {NodeJS.ProcessEnv} [env] */
export function parseListenPorts(env = process.env) {
  const parsePart = (part) => {
    const n = Number(String(part).trim());
    return Number.isFinite(n) && n > 0 && n <= 65535 ? n : null;
  };

  if (env.EUTERPE_PORTS) {
    return [
      ...new Set(
        env.EUTERPE_PORTS.split(",")
          .map(parsePart)
          .filter((n) => n != null)
      ),
    ];
  }

  const ports = [];
  const primary = parsePart(env.EUTERPE_PORT ?? "8000");
  if (primary != null) ports.push(primary);

  if (env.EUTERPE_EXTRA_PORTS) {
    for (const part of env.EUTERPE_EXTRA_PORTS.split(",")) {
      const n = parsePart(part);
      if (n != null) ports.push(n);
    }
  }

  return [...new Set(ports)];
}

function resolveMpvAo() {
  if (process.env.EUTERPE_MPV_AO !== undefined) {
    const v = process.env.EUTERPE_MPV_AO.trim();
    return v || null;
  }
  return process.platform === "win32" ? null : "alsa";
}

function resolveMpvExtraArgs() {
  const raw = process.env.EUTERPE_MPV_EXTRA_ARGS;
  if (!raw?.trim()) return [];
  return raw.trim().split(/\s+/);
}

function resolveMpvAudioDevice() {
  const v = process.env.EUTERPE_MPV_AUDIO_DEVICE?.trim();
  return v || null;
}

const listenPorts = parseListenPorts();

export const config = {
  ports: listenPorts.length ? listenPorts : [8000],
  port: (listenPorts.length ? listenPorts : [8000])[0],
  secret: process.env.EUTERPE_SECRET || "change-me-in-production",
  dataDir: process.env.EUTERPE_DATA_DIR || path.join(root, "data"),
  audioDir: process.env.EUTERPE_AUDIO_DIR || path.join(root, "data", "audio"),
  mpvPath: resolveMpvPath(),
  mpvAo: resolveMpvAo(),
  mpvAudioDevice: resolveMpvAudioDevice(),
  mpvExtraArgs: resolveMpvExtraArgs(),
  mpvSocket: process.env.EUTERPE_MPV_SOCKET || path.join(root, "data", "mpv.sock"),
  publicDir: path.join(root, "public"),
  isWindows: process.platform === "win32",
};
