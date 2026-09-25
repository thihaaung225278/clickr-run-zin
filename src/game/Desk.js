import * as THREE from "three";
import { COLORS, FINISH_DISTANCE, TEAMMATES } from "./constants.js";
import { makeLabel } from "./labels.js";

/** Chair sits this far in front of the desk; the runner stops here. */
export const CHAIR_OFFSET = 1.2;

const CAMEO_STAGGER = 0.12; // s between each teammate popping in
const CAMEO_POP = 0.35; // s for one sign to scale in
const CAMEO_W = 2.1;
const CAMEO_H = 0.73;
const CAMEO_GAP_X = 2.3; // > CAMEO_W so neighbours never overlap
const CAMEO_ROWS_Y = [3.6, 2.6]; // row gap > CAMEO_H

/**
 * Derick's desk at the finish line. Centre lane, not collidable.
 * Chair back kept low so the chase camera still sees him seated.
 */
export class Desk {
  constructor(scene) {
    this.root = new THREE.Group();

    const dark = new THREE.MeshStandardMaterial({
      color: COLORS.clickrDark,
      roughness: 0.55,
      metalness: 0.25,
    });
    const orange = new THREE.MeshStandardMaterial({
      color: COLORS.clickrOrange,
      emissive: COLORS.clickrOrange,
      emissiveIntensity: 0.6,
      roughness: 0.4,
    });
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };

    // Desk (origin = desk centre)
    this.root.add(
      box(2.2, 0.08, 0.9, dark, 0, 0.78, 0),
      box(2.24, 0.04, 0.94, orange, 0, 0.84, 0),
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => box(0.08, 0.76, 0.08, dark, sx * 1.02, 0.38, sz * 0.38))
      ),
      // Monitor facing the chair (+Z)
      box(0.1, 0.3, 0.1, dark, 0, 1.0, -0.15),
      box(1.0, 0.6, 0.06, dark, 0, 1.4, -0.15),
      box(0.92, 0.52, 0.02, orange, 0, 1.4, -0.11)
    );

    // Chair at the runner's stop point
    const chair = new THREE.Group();
    chair.position.z = CHAIR_OFFSET;
    chair.add(
      box(0.6, 0.08, 0.55, dark, 0, 0.48, 0),
      box(0.08, 0.44, 0.08, dark, 0, 0.24, 0),
      box(0.6, 0.14, 0.06, orange, 0, 0.6, 0.28)
    );
    this.root.add(chair);

    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    scene.add(this.root);
    this._cameo = [];
    this._cameoT = 0;
    this._cameoFit = 1;
    this.reset();
  }

  reset() {
    this.hideCameo();
    this.root.position.set(0, 0, -FINISH_DISTANCE);
  }

  /**
   * All teammates pop up behind the desk with their reply: 2 rows of 3.
   * Narrow screens shrink the whole grid so no sign is cut off at the edge.
   */
  showCameo(aspect = 16 / 9) {
    this.hideCameo();
    this._cameoT = 0;
    this._cameoFit = THREE.MathUtils.clamp(aspect / 1.6, 0.5, 1);
    const perRow = Math.ceil(TEAMMATES.length / CAMEO_ROWS_Y.length);
    TEAMMATES.forEach((t, i) => {
      const label = makeLabel(t.name, t.reply);
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const x = (col - (perRow - 1) / 2) * CAMEO_GAP_X * this._cameoFit;
      const y = 1 + (CAMEO_ROWS_Y[row] - 1) * this._cameoFit;
      label.position.set(x, y, -3);
      label.scale.set(0.001, 0.001, 1);
      this.root.add(label);
      this._cameo.push(label);
    });
  }

  hideCameo() {
    this._cameo.forEach((label) => {
      this.root.remove(label);
      label.material.dispose(); // map is cached in labels.js
    });
    this._cameo = [];
  }

  update(dt) {
    if (!this._cameo.length) return;
    this._cameoT += dt;
    this._cameo.forEach((label, i) => {
      const t = THREE.MathUtils.clamp((this._cameoT - i * CAMEO_STAGGER) / CAMEO_POP, 0, 1);
      // Ease-out-back: slight overshoot for a bouncy pop
      const k = 1.7;
      const s = t === 0 ? 0.001 : 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2;
      const k2 = s * this._cameoFit;
      label.scale.set(CAMEO_W * k2, CAMEO_H * k2, 1);
    });
  }
}
