import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { COLORS } from "./constants.js";

/**
 * Mixamo Soldier (three.js webgl_animation_walk) with Idle/Walk/Run clips.
 * Jump/slide approximated via pivot tilt — clips not in Soldier.glb.
 * Falls back to procedural mesh if GLB fails to load.
 */
export class Humanoid {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = "Humanoid";
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);

    this.mixer = null;
    this.actions = null;
    this._current = "Idle";
    this._pose = "idle";
    this._loaded = false;
    this._fade = 0.2;

    // Smooth jump/slide recover (avoids bind-pose arm flare)
    this._pivotRotX = 0;
    this._pivotPosY = 0;
    this._timeScale = 1;
    this._pivotRotXTarget = 0;
    this._pivotPosYTarget = 0;
    this._timeScaleTarget = 1;
    this._poseSmooth = 10;

    this.ready = this._loadSoldier().catch(() => {
      this._buildProcedural();
      this._loaded = true;
    });
  }

  async _loadSoldier() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync("/models/Soldier.glb");
    const model = gltf.scene;

    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (object.name === "vanguard_Mesh") {
        object.material.metalness = 1.0;
        object.material.roughness = 0.35;
        object.material.color.set(1, 1, 1);
        if (object.material.map) {
          object.material.metalnessMap = object.material.map;
        }
      } else {
        object.material.metalness = 1;
        object.material.roughness = 0.15;
        object.material.transparent = true;
        object.material.opacity = 0.85;
        object.material.color.set(1, 1, 1);
      }
    });

    model.scale.setScalar(1);
    this.pivot.add(model);
    this.model = model;

    const animations = gltf.animations;
    this.mixer = new THREE.AnimationMixer(model);

    const byName = Object.fromEntries(
      animations.map((clip) => [clip.name, clip])
    );

    const idleClip = byName.Idle || animations[0];
    const runClip = byName.Run || animations[1];
    const walkClip = byName.Walk || animations[3] || runClip;

    this.actions = {
      Idle: this.mixer.clipAction(idleClip),
      Walk: this.mixer.clipAction(walkClip),
      Run: this.mixer.clipAction(runClip),
    };

    // Match three.js walk example: enable all, only Idle starts at weight 1
    for (const name of Object.keys(this.actions)) {
      const a = this.actions[name];
      a.enabled = true;
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = false;
      a.setEffectiveTimeScale(1);
      a.setEffectiveWeight(0);
    }

    this.actions.Idle.setEffectiveWeight(1);
    this.actions.Idle.play();
    this._current = "Idle";
    this._loaded = true;
    this.setPose("idle");
  }

  setPose(pose) {
    this._pose = pose;
    if (!this.actions) {
      this._proceduralPose(pose);
      return;
    }

    if (pose === "run") {
      this._fadeTo("Run");
      this._pivotRotXTarget = 0.06;
      this._pivotPosYTarget = 0;
      this._timeScaleTarget = 1.35;
    } else if (pose === "jump") {
      // Keep Run bones moving lightly; slow timescale for a hop feel
      this._fadeTo("Run");
      this._pivotRotXTarget = -0.15;
      this._pivotPosYTarget = 0;
      this._timeScaleTarget = 0.15;
    } else if (pose === "slide") {
      this._fadeTo("Run");
      this._pivotRotXTarget = 1.05;
      this._pivotPosYTarget = -0.35;
      this._timeScaleTarget = 0.4;
    } else if (pose === "sit") {
      // No sit clip: drop the Idle body into the chair
      this._fadeTo("Idle");
      this._pivotRotXTarget = -0.1;
      this._pivotPosYTarget = -0.45;
      this._timeScaleTarget = 1;
    } else {
      this._fadeTo("Idle");
      this._pivotRotXTarget = 0;
      this._pivotPosYTarget = 0;
      this._timeScaleTarget = 1;
    }
  }

  /**
   * Cross-fade only when switching clips. Staying on the same clip
   * keeps weight — fadeIn(from 0) would flash bind-pose (arms wide).
   */
  _fadeTo(name) {
    if (!this.actions) return;
    const next = this.actions[name];
    if (!next) return;

    const alreadyOn =
      this._current === name &&
      next.isRunning() &&
      next.getEffectiveWeight() > 0.5;

    for (const key of Object.keys(this.actions)) {
      if (key === name) continue;
      const other = this.actions[key];
      other.stopFading();
      if (other.getEffectiveWeight() > 0.01) other.fadeOut(this._fade);
      else other.setEffectiveWeight(0);
    }

    if (alreadyOn) {
      next.stopFading();
      next.enabled = true;
      next.setEffectiveWeight(1);
      return;
    }

    next.stopFading();
    if (this._current !== name) next.reset();
    this._current = name;
    next.enabled = true;
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.setEffectiveWeight(1);
    next.fadeIn(this._fade);
    next.play();
  }

  update(dt, speedFactor = 0) {
    if (this.mixer) {
      let scaleTarget = this._timeScaleTarget;
      if (this._pose === "run") {
        scaleTarget = 1.25 + speedFactor * 0.55;
        // Keep Run dominant every frame while running
        if (this.actions?.Run && this.actions.Run.getEffectiveWeight() < 0.95) {
          this.actions.Run.stopFading();
          this.actions.Run.setEffectiveWeight(1);
          this.actions.Idle.setEffectiveWeight(0);
          if (this.actions.Walk) this.actions.Walk.setEffectiveWeight(0);
        }
      }

      this._timeScale = THREE.MathUtils.damp(
        this._timeScale,
        scaleTarget,
        this._poseSmooth,
        dt
      );
      this._pivotRotX = THREE.MathUtils.damp(
        this._pivotRotX,
        this._pivotRotXTarget,
        this._poseSmooth,
        dt
      );
      this._pivotPosY = THREE.MathUtils.damp(
        this._pivotPosY,
        this._pivotPosYTarget,
        this._poseSmooth,
        dt
      );

      this.pivot.rotation.x = this._pivotRotX;
      this.pivot.position.y = this._pivotPosY;

      const active = this.actions?.[this._current];
      if (active) active.setEffectiveTimeScale(this._timeScale);

      this.mixer.update(dt);
      return;
    }
    this._proceduralUpdate(dt, speedFactor);
  }

  /* —— Procedural fallback (load failure) —— */

  _buildProcedural() {
    const box = (w, h, d, color) =>
      new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.65 })
      );

    this.torso = box(0.42, 0.55, 0.28, COLORS.shirt);
    this.torso.position.y = 1.15;
    this.pivot.add(this.torso);

    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.55 })
    );
    this.head.position.y = 1.58;
    this.pivot.add(this.head);

    this.armL = box(0.12, 0.5, 0.12, COLORS.skin);
    this.armR = box(0.12, 0.5, 0.12, COLORS.skin);
    this.armL.position.set(-0.3, 1.15, 0);
    this.armR.position.set(0.3, 1.15, 0);
    this.legL = box(0.14, 0.7, 0.14, COLORS.pants);
    this.legR = box(0.14, 0.7, 0.14, COLORS.pants);
    this.legL.position.set(-0.12, 0.35, 0);
    this.legR.position.set(0.12, 0.35, 0);
    this.pivot.add(this.armL, this.armR, this.legL, this.legR);
    this.pivot.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this._phase = 0;
  }

  _proceduralPose(pose) {
    if (!this.torso) return;
    if (pose === "slide") {
      this._pivotRotXTarget = 0.55;
      this._pivotPosYTarget = -0.2;
    } else if (pose === "jump") {
      this._pivotRotXTarget = -0.1;
      this._pivotPosYTarget = 0;
    } else if (pose === "sit") {
      this._pivotRotXTarget = -0.1;
      this._pivotPosYTarget = -0.45;
    } else {
      this._pivotRotXTarget = 0.08;
      this._pivotPosYTarget = 0;
    }
  }

  _proceduralUpdate(dt, speedFactor) {
    if (!this.armL) return;
    this._phase = (this._phase || 0) + dt * (8 + speedFactor * 4);

    this._pivotRotX = THREE.MathUtils.damp(
      this._pivotRotX,
      this._pivotRotXTarget,
      this._poseSmooth,
      dt
    );
    this._pivotPosY = THREE.MathUtils.damp(
      this._pivotPosY,
      this._pivotPosYTarget,
      this._poseSmooth,
      dt
    );
    this.pivot.rotation.x = this._pivotRotX;
    this.pivot.position.y = this._pivotPosY;

    if (this._pose !== "run") return;
    const swing = Math.sin(this._phase);
    this.armL.rotation.x = swing * 0.9;
    this.armR.rotation.x = -swing * 0.9;
    this.legL.rotation.x = -swing * 0.85;
    this.legR.rotation.x = swing * 0.85;
  }
}
