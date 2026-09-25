import * as THREE from "three";
import { Humanoid } from "./Humanoid.js";
import { LANE_X, GROUND_Y } from "./constants.js";

const JUMP_HEIGHT = 1.65;
const JUMP_DURATION = 0.68;
const SLIDE_DURATION = 0.68;
/** Full dodge length (lean + slide + recover) */
const LANE_DURATION = 0.32;
/** Max body bank (radians) toward the dodge side */
const LEAN_MAX = 0.42;

export class Player {
  constructor(scene) {
    this.humanoid = new Humanoid();
    this.root = this.humanoid.root;
    this.root.position.set(0, GROUND_Y, 0);
    this.root.rotation.y = 0; // Soldier forward aligns with −Z run
    scene.add(this.root);

    this.ready = this.humanoid.ready;

    this.lane = 1;
    this.targetX = LANE_X[1];
    this._laneFromX = LANE_X[1];
    this._laneProgress = 1; // 1 = settled on target lane
    this._laneDir = 0; // -1 left, +1 right
    this.y = 0;
    this.z = 0;

    this.state = "run"; // run | jump | slide
    this.stateTime = 0;
    this.alive = true;

    this._hitbox = new THREE.Box3();
  }

  reset() {
    this.lane = 1;
    this.targetX = LANE_X[1];
    this._laneFromX = LANE_X[1];
    this._laneProgress = 1;
    this._laneDir = 0;
    this.y = 0;
    this.z = 0;
    this.state = "run";
    this.stateTime = 0;
    this.alive = true;
    this.root.position.set(0, GROUND_Y, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);
    this.humanoid.pivot.rotation.z = 0;
    this.humanoid.setPose("run");
  }

  handleAction(action) {
    if (!this.alive) return;
    if (action === "left" && this.lane > 0) {
      this._beginLaneChange(this.lane - 1);
    } else if (action === "right" && this.lane < 2) {
      this._beginLaneChange(this.lane + 1);
    } else if (action === "jump" && this.state === "run") {
      this.state = "jump";
      this.stateTime = 0;
      this.humanoid.setPose("jump");
    } else if (action === "slide" && this.state === "run") {
      this.state = "slide";
      this.stateTime = 0;
      this.humanoid.setPose("slide");
    }
  }

  /** End of run: cancel jump/slide and ease into the centre lane. */
  finishRun() {
    this.state = "run";
    this.stateTime = 0;
    this.y = 0;
    this.humanoid.setPose("run");
    if (this.lane !== 1) this._beginLaneChange(1);
  }

  _beginLaneChange(nextLane) {
    this._laneFromX = this.root.position.x;
    this.lane = nextLane;
    this.targetX = LANE_X[nextLane];
    this._laneDir = Math.sign(this.targetX - this._laneFromX) || 0;
    this._laneProgress = 0;
  }

  /**
   * Lean first, then slide: ramp bank early, hold, recover late.
   * t in [0,1]
   */
  _leanAmount(t) {
    if (t < 0.18) return t / 0.18;
    if (t < 0.62) return 1;
    return Math.max(0, 1 - (t - 0.62) / 0.38);
  }

  /**
   * Lateral move delayed until lean is visible, then ease-in-out.
   * t in [0,1]
   */
  _moveAmount(t) {
    const u = THREE.MathUtils.clamp((t - 0.14) / 0.86, 0, 1);
    return u * u * (3 - 2 * u);
  }

  update(dt, speedFactor) {
    if (!this.alive) return;

    let leanZ = 0;
    if (this._laneProgress < 1) {
      this._laneProgress = Math.min(1, this._laneProgress + dt / LANE_DURATION);
      const t = this._laneProgress;
      this.root.position.x = THREE.MathUtils.lerp(
        this._laneFromX,
        this.targetX,
        this._moveAmount(t)
      );
      // Camera behind: +Z roll tips toward −X (left), −Z toward +X (right)
      leanZ = -this._laneDir * LEAN_MAX * this._leanAmount(t);
    } else {
      this.root.position.x = this.targetX;
      leanZ = 0;
    }

    if (this.state === "jump") {
      this.stateTime += dt;
      const t = Math.min(1, this.stateTime / JUMP_DURATION);
      this.y = Math.sin(t * Math.PI) * JUMP_HEIGHT;
      if (t >= 1) {
        this.state = "run";
        this.y = 0;
        this.humanoid.setPose("run");
      }
    } else if (this.state === "slide") {
      this.stateTime += dt;
      this.y = 0;
      if (this.stateTime >= SLIDE_DURATION) {
        this.state = "run";
        this.humanoid.setPose("run");
      }
    } else {
      this.y = 0;
    }

    this.root.position.y = GROUND_Y + this.y;
    this.humanoid.update(dt, speedFactor);
    // Apply after humanoid.update so pose code doesn't wipe the bank
    this.humanoid.pivot.rotation.z = THREE.MathUtils.damp(
      this.humanoid.pivot.rotation.z,
      leanZ,
      18,
      dt
    );
  }

  /** World-space AABB for collision (tighter when sliding / jumping). */
  getHitbox() {
    const p = this.root.position;
    let minY = p.y + 0.05;
    let maxY = p.y + 1.85;
    let halfW = 0.32;
    let halfD = 0.28;

    if (this.state === "slide") {
      minY = p.y + 0.02;
      maxY = p.y + 0.85;
      halfD = 0.4;
    } else if (this.state === "jump") {
      minY = p.y + 0.2;
      maxY = p.y + 1.75;
    }

    this._hitbox.min.set(p.x - halfW, minY, p.z - halfD);
    this._hitbox.max.set(p.x + halfW, maxY, p.z + halfD);
    return this._hitbox;
  }
}
