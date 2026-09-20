const Spotify = (() => {
  const AUTH = "https://accounts.spotify.com/authorize";
  const TOKEN = "https://accounts.spotify.com/api/token";
  const API = "https://api.spotify.com/v1";
  const SCOPES = [
    "user-read-private",
    "user-read-email",
    "user-library-read",
    "playlist-read-private",
    "playlist-read-collaborative",
    "streaming",
    "user-read-playback-state",
    "user-modify-playback-state",
  ].join(" ");

  const store = {
    get clientId() { return localStorage.getItem("karaspot_client_id") || ""; },
    set clientId(v) { localStorage.setItem("karaspot_client_id", v); },
    get tokens() {
      const raw = localStorage.getItem("karaspot_tokens");
      return raw ? JSON.parse(raw) : null;
    },
    set tokens(v) { localStorage.setItem("karaspot_tokens", JSON.stringify(v)); },
    clear() { localStorage.removeItem("karaspot_tokens"); },
  };

  function redirectUri() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function randomString(len = 64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
  }

  async function sha256(plain) {
    const data = new TextEncoder().encode(plain);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  async function login() {
    if (!store.clientId) throw new Error("Add your Spotify Client ID in Settings first.");
    const verifier = randomString(64);
    sessionStorage.setItem("karaspot_verifier", verifier);
    const challenge = await sha256(verifier);
    const params = new URLSearchParams({
      client_id: store.clientId,
      response_type: "code",
      redirect_uri: redirectUri(),
      scope: SCOPES,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state: randomString(16),
    });
    window.location.href = `${AUTH}?${params}`;
  }

  async function exchangeCode(code) {
    const verifier = sessionStorage.getItem("karaspot_verifier");
    const body = new URLSearchParams({
      client_id: store.clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    });
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error("Could not exchange Spotify auth code.");
    const json = await res.json();
    json.expires_at = Date.now() + json.expires_in * 1000;
    store.tokens = json;
    history.replaceState({}, "", redirectUri());
    return json;
  }

  async function refresh() {
    const tokens = store.tokens;
    if (!tokens?.refresh_token) return null;
    const body = new URLSearchParams({
      client_id: store.clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      store.clear();
      return null;
    }
    const json = await res.json();
    json.refresh_token = json.refresh_token || tokens.refresh_token;
    json.expires_at = Date.now() + json.expires_in * 1000;
    store.tokens = json;
    return json;
  }

  async function token() {
    let tokens = store.tokens;
    if (!tokens) return null;
    if (Date.now() > tokens.expires_at - 30_000) tokens = await refresh();
    return tokens?.access_token || null;
  }

  async function api(path) {
    const t = await token();
    if (!t) throw new Error("Not signed in to Spotify.");
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${t}` } });
    if (res.status === 401) {
      store.clear();
      throw new Error("Spotify session expired. Sign in again.");
    }
    if (!res.ok) throw new Error(`Spotify API ${res.status}`);
    return res.json();
  }

  async function handleRedirect() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) await exchangeCode(code);
  }

  return {
    store,
    login,
    logout() { store.clear(); },
    token,
    api,
    handleRedirect,
    redirectUri,
    async me() { return api("/me"); },
    async search(q) {
      const data = await api(`/search?type=track&limit=20&q=${encodeURIComponent(q)}`);
      return data.tracks.items;
    },
    async playlists() {
      const data = await api("/me/playlists?limit=30");
      return data.items;
    },
    async playlistTracks(id) {
      const data = await api(`/playlists/${id}/tracks?limit=50`);
      return data.items.map((i) => i.track).filter(Boolean);
    },
    async savedTracks() {
      const data = await api("/me/tracks?limit=30");
      return data.items.map((i) => i.track);
    },
  };
})();
