const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  results: [],
  playlists: [],
  queue: JSON.parse(localStorage.getItem("karaspot_queue") || "[]"),
  current: null,
  lyrics: { lines: [], plain: "" },
  singer: localStorage.getItem("karaspot_singer") || "Singer",
  key: 0,
  tempo: 100,
  voc: 15,
  inst: 100,
  tab: "search",
};

function saveQueue() {
  localStorage.setItem("karaspot_queue", JSON.stringify(state.queue));
}

function fmt(t) {
  if (!Number.isFinite(t)) return "0:00";
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function keyLabel(n) {
  if (n === 0) return "Original";
  return n > 0 ? `+${n} st` : `${n} st`;
}

function mapTrack(t) {
  return {
    id: t.id,
    title: t.name,
    artist: (t.artists || []).map((a) => a.name).join(", "),
    album: t.album?.name || "",
    duration: (t.duration_ms || 0) / 1000,
    cover: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || "",
    uri: t.uri,
    singer: state.singer,
  };
}

function renderList(el, tracks, action = "queue") {
  if (!tracks.length) {
    el.innerHTML = `<div class="empty">Nothing here yet. Search Spotify or drop an audio file.</div>`;
    return;
  }
  el.innerHTML = tracks.map((t, i) => `
    <div class="track" data-i="${i}">
      ${t.cover ? `<img src="${t.cover}" alt="">` : `<div class="cover-ph"></div>`}
      <div>
        <div class="t-title">${escapeHtml(t.title)}</div>
        <div class="t-sub">${escapeHtml(t.artist)}${t.singer ? " · " + escapeHtml(t.singer) : ""}</div>
      </div>
      <button class="icon-btn" data-act="${action}" data-i="${i}">${action === "queue" ? "+" : "✕"}</button>
    </div>
  `).join("");
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;",
  }[c]));
}

function renderQueue() {
  renderList($("queueList"), state.queue, "remove");
}

function renderResults() {
  renderList($("resultList"), state.results, "queue");
}

function setNow(track, extra = "") {
  $("nowTitle").textContent = track?.title || "No song loaded";
  $("nowArtist").textContent = track ? `${track.artist}${track.singer ? " · " + track.singer : ""}` : "Pick a Spotify track, then attach audio";
  $("nowCover").src = track?.cover || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>";
  $("nowBadge").textContent = extra;
  $("nowBadge").style.display = extra ? "inline-block" : "none";
}

function renderLyrics(t) {
  const { prev, cur, next } = Lyrics.atTime(state.lyrics.lines, t);
  if (state.lyrics.lines.length) {
    $("lyricPrev").textContent = prev;
    $("lyricCur").textContent = cur || "…";
    $("lyricNext").textContent = next;
  } else if (state.lyrics.plain) {
    $("lyricPrev").textContent = "";
    $("lyricCur").textContent = "Synced lyrics not found — plain lyrics loaded";
    $("lyricNext").textContent = state.lyrics.plain.split("\n").slice(0, 2).join(" · ");
  } else {
    $("lyricPrev").textContent = "";
    $("lyricCur").textContent = state.current ? "No lyrics found" : "Search a song to start";
    $("lyricNext").textContent = "Audio files you own can be split into a guide vocal + backing mix";
  }
}

async function loadLyrics(track) {
  $("lyricCur").textContent = "Fetching lyrics…";
  try {
    state.lyrics = await Lyrics.fetchLyrics(track);
  } catch {
    state.lyrics = { lines: [], plain: "" };
  }
  renderLyrics(0);
}

async function selectTrack(track, playAfter = false) {
  state.current = track;
  setNow(track, AudioEngine.isReady() ? "Audio ready" : "Needs audio file");
  await loadLyrics(track);
  if (playAfter && AudioEngine.isReady()) togglePlay(true);
}

function enqueue(track) {
  state.queue.push({ ...track, singer: $("singerName").value || "Singer" });
  saveQueue();
  renderQueue();
}

function dequeue(i) {
  state.queue.splice(i, 1);
  saveQueue();
  renderQueue();
}

async function searchSpotify() {
  const q = $("searchInput").value.trim();
  if (!q) return;
  if (!await Spotify.token()) {
    openSettings("Sign in to Spotify to search the catalog.");
    return;
  }
  $("resultList").innerHTML = `<div class="empty">Searching…</div>`;
  try {
    const items = await Spotify.search(q);
    state.results = items.map(mapTrack);
    renderResults();
  } catch (err) {
    $("resultList").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

async function loadLibrary() {
  if (!await Spotify.token()) return;
  try {
    const [saved, plays] = await Promise.all([
      Spotify.savedTracks().catch(() => []),
      Spotify.playlists().catch(() => []),
    ]);
    state.playlists = plays;
    if (state.tab === "liked") {
      state.results = saved.map(mapTrack);
      renderResults();
    }
    if (state.tab === "playlists") {
      $("resultList").innerHTML = plays.map((p, i) => `
        <div class="track" data-pl="${p.id}">
          ${p.images?.[0] ? `<img src="${p.images[0].url}" alt="">` : `<div class="cover-ph"></div>`}
          <div>
            <div class="t-title">${escapeHtml(p.name)}</div>
            <div class="t-sub">${p.tracks?.total || 0} tracks</div>
          </div>
          <button class="icon-btn" data-act="openpl" data-i="${i}">→</button>
        </div>
      `).join("") || `<div class="empty">No playlists found.</div>`;
    }
  } catch (err) {
    $("resultList").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  if (tab === "search") renderResults();
  else loadLibrary();
}

function openSettings(msg) {
  $("settingsMsg").textContent = msg || "";
  $("clientId").value = Spotify.store.clientId;
  $("redirectUri").value = Spotify.redirectUri();
  $("settings").classList.add("show");
}

function closeSettings() {
  $("settings").classList.remove("show");
}

async function saveSettings() {
  Spotify.store.clientId = $("clientId").value.trim();
  closeSettings();
  updateUser();
}

async function updateUser() {
  try {
    if (await Spotify.token()) {
      state.user = await Spotify.me();
      $("userLabel").textContent = state.user.display_name || "Spotify";
      const img = state.user.images?.[0]?.url;
      $("userAvatar").src = img || "";
      $("userAvatar").style.display = img ? "block" : "none";
      $("loginBtn").textContent = "Sign out";
    } else {
      state.user = null;
      $("userLabel").textContent = "Not signed in";
      $("userAvatar").style.display = "none";
      $("loginBtn").textContent = "Connect Spotify";
    }
  } catch {
    state.user = null;
    $("userLabel").textContent = "Not signed in";
  }
}

async function handleFile(file, kind) {
  if (!file) return;
  $("audioStatus").textContent = "Decoding audio…";
  try {
    await Tone.start();
    let info;
    if (kind === "any") {
      handleFile.inst = handleFile.voc = null;
    }
    if (kind === "inst" || kind === "voc") {
      handleFile[kind] = file;
      if (handleFile.inst && handleFile.voc) {
        info = await AudioEngine.loadStems(handleFile.inst, handleFile.voc);
        $("audioStatus").textContent = "Loaded uploaded instrumental + vocal stems.";
      } else {
        $("audioStatus").textContent = kind === "inst"
          ? "Instrumental loaded. Add a vocal stem for a true mix."
          : "Vocal stem loaded. Add an instrumental to mix.";
        return;
      }
    } else {
      info = await AudioEngine.loadSingle(file);
      $("audioStatus").textContent = info.channels < 2
        ? "Mono file loaded — vocal cancel needs stereo. Mix sliders still work as volume."
        : "Split with a quick stereo center/side extract. Upload AI stems for cleaner karaoke.";
    }
    if (state.current) setNow(state.current, "Audio ready");
    else {
      const local = {
        id: "local-" + Date.now(),
        title: file.name.replace(/\.[^.]+$/, ""),
        artist: "Local file",
        album: "",
        duration: info.duration,
        cover: "",
        singer: $("singerName").value || "Singer",
      };
      state.current = local;
      setNow(local, "Local audio");
      await loadLyrics(local);
    }
    $("duration").textContent = fmt(AudioEngine.duration);
  } catch (err) {
    $("audioStatus").textContent = err.message || "Could not decode that file.";
  }
}

function applyMixer() {
  AudioEngine.setKey(state.key);
  AudioEngine.setTempo(state.tempo / 100);
  AudioEngine.setVocals(state.voc / 100);
  AudioEngine.setInst(state.inst / 100);
  $("keyVal").textContent = keyLabel(state.key);
  $("tempoVal").textContent = `${state.tempo}%`;
  $("vocVal").textContent = `${state.voc}%`;
  $("instVal").textContent = `${state.inst}%`;
}

function togglePlay(forcePlay) {
  try {
    const shouldPlay = forcePlay === true || (forcePlay !== false && !AudioEngine.isPlaying());
    if (shouldPlay) {
      AudioEngine.play();
      $("playBtn").textContent = "❚❚";
    } else {
      AudioEngine.pause();
      $("playBtn").textContent = "▶";
    }
  } catch (err) {
    $("audioStatus").textContent = err.message;
  }
}

function tick() {
  const t = AudioEngine.currentTime();
  $("currentTime").textContent = fmt(t);
  $("duration").textContent = fmt(AudioEngine.duration);
  if (AudioEngine.duration) $("seek").value = String((t / AudioEngine.duration) * 1000);
  renderLyrics(t);
  requestAnimationFrame(tick);
}

AudioEngine.onended(() => {
  $("playBtn").textContent = "▶";
  if (state.queue.length) {
    const next = state.queue.shift();
    saveQueue();
    renderQueue();
    selectTrack(next);
    $("audioStatus").textContent = "Next in queue selected — attach audio if this is a different song.";
  }
});

function bind() {
  $("searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") searchSpotify(); });
  $("searchBtn").addEventListener("click", searchSpotify);
  $("loginBtn").addEventListener("click", async () => {
    if (await Spotify.token()) {
      Spotify.logout();
      updateUser();
    } else if (!Spotify.store.clientId) {
      openSettings("Create a Spotify app and paste the Client ID.");
    } else {
      Spotify.login();
    }
  });
  $("settingsBtn").addEventListener("click", () => openSettings());
  $("saveSettings").addEventListener("click", saveSettings);
  $("closeSettings").addEventListener("click", closeSettings);
  $("copyRedirect").addEventListener("click", async () => {
    await navigator.clipboard.writeText(Spotify.redirectUri());
    $("copyRedirect").textContent = "Copied";
    setTimeout(() => { $("copyRedirect").textContent = "Copy redirect URI"; }, 1200);
  });

  document.querySelectorAll(".tabs button").forEach((b) => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
  });

  $("resultList").addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    const row = e.target.closest(".track");
    if (btn?.dataset.act === "queue") enqueue(state.results[Number(btn.dataset.i)]);
    else if (btn?.dataset.act === "openpl") {
      const pl = state.playlists[Number(btn.dataset.i)];
      const tracks = await Spotify.playlistTracks(pl.id);
      state.tab = "search";
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === "search"));
      state.results = tracks.map(mapTrack);
      renderResults();
    } else if (row && state.results[Number(row.dataset.i)]) {
      selectTrack(state.results[Number(row.dataset.i)]);
    }
  });

  $("queueList").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    const row = e.target.closest(".track");
    if (btn?.dataset.act === "remove") dequeue(Number(btn.dataset.i));
    else if (row) selectTrack(state.queue[Number(row.dataset.i)]);
  });

  $("playBtn").addEventListener("click", () => togglePlay());
  $("stopBtn").addEventListener("click", () => {
    AudioEngine.stop();
    $("playBtn").textContent = "▶";
  });
  $("seek").addEventListener("input", (e) => {
    if (!AudioEngine.duration) return;
    AudioEngine.seek((Number(e.target.value) / 1000) * AudioEngine.duration);
  });

  $("key").addEventListener("input", (e) => { state.key = Number(e.target.value); applyMixer(); });
  $("tempo").addEventListener("input", (e) => { state.tempo = Number(e.target.value); applyMixer(); });
  $("voc").addEventListener("input", (e) => { state.voc = Number(e.target.value); applyMixer(); });
  $("inst").addEventListener("input", (e) => { state.inst = Number(e.target.value); applyMixer(); });

  $("singerName").value = state.singer;
  $("singerName").addEventListener("change", () => {
    state.singer = $("singerName").value.trim() || "Singer";
    localStorage.setItem("karaspot_singer", state.singer);
  });

  $("fileAny").addEventListener("change", (e) => handleFile(e.target.files[0], "any"));
  $("fileInst").addEventListener("change", (e) => handleFile(e.target.files[0], "inst"));
  $("fileVoc").addEventListener("change", (e) => handleFile(e.target.files[0], "voc"));

  const drop = $("drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("hot");
  }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("hot");
  }));
  drop.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    handleFile(file, "any");
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input")) return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    if (e.key === "ArrowLeft") AudioEngine.seek(AudioEngine.currentTime() - 5);
    if (e.key === "ArrowRight") AudioEngine.seek(AudioEngine.currentTime() + 5);
    if (e.key === "[") { state.key = Math.max(-12, state.key - 1); $("key").value = state.key; applyMixer(); }
    if (e.key === "]") { state.key = Math.min(12, state.key + 1); $("key").value = state.key; applyMixer(); }
  });
}

async function init() {
  bind();
  renderQueue();
  applyMixer();
  setNow(null);
  renderLyrics(0);
  try {
    await Spotify.handleRedirect();
  } catch (err) {
    $("audioStatus").textContent = err.message;
  }
  await updateUser();
  tick();
}

init();
