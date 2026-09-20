const AudioEngine = (() => {
  let instPlayer = null;
  let vocPlayer = null;
  let instGain = null;
  let vocGain = null;
  let master = null;
  let ready = false;
  let playing = false;
  let duration = 0;
  let startedAt = 0;
  let offset = 0;
  let tempo = 1;
  let key = 0;
  let instLevel = 1;
  let vocLevel = 0.15;
  let onEnd = null;

  function ensureNodes() {
    if (master) return;
    master = new Tone.Gain(0.9).toDestination();
    instGain = new Tone.Gain(instLevel).connect(master);
    vocGain = new Tone.Gain(vocLevel).connect(master);
  }

  function disposePlayers() {
    [instPlayer, vocPlayer].forEach((p) => {
      if (!p) return;
      try { p.stop(); } catch {}
      p.dispose();
    });
    instPlayer = vocPlayer = null;
    ready = false;
    playing = false;
  }

  function audioCtx() {
    return Tone.context.rawContext || Tone.context._context || Tone.context;
  }

  function splitStereo(buffer) {
    const sr = buffer.sampleRate;
    const n = buffer.length;
    const ctx = audioCtx();
    const inst = ctx.createBuffer(2, n, sr);
    const voc = ctx.createBuffer(2, n, sr);
    const L = buffer.getChannelData(0);
    const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
    const iL = inst.getChannelData(0);
    const iR = inst.getChannelData(1);
    const vL = voc.getChannelData(0);
    const vR = voc.getChannelData(1);
    for (let i = 0; i < n; i++) {
      const mid = (L[i] + R[i]) * 0.5;
      const side = (L[i] - R[i]) * 0.5;
      iL[i] = side * 1.4;
      iR[i] = -side * 1.4;
      vL[i] = mid;
      vR[i] = mid;
    }
    return { instrumental: inst, vocals: voc, method: "center-cancel" };
  }

  function makePlayer(buffer, dest) {
    const p = new Tone.GrainPlayer({
      grainSize: 0.18,
      overlap: 0.08,
      loop: false,
    }).connect(dest);
    p.buffer = new Tone.Buffer(buffer);
    p.detune = key * 100;
    p.playbackRate = tempo;
    return p;
  }

  async function decodeFile(file) {
    const arr = await file.arrayBuffer();
    return audioCtx().decodeAudioData(arr.slice(0));
  }

  async function loadSingle(file) {
    ensureNodes();
    await Tone.start();
    disposePlayers();
    const decoded = await decodeFile(file);
    const stems = splitStereo(decoded);
    instPlayer = makePlayer(stems.instrumental, instGain);
    vocPlayer = makePlayer(stems.vocals, vocGain);
    duration = decoded.duration;
    offset = 0;
    ready = true;
    return { duration, method: stems.method, channels: decoded.numberOfChannels };
  }

  async function loadStems(instFile, vocFile) {
    ensureNodes();
    await Tone.start();
    disposePlayers();
    const [instBuf, vocBuf] = await Promise.all([decodeFile(instFile), decodeFile(vocFile)]);
    instPlayer = makePlayer(instBuf, instGain);
    vocPlayer = makePlayer(vocBuf, vocGain);
    duration = Math.max(instBuf.duration, vocBuf.duration);
    offset = 0;
    ready = true;
    return { duration, method: "uploaded-stems", channels: 2 };
  }

  function applyParams() {
    [instPlayer, vocPlayer].forEach((p) => {
      if (!p) return;
      p.detune = key * 100;
      p.playbackRate = tempo;
    });
    if (instGain) instGain.gain.value = instLevel;
    if (vocGain) vocGain.gain.value = vocLevel;
  }

  function currentTime() {
    if (!playing) return offset;
    const t = offset + (Tone.now() - startedAt) * tempo;
    return Math.min(Math.max(t, 0), duration || t);
  }

  function startFrom(pos) {
    if (!ready) return;
    offset = Math.max(0, Math.min(pos, duration - 0.05));
    const when = Tone.now() + 0.02;
    instPlayer.start(when, offset);
    vocPlayer.start(when, offset);
    startedAt = when;
    playing = true;
    const remain = (duration - offset) / tempo;
    clearTimeout(startFrom._end);
    startFrom._end = setTimeout(() => {
      if (!playing) return;
      stop(true);
      if (onEnd) onEnd();
    }, remain * 1000 + 40);
  }

  function play() {
    if (!ready) throw new Error("Load an audio file first.");
    if (playing) return;
    if (offset >= duration - 0.05) offset = 0;
    startFrom(offset);
  }

  function pause() {
    if (!playing) return;
    offset = currentTime();
    try { instPlayer.stop(); } catch {}
    try { vocPlayer.stop(); } catch {}
    playing = false;
    clearTimeout(startFrom._end);
  }

  function stop(ended = false) {
    try { instPlayer?.stop(); } catch {}
    try { vocPlayer?.stop(); } catch {}
    playing = false;
    if (!ended) offset = 0;
    else offset = duration;
    clearTimeout(startFrom._end);
  }

  function seek(pos) {
    if (!ready) return;
    if (playing) startFrom(pos);
    else offset = pos;
  }

  return {
    loadSingle,
    loadStems,
    play,
    pause,
    stop,
    seek,
    currentTime,
    isPlaying: () => playing,
    isReady: () => ready,
    get duration() { return duration; },
    setKey(v) { key = v; applyParams(); },
    setTempo(v) { tempo = v; applyParams(); if (playing) startFrom(currentTime()); },
    setInst(v) { instLevel = v; applyParams(); },
    setVocals(v) { vocLevel = v; applyParams(); },
    setMaster(v) { ensureNodes(); master.gain.value = v; },
    onended(fn) { onEnd = fn; },
  };
})();
