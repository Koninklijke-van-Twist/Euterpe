const base = "http://localhost:8000";

async function req(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

function log(label, s) {
  console.log(label, {
    state: s.state,
    current: s.current_track?.title,
    currentId: s.current_track?.id,
    position: s.position?.toFixed?.(1),
    queue: s.queue?.map((q) => ({ queue_id: q.queue_id, title: q.track?.title })),
    playlist: s.active_playlist_id,
  });
}

let s = (await req("GET", "/api/playback/status")).data;
log("INITIAL", s);

if (!s.queue?.length) {
  await req("POST", "/api/playback/stop");
  for (const tid of [6, 4, 5]) {
    await req("POST", "/api/queue", { track_id: tid });
  }
  await req("POST", "/api/playback/play");
  s = (await req("GET", "/api/playback/status")).data;
  log("SETUP", s);
}

const q1 = s.queue[0];
console.log("\n--- DELETE first queue item", q1.queue_id, q1.track.title, "---");
const del = await req("DELETE", `/api/queue/${q1.queue_id}`);
console.log("DELETE status:", del.status);
s = (await req("GET", "/api/playback/status")).data;
log("AFTER DELETE", s);
if (s.queue.some((q) => q.queue_id === q1.queue_id)) {
  console.error("FAIL: item still in queue after delete");
  process.exit(1);
}

if (s.queue.length) {
  const q2 = s.queue[0];
  console.log("\n--- PLAY NOW", q2.queue_id, q2.track.title, "---");
  const play = await req("POST", `/api/queue/${q2.queue_id}/play`);
  console.log("PLAY NOW status:", play.status, play.data);
  await new Promise((r) => setTimeout(r, 1500));
  s = (await req("GET", "/api/playback/status")).data;
  log("AFTER PLAY NOW", s);
  if (s.current_track?.id !== q2.track.id) {
    console.error("FAIL: wrong track playing, expected", q2.track.id, "got", s.current_track?.id);
    process.exit(1);
  }
  if (s.queue.some((q) => q.queue_id === q2.queue_id)) {
    console.error("FAIL: played item still in queue");
    process.exit(1);
  }
}

console.log("\nOK all checks passed");
