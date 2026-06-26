import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { config } from "./config.js";

class MPVClient {
  constructor() {
    this.process = null;
    this.socket = null;
    this.buffer = "";
    this.requestId = 0;
    this.handlers = [];
    this.connected = false;
  }

  onEvent(handler) {
    this.handlers.push(handler);
  }

  ipcPath() {
    if (config.isWindows) {
      return `\\\\.\\pipe\\euterpe-${path.basename(config.mpvSocket)}`;
    }
    return config.mpvSocket;
  }

  mpvArgs(ipc) {
    return [
      "--no-video",
      "--idle=yes",
      "--keep-open=yes",
      `--input-ipc-server=${ipc}`,
      "--volume=75",
      // mpvnet: voorkom focus-gedrag bij headless gebruik
      ...(config.isWindows ? ["--force-window=no"] : []),
    ];
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
      stdio: "ignore",
      windowsHide: true,
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

    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        await this.connect();
        break;
      } catch {
        if (i === 79) {
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
        for (const handler of this.handlers) handler(data);
      } catch {
        /* ignore malformed */
      }
    }
  }

  async command(...args) {
    if (!this.socket?.writable) return;
    this.requestId += 1;
    const payload = JSON.stringify({ command: args, request_id: this.requestId }) + "\n";
    this.socket.write(payload);
  }

  loadFile(filePath) {
    const normalized = config.isWindows ? filePath.replace(/\//g, "\\") : filePath;
    return this.command("loadfile", normalized, "replace");
  }

  pause(paused = true) {
    return this.command("set_property", "pause", paused);
  }

  stop() {
    return this.command("stop");
  }

  setVolume(volume) {
    return this.command("set_property", "volume", volume);
  }

  async shutdown() {
    this.connected = false;
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
