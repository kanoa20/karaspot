const Lyrics = (() => {
  const LRC = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;

  function parse(synced) {
    if (!synced) return [];
    return synced.split(/\r?\n/).map((line) => {
      const m = line.match(LRC);
      if (!m) return null;
      const ms = (m[3] || "0").padEnd(3, "0").slice(0, 3);
      const t = Number(m[1]) * 60 + Number(m[2]) + Number(ms) / 1000;
      return { t, text: m[4].trim() };
    }).filter((x) => x && x.text);
  }

  async function fetchLyrics({ title, artist, album, duration }) {
    const params = new URLSearchParams({
      track_name: title || "",
      artist_name: artist || "",
    });
    if (album) params.set("album_name", album);
    if (duration) params.set("duration", String(Math.round(duration)));
    let res = await fetch(`https://lrclib.net/api/get?${params}`);
    if (res.status === 404) {
      res = await fetch(`https://lrclib.net/api/search?${params}`);
      if (!res.ok) return { lines: [], plain: "", source: null };
      const arr = await res.json();
      const best = arr.find((x) => x.syncedLyrics) || arr[0];
      if (!best) return { lines: [], plain: "", source: null };
      return {
        lines: parse(best.syncedLyrics),
        plain: best.plainLyrics || "",
        source: "lrclib",
        instrumental: best.instrumental,
      };
    }
    if (!res.ok) return { lines: [], plain: "", source: null };
    const data = await res.json();
    return {
      lines: parse(data.syncedLyrics),
      plain: data.plainLyrics || "",
      source: "lrclib",
      instrumental: data.instrumental,
    };
  }

  function atTime(lines, t) {
    if (!lines.length) return { prev: "", cur: "", next: "" };
    let i = 0;
    while (i + 1 < lines.length && lines[i + 1].t <= t + 0.05) i++;
    return {
      prev: lines[i - 1]?.text || "",
      cur: lines[i]?.text || "",
      next: lines[i + 1]?.text || "",
      i,
    };
  }

  return { fetchLyrics, parse, atTime };
})();
