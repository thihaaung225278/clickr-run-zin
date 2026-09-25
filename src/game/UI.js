import { TEAMMATES } from "./constants.js";

const TYPE_MS = 300; // typewriter reveal time for a shout
const HOLD_MS = 1100; // shout stays up this long after typing
const CONFETTI_COUNT = 80;
const CONFETTI_MS = 3200;
const CONFETTI_COLORS = ["#ff6900", "#fbf5e8", "#d4a017", "#cc5406"];

/**
 * HUD + overlay start / pause / game-over / win panel, shout bubble, finale.
 */
export class UI {
  constructor() {
    this.overlay = document.getElementById("overlay");
    this.pauseOverlay = document.getElementById("pause-overlay");
    this.hud = document.getElementById("hud");
    this.scoreEl = document.getElementById("score-value");
    this.coinEl = document.getElementById("coin-value");
    this.title = document.getElementById("title-heading");
    this.subtitle = document.getElementById("subtitle");
    this.startBtn = document.getElementById("start-btn");
    this.resumeBtn = document.getElementById("resume-btn");
    this.brand = this.overlay?.querySelector(".brand");
    this.muteBtn = document.getElementById("mute-btn");
    this.volumeSlider = document.getElementById("volume-slider");
    this.sfxSlider = document.getElementById("sfx-slider");
    this.deskEl = document.getElementById("desk-value");
    this.shoutEl = document.getElementById("shout");
    this.shoutBubble = this.shoutEl?.querySelector(".shout-bubble");
    this.shoutText = this.shoutEl?.querySelector(".shout-text");
    this.shoutCombo = this.shoutEl?.querySelector(".shout-combo");
    this.shoutVisible = false;
    this._shoutTimer = 0;
    this._typeTimer = 0;
    this.finaleEl = document.getElementById("finale");
    this.finaleText = this.finaleEl?.querySelector(".finale-text");
    this._confettiTimer = 0;
    this.statsEl = document.getElementById("stats");
    this.castEl = document.getElementById("cast");
    this._renderCast();
    this._onMute = null;
    this._onVolume = null;
    this._onSfxVolume = null;
  }

  bindMute(handler) {
    this._onMute = handler;
    if (this.muteBtn) {
      this.muteBtn.onclick = (e) => {
        e.stopPropagation();
        handler?.();
      };
    }
  }

  bindVolume(handler) {
    this._onVolume = handler;
    if (this.volumeSlider) {
      this.volumeSlider.oninput = (e) => {
        const v = Number(e.target.value) / 100;
        handler?.(v);
      };
    }
  }

  bindSfxVolume(handler) {
    this._onSfxVolume = handler;
    if (this.sfxSlider) {
      this.sfxSlider.oninput = (e) => {
        const v = Number(e.target.value) / 100;
        handler?.(v);
      };
    }
  }

  setVolumeUI(value01) {
    if (!this.volumeSlider) return;
    this.volumeSlider.value = String(Math.round(value01 * 100));
  }

  setSfxVolumeUI(value01) {
    if (!this.sfxSlider) return;
    this.sfxSlider.value = String(Math.round(value01 * 100));
  }

  setLoading(isLoading) {
    if (!this.startBtn || !this.subtitle) return;
    this.startBtn.disabled = !!isLoading;
    if (isLoading) {
      this.subtitle.textContent = "Loading explorer…";
      this.startBtn.textContent = "Loading…";
    }
  }

  setMuteState(muted) {
    if (!this.muteBtn) return;
    this.muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    this.muteBtn.textContent = muted ? "Sound Off" : "Sound On";
    this.muteBtn.title = muted ? "Unmute" : "Mute";
  }

  showStart(onStart) {
    this.hud.hidden = true;
    if (this.pauseOverlay) this.pauseOverlay.hidden = true;
    // Keep overlay open if already visible (avoids flash after loading)
    this.overlay.hidden = false;
    this.hideShout();
    if (this.brand) this.brand.textContent = "clickr run";
    this.title.textContent = "Have you Claude it yet?";
    this.subtitle.textContent = "Derick needs to reach his desk. Dodge the team.";
    this.startBtn.textContent = "Begin Run";
    this.startBtn.onclick = () => onStart();
    if (this.castEl) this.castEl.hidden = false;
    if (this.statsEl) this.statsEl.hidden = true;
  }

  /** Cast list on the start screen, built once from TEAMMATES. */
  _renderCast() {
    if (!this.castEl) return;
    this.castEl.replaceChildren(
      ...TEAMMATES.map((t) => {
        const li = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = t.name;
        const line = document.createElement("span");
        line.textContent = `"${t.line}"`;
        li.append(name, line);
        return li;
      })
    );
  }

  showGameOver(score, coins, teammate, onRestart) {
    this.hideShout();
    const title = teammate ? `Caught by ${teammate.name}` : "Caught by the team";
    const line = teammate ? `"${teammate.line}" · ` : "";
    this._showEnd(title, `${line}Score ${Math.floor(score)} · Coins ${coins}`, onRestart);
  }

  showWin(title, stats, onRestart) {
    this.hideShout();
    this._showEnd(title, "Derick made it to his desk.", onRestart);
    if (!this.statsEl) return;
    const rows = [
      ["Teammates dodged", stats.dodged],
      ["Claude-its shouted", stats.shouts],
      ["Best combo", `x${stats.maxCombo}`],
      ["Most dodged", stats.mostDodged],
      ["Score", Math.floor(stats.score)],
      ["Coins", stats.coins],
    ];
    this.statsEl.replaceChildren(
      ...rows.map(([label, value]) => {
        const li = document.createElement("li");
        const l = document.createElement("span");
        l.textContent = label;
        const v = document.createElement("strong");
        v.textContent = String(value);
        li.append(l, v);
        return li;
      })
    );
    this.statsEl.hidden = false;
  }

  _showEnd(title, subtitle, onRestart) {
    this.hud.hidden = true;
    if (this.pauseOverlay) this.pauseOverlay.hidden = true;
    this.overlay.hidden = false;
    if (this.brand) this.brand.textContent = "clickr run";
    this.title.textContent = title;
    this.subtitle.textContent = subtitle;
    this.startBtn.textContent = "Run Again";
    this.startBtn.onclick = () => onRestart();
    this.startBtn.focus();
    if (this.castEl) this.castEl.hidden = true;
    if (this.statsEl) this.statsEl.hidden = true;
  }

  /**
   * Speech bubble over Derick's head. Types out, holds, hides.
   * A new shout cancels the current one. level 1-3 grows the bubble.
   */
  showShout(text, { level = 1, combo = 1 } = {}) {
    if (!this.shoutEl) return;
    this.hideShout();
    this.shoutVisible = true;
    this.shoutEl.hidden = false;
    this.shoutEl.dataset.level = String(level);
    this.shoutCombo.textContent = combo >= 3 ? `x${combo} COMBO` : "";
    this.shoutCombo.hidden = combo < 3;
    this.shoutBubble.classList.remove("pop");
    void this.shoutBubble.offsetWidth; // reflow so the animation restarts
    this.shoutBubble.classList.add("pop");

    let shown = 0;
    this.shoutText.textContent = "";
    const step = Math.max(10, TYPE_MS / text.length);
    this._typeTimer = setInterval(() => {
      shown++;
      this.shoutText.textContent = text.slice(0, shown);
      if (shown >= text.length) clearInterval(this._typeTimer);
    }, step);
    this._shoutTimer = setTimeout(() => this.hideShout(), TYPE_MS + HOLD_MS);
  }

  hideShout() {
    clearTimeout(this._shoutTimer);
    clearInterval(this._typeTimer);
    this.shoutVisible = false;
    if (this.shoutEl) this.shoutEl.hidden = true;
  }

  /** Anchor the bubble tail at a screen point, kept inside the viewport. */
  positionShout(x, y) {
    if (!this.shoutEl) return;
    const halfW = this.shoutEl.offsetWidth / 2;
    const h = this.shoutEl.offsetHeight;
    const pad = 8;
    const cx = Math.min(Math.max(x, halfW + pad), window.innerWidth - halfW - pad);
    const cy = Math.min(Math.max(y, h + pad), window.innerHeight - pad);
    this.shoutEl.style.left = `${cx}px`;
    this.shoutEl.style.top = `${cy}px`;
  }

  /** "USE THE REPO." slam plus confetti. */
  showFinale(text) {
    if (!this.finaleEl) return;
    this.hideFinale();
    this.finaleText.textContent = text;
    this.finaleEl.hidden = false;
    this.finaleText.classList.remove("slam");
    void this.finaleText.offsetWidth;
    this.finaleText.classList.add("slam");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pieces = Array.from({ length: CONFETTI_COUNT }, () => {
      const el = document.createElement("i");
      el.className = "confetti";
      el.style.left = `${Math.random() * 100}vw`;
      el.style.background =
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      el.style.animationDelay = `${Math.random() * 0.6}s`;
      el.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
      el.style.setProperty("--drift", `${(Math.random() - 0.5) * 30}vw`);
      el.style.setProperty("--spin", `${(Math.random() - 0.5) * 1440}deg`);
      return el;
    });
    this.finaleEl.append(...pieces);
    this._confettiTimer = setTimeout(() => pieces.forEach((p) => p.remove()), CONFETTI_MS);
  }

  hideFinale() {
    clearTimeout(this._confettiTimer);
    if (!this.finaleEl) return;
    this.finaleEl.querySelectorAll(".confetti").forEach((p) => p.remove());
    this.finaleEl.hidden = true;
  }

  setDeskDistance(m) {
    if (this.deskEl) this.deskEl.textContent = String(Math.ceil(m));
  }

  showPlaying() {
    this.overlay.hidden = true;
    if (this.pauseOverlay) this.pauseOverlay.hidden = true;
    this.hud.hidden = false;
  }

  showPaused(onResume) {
    if (this.pauseOverlay) {
      this.pauseOverlay.hidden = false;
      if (this.resumeBtn) {
        this.resumeBtn.onclick = () => onResume?.();
        this.resumeBtn.focus();
      }
    }
  }

  hidePaused() {
    if (this.pauseOverlay) this.pauseOverlay.hidden = true;
  }

  setScore(score, coins) {
    this.scoreEl.textContent = String(Math.floor(score));
    this.coinEl.textContent = String(coins);
  }
}
