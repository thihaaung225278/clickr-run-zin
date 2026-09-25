import * as THREE from "three";

/** Sign textures keyed by "title|line"; shared by every sign, never disposed. */
const cache = new Map();

const W = 768;
const H = 264;
const FONT = '"Outfit", system-ui, sans-serif';

export function labelTexture(title, line) {
  const key = `${title}|${line}`;
  let tex = cache.get(key);
  if (tex) return tex;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "rgba(27, 27, 26, 0.9)";
  ctx.strokeStyle = "#ff6900";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.roundRect(9, 9, W - 18, H - 18, 40);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff6900";
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText(title, W / 2, 86);

  // Shrink the quote until it fits the bubble
  const quote = `"${line}"`;
  let size = 56;
  do {
    ctx.font = `600 ${size}px ${FONT}`;
    size -= 2;
  } while (ctx.measureText(quote).width > W - 70 && size > 26);
  ctx.fillStyle = "#fbf5e8";
  ctx.fillText(quote, W / 2, 182);

  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** Fog-free sprite so signs read from the moment they spawn. */
export function makeLabel(title, line) {
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: labelTexture(title, line),
      transparent: true,
      toneMapped: false,
      fog: false,
    })
  );
}
