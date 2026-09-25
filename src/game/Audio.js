/**
 * BGM: prefers /audio/neffex-my-way.mp3 (NEFFEX – My Way, creator-friendly).
 * Falls back to procedural temple loop if the file is missing.
 * SFX stay Web Audio synth.
 */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this._muted = false;
    this._playing = false;
    this._timerId = null;
    this._nextBeat = 0;
    this._step = 0;
    this._bgmEl = null;
    this._bgmMode = null; // "file" | "synth" | null
    this._bgmUrl = "/audio/My%20Way%20-%20NEFFEX.mp3";
    this._musicVolume = 0.15; // My Way BGM — quieter default
    this._sfxVolume = 0.6; // jump / slide / coin / hit
    this._paused = false;
  }

  get muted() {
    return this._muted;
  }

  get musicVolume() {
    return this._musicVolume;
  }

  get sfxVolume() {
    return this._sfxVolume;
  }

  async unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this._musicVolume * 0.5;
        this.musicGain.connect(this.master);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this._sfxVolume;
        this.sfxGain.connect(this.master);
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  setMusicVolume(value) {
    this._musicVolume = Math.min(1, Math.max(0, value));
    this._applyMusicVolume();
    return this._musicVolume;
  }

  adjustMusicVolume(delta) {
    return this.setMusicVolume(this._musicVolume + delta);
  }

  setSfxVolume(value) {
    this._sfxVolume = Math.min(1, Math.max(0, value));
    this._applySfxVolume();
    return this._sfxVolume;
  }

  adjustSfxVolume(delta) {
    return this.setSfxVolume(this._sfxVolume + delta);
  }

  _applyMusicVolume() {
    const v = this._muted ? 0 : this._musicVolume;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.05);
    }
    if (this._bgmEl) {
      this._bgmEl.volume = v;
      this._bgmEl.muted = this._muted || v <= 0.001;
    }
  }

  _applySfxVolume() {
    if (!this.sfxGain || !this.ctx) return;
    const v = this._muted ? 0 : this._sfxVolume;
    this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setMuted(muted) {
    this._muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
    }
    this._applyMusicVolume();
    this._applySfxVolume();
  }

  toggleMute() {
    this.setMuted(!this._muted);
    return this._muted;
  }

  async startMusic() {
    if (!this.ctx || this._playing) return;
    this._playing = true;
    this._paused = false;

    const ok = await this._tryStartFileBgm();
    if (ok) {
      this._bgmMode = "file";
      this._applyMusicVolume();
      return;
    }

    this._bgmMode = "synth";
    this._step = 0;
    this._nextBeat = this.ctx.currentTime + 0.05;
    this._applyMusicVolume();
    this._schedule();
  }

  pauseMusic() {
    if (!this._playing || this._paused) return;
    this._paused = true;
    if (this._timerId != null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    if (this._bgmEl && this._bgmMode === "file") {
      this._bgmEl.pause();
    }
  }

  resumeMusic() {
    if (!this._playing || !this._paused) return;
    this._paused = false;
    if (this._bgmMode === "file" && this._bgmEl) {
      this._applyMusicVolume();
      this._bgmEl.play().catch(() => {});
    } else if (this._bgmMode === "synth") {
      this._nextBeat = this.ctx.currentTime + 0.05;
      this._schedule();
    }
  }

  stopMusic() {
    this._playing = false;
    this._paused = false;
    if (this._timerId != null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    if (this._bgmEl) {
      this._bgmEl.pause();
      this._bgmEl.currentTime = 0;
    }
    this._bgmMode = null;
  }

  async _tryStartFileBgm() {
    try {
      const res = await fetch(this._bgmUrl, { method: "HEAD" });
      if (!res.ok) {
        // Some hosts block HEAD — try GET range-less existence via audio element
        return this._playHtmlAudio();
      }
      return this._playHtmlAudio();
    } catch {
      return this._playHtmlAudio();
    }
  }

  _playHtmlAudio() {
    return new Promise((resolve) => {
      if (!this._bgmEl) {
        this._bgmEl = new Audio(this._bgmUrl);
        this._bgmEl.loop = true;
        this._bgmEl.preload = "auto";
      }
      this._bgmEl.muted = this._muted;
      this._bgmEl.volume = this._muted ? 0 : this._musicVolume;

      const onError = () => {
        cleanup();
        resolve(false);
      };
      const onPlay = () => {
        cleanup();
        resolve(true);
      };
      const cleanup = () => {
        this._bgmEl.removeEventListener("error", onError);
        this._bgmEl.removeEventListener("playing", onPlay);
      };

      this._bgmEl.addEventListener("error", onError);
      this._bgmEl.addEventListener("playing", onPlay);
      this._bgmEl.currentTime = 0;
      const p = this._bgmEl.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          cleanup();
          resolve(false);
        });
      }
    });
  }

  playCoin() {
    // Louder two-tone sparkle so it cuts through BGM
    this._blip(1046, 0.11, "sine", 0.95);
    this._blip(1568, 0.16, "triangle", 0.7, 0.05);
  }

  /** Rising C-major arpeggio for reaching the desk. */
  playFanfare() {
    [523, 659, 784].forEach((f, i) => this._blip(f, 0.14, "triangle", 0.8, i * 0.1));
    this._blip(1046, 0.5, "triangle", 0.9, 0.32);
    this._blip(1568, 0.45, "sine", 0.5, 0.34);
  }

  playHit() {
    this._noiseBurst(0.25, 0.45);
    this._blip(110, 0.2, "sawtooth", 0.4);
  }

  playJump() {
    this._blip(320, 0.1, "sine", 0.7);
  }

  playSlide() {
    this._noiseBurst(0.16, 0.62);
  }

  _schedule() {
    if (!this._playing || !this.ctx || this._bgmMode !== "synth" || this._paused) return;

    const beat = 0.42;
    const now = this.ctx.currentTime;

    while (this._nextBeat < now + 0.8) {
      const t = this._nextBeat;
      const step = this._step % 16;

      if (step % 4 === 0) this._drum(t, step % 8 === 0 ? 70 : 95, 0.12);
      if (step % 2 === 1) this._noiseBurst(0.04, 0.05, t);
      if (step === 0 || step === 8) this._drone(t, 0.9);

      const scale = [220, 247, 261.63, 293.66, 329.63, 392, 440];
      const pattern = [0, 2, 4, 2, 5, 4, 3, 2, 0, 4, 5, 4, 2, 3, 1, 0];
      if (step % 2 === 0) {
        const note = scale[pattern[step] % scale.length];
        this._pluck(t, note, 0.35);
      }

      this._nextBeat += beat;
      this._step += 1;
    }

    this._timerId = setTimeout(() => this._schedule(), 200);
  }

  _pluck(time, freq, dur) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);
    f.type = "lowpass";
    f.frequency.setValueAtTime(1400, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.18, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  _drone(time, dur) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.value = 55;
    f.type = "lowpass";
    f.frequency.value = 280;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.08, time + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  _drum(time, freq, dur) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + dur);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.35, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  _blip(freq, dur, type, vol, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (type === "sawtooth") {
      osc.frequency.exponentialRampToValueAtTime(40, t + dur);
    } else {
      osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noiseBurst(dur, vol, at) {
    if (!this.ctx) return;
    const t = at ?? this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 800;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(at != null ? this.musicGain : this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
