// Kleine Vektor-Hilfen für ganzzahlige Blockkoordinaten.

/** @typedef {{x:number,y:number,z:number}} V3 */

/** @param {number} x @param {number} y @param {number} z @returns {V3} */
export const v = (x, y, z) => ({ x, y, z });
/** @param {V3} a @param {V3} b */
export const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
/** @param {V3} a @param {V3} b */
export const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
/** @param {V3} a @param {number} s */
export const mul = (a, s) => v(a.x * s, a.y * s, a.z * s);
/** @param {V3} a */
export const floor = (a) => v(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z));
/** @param {V3} a */
export const len = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
/** @param {V3} a @param {V3} b */
export const dist = (a, b) => len(sub(a, b));
/** @param {V3} a @param {V3} b */
export const eq = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
/** @param {V3} a @param {V3} b */
export const vmin = (a, b) => v(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
/** @param {V3} a @param {V3} b */
export const vmax = (a, b) => v(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
/** @param {V3} a */
export const key = (a) => `${a.x},${a.y},${a.z}`;
/** @param {number} x @param {number} y @param {number} z */
export const k3 = (x, y, z) => `${x},${y},${z}`;
/** @param {string} s @returns {V3} */
export const unkey = (s) => {
  const p = s.split(",");
  return v(+p[0], +p[1], +p[2]);
};
/** @param {V3} a */
export const fmt = (a) => `${a.x} ${a.y} ${a.z}`;
/** @param {V3} min @param {V3} max */
export const volume = (min, max) => (max.x - min.x + 1) * (max.y - min.y + 1) * (max.z - min.z + 1);

/** Richtungsvektoren für die Block-Seiten (Direction-Enum als String). */
export const FACE_VEC = {
  Up: v(0, 1, 0),
  Down: v(0, -1, 0),
  North: v(0, 0, -1),
  South: v(0, 0, 1),
  East: v(1, 0, 0),
  West: v(-1, 0, 0),
};

/** Die sechs direkten Nachbarn. */
export const NEIGHBORS6 = [v(1, 0, 0), v(-1, 0, 0), v(0, 1, 0), v(0, -1, 0), v(0, 0, 1), v(0, 0, -1)];

/**
 * Nächste Hauptachse (Himmelsrichtung oder oben/unten) zur Blickrichtung.
 * @param {V3} dir
 * @param {boolean} [horizontalOnly]
 * @returns {V3}
 */
export function cardinal(dir, horizontalOnly = false) {
  const ax = Math.abs(dir.x);
  const ay = horizontalOnly ? -1 : Math.abs(dir.y);
  const az = Math.abs(dir.z);
  if (ay >= ax && ay >= az) return v(0, Math.sign(dir.y) || 1, 0);
  if (ax >= az) return v(Math.sign(dir.x) || 1, 0, 0);
  return v(0, 0, Math.sign(dir.z) || 1);
}

/** @param {V3} d */
export function dirName(d) {
  if (d.y > 0) return "oben";
  if (d.y < 0) return "unten";
  if (d.x > 0) return "Osten";
  if (d.x < 0) return "Westen";
  if (d.z > 0) return "Süden";
  return "Norden";
}
