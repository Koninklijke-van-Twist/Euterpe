import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { attachMpvEvents, syncAfterMpvStart } from "./playback.js";
import { mpv } from "./mpv.js";
import { handleApi, handleSse, broadcastStatus } from "./router.js";
import { initStore } from "./store.js";
import { purgeExpiredTrash } from "./trash.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

async function serveStatic(res, filePath) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (url.pathname === "/api/events") {
    return handleSse(req, res);
  }

  if (url.pathname.startsWith("/api/")) {
    return handleApi(req, res, url);
  }

  let filePath = path.join(config.publicDir, url.pathname === "/" ? "index.html" : url.pathname);
  if (!filePath.startsWith(config.publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  return serveStatic(res, filePath);
});

await initStore();
await purgeExpiredTrash().catch((err) => console.warn("Prullenbak opschonen mislukt:", err.message));
setInterval(() => purgeExpiredTrash().catch(() => {}), 60 * 60 * 1000);
attachMpvEvents();

try {
  await mpv.start();
  console.log(`Audio engine connected (${config.mpvPath})`);
  await syncAfterMpvStart();
} catch (err) {
  console.warn(`Audio engine not available (${config.mpvPath}):`, err.message);
}

server.listen(config.port, () => {
  console.log(`Euterpe running on http://localhost:${config.port}`);
}).on("error", (err) => {
  console.error(`Kan poort ${config.port} niet openen:`, err.message);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await mpv.shutdown();
  process.exit(0);
});

// Push initial status periodically for SSE keepalive
setInterval(() => broadcastStatus().catch(() => {}), 5000);
