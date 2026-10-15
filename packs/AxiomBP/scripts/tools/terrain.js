// Terrain (Höhenkarte): Anheben, Absenken, Einebnen, Glätten, Hügel (Rauschen), Terrassen.
import { BlockPermutation } from "@minecraft/server";
import { runEdit } from "../core/edit.js";
import { air, isSolidId } from "../core/pattern.js";
import { fbm } from "../core/noise.js";
import { markDirty } from "../core/state.js";
import { err, msg, now, target } from "../core/util.js";
import { v } from "../core/vec.js";
import { spawn } from "../core/selection.js";
import { samplePath } from "./path.js";
import { Modal } from "../ui/forms.js";
import { strokeId } from "./registry.js";

export const TERRAIN_MODES = /** @type {[string,string][]} */ ([
  ["raise", "Anheben"],
  ["lower", "Absenken"],
  ["flatten", "Einebnen (auf Zielhöhe)"],
  ["smooth", "Höhen glätten"],
  ["hills", "Hügel / Rauschen"],
  ["terrace", "Terrassen (Stufen)"],
  ["mountain", "Stempel: Berg (ein Klick)"],
  ["crater", "Stempel: Krater (ein Klick)"],
  ["volcano", "Stempel: Vulkan (ein Klick)"],
  ["mesa", "Stempel: Hochplateau (ein Klick)"],
  ["island", "Stempel: Insel mit Strand (ein Klick)"],
  ["canyon", "Stempel: Schlucht in Blickrichtung (ein Klick)"],
  ["dune", "Stempel: Sanddüne (flach vorne, steil hinten)"],
  ["snowpeak", "Stempel: Schneegipfel (Fels & Schnee oben)"],
  ["cliff", "Stempel: Klippe (Felswand quer vor dir)"],
  ["rockarch", "Stempel: Felsbogen (steht quer vor dir)"],
  ["cave", "Stempel: Höhleneingang (in einen Hang zielen)"],
  ["ridge", "Hügelkette entlang der Pfad-Punkte"],
  ["lake", "See: Mulde bis zum Überlauf mit Wasser füllen (in die Mulde zielen)"],
  ["waterfall", "Stempel: Wasserfall (auf eine Felswand zielen)"],
  ["stairs", "Treppen/Stufen an Stufenkanten setzen"],
  ["biome", "Nur Oberfläche anpassen (Gras, Sand, Stein, Schnee)"],
  ["rain", "Erosion: Regen (Rinnen an Hängen)"],
  ["melt", "Erosion: Wind/Schmelzen (Kanten abrunden)"],
]);

/** Stempel (ein Klick): Form über Zackigkeit, Drehung und Streckung einstellbar. */
export const STAMP_MODES = ["mountain", "crater", "volcano", "mesa", "island", "canyon", "dune", "snowpeak", "cliff", "rockarch", "cave"];

/**
 * Längsachse eines Stempels: Blickrichtung (waagerecht), um `rot` Grad gedreht.
 * @param {{x:number, z:number}} vd Blickrichtung @param {number} rot Grad
 */
export function stampAxis(vd, rot) {
  const vl = Math.hypot(vd.x, vd.z) || 1;
  const fx = vd.x / vl;
  const fz = vd.z / vl;
  const a = (rot * Math.PI) / 180;
  return { ax: fx * Math.cos(a) - fz * Math.sin(a), az: fx * Math.sin(a) + fz * Math.cos(a) };
}

/** Natürliche Bodenblöcke, die das Biom-Malen umfärben darf (Bauwerke bleiben unberührt). */
export const NATURAL =
  /^minecraft:(grass_block|grass|dirt|coarse_dirt|podzol|mycelium|dirt_with_roots|stone|andesite|diorite|granite|tuff|calcite|deepslate|sand|red_sand|gravel|snow|clay|mud|moss_block|cobblestone|mossy_cobblestone)$/;

/**
 * Passende Oberfläche für eine Spalte (Biom-Malen).
 * @param {number} slope größter Höhenunterschied zu den Nachbarn
 * @param {boolean} wet Wasser in der Nähe
 * @param {number} y neue Höhe der Oberfläche
 * @param {number} snowY Schneegrenze
 * @param {number} x @param {number} z
 * @returns {{top:string, sub:string}}
 */
export function surfaceFor(slope, wet, y, snowY, x, z) {
  const rnd = ((x * 73856093) ^ (z * 19349663)) >>> 0;
  if (y >= snowY) return { top: slope >= 6 ? "minecraft:stone" : "minecraft:snow", sub: "minecraft:stone" };
  if (slope >= 3) return { top: rnd % 4 === 0 ? "minecraft:andesite" : "minecraft:stone", sub: "minecraft:stone" };
  if (wet) return { top: "minecraft:sand", sub: "minecraft:sand" };
  if (slope === 2 && rnd % 3 === 0) return { top: "minecraft:gravel", sub: "minecraft:dirt" };
  return { top: "minecraft:grass_block", sub: "minecraft:dirt" };
}

/** Richtung zur höheren Nachbarspalte -> weirdo_direction (0 Ost, 1 West, 2 Süd, 3 Nord) */
const STAIR_DIRS = /** @type {[number, number, number][]} */ ([
  [1, 0, 0],
  [-1, 0, 1],
  [0, 1, 2],
  [0, -1, 3],
]);

const STAIR_MAP = /** @type {Record<string,string>} */ ({
  "minecraft:stone": "minecraft:normal_stone_stairs",
  "minecraft:cobblestone": "minecraft:stone_stairs",
  "minecraft:mossy_cobblestone": "minecraft:mossy_cobblestone_stairs",
  "minecraft:sandstone": "minecraft:sandstone_stairs",
  "minecraft:red_sandstone": "minecraft:red_sandstone_stairs",
  "minecraft:andesite": "minecraft:andesite_stairs",
  "minecraft:diorite": "minecraft:diorite_stairs",
  "minecraft:granite": "minecraft:granite_stairs",
  "minecraft:deepslate": "minecraft:cobbled_deepslate_stairs",
  "minecraft:cobbled_deepslate": "minecraft:cobbled_deepslate_stairs",
  "minecraft:stone_bricks": "minecraft:stone_brick_stairs",
  "minecraft:bricks": "minecraft:brick_stairs",
  "minecraft:oak_planks": "minecraft:oak_stairs",
  "minecraft:spruce_planks": "minecraft:spruce_stairs",
  "minecraft:blackstone": "minecraft:blackstone_stairs",
  "minecraft:mud_bricks": "minecraft:mud_brick_stairs",
});

/** Passende Treppe zum Material der höheren Stufe (Gras/Erde -> Bruchstein-Treppe). @param {string} id */
function stairFor(id) {
  // In Bedrock heißt die Bruchsteintreppe „stone_stairs“
  return STAIR_MAP[id] ?? "minecraft:stone_stairs";
}

/** Passende Stufe (Platte) zur Treppe. @param {string} stair */
function slabFor(stair) {
  return stair === "minecraft:stone_stairs" ? "minecraft:cobblestone_slab" : stair.replace(/_stairs$/, "_slab");
}

const NOT_GROUND = /(leaves|log|wood|mushroom_block|vine|bamboo|cactus)/;

/**
 * Oberste Boden-Höhe einer Spalte suchen.
 * @param {import("../core/edit.js").EditSession} es
 * @param {number} x @param {number} z @param {number} from @param {number} range
 */
function groundY(es, x, z, from, range) {
  for (let y = from; y >= from - range; y--) {
    const id = es.id(x, y, z);
    if (id && isSolidId(id) && !NOT_GROUND.test(id)) return y;
  }
  return null;
}

/**
 * Wasserfall: schmale Rinne von der getroffenen Stelle bis zur Oberkante in die Wand schneiden,
 * oben eine Wasserquelle setzen und unten ein kleines Becken ausheben.
 * @param {import("../core/state.js").Session} ses
 * @param {import("../core/util.js").Target} t
 * @param {{radius:number, strength:number}} c
 */
function waterfall(ses, t, c) {
  const n = t.normal;
  if (n.y !== 0) return err(ses.player, "Für den Wasserfall auf eine senkrechte Felswand zielen (nicht auf Boden/Decke).");
  const W = BlockPermutation.resolve("minecraft:water");
  const pool = Math.max(1, Math.min(4, Math.round(c.radius / 2)));
  runEdit(ses.player, { label: "Wasserfall" }, function* (es) {
    const A = air();
    const p = t.pos;
    // Oberkante der Wand suchen (max. 64 Blöcke nach oben)
    let top = p.y;
    while (top < p.y + 64) {
      const above = es.id(p.x, top + 1, p.z);
      if (!above || !isSolidId(above)) break;
      top++;
    }
    // Rinne: 1 breit, 2 tief, von der Trefferhöhe bis zur Oberkante
    for (let y = p.y; y <= top; y++) {
      for (let d = 0; d <= 1; d++) es.set(p.x - n.x * d, y, p.z - n.z * d, A);
    }
    yield;
    // Quelle oben in der Rinne – das Wasser fließt die Wand hinunter
    es.set(p.x - n.x, top, p.z - n.z, W);
    // Becken vor der Wand am Boden
    const fx = p.x + n.x * (pool + 1);
    const fz = p.z + n.z * (pool + 1);
    let gy = p.y;
    while (gy > p.y - 64) {
      const id = es.id(fx, gy, fz);
      if (id && isSolidId(id)) break;
      gy--;
    }
    for (let dx = -pool; dx <= pool; dx++)
      for (let dz = -pool; dz <= pool; dz++) {
        if (dx * dx + dz * dz > pool * pool + pool) continue;
        for (let dy = 0; dy < 2; dy++) {
          const id = es.id(fx + dx, gy - dy, fz + dz);
          if (id && isSolidId(id)) es.set(fx + dx, gy - dy, fz + dz, W);
        }
      }
  });
}

/**
 * Regen-Erosion: Tropfen laufen den steilsten Weg bergab, tragen dabei Boden ab und lagern ihn in Senken ab.
 * Ergebnis: neue Höhe je Spalte (nur geänderte Spalten).
 * @param {(x:number, z:number) => number|null} H Höhenkarte
 * @param {number} cx @param {number} cz @param {number} R @param {number} strength
 * @param {() => number} [rand]
 */
export function rainErosion(H, cx, cz, R, strength, rand = Math.random) {
  /** @type {Map<string, number>} */
  const cur = new Map();
  const get = (/** @type {number} */ x, /** @type {number} */ z) => {
    const k = x + "," + z;
    if (cur.has(k)) return /** @type {number} */ (cur.get(k));
    return H(x, z);
  };
  const inside = (/** @type {number} */ x, /** @type {number} */ z) => (x - cx) ** 2 + (z - cz) ** 2 <= (R + 0.5) ** 2;
  const drops = Math.round(R * R * 0.6 * strength);
  const cap = Math.max(1, Math.ceil(strength / 2));
  for (let i = 0; i < drops; i++) {
    let x = cx + Math.round((rand() * 2 - 1) * R);
    let z = cz + Math.round((rand() * 2 - 1) * R);
    if (!inside(x, z)) continue;
    let load = 0;
    for (let step = 0; step < R * 3; step++) {
      const h = get(x, z);
      if (h === null) break;
      let bx = 0;
      let bz = 0;
      let bh = h;
      for (let ax = -1; ax <= 1; ax++)
        for (let az = -1; az <= 1; az++) {
          if (!ax && !az) continue;
          const nh = get(x + ax, z + az);
          if (nh !== null && nh < bh) {
            bh = nh;
            bx = ax;
            bz = az;
          }
        }
      if (bh >= h) {
        // Senke: mitgenommenen Boden ablagern
        if (load > 0) cur.set(x + "," + z, h + 1);
        break;
      }
      if (!inside(x + bx, z + bz)) break;
      // Nur an Hängen abtragen (mind. 1 Block Gefälle), nie tiefer als der nächste Schritt
      if (load < cap && h - 1 >= bh) {
        cur.set(x + "," + z, h - 1);
        load++;
      }
      x += bx;
      z += bz;
    }
  }
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const [k, v] of cur) {
    const [x, z] = k.split(",").map(Number);
    if (H(x, z) !== v) out.set(k, v);
  }
  return out;
}

/** Felsblöcke gemischt (Stein, Andesit, Bruchstein) – fest pro Position. @param {number} x @param {number} y @param {number} z */
function rockId(x, y, z) {
  const h = ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
  return h % 7 === 0 ? "minecraft:cobblestone" : h % 4 === 0 ? "minecraft:andesite" : "minecraft:stone";
}

/** @type {Map<string, BlockPermutation>} */
const permCache = new Map();
/** @param {string} id */
function permOf(id) {
  let p = permCache.get(id);
  if (!p) {
    p = BlockPermutation.resolve(id);
    permCache.set(id, p);
  }
  return p;
}

/**
 * Felsbogen: halber Ring aus Fels, steht senkrecht entlang der Längsachse; die Füße reichen bis zum Boden.
 * Radius = halbe Spannweite, Stärke = Dicke, Zackigkeit = raue Kanten.
 * @param {import("../core/state.js").Session} ses
 * @param {import("../core/util.js").Target} t
 * @param {import("../core/state.js").Settings["terrain"]} c
 */
function rockArch(ses, t, c) {
  const { ax, az } = stampAxis(ses.player.getViewDirection(), c.rot ?? 0);
  const R = Math.max(2, c.radius);
  const r = Math.max(1, Math.round(c.strength * 0.7));
  const base = t.pos;
  runEdit(ses.player, { label: "Felsbogen", symmetry: true }, function* (es) {
    /** @type {Map<string, number>} unterste gesetzte Höhe je Spalte (für die Füße) */
    const feet = new Map();
    const span = R + r + 1;
    for (let dx = -span; dx <= span; dx++) {
      for (let dz = -span; dz <= span; dz++) {
        const u = dx * ax + dz * az;
        const w = -dx * az + dz * ax;
        if (Math.abs(w) > r + 1) continue;
        for (let y = 0; y <= R + r + 1; y++) {
          const x = base.x + dx;
          const z = base.z + dz;
          const rough = c.jag ? fbm(x / 3 + 11.3, (base.y + y) / 3, z / 3, 2) * c.jag * 0.12 : 0;
          const q = Math.hypot(u, y) - R;
          if (q * q + w * w > (r + 0.5 + rough) ** 2) continue;
          es.set(x, base.y + 1 + y, z, permOf(rockId(x, base.y + y, z)));
          if (y <= 1) feet.set(x + "," + z, base.y + 1 + y);
        }
      }
      yield;
    }
    // Füße bis zum Boden verlängern
    for (const [k, y0] of feet) {
      const [x, z] = k.split(",").map(Number);
      for (let y = y0 - 1; y > y0 - 40; y--) {
        const id = es.id(x, y, z);
        if (id && isSolidId(id)) break;
        es.set(x, y, z, permOf(rockId(x, y, z)));
      }
    }
  });
}

/**
 * Höhleneingang: Stollen in Blickrichtung in den Hang graben, leicht abfallend, mit rauen Wänden.
 * Radius = Länge/Breite, Stärke = Höhe.
 * @param {import("../core/state.js").Session} ses
 * @param {import("../core/util.js").Target} t
 * @param {import("../core/state.js").Settings["terrain"]} c
 */
function cave(ses, t, c) {
  const { ax, az } = stampAxis(ses.player.getViewDirection(), c.rot ?? 0);
  const len = Math.max(4, Math.round(c.radius * 2 * Math.max(1, (c.stretch ?? 10) / 10)));
  const wide = Math.max(1.5, c.radius * 0.35);
  const high = Math.max(2, 1 + c.strength * 0.8);
  const start = t.face === "Up" ? v(t.pos.x, t.pos.y + 1, t.pos.z) : t.adjacent;
  runEdit(ses.player, { label: "Höhleneingang", symmetry: true }, function* (es) {
    const A = air();
    for (let i = 0; i <= len; i++) {
      // Eingang etwas größer, nach hinten schmaler und abfallend
      const k = i / len;
      const mouth = i < 3 ? 1.25 : 1;
      const cx = start.x + ax * i;
      const cz = start.z + az * i;
      const cy = start.y - i * 0.25;
      const ww = wide * mouth * (1 - 0.3 * k);
      const hh = high * mouth * (1 - 0.25 * k);
      const reach = Math.ceil(Math.max(ww, hh)) + 1;
      for (let a = -reach; a <= reach; a++)
        for (let y = -1; y <= reach; y++) {
          const x = Math.round(cx - az * a);
          const z = Math.round(cz + ax * a);
          const yy = Math.round(cy + y);
          const rough = c.jag ? fbm(x / 3 + 7.1, yy / 3, z / 3, 2) * c.jag * 0.08 : 0;
          // Querschnitt: unten flach, oben gewölbt
          const ey = y < 0 ? 0 : y / hh;
          if ((a / ww) ** 2 + ey ** 2 > 1 + rough) continue;
          const id = es.id(x, yy, z);
          if (id && isSolidId(id)) es.set(x, yy, z, A);
        }
      yield;
    }
  });
}

/**
 * Hügelkette entlang der Pfad-Punkte: Kamm folgt der Kurve, Enden laufen flach aus.
 * Radius = Breite, Stärke = Höhe, Zackigkeit = unregelmäßige Gipfel.
 * @param {import("../core/state.js").Session} ses
 * @param {import("../core/state.js").Settings["terrain"]} c
 */
export function ridge(ses, c) {
  if (ses.pathPoints.length < 2) return err(ses.player, "Erst mit dem Pfad-Werkzeug mindestens 2 Punkte setzen – die Hügelkette folgt ihnen.");
  const samples = samplePath(ses.pathPoints, true);
  const acc = [0];
  for (let i = 1; i < samples.length; i++) acc.push(acc[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z));
  const total = acc[acc.length - 1] || 1;
  const R = Math.max(2, c.radius);
  const peak = c.strength * 4;
  runEdit(ses.player, { label: "Hügelkette", symmetry: true }, function* (es) {
    /** @type {Map<string, number>} gewünschte Erhöhung je Spalte */
    const lift = new Map();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const along = acc[i] / total;
      const taper = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, along))), 0.5);
      for (let dx = -R; dx <= R; dx++)
        for (let dz = -R; dz <= R; dz++) {
          const x = Math.round(s.x + dx);
          const z = Math.round(s.z + dz);
          const d = Math.hypot(x + 0.5 - (s.x + 0.5), z + 0.5 - (s.z + 0.5));
          if (d > R + 0.5) continue;
          const f = Math.max(0, 1 - d / (R + 0.5));
          let hgt = peak * taper * Math.pow(f, 1.3);
          if (c.jag) hgt *= Math.max(0, 1 + fbm(x / 7 + 3.3, 0.4, z / 7 + 9.1, 3) * c.jag * 0.12);
          const k = x + "," + z;
          if (hgt > (lift.get(k) ?? 0)) lift.set(k, hgt);
        }
      if (i % 8 === 0) yield;
    }
    // Boden suchen und Spalten anheben
    const top = Math.round(Math.max(...samples.map((p) => p.y))) + 24;
    /** @type {Map<string, number>} */
    const ground = new Map();
    for (const k of lift.keys()) {
      const [x, z] = k.split(",").map(Number);
      const g = groundY(es, x, z, top, 64);
      if (g !== null) ground.set(k, g);
    }
    yield;
    let n = 0;
    for (const [k, l] of lift) {
      const add = Math.round(l);
      const g = ground.get(k);
      if (!add || g === undefined) continue;
      const [x, z] = k.split(",").map(Number);
      const target = g + add;
      let topId = es.id(x, g, z);
      let sub = "minecraft:dirt";
      if (c.biome && NATURAL.test(topId)) {
        let slope = 0;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = x + ox + "," + (z + oz);
          const ng = ground.get(nk);
          if (ng !== undefined) slope = Math.max(slope, Math.abs(ng + Math.round(lift.get(nk) ?? 0) - target));
        }
        const sf = surfaceFor(slope, false, target, c.snowY, x, z);
        topId = sf.top;
        sub = sf.sub;
      }
      for (let y = g; y < target; y++) es.set(x, y, z, permOf(target - y <= 3 ? sub : "minecraft:stone"));
      es.set(x, target, z, permOf(topId));
      if (++n % 64 === 0) yield;
    }
  });
}

/**
 * Wasserspiegel einer Mulde finden. Spalten werden nach Bodenhöhe aufsteigend abgelaufen (wie steigendes Wasser).
 * Jedes Mal, wenn ein neuer, höherer Rand erreicht wird, ist der See bis zu diesem Rand dicht – das merken wir uns.
 * Wird die Fläche danach riesig (Wasser liefe ins Umland), gilt der zuletzt gemerkte Wasserspiegel.
 * Generator: gibt zwischendurch die Kontrolle ab (große Mulden über mehrere Ticks).
 * @param {(x:number, z:number) => number|null} H Bodenhöhe
 * @param {number} sx @param {number} sz Startspalte @param {number} limit max. Spalten
 * @returns {Generator<void, {level:number, cols:{x:number, z:number, h:number}[], partial:boolean} | {error:string}>}
 */
export function* findLakeGen(H, sx, sz, limit) {
  const h0 = H(sx, sz);
  if (h0 === null) return { error: "Kein Boden gefunden." };
  /** @type {{x:number, z:number, h:number}[]} Min-Heap nach Höhe */
  const heap = [];
  const push = (/** @type {{x:number, z:number, h:number}} */ e) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const q = (i - 1) >> 1;
      if (heap[q].h <= heap[i].h) break;
      [heap[q], heap[i]] = [heap[i], heap[q]];
      i = q;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = /** @type {{x:number, z:number, h:number}} */ (heap.pop());
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].h < heap[m].h) m = l;
        if (r < heap.length && heap[r].h < heap[m].h) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const seen = new Set([sx + "," + sz]);
  push({ x: sx, z: sz, h: h0 });
  let max = h0;
  let level = -Infinity;
  let wetCount = 0;
  /** @type {{x:number, z:number, h:number}[]} */
  const cols = [];
  let partial = false;
  while (heap.length) {
    const c = pop();
    if (c.h > max) {
      // Neuer höchster Rand: alles bisher Erreichte liegt tiefer und ist rundum eingefasst
      max = c.h;
      level = c.h;
      wetCount = cols.length;
    }
    cols.push(c);
    if (cols.length > limit) {
      // Nur „teilweise“, wenn es noch höhere Ränder gäbe (bei ebenem Umland ist der See bereits voll)
      partial = heap.some((e) => e.h > max);
      break;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx;
      const z = c.z + dz;
      const k = x + "," + z;
      if (seen.has(k)) continue;
      seen.add(k);
      const h = H(x, z);
      if (h !== null) push({ x, z, h });
    }
    if (cols.length % 128 === 0) yield;
  }
  const wet = cols.slice(0, wetCount).filter((c) => c.h < level);
  if (!wet.length) return { error: "Hier ist keine Mulde – auf eine tiefe Stelle zielen, die rundum höher eingefasst ist." };
  return { level, cols: wet, partial };
}

/** Wie findLakeGen, aber auf einmal (für Tests). @param {(x:number, z:number) => number|null} H @param {number} sx @param {number} sz @param {number} limit */
export function findLake(H, sx, sz, limit) {
  const g = findLakeGen(H, sx, sz, limit);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

/**
 * See: Mulde am Blickziel bis zum Überlauf mit Wasser füllen, Grund unter Wasser wird Sand/Kies.
 * @param {import("../core/state.js").Session} ses
 * @param {import("../core/util.js").Target} t
 */
function lake(ses, t) {
  const p = t.pos;
  runEdit(ses.player, { label: "See" }, function* (es) {
    /** @type {Map<string, number|null>} */
    const hm = new Map();
    const H = (/** @type {number} */ x, /** @type {number} */ z) => {
      const k = x + "," + z;
      if (!hm.has(k)) hm.set(k, groundY(es, x, z, p.y + 48, 96));
      return hm.get(k) ?? null;
    };
    const res = yield* findLakeGen(H, p.x, p.z, 8000);
    if ("error" in res) return err(ses.player, res.error);
    yield;
    const W = permOf("minecraft:water");
    let n = 0;
    for (const c of res.cols) {
      const top = es.id(c.x, c.h, c.z);
      if (NATURAL.test(top)) es.set(c.x, c.h, c.z, permOf(res.level - c.h > 3 ? "minecraft:gravel" : "minecraft:sand"));
      for (let y = c.h + 1; y <= res.level; y++) {
        const id = es.id(c.x, y, c.z);
        if (!id || !isSolidId(id)) es.set(c.x, y, c.z, W);
      }
      if (++n % 64 === 0) yield;
    }
    msg(
      ses.player,
      `See gefüllt: ${res.cols.length} Spalten, Wasserspiegel auf Höhe ${res.level}.` +
        (res.partial ? " §7(Sehr große Mulde oder ebenes Umland – zur Sicherheit nur so weit gefüllt, wie das Wasser sicher eingefasst ist.)" : "")
    );
  });
}

/** @type {import("./registry.js").Tool} */
export const terrainTool = {
  id: "axiom:terrain",
  name: "Terrain",
  brush: true,
  help: "Benutzen (gedrückt halten): Gelände anheben/absenken/glätten … Schleichen+Benutzen: Modus, Radius, Stärke.",
  onUse(ses) {
    const t = target(ses.player, ses.s);
    if (!t) return;
    const c = { ...ses.s.terrain };
    if ([...STAMP_MODES, "waterfall", "ridge", "lake"].includes(c.mode)) {
      // Stempel nur einmal pro Tastendruck
      const last = ses.floodLast ?? -100;
      ses.floodLast = now();
      if (now() - last < 20) return;
    }
    if (c.mode === "waterfall") return waterfall(ses, t, c);
    if (c.mode === "rockarch") return rockArch(ses, t, c);
    if (c.mode === "cave") return cave(ses, t, c);
    if (c.mode === "ridge") return ridge(ses, c);
    if (c.mode === "lake") return lake(ses, t);
    const ctr = t.pos;
    const R = c.radius;
    // Stempel: Längsachse (Blickrichtung + Drehung) und Streckung → ovaler Grundriss
    const stamp = STAMP_MODES.includes(c.mode);
    const el = stamp ? Math.max(1, (c.stretch ?? 10) / 10) : 1;
    const { ax, az } = stampAxis(ses.player.getViewDirection(), stamp ? (c.rot ?? 0) : 0);
    const RR = Math.ceil(R * el);
    const seed = 77.37;
    runEdit(ses.player, { label: "Terrain", stroke: strokeId(ses, "terrain"), symmetry: true }, function* (es) {
      const A = air();
      const scanTop = ctr.y + Math.max(24, R * 2);
      const range = Math.max(48, R * 4);
      /** @type {Map<string, number|null>} */
      const hm = new Map();
      const H = (/** @type {number} */ x, /** @type {number} */ z) => {
        const k = x + "," + z;
        if (!hm.has(k)) hm.set(k, groundY(es, x, z, scanTop, range));
        return hm.get(k) ?? null;
      };
      const pad = c.mode === "smooth" ? 2 : c.mode === "stairs" ? 1 : 0;
      for (let dx = -RR - pad; dx <= RR + pad; dx++) {
        for (let dz = -RR - pad; dz <= RR + pad; dz++) H(ctr.x + dx, ctr.z + dz);
        yield;
      }
      /** @type {Map<string, BlockPermutation>} */
      const cache = new Map();
      const perm = (/** @type {string} */ id) => {
        let p = cache.get(id);
        if (!p) {
          p = BlockPermutation.resolve(id);
          cache.set(id, p);
        }
        return p;
      };
      /** @type {Map<string, number>|null} */
      const eroded = c.mode === "rain" ? rainErosion(H, ctr.x, ctr.z, R, c.strength) : null;
      /** @type {{x:number, z:number, h:number, target:number, topOverride?:string, fillOverride?:string}[]} */
      const plan = [];
      /** @type {Map<string, number>} */
      const newH = new Map();
      for (let dx = -RR; dx <= RR; dx++) {
        for (let dz = -RR; dz <= RR; dz++) {
          const along = dx * ax + dz * az;
          const across = -dx * az + dz * ax;
          const d = stamp ? Math.hypot(along / el, across) : Math.sqrt(dx * dx + dz * dz);
          if (d > R + 0.5) continue;
          const x = ctr.x + dx;
          const z = ctr.z + dz;
          const h = H(x, z);
          if (h === null) continue;
          if (c.mode === "stairs") {
            // Stufe genau 1 Block höher daneben? -> Treppe davor setzen, die zur höheren Seite ansteigt
            const above = es.id(x, h + 1, z);
            if (!above || isSolidId(above)) continue;
            for (const [dx2, dz2, dir] of STAIR_DIRS) {
              if (H(x + dx2, z + dz2) !== h + 1) continue;
              const stair = stairFor(es.id(x + dx2, h + 1, z + dz2));
              try {
                if (c.slab) es.set(x, h + 1, z, BlockPermutation.resolve(slabFor(stair)));
                else es.set(x, h + 1, z, BlockPermutation.resolve(stair, { weirdo_direction: dir, upside_down_bit: false }));
              } catch {}
              break;
            }
            continue;
          }
          const fall = c.falloff ? Math.max(0, Math.cos((Math.min(d, R) / (R + 0.5)) * (Math.PI / 2))) : 1;
          /** @type {string|undefined} */
          let topOverride;
          /** @type {string|undefined} */
          let fillOverride;
          let target = h;
          switch (c.mode) {
            case "raise":
              target = h + Math.round(c.strength * fall);
              break;
            case "lower":
              target = h - Math.round(c.strength * fall);
              break;
            case "flatten":
              target = Math.round(h + (ctr.y - h) * Math.min(1, fall * (c.strength / 4)));
              break;
            case "smooth": {
              let sum = 0;
              let cnt = 0;
              for (let ax = -2; ax <= 2; ax++)
                for (let az = -2; az <= 2; az++) {
                  const hh = H(x + ax, z + az);
                  if (hh !== null) {
                    sum += hh;
                    cnt++;
                  }
                }
              if (cnt) target = Math.round(h + (sum / cnt - h) * Math.min(1, fall * (c.strength / 3)));
              break;
            }
            case "hills":
              target = h + Math.round(fbm(x / 16 + seed, 0.5, z / 16 + 13.71, 3) * c.strength * 3 * fall);
              break;
            case "mountain": {
              // Spitze Bergform mit etwas Rauschen
              const f = Math.max(0, 1 - d / (R + 0.5));
              target = h + Math.round(c.strength * 4 * Math.pow(f, 1.6));
              break;
            }
            case "crater": {
              // Mulde in der Mitte, aufgeworfener Rand außen
              const q = d / (R + 0.5);
              if (q < 0.7) target = h - Math.round(c.strength * 3 * (1 - (q / 0.7) ** 2));
              else target = h + Math.round(c.strength * Math.sin(((q - 0.7) / 0.3) * Math.PI) * 0.9);
              break;
            }
            case "volcano": {
              // Kegel mit Krater oben
              const q = d / (R + 0.5);
              const cone = c.strength * 5 * Math.max(0, 1 - q);
              const pit = q < 0.18 ? c.strength * 2.5 * (1 - q / 0.18) : 0;
              target = h + Math.round(cone - pit);
              break;
            }
            case "mesa": {
              // Flache Oberseite, steile Flanken
              const q = d / (R + 0.5);
              const top = c.strength * 3;
              target = h + Math.round(q < 0.65 ? top : top * Math.max(0, 1 - (q - 0.65) / 0.35) ** 0.6);
              break;
            }
            case "island": {
              // Flacher Hügel, außen Sandstrand
              const q = d / (R + 0.5);
              target = h + Math.round(c.strength * 2.5 * Math.max(0, 1 - q * q));
              if (q > 0.65) topOverride = "minecraft:sand";
              break;
            }
            case "canyon": {
              // Langgezogene Schlucht entlang der Längsachse (Blickrichtung + Drehung)
              const ac = Math.abs(across);
              const w = Math.max(1.5, R * 0.35);
              if (ac > w) break;
              target = h - Math.round(c.strength * 4 * (1 - (ac / w) ** 2) * (1 - (Math.abs(along) / (RR + 0.5)) ** 4));
              break;
            }
            case "dune": {
              // Windseite flach ansteigend, Leeseite steil (Kamm bei 40 % der Länge)
              const u = along / (RR + 0.5);
              const prof = u < 0.4 ? (u + 1) / 1.4 : Math.max(0, (1 - u) / 0.6);
              const side = Math.max(0, 1 - (across / (R + 0.5)) ** 2);
              target = h + Math.round(c.strength * 2.2 * prof * side);
              topOverride = fillOverride = "minecraft:sand";
              break;
            }
            case "snowpeak": {
              // Hoher, spitzer Gipfel: unten Gras, Mitte Fels, oben Schnee
              const f = Math.max(0, 1 - d / (R + 0.5));
              target = h + Math.round(c.strength * 5.5 * Math.pow(f, 1.35));
              fillOverride = "minecraft:stone";
              if (f > 0.55) topOverride = "minecraft:snow";
              else if (f > 0.3) topOverride = "minecraft:stone";
              break;
            }
            case "cliff": {
              // Senkrechte Felswand quer zur Blickrichtung: dahinter erhöht, davor bleibt alles
              if (along < 0) break;
              const edge = Math.min(1, (R + 0.5 - Math.abs(across)) / 2);
              target = h + Math.round(c.strength * 4 * Math.max(0, edge));
              fillOverride = "minecraft:stone";
              break;
            }
            case "biome":
              break;
            case "rain":
              target = eroded?.get(x + "," + z) ?? h;
              break;
            case "melt": {
              // Spitzen und Grate abtragen, Löcher füllen – je nachdem, wie viele Nachbarn tiefer/höher liegen
              let lower = 0;
              let higher = 0;
              for (let ax = -1; ax <= 1; ax++)
                for (let az = -1; az <= 1; az++) {
                  if (!ax && !az) continue;
                  const hh = H(x + ax, z + az);
                  if (hh === null) continue;
                  if (hh < h) lower++;
                  else if (hh > h) higher++;
                }
              if (lower >= 5 && Math.random() < 0.35 + c.strength * 0.065) target = h - 1;
              else if (higher >= 6 && Math.random() < 0.35 + c.strength * 0.065) target = h + 1;
              break;
            }
            case "terrace": {
              const step = Math.max(2, c.strength);
              target = Math.round(h + (Math.floor(h / step) * step - h) * fall);
              break;
            }
          }
          // Zackigkeit: Höhenänderung der Stempel mit Rauschen verformen (0 = glatt)
          if (stamp && target !== h && c.jag) {
            const n = fbm(x / 6 + 31.7, 0.7, z / 6 + 5.3, 3);
            target = h + Math.round((target - h) * Math.max(0, 1 + n * c.jag * 0.12));
          }
          if (target === h && !topOverride && !c.biome) continue;
          plan.push({ x, z, h, target, topOverride, fillOverride });
          newH.set(x + "," + z, target);
        }
        yield;
      }
      if (c.mode === "stairs") return;
      // Biom-Malen: Wasser in der Nähe merken, solange das Gelände noch unverändert ist
      /** @type {Map<string, boolean>} */
      const water = new Map();
      const hasWater = (/** @type {number} */ x, /** @type {number} */ z) => {
        const k = x + "," + z;
        if (!water.has(k)) {
          const g = H(x, z);
          water.set(k, g !== null && es.id(x, g + 1, z).includes("water"));
        }
        return water.get(k);
      };
      /** @type {Map<string, {top:string, sub:string}>} */
      const surf = new Map();
      if (c.biome) {
        const NH = (/** @type {number} */ x, /** @type {number} */ z) => newH.get(x + "," + z) ?? H(x, z);
        for (const q of plan) {
          let slope = 0;
          for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = NH(q.x + ox, q.z + oz);
            if (n !== null) slope = Math.max(slope, Math.abs(n - q.target));
          }
          let wet = false;
          for (let ax = -2; ax <= 2 && !wet; ax++) for (let az = -2; az <= 2 && !wet; az++) wet = !!hasWater(q.x + ax, q.z + az);
          surf.set(q.x + "," + q.z, surfaceFor(slope, wet, q.target, c.snowY, q.x, q.z));
        }
        yield;
      }
      let n = 0;
      for (const { x, z, h, target, topOverride, fillOverride } of plan) {
        const oldTop = es.id(x, h, z);
        const sf = !topOverride && NATURAL.test(oldTop) ? surf.get(x + "," + z) : undefined;
        const topId = topOverride ?? sf?.top ?? oldTop;
        const belowId = es.id(x, h - 1, z);
        const fillId = fillOverride ?? (belowId && isSolidId(belowId) ? belowId : topId);
        if (target > h) {
          // Oberfläche nach oben verschieben: alte Oberfläche wird Füllmaterial
          for (let y = h; y < target; y++) {
            const fid = sf ? (target - y <= 3 ? sf.sub : "minecraft:stone") : fillId;
            es.set(x, y, z, perm(fid));
          }
          es.set(x, target, z, perm(topId));
        } else {
          for (let y = h; y > target; y--) es.set(x, y, z, A);
          if (es.id(x, target, z) !== topId) es.set(x, target, z, perm(topId));
        }
        if (sf) {
          // Schicht unter der Oberfläche (Erde/Sand) – nur natürliche Blöcke umfärben
          for (let k = 1; k <= 3; k++) {
            const y = target - k;
            if (y < h || target <= h) {
              const id = es.id(x, y, z);
              if (id !== sf.sub && NATURAL.test(id)) es.set(x, y, z, perm(sf.sub));
            }
          }
        }
        if (++n % 64 === 0) yield;
      }
    });
  },
  preview(ses) {
    const c = ses.s.terrain;
    if (!STAMP_MODES.includes(c.mode)) return;
    const t = target(ses.player, ses.s);
    if (!t) return;
    // Umriss des Stempels (Oval) und Längsachse als Partikel
    const el = Math.max(1, (c.stretch ?? 10) / 10);
    const { ax, az } = stampAxis(ses.player.getViewDirection(), c.rot ?? 0);
    const R = c.radius + 0.5;
    const y = t.pos.y + 1.2;
    const cx = t.pos.x + 0.5;
    const cz = t.pos.z + 0.5;
    const n = Math.min(96, Math.max(24, Math.round(R * el * 6)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const u = Math.cos(a) * R * el;
      const w = Math.sin(a) * R;
      spawn(ses.player, "axiom:marker", { x: cx + u * ax - w * az, y, z: cz + u * az + w * ax });
    }
    if (el > 1 || c.mode === "canyon")
      for (let k = -4; k <= 4; k++) spawn(ses.player, "axiom:pos2", { x: cx + (k / 4) * R * el * ax, y, z: cz + (k / 4) * R * el * az });
  },
  hud(ses) {
    const c = ses.s.terrain;
    return `${TERRAIN_MODES.find((m) => m[0] === c.mode)?.[1]} · Radius ${c.radius} · Stärke ${c.strength}${c.biome ? " · §aBiom" : ""}`;
  },
  async menu(ses) {
    const c = ses.s.terrain;
    const r = await new Modal("Terrain")
      .dropdown("mode", "Modus", TERRAIN_MODES, c.mode)
      .slider("radius", "Radius", 1, 32, 1, c.radius)
      .slider("strength", "Stärke (Blöcke pro Anwendung / Stufenhöhe)", 1, 10, 1, c.strength)
      .toggle("falloff", "Weicher Rand (zur Mitte stärker)", c.falloff)
      .toggle("slab", "Treppen-Modus: Stufen (Platten) statt Treppen", c.slab)
      .slider("jag", "Stempel: Zackigkeit (0 = glatt)", 0, 10, 1, c.jag)
      .slider("rot", "Stempel: Drehung in Grad (0 = Blickrichtung)", 0, 345, 15, c.rot)
      .slider("stretch", "Stempel: Streckung (10 = rund, 30 = dreimal so lang)", 10, 30, 2, c.stretch)
      .toggle("biome", "Biom-Malen: Oberfläche passend färben (Gras, Sand am Wasser, Stein an Hängen, Schnee oben)", c.biome)
      .slider("snowY", "Biom-Malen: Schneegrenze (Höhe Y)", 60, 300, 5, Math.max(60, Math.min(300, c.snowY)))
      .show(ses.player);
    if (!r) return;
    Object.assign(c, r);
    markDirty(ses);
  },
};
