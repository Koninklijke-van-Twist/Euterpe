import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const mpvPath = process.argv[2] || "C:\\Users\\tfalken\\AppData\\Local\\Programs\\mpv.net\\mpvnet.exe";
const testFile =
  process.argv[3] ||
  "C:\\open-source-repositories\\Euterpe\\data\\audio\\0347758d3f1d84e4f497d97799da2a14.mp3";
const ipc = "\\\\.\\pipe\\euterpe-test-mpv";

const args = [
  "--process-instance=multi",
  "--idle=yes",
  "--keep-open=yes",
  `--input-ipc-server=${ipc}`,
  "--no-video",
  "--force-window=no",
];

console.log("spawn:", mpvPath, args.join(" "));
const proc = spawn(mpvPath, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
proc.stderr?.on("data", (d) => console.error("[stderr]", d.toString().trim()));

function send(socket, cmd) {
  return new Promise((resolve, reject) => {
    const id = 1;
    const timer = setTimeout(() => reject(new Error("timeout")), 10000);
    const onData = (chunk) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        const data = JSON.parse(line);
        if (data.request_id === id) {
          clearTimeout(timer);
          socket.off("data", onData);
          resolve(data);
        }
      }
    };
    socket.on("data", onData);
    socket.write(JSON.stringify({ command: cmd, request_id: id }) + "\n");
  });
}

await new Promise((r) => setTimeout(r, 5000));

const socket = net.connect(ipc);
await new Promise((resolve, reject) => {
  socket.once("connect", resolve);
  socket.once("error", reject);
});
console.log("connected");

const uri = pathToFileURL(path.resolve(testFile)).href;
console.log("loadfile:", uri);
const load = await send(socket, ["loadfile", uri, "replace"]);
console.log("load response:", load);

await new Promise((r) => setTimeout(r, 1000));
const pos = await send(socket, ["get_property", "time-pos"]);
const dur = await send(socket, ["get_property", "duration"]);
const pause = await send(socket, ["get_property", "pause"]);
console.log("time-pos:", pos.data, "duration:", dur.data, "pause:", pause.data);

socket.destroy();
spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
console.log("done");
