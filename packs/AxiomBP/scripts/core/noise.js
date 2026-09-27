// Klassisches Perlin-Rauschen (3D) + fraktales Rauschen für Maler, Felsen & Rauheit.

const perm = new Uint8Array(512);
let currentSeed = -1;

/** @param {number} seed */
export function seedNoise(seed) {
  if (seed === currentSeed) return;
  currentSeed = seed;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = (seed * 2654435761) >>> 0 || 1;
  for (let i = 255; i > 0; i--) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    const j = s % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
seedNoise(1337);

/** @param {number} t */
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
/** @param {number} a @param {number} b @param {number} t */
const lerp = (a, b, t) => a + t * (b - a);
/** @param {number} h @param {number} x @param {number} y @param {number} z */
function grad(h, x, y, z) {
  const k = h & 15;
  const u = k < 8 ? x : y;
  const w = k < 4 ? y : k === 12 || k === 14 ? x : z;
  return ((k & 1) === 0 ? u : -u) + ((k & 2) === 0 ? w : -w);
}

/**
 * Perlin-Rauschen im Bereich ca. -1..1
 * @param {number} x @param {number} y @param {number} z
 */
export function perlin(x, y, z) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = perm[X] + Y;
  const AA = perm[A] + Z;
  const AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y;
  const BA = perm[B] + Z;
  const BB = perm[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u), lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
    lerp(
      lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
      lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u),
      v
    ),
    w
  );
}

/**
 * Fraktales Rauschen (mehrere Oktaven), Ergebnis ca. -1..1
 * @param {number} x @param {number} y @param {number} z
 * @param {number} [octaves]
 */
export function fbm(x, y, z, octaves = 3) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += perlin(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
