import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";

class MPVClient {
  constructor() {
    this.process = null;
    this.socket = null;
    this.buffer = "";
    this.requestId = 0;
    this.handlers = [];
    this.pending = new Map();
    this.connected = false;
  }

  onEvent(handler) {
    this.handlers.push(handler);
  }

  onceEvent(predicate, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handlers = this.handlers.filter((h) => h !== handler);
        reject(new Error("Audio engine timeout"));
      }, timeoutMs);
      const handler = (event) => {
        try {
          if (!predicate(event)) return;
          clearTimeout(timer);
          this.handlers = this.handlers.filter((h) => h !== handler);
          resolve(event);
        } catch (err) {
          clearTimeout(timer);
          this.handlers = this.handlers.filter((h) => h !== handler);
          reject(err);
        }
      };
      this.handlers.push(handler);
    });
  }

  ipcPath() {
    if (config.isWindows) {
      return `\\\\.\\pipe\\euterpe-${path.basename(config.mpvSocket)}`;
    }
    return config.mpvSocket;
  }

  mpvArgs(ipc) {
    const args = [
      // mpv.net: eigen proces + IPC-pipe (niet de bestaande GUI-instantie)
      ...(config.isWindows ? ["--process-instance=multi"] : []),
      "--idle=yes",
      "--keep-open=yes",
      "--loop-file=no",
      "--loop-playlist=no",
      `--input-ipc-server=${ipc}`,
      "--volume=75",
      "--no-video",
      "--force-window=no",
    ];
    return args;
  }

  async start() {
    const ipc = this.ipcPath();
    if (!config.isWindows && fs.existsSync(config.mpvSocket)) {
      fs.unlinkSync(config.mpvSocket);
    }

    console.log(`Starting audio engine: ${config.mpvPath}`);
    if (config.isWindows) {
      console.log(`IPC pipe: ${ipc}`);
    }

    this.process = spawn(config.mpvPath, this.mpvArgs(ipc), {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    this.process.stderr?.on("data", (chunk) => {
      const msg = chunk.toString("utf8").trim();
      if (msg) console.error(`[${config.mpvPath}]`, msg);
    });

    this.process.on("exit", (code) => {
      console.warn(`Audio engine exited (code ${code ?? "?"})`);
      this.connected = false;
    });

    const spawnFailed = await new Promise((resolve) => {
      this.process.once("error", (err) => resolve(err));
      setTimeout(() => resolve(null), 50);
    });
    if (spawnFailed) {
      throw new Error(
        `${spawnFailed.message} (binary: ${config.mpvPath}). ` +
          `Zet EUTERPE_MPV_PATH in .env of je omgeving.`
      );
    }

    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 150));
      try {
        await this.connect();
        break;
      } catch {
        if (i === 119) {
          throw new Error(
            `Kon niet verbinden met ${config.mpvPath} IPC. ` +
              `Controleer of ${config.mpvPath} --input-ipc-server ondersteunt.`
          );
        }
      }
    }

    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("close", () => {
      this.connected = false;
    });

    await this.command("observe_property", 1, "time-pos");
    await this.command("observe_property", 2, "duration");
    await this.command("observe_property", 3, "pause");
    await this.command("observe_property", 4, "volume");
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.ipcPath());
      socket.once("connect", () => {
        this.socket = socket;
        this.connected = true;
        resolve();
      });
      socket.once("error", reject);
    });
  }

  onData(chunk) {
    this.buffer += chunk.toString("utf8");
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const data = JSON.parse(line);
        if (data.request_id != null && this.pending.has(data.request_id)) {
          const { resolve, reject } = this.pending.get(data.request_id);
          this.pending.delete(data.request_id);
          if (data.error && data.error !== "success") {
            reject(new Error(String(data.error)));
          } else {
            resolve(data);
          }
          continue;
        }
        for (const handler of this.handlers) handler(data);
      } catch {
        /* ignore malformed */
      }
    }
  }

  command(...args) {
    return this.send({ command: args });
  }

  send(payload) {
    return new Promise((resolve, reject) => {
      if (!this.socket?.writable) {
        reject(new Error("Audio engine not connected"));
        return;
      }
      const id = ++this.requestId;
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("Audio engine request timeout"));
        }
      }, 15000);

      this.pending.set(id, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.socket.write(JSON.stringify({ ...payload, request_id: id }) + "\n");
    });
  }

  async getProperty(name) {
    const res = await this.command("get_property", name);
    return res.data;
  }

  async loadFile(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Bestand niet gevonden: ${resolved}`);
    }
    const uri = pathToFileURL(resolved).href;
    const fileName = path.basename(resolved).toLowerCase();
    console.log(`loadfile: ${uri}`);
    const loaded = this.onceEvent((e) => e.event === "file-loaded");
    await this.command("loadfile", uri, "replace");
    try {
      await loaded;
    } catch {
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100));
        try {
          const mpvPath = String((await this.getProperty("path")) ?? "").toLowerCase();
          if (mpvPath.includes(fileName)) return;
        } catch {
          /* mpv busy */
        }
      }
      throw new Error("Audio engine laadde het bestand niet op tijd");
    }
  }

  async seek(seconds, mode = "absolute") {
    await this.command("seek", seconds, mode);
  }

  async pause(paused = true) {
    await this.command("set_property", "pause", paused);
  }

  async stop() {
    await this.command("stop");
  }

  async setVolume(volume) {
    await this.command("set_property", "volume", volume);
  }

  async shutdown() {
    this.connected = false;
    for (const { reject } of this.pending.values()) {
      reject(new Error("Audio engine shutting down"));
    }
    this.pending.clear();
    if (this.socket) this.socket.destroy();
    if (this.process?.pid) {
      if (config.isWindows) {
        spawn("taskkill", ["/PID", String(this.process.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        this.process.kill("SIGTERM");
      }
      this.process = null;
    }
  }
}

export const mpv = new MPVClient();
