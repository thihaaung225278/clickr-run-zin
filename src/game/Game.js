import * as THREE from "three";
import { Input } from "./Input.js";
import { Player } from "./Player.js";
import { Track } from "./Track.js";
import { ObstacleManager } from "./ObstacleManager.js";
import { ChaseCamera } from "./ChaseCamera.js";
import { UI } from "./UI.js";
import { GameAudio } from "./Audio.js";
import {
  COLORS,
  SHOUTS,
  COMBO_WINDOW,
  FINAL_LINE,
  FINISH_DISTANCE,
} from "./constants.js";
import { Starfield } from "./Starfield.js";
import { Desk, CHAIR_OFFSET } from "./Desk.js";

const BASE_SPEED = 9;
const MAX_SPEED = 20;
/** Runner stops at the chair, just short of the desk. */
const STOP_DISTANCE = FINISH_DISTANCE - CHAIR_OFFSET;
/** Start braking this far before the chair. */
const BRAKE_DISTANCE = 12;
/** Seated pause before the win screen. */
const WIN_DELAY = 2.8;
/** Shout this long before reaching a row. */
const SHOUT_LEAD = 0.35;
/** Head-bubble anchor above the runner. */
const HEAD_Y = 2.3;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ui = new UI();
    this.audio = new GameAudio();
    this.input = new Input(window);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    // Starfield sets scene.background to a starry canvas
    this.scene.fog = new THREE.FogExp2(COLORS.fog, 0.014);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );

    this._setupLights();
    this.stars = new Starfield(this.scene);

    this.track = new Track(this.scene);
    this.player = new Player(this.scene);
    this.obstacles = new ObstacleManager(this.scene);
    this.desk = new Desk(this.scene);
    this.chase = new ChaseCamera(this.camera);

    this.mode = "menu"; // menu | playing | paused | dead | finishing | won
    this.score = 0;
    this.coins = 0;
    this.distance = 0;
    this.speed = BASE_SPEED;
    this._starting = false;
    this._decel = 0;
    this._seatedT = -1; // < 0 until Derick sits
    this._runT = 0;
    this._lastShoutT = -Infinity;
    this._combo = 0;
    this._head = new THREE.Vector3();
    this.stats = this._freshStats();
    // Built once so the per-frame update doesn't allocate closures
    this._events = {
      onCoin: (n) => {
        this.coins += n;
        this.audio.playCoin();
      },
      onHit: (kind, teammate) => this._gameOver(teammate),
      onShout: () => this._shout(),
      onDodge: (teammate) => {
        this.stats.dodged++;
        this.stats.counts[teammate.name] = (this.stats.counts[teammate.name] || 0) + 1;
      },
    };
    this._clock = new THREE.Clock();
    this._raf = 0;

    this._onResize = this._onResize.bind(this);
    this._onSystemKey = this._onSystemKey.bind(this);
    window.addEventListener("resize", this._onResize);
    window.addEventListener("keydown", this._onSystemKey);

    this.input.attach();
    this.chase.reset(this.player.root.position);
    this.ui.bindMute(() => {
      const muted = this.audio.toggleMute();
      this.ui.setMuteState(muted);
    });
    this.ui.bindVolume((v) => {
      this.audio.setMusicVolume(v);
      this.ui.setVolumeUI(v);
    });
    this.ui.bindSfxVolume((v) => {
      this.audio.setSfxVolume(v);
      this.ui.setSfxVolumeUI(v);
    });
    this.ui.setVolumeUI(this.audio.musicVolume);
    this.ui.setSfxVolumeUI(this.audio.sfxVolume);
    this.ui.setLoading(true);
    // Wait for fonts too: teammate labels are drawn to canvas once and cached
    Promise.allSettled([this.player.ready, document.fonts?.ready]).then(() => {
      this.humanoidIdle();
      this.ui.setLoading(false);
      this.ui.showStart(() => this.start());
    });
    this._loop();
  }

  humanoidIdle() {
    this.player.humanoid.setPose("idle");
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xf0f0f0, 0.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 0.95);
    sun.position.set(6, 14, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    this._sun = sun;

    const fill = new THREE.DirectionalLight(0xffffff, 0.28);
    fill.position.set(-8, 6, -4);
    this.scene.add(fill);

    const ambience = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambience);

    this._torchLight = new THREE.PointLight(COLORS.torch, 1.8, 14, 2);
    this._torchLight.position.set(0, 2.5, -2);
    this.scene.add(this._torchLight);
  }

  async start() {
    if (this._starting) return;
    this._starting = true;
    try {
      await this.audio.unlock();
      this.audio.stopMusic();
      await this.audio.startMusic();

      this.track.reset();
      this.obstacles.reset();
      this.obstacles.setFinish(-FINISH_DISTANCE);
      this.desk.reset();
      this.player.reset();
      this.input.clear();
      this.score = 0;
      this.coins = 0;
      this.distance = 0;
      this.speed = BASE_SPEED;
      this._decel = 0;
      this._seatedT = -1;
      this._runT = 0;
      this._lastShoutT = -Infinity;
      this._combo = 0;
      this.stats = this._freshStats();
      this.ui.hideFinale();
      this.ui.hideShout();
      this.mode = "playing";
      this.chase.reset(this.player.root.position);
      this.ui.showPlaying();
      this.ui.setScore(0, 0);
      this.ui.setDeskDistance(FINISH_DISTANCE);
      this.ui.setMuteState(this.audio.muted);
      this.ui.setVolumeUI(this.audio.musicVolume);
      this.ui.setSfxVolumeUI(this.audio.sfxVolume);
      this.ui.startBtn?.blur();
      this._clock.getDelta();
    } finally {
      this._starting = false;
    }
  }

  togglePause() {
    if (this.mode === "playing") {
      this.mode = "paused";
      this.input.clear();
      this.audio.pauseMusic();
      this.ui.showPaused(() => this.resume());
      return;
    }
    if (this.mode === "paused") {
      this.resume();
    }
  }

  resume() {
    if (this.mode !== "paused") return;
    this.mode = "playing";
    this.ui.hidePaused();
    this.ui.showPlaying();
    this.audio.resumeMusic();
    this.input.clear();
    this._clock.getDelta();
  }

  _onSystemKey(e) {
    if (e.repeat) return;

    // Start / restart from menu or game-over
    if (
      e.code === "Space" &&
      (this.mode === "menu" || this.mode === "dead" || this.mode === "won")
    ) {
      e.preventDefault();
      if (this.ui.startBtn?.disabled) return;
      this.start();
      return;
    }

    if (e.code === "CapsLock") {
      e.preventDefault();
      this.togglePause();
      return;
    }

    // Music volume: - / = (also NumpadAdd/Subtract)
    if (e.code === "Minus" || e.code === "NumpadSubtract") {
      e.preventDefault();
      const v = this.audio.adjustMusicVolume(-0.05);
      this.ui.setVolumeUI(v);
      return;
    }
    if (e.code === "Equal" || e.code === "NumpadAdd") {
      e.preventDefault();
      const v = this.audio.adjustMusicVolume(0.05);
      this.ui.setVolumeUI(v);
      return;
    }

    // SFX / coin volume: [ ]
    if (e.code === "BracketLeft") {
      e.preventDefault();
      const v = this.audio.adjustSfxVolume(-0.05);
      this.ui.setSfxVolumeUI(v);
      return;
    }
    if (e.code === "BracketRight") {
      e.preventDefault();
      const v = this.audio.adjustSfxVolume(0.05);
      this.ui.setSfxVolumeUI(v);
    }
  }

  _freshStats() {
    return { dodged: 0, shouts: 0, maxCombo: 0, counts: {} };
  }

  /** Quick dodges in a row escalate the shout. */
  _shout() {
    this._combo = this._runT - this._lastShoutT <= COMBO_WINDOW ? this._combo + 1 : 1;
    this._lastShoutT = this._runT;
    this.stats.shouts++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this._combo);
    let level = 0;
    SHOUTS.forEach((tier, i) => {
      if (this._combo >= tier.min) level = i;
    });
    this.ui.showShout(SHOUTS[level].text, { level: level + 1, combo: this._combo });
  }

  _winStats() {
    const [name, count] =
      Object.entries(this.stats.counts).sort((a, b) => b[1] - a[1])[0] || [];
    return {
      ...this.stats,
      mostDodged: name ? `${name} (${count})` : "nobody",
      score: this.score,
      coins: this.coins,
    };
  }

  _gameOver(teammate) {
    this.mode = "dead";
    this.player.alive = false;
    this.player.humanoid.setPose("idle");
    this.chase.shake(0.7);
    this.audio.playHit();
    this.audio.stopMusic();
    this.ui.showGameOver(this.score, this.coins, teammate, () => this.start());
  }

  _beginFinish() {
    this.mode = "finishing";
    this.input.clear();
    this.player.finishRun();
    const remaining = Math.max(0.01, STOP_DISTANCE - this.distance);
    // Constant deceleration that lands exactly on the chair at any speed
    this._decel = (this.speed * this.speed) / (2 * remaining);
  }

  _updateFinish(dt) {
    if (this._seatedT >= 0) {
      this._seatedT += dt;
      this.player.humanoid.update(dt, 0);
      this.desk.update(dt);
      if (this._seatedT >= WIN_DELAY) {
        this.mode = "won";
        this.ui.showWin(FINAL_LINE, this._winStats(), () => this.start());
      }
      return;
    }

    const remaining = Math.max(0, STOP_DISTANCE - this.distance);
    this.speed = Math.min(this.speed, Math.sqrt(2 * this._decel * remaining));
    const move = Math.min(remaining, this.speed * dt);
    this.player.root.position.z -= move;
    this.distance += move;
    this.score = this.distance * 1.2 + this.coins * 25;
    this.ui.setScore(this.score, this.coins);

    const speedFactor = Math.max(0, (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED));
    this.player.update(dt, speedFactor);
    this.track.update(this.player.root.position.z);
    this.ui.setDeskDistance(0);

    if (this.speed < 0.3 || remaining - move <= 0.01) {
      this.player.root.position.z = -STOP_DISTANCE;
      this.player.root.position.x = 0;
      this.distance = STOP_DISTANCE;
      this.player.humanoid.setPose("sit");
      this.audio.stopMusic();
      this.audio.playFanfare();
      this.ui.hideShout();
      this.ui.showFinale(FINAL_LINE);
      this.chase.shake(0.5);
      this.desk.showCameo(this.camera.aspect);
      this._seatedT = 0;
    }
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    const dt = Math.min(0.05, this._clock.getDelta());

    if (this.mode === "playing") {
      let action;
      while ((action = this.input.consume())) {
        const before = this.player.state;
        this.player.handleAction(action);
        if (action === "jump" && before === "run" && this.player.state === "jump") {
          this.audio.playJump();
        }
        if (action === "slide" && before === "run" && this.player.state === "slide") {
          this.audio.playSlide();
        }
      }

      this._runT += dt;
      this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.distance * 0.012);
      const move = this.speed * dt;
      this.player.root.position.z -= move;
      this.distance += move;
      this.score = this.distance * 1.2 + this.coins * 25;

      const speedFactor = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED || 1);
      this.player.update(dt, speedFactor);

      this.track.update(this.player.root.position.z);
      this.obstacles.update(
        this.player.root.position.z,
        this.player.getHitbox(),
        this.distance,
        this.speed * SHOUT_LEAD,
        this._events
      );

      this.ui.setScore(this.score, this.coins);
      this.ui.setDeskDistance(Math.max(0, FINISH_DISTANCE - this.distance));
      if (this.mode === "playing" && STOP_DISTANCE - this.distance <= BRAKE_DISTANCE) {
        this._beginFinish();
      }
    } else if (this.mode === "finishing") {
      this._updateFinish(dt);
    } else if (this.mode === "paused") {
      // Freeze gameplay; keep rendering last frame pose
    } else {
      this.player.humanoid.update(dt, 0);
      this.desk.update(dt);
    }

    const pp = this.player.root.position;
    this._sun.position.x = pp.x + 6;
    this._sun.position.z = pp.z + 4;
    this._sun.target.position.copy(pp);
    this._sun.target.updateMatrixWorld();
    this._torchLight.position.set(pp.x + 1.2, 2.4, pp.z - 3);

    this.stars.follow(pp);
    this.stars.update(this._clock.elapsedTime);

    this.chase.update(dt, pp, pp.x);
    if (this.ui.shoutVisible) {
      this._head.set(pp.x, pp.y + HEAD_Y, pp.z).project(this.camera);
      this.ui.positionShout(
        (this._head.x * 0.5 + 0.5) * window.innerWidth,
        (-this._head.y * 0.5 + 0.5) * window.innerHeight
      );
    }
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
