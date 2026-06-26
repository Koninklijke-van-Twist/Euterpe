let tracks = [];
let playlists = [];
let trashTracks = [];
let status = null;
let editingPlaylist = null;
let selectedTrackIds = [];
let eventSource = null;
let suppressQueueSseUntil = 0;

function suppressQueueSse(ms = 2000) {
  suppressQueueSseUntil = Date.now() + ms;
}

async function refreshPlaybackUi() {
  status = await api("/api/playback/status");
  renderPlayer();
  renderQueue();
}

const $ = (id) => document.getElementById(id);

function formatTime(s) {
  if (!s || !Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

function connectEvents() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource("/api/events");
  eventSource.onmessage = (e) => {
    status = JSON.parse(e.data);
    renderPlayer();
    if (Date.now() >= suppressQueueSseUntil) renderQueue();
  };
}

function renderPlayer() {
  if (!status) return;
  const badge = $("status-badge");
  badge.className = `status-badge ${status.state}`;
  badge.textContent = status.state === "playing" ? "Afspelen" : status.state === "paused" ? "Gepauzeerd" : "Gestopt";

  const track = status.current_track;
  $("track-title").textContent = track ? track.title : "Geen nummer actief";
  $("track-title").classList.toggle("muted", !track);
  $("track-artist").textContent = track ? (track.artist || "Onbekende artiest") : "";

  const pct = status.duration > 0 ? (status.position / status.duration) * 100 : 0;
  $("progress-fill").style.width = `${pct}%`;
  $("time-pos").textContent = formatTime(status.position);
  $("time-dur").textContent = formatTime(status.duration);
  $("volume").value = status.volume;
  $("volume-label").textContent = `${Math.round(status.volume)}%`;
  $("btn-play").textContent = status.state === "playing" ? "⏸" : "▶";
}

function renderTracks() {
  const list = $("track-list");
  if (!tracks.length) {
    list.innerHTML = '<li class="empty-state">Nog geen nummers geüpload</li>';
    return;
  }
  list.innerHTML = tracks.map((t) => `
    <li>
      <div class="track-info">
        <div class="title">${esc(t.title)}</div>
        <div class="meta">${esc(t.artist || "Onbekend")} · ${formatTime(t.duration)} · ${formatBytes(t.file_size)}</div>
      </div>
      <div class="track-actions">
        <button class="btn-small" data-queue="${t.id}">▶</button>
        <button class="btn-danger" data-delete-track="${t.id}">✕</button>
      </div>
    </li>
  `).join("");
}

function renderQueue() {
  const list = $("queue-list");
  const queue = (status?.queue || []).filter((item) => item?.track);
  if (!queue.length) {
    list.innerHTML = '<li class="empty-state">Wachtrij is leeg</li>';
    return;
  }
  list.innerHTML = queue.map((item, i) => `
    <li>
      <div class="track-info">
        <div class="title">${i + 1}. ${esc(item.track.title)}</div>
        <div class="meta">${esc(item.track.artist || "Onbekend")} · ${formatTime(item.track.duration)}</div>
      </div>
      <div class="track-actions">
        <button type="button" class="btn-small" data-play-queue="${item.id}">Speel nu</button>
        <button type="button" class="btn-danger" data-remove-queue="${item.id}">✕</button>
      </div>
    </li>
  `).join("");
}

function renderPlaylists() {
  const container = $("playlist-list");
  if (!playlists.length) {
    container.innerHTML = '<p class="empty-state">Nog geen afspeellijsten</p>';
    return;
  }
  container.innerHTML = playlists.map((pl) => `
    <div class="playlist-item">
      <div>
        <strong>${esc(pl.name)}</strong>
        <div class="muted" style="font-size:0.85rem">${pl.tracks.length} nummers</div>
      </div>
      <div class="track-actions">
        <button class="btn-small" data-play-pl="${pl.id}">▶ Shuffle</button>
        <button class="btn-small" data-edit-pl="${pl.id}">Bewerken</button>
        <button class="btn-danger" data-delete-pl="${pl.id}">✕</button>
      </div>
    </div>
  `).join("");
}

function renderPlaylistEditor() {
  const editor = $("playlist-editor");
  if (!editingPlaylist) { editor.classList.add("hidden"); return; }
  editor.classList.remove("hidden");
  editor.innerHTML = `
    <h3>Bewerk: ${esc(editingPlaylist.name)}</h3>
    <ul class="track-list editor-list">
      ${tracks.map((t) => `
        <li>
          <label class="checkbox-row">
            <input type="checkbox" data-pl-track="${t.id}" ${selectedTrackIds.includes(t.id) ? "checked" : ""} />
            <div class="track-info">
              <div class="title">${esc(t.title)}</div>
              <div class="meta">${esc(t.artist || "Onbekend")}</div>
            </div>
          </label>
        </li>
      `).join("")}
    </ul>
    <div class="track-actions editor-actions">
      <button class="btn-primary" id="save-pl-edit">Opslaan</button>
      <button class="btn-secondary" id="cancel-pl-edit">Annuleren</button>
    </div>
  `;
}

function renderTrashModal() {
  const list = $("trash-list");
  if (!trashTracks.length) {
    list.innerHTML = '<li class="empty-state">Prullenbak is leeg</li>';
    return;
  }
  list.innerHTML = trashTracks.map((t) => `
    <li>
      <div class="track-info">
        <div class="title">${esc(t.title)}</div>
        <div class="meta">${esc(t.artist || "Onbekend")} · nog ${t.days_until_purge} dag${t.days_until_purge === 1 ? "" : "en"}</div>
      </div>
      <button class="btn-small" data-restore-track="${t.id}">Herstellen</button>
    </li>
  `).join("");
}

function openTrashModal() {
  $("trash-modal").classList.remove("hidden");
}

function closeTrashModal() {
  $("trash-modal").classList.add("hidden");
}

async function loadTrash() {
  trashTracks = await api("/api/tracks/trash");
  renderTrashModal();
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function loadData() {
  [tracks, playlists, status] = await Promise.all([
    api("/api/tracks"),
    api("/api/playlists"),
    api("/api/playback/status"),
  ]);
  renderTracks();
  renderPlaylists();
  renderPlayer();
  renderQueue();
}

$("trash-btn").addEventListener("click", async () => {
  try {
    await loadTrash();
    openTrashModal();
  } catch (err) {
    alert(err.message || "Prullenbak laden mislukt");
  }
});
$("trash-modal-close").addEventListener("click", closeTrashModal);
$("trash-modal-backdrop").addEventListener("click", closeTrashModal);

$("restart-btn").addEventListener("click", async () => {
  if (!confirm("Server afsluiten? run.sh doet daarna git pull en start de service opnieuw.")) return;
  try {
    await api("/api/admin/restart", { method: "POST" });
  } catch {
    /* server may close before response completes */
  }
  $("restart-btn").textContent = "Herstarten…";
  $("restart-btn").disabled = true;
});

$("btn-play").addEventListener("click", async () => {
  try {
    if (status?.state === "playing") await api("/api/playback/pause", { method: "POST" });
    else await api("/api/playback/play", { method: "POST" });
  } catch (err) {
    alert(err.message || "Afspelen mislukt");
  }
});
$("btn-stop").addEventListener("click", () => api("/api/playback/stop", { method: "POST" }));
$("btn-skip").addEventListener("click", () => api("/api/playback/skip", { method: "POST" }));
$("volume").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  $("volume-label").textContent = `${v}%`;
  api("/api/playback/volume", { method: "PUT", body: JSON.stringify({ volume: v }) });
});

const uploadZone = $("upload-zone");
const fileInput = $("file-input");
uploadZone.addEventListener("click", () => fileInput.click());
uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("dragover"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  uploadFiles(e.dataTransfer.files);
});
fileInput.addEventListener("change", (e) => uploadFiles(e.target.files));

async function uploadFiles(files) {
  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    await api("/api/tracks/upload", { method: "POST", body: form });
  }
  tracks = await api("/api/tracks");
  renderTracks();
}

function clickTarget(e, selector) {
  return e.target instanceof Element ? e.target.closest(selector) : null;
}

document.addEventListener("click", async (e) => {
  const playQueueEl = clickTarget(e, "[data-play-queue]");
  if (playQueueEl) {
    e.preventDefault();
    const id = playQueueEl.getAttribute("data-play-queue");
    suppressQueueSse();
    try {
      await api(`/api/queue/${id}/play`, { method: "POST" });
      await refreshPlaybackUi();
    } catch (err) {
      await refreshPlaybackUi();
      alert(err.message || "Afspelen mislukt");
    }
    return;
  }

  const removeQueueEl = clickTarget(e, "[data-remove-queue]");
  if (removeQueueEl) {
    e.preventDefault();
    const id = Number(removeQueueEl.getAttribute("data-remove-queue"));
    suppressQueueSse();
    try {
      await api(`/api/queue/${id}`, { method: "DELETE" });
      await refreshPlaybackUi();
    } catch (err) {
      await refreshPlaybackUi();
      alert(err.message || "Verwijderen uit wachtrij mislukt");
    }
    return;
  }

  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  if (t.dataset.queue) {
    suppressQueueSse();
    await api("/api/queue", { method: "POST", body: JSON.stringify({ track_id: Number(t.dataset.queue) }) });
    await refreshPlaybackUi();
  }
  if (t.dataset.deleteTrack) {
    const track = tracks.find((tr) => tr.id === Number(t.dataset.deleteTrack));
    const name = track?.title || "dit nummer";
    if (!confirm(`"${name}" naar de prullenbak verplaatsen? Het nummer blijft een week bewaard.`)) return;
    try {
      await api(`/api/tracks/${t.dataset.deleteTrack}`, { method: "DELETE" });
      await loadData();
      if (!$("trash-modal").classList.contains("hidden")) await loadTrash();
    } catch (err) {
      alert(err.message || "Verwijderen mislukt");
    }
  }
  if (t.dataset.restoreTrack) {
    try {
      await api(`/api/tracks/${t.dataset.restoreTrack}/restore`, { method: "POST" });
      tracks = await api("/api/tracks");
      renderTracks();
      await loadTrash();
    } catch (err) {
      alert(err.message || "Herstellen mislukt");
    }
    return;
  }
  if (t.dataset.playPl) {
    await api(`/api/playlists/${t.dataset.playPl}/play`, { method: "POST" });
  }
  if (t.dataset.editPl) {
    editingPlaylist = playlists.find((p) => p.id === Number(t.dataset.editPl));
    selectedTrackIds = editingPlaylist.tracks.map((t) => t.track.id);
    renderPlaylistEditor();
  }
  if (t.dataset.deletePl) {
    await api(`/api/playlists/${t.dataset.deletePl}`, { method: "DELETE" });
    playlists = await api("/api/playlists");
    renderPlaylists();
  }
  if (t.id === "save-pl-edit") {
    await api(`/api/playlists/${editingPlaylist.id}`, {
      method: "PUT",
      body: JSON.stringify({ track_ids: selectedTrackIds }),
    });
    editingPlaylist = null;
    playlists = await api("/api/playlists");
    renderPlaylists();
    renderPlaylistEditor();
  }
  if (t.id === "cancel-pl-edit") {
    editingPlaylist = null;
    renderPlaylistEditor();
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement && t.dataset.plTrack) {
    const id = Number(t.dataset.plTrack);
    if (t.checked) selectedTrackIds.push(id);
    else selectedTrackIds = selectedTrackIds.filter((x) => x !== id);
  }
});

$("playlist-create-btn").addEventListener("click", async () => {
  const name = $("playlist-name").value.trim();
  if (!name) return;
  await api("/api/playlists", { method: "POST", body: JSON.stringify({ name }) });
  $("playlist-name").value = "";
  playlists = await api("/api/playlists");
  renderPlaylists();
});

loadData().then(connectEvents);
