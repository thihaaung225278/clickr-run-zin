import * as THREE from "three";
import { COLORS, LANE_X, TEAMMATES } from "./constants.js";
import { labelTexture, makeLabel } from "./labels.js";

const SIGN_W = 2.3; // under lane width (2.4) so a wall of signs doesn't overlap
const SIGN_H = 0.8;
const POP_MS = 250;

/**
 * Obstacle kinds:
 * - barrier: low — must jump
 * - beam: high — must slide
 * - pillar: full lane block — must change lane
 * - coin: collectible
 *
 * Every block is a teammate with a floating sign (name + line). Blocks that
 * share a z form a row: the runner shouts once as he approaches the row, and
 * each sign flips to the teammate's reply once he is past it.
 */
export class ObstacleManager {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.rows = [];
    this._nextSpawnZ = -32;
    this._spawnGap = 18;
    this._box = new THREE.Box3();
    this._pending = [];
    this._bag = [];
    this._lastTeammate = null;
    this._finishZ = -Infinity;
  }

  reset() {
    this.items.forEach((item) => this._dispose(item));
    this.items = [];
    this.rows = [];
    this._bag = []; // each run starts a fresh cycle of teammates
    this._nextSpawnZ = -32;
    this._spawnGap = 18;
  }

  /** No patterns spawn within 40 units of the desk (pattern depth + run-up). */
  setFinish(z) {
    this._finishZ = z;
  }

  /**
   * @param leadDistance shout this far before a row (speed × reaction time)
   * @param events { onCoin, onHit, onShout, onDodge }
   */
  update(playerZ, playerHitbox, distance, leadDistance, events) {
    this.items = this.items.filter((item) => {
      if (item.root.position.z > playerZ + 12) {
        this._dispose(item);
        return false;
      }
      return true;
    });
    this.rows = this.rows.filter((row) => row.z <= playerZ + 12);

    const ahead = playerZ - 90;
    while (this._nextSpawnZ > ahead && this._nextSpawnZ > this._finishZ + 40) {
      this._spawnPattern(this._nextSpawnZ);
      // Wider gaps; slow tighten with distance
      const gap = Math.max(14, 20 - distance * 0.004);
      this._nextSpawnZ -= gap;
    }

    for (const row of this.rows) {
      if (!row.shouted && playerZ - row.z <= leadDistance) {
        row.shouted = true;
        events.onShout?.();
      }
    }

    const now = performance.now();
    for (const item of this.items) {
      if (item.collected) continue;

      if (item.kind === "coin") {
        item.root.rotation.y += 0.05;
        item.root.position.y =
          item.baseY + Math.sin(now * 0.006 + item.phase) * 0.12;
      } else {
        this._updateSign(item, playerZ, now, events);
      }

      const box = this._bounds(item);
      if (!box.intersectsBox(playerHitbox)) continue;

      if (item.kind === "coin") {
        item.collected = true;
        item.root.visible = false;
        events.onCoin?.(1);
      } else if (this._hitsObstacle(item, playerHitbox)) {
        events.onHit?.(item.kind, item.teammate);
        return true;
      }
    }
    return false;
  }

  /** Scale up far signs so they read early; flip to the reply once passed. */
  _updateSign(item, playerZ, now, events) {
    const z = item.root.position.z;
    if (!item.replied && playerZ < z - 1) {
      item.replied = true;
      item.popAt = now;
      item.label.material.map = labelTexture(item.teammate.name, item.teammate.reply);
      events.onDodge?.(item.teammate);
    }
    const ahead = playerZ - z;
    const far = 1 + THREE.MathUtils.clamp((ahead - 15) / 30, 0, 0.6);
    const pop = 1 + 0.35 * Math.max(0, 1 - (now - item.popAt) / POP_MS);
    item.label.scale.set(SIGN_W * far * pop, SIGN_H * far * pop, 1);
  }

  /** Jump clears barriers; slide clears beams. */
  _hitsObstacle(item, playerHitbox) {
    if (item.kind === "barrier") {
      // cleared if player bottom is above barrier top
      return playerHitbox.min.y < 0.85;
    }
    if (item.kind === "beam") {
      // cleared if player top is below beam bottom
      return playerHitbox.max.y > 1.15;
    }
    return true;
  }

  _spawnPattern(z) {
    this._pending = [];
    this._spawnObstacles(z);
    const blocks = this._pending;
    this._pending = [];

    for (const item of blocks) {
      const rowZ = item.root.position.z;
      let row = this.rows.find((r) => r.z === rowZ);
      if (!row) {
        row = { z: rowZ, items: [], shouted: false };
        this.rows.push(row);
      }
      row.items.push(item);

      item.teammate = this._nextTeammate();
      item.label = makeLabel(item.teammate.name, item.teammate.line);
      // Alternate heights inside a row so neighbouring signs don't collide
      const y = row.items.length % 2 === 0 ? 3.9 : 2.9;
      item.label.position.set(item.root.position.x, y, rowZ);
      item.label.scale.set(SIGN_W, SIGN_H, 1);
      this.scene.add(item.label);
    }
  }

  /** Shuffle-bag: every teammate appears once per cycle, no back-to-back repeat. */
  _nextTeammate() {
    if (!this._bag.length) {
      this._bag = [...TEAMMATES].sort(() => Math.random() - 0.5);
      if (this._bag[this._bag.length - 1] === this._lastTeammate) this._bag.reverse();
    }
    this._lastTeammate = this._bag.pop();
    return this._lastTeammate;
  }

  _spawnObstacles(z) {
    const roll = Math.random();
    // Mostly single-lane obstacles + coin stretches
    if (roll < 0.32) {
      const lane = Math.floor(Math.random() * 3);
      this._add("barrier", lane, z);
      this._maybeCoins(z - 4, lane);
    } else if (roll < 0.58) {
      const lane = Math.floor(Math.random() * 3);
      this._add("beam", lane, z);
      this._maybeCoins(z - 3, lane);
    } else if (roll < 0.72) {
      const lane = Math.floor(Math.random() * 3);
      this._add("pillar", lane, z);
      this._maybeCoins(z - 4, (lane + 1) % 3);
    } else if (roll < 0.82) {
      // Mild two-lane block (one lane always free)
      const free = Math.floor(Math.random() * 3);
      for (let i = 0; i < 3; i++) {
        if (i !== free) this._add("barrier", i, z);
      }
      this._maybeCoins(z - 5, free);
    } else if (roll < 0.9) {
      // Gentle stagger with extra spacing
      this._add("barrier", 0, z);
      this._add("beam", 2, z - 8);
    } else {
      for (let i = 0; i < 3; i++) this._add("coin", i, z - i * 2);
    }
  }

  _maybeCoins(z, lane) {
    if (Math.random() > 0.35) return;
    for (let i = 0; i < 4; i++) this._add("coin", lane, z - i * 1.9);
  }

  _add(kind, lane, z) {
    const root = new THREE.Group();
    root.position.set(LANE_X[lane], 0, z);
    let mesh;
    let baseY = 0.5;

    if (kind === "barrier") {
      // Jump block — black body + Clickr orange hazard top
      const black = new THREE.MeshStandardMaterial({
        color: COLORS.clickrDark,
        roughness: 0.55,
        metalness: 0.25,
      });
      const orange = new THREE.MeshStandardMaterial({
        color: COLORS.clickrOrange,
        emissive: COLORS.clickrOrange,
        emissiveIntensity: 0.55,
        roughness: 0.4,
        metalness: 0.15,
      });

      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 0.5), black);
      mesh.position.y = 0.28;

      const band = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.14, 0.56), orange);
      band.position.y = 0.62;

      const tip = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.42), black);
      tip.position.y = 0.73;

      // Side orange accents
      const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.52), orange);
      sideL.position.set(-0.86, 0.28, 0);
      const sideR = sideL.clone();
      sideR.position.x = 0.86;

      root.add(mesh, band, tip, sideL, sideR);
      baseY = 0.35;
    } else if (kind === "beam") {
      // Slide beam — black posts + glowing Clickr orange bar
      const black = new THREE.MeshStandardMaterial({
        color: COLORS.clickrDark,
        roughness: 0.5,
        metalness: 0.3,
      });
      const orange = new THREE.MeshStandardMaterial({
        color: COLORS.clickrOrange,
        emissive: COLORS.clickrOrange,
        emissiveIntensity: 0.7,
        roughness: 0.35,
        metalness: 0.2,
      });

      const posts = [-0.72, 0.72].map((x) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.75, 0.16), black);
        post.position.set(x, 0.88, 0);
        const ring = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), orange);
        ring.position.set(x, 1.55, 0);
        return [post, ring];
      }).flat();

      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.28, 0.28), orange);
      mesh.position.y = 1.55;

      const railTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.32), black);
      railTop.position.y = 1.72;
      const railBot = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.32), black);
      railBot.position.y = 1.38;

      root.add(...posts, mesh, railTop, railBot);
      baseY = 1.55;
    } else if (kind === "pillar") {
      // Lane block — black shaft + Clickr orange hazard bands (match barrier/beam)
      const black = new THREE.MeshStandardMaterial({
        color: COLORS.clickrDark,
        roughness: 0.55,
        metalness: 0.25,
      });
      const orange = new THREE.MeshStandardMaterial({
        color: COLORS.clickrOrange,
        emissive: COLORS.clickrOrange,
        emissiveIntensity: 0.55,
        roughness: 0.4,
        metalness: 0.15,
      });

      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 2.2, 12), black);
      mesh.position.y = 1.1;

      const bandMid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.22, 12),
        orange
      );
      bandMid.position.y = 1.1;

      const bandTop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48, 0.48, 0.16, 12),
        orange
      );
      bandTop.position.y = 1.85;

      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.1), orange);
      cap.position.y = 2.25;

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 1.05), black);
      base.position.y = 0.09;

      root.add(mesh, bandMid, bandTop, cap, base);
      baseY = 1.1;
    } else {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16),
        new THREE.MeshStandardMaterial({
          color: COLORS.gold,
          emissive: COLORS.gold,
          emissiveIntensity: 0.45,
          metalness: 0.7,
          roughness: 0.25,
        })
      );
      mesh.rotation.x = Math.PI / 2;
      root.position.y = 1.1;
      root.add(mesh);
      baseY = 1.1;
    }

    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    this.scene.add(root);
    const item = {
      kind,
      lane,
      root,
      baseY,
      phase: Math.random() * Math.PI * 2,
      collected: false,
      teammate: null,
      label: null,
      replied: false,
      popAt: -Infinity,
    };
    this.items.push(item);
    if (kind !== "coin") this._pending.push(item);
  }

  _bounds(item) {
    const p = item.root.position;
    if (item.kind === "barrier") {
      this._box.min.set(p.x - 0.75, 0, p.z - 0.28);
      this._box.max.set(p.x + 0.75, 0.85, p.z + 0.28);
    } else if (item.kind === "beam") {
      this._box.min.set(p.x - 0.8, 1.15, p.z - 0.25);
      this._box.max.set(p.x + 0.8, 1.85, p.z + 0.25);
    } else if (item.kind === "pillar") {
      this._box.min.set(p.x - 0.5, 0, p.z - 0.5);
      this._box.max.set(p.x + 0.5, 2.3, p.z + 0.5);
    } else {
      const y = p.y;
      this._box.min.set(p.x - 0.4, y - 0.25, p.z - 0.4);
      this._box.max.set(p.x + 0.4, y + 0.25, p.z + 0.4);
    }
    return this._box;
  }

  _dispose(item) {
    if (item.label) {
      this.scene.remove(item.label);
      item.label.material.dispose(); // map is cached in labels.js, keep it
    }
    this.scene.remove(item.root);
    item.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
