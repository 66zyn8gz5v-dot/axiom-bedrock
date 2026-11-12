// Operationen auf der Auswahl: Füllen, Ersetzen, Wände, Hohl, Überziehen, Natürlich, Glätten,
// Stapeln, Verschieben, Drehen, Spiegeln, Analysieren, Kopieren/Ausschneiden.
import { BlockPermutation } from "@minecraft/server";
import { fillBox, runEdit } from "./edit.js";
import { air, isSolidId, normId, parsePattern, picker, shortId, isAirId } from "./pattern.js";
import { selContains, selPositions, selSize, shiftSel, selDims, recomputeBounds, SET_LIMIT } from "./selection.js";
import { copySelection, freeClip, getClip, pasteClip, rotatedSize } from "./clipboard.js";
import { err, fmtNum, msg } from "./util.js";
import { v, vmax, vmin } from "./vec.js";
import { fbm } from "./noise.js";
import { groundY, MESA_BANDS, surfaceFor } from "../tools/terrain.js";

/** @param {import("./state.js").Session} ses */
function need(ses) {
  const sel = ses.sel;
  if (!sel) {
    err(ses.player, "Keine Auswahl – erst mit Box-, Magischer oder Pinsel-Auswahl etwas auswählen.");
    return null;
  }
  if (sel.dim !== ses.player.dimension.id) {
    err(ses.player, "Die Auswahl liegt in einer anderen Dimension.");
    return null;
  }
  return sel;
}

/**
 * Jede Position der Auswahl mit einer Funktion bearbeiten.
 * @param {import("./state.js").Session} ses
 * @param {string} label
 * @param {(es: import("./edit.js").EditSession, x:number, y:number, z:number) => void} fn
 * @param {{useMask?: boolean}} [o]
 */
function perBlock(ses, label, fn, o = {}) {
  const sel = need(ses);
  if (!sel) return;
  runEdit(ses.player, { label, region: { min: sel.min, max: sel.max }, useMask: o.useMask }, function* (es) {
    let n = 0;
    for (const p of selPositions(sel)) {
      fn(es, p.x, p.y, p.z);
      if (++n % 512 === 0) yield;
    }
  });
}

/** Füllen mit aktivem Muster (Quader + ein Block + keine Maske -> schneller Weg). @param {import("./state.js").Session} ses @param {import("./pattern.js").PatternEntry[]} [pattern] */
export function opFill(ses, pattern = ses.s.pattern, label = "Füllen") {
  const sel = need(ses);
  if (!sel) return;
  if (sel.kind === "box" && pattern.length === 1 && ses.s.mask.mode === "none") {
    const perm = picker(pattern)();
    runEdit(ses.player, { label, region: { min: sel.min, max: sel.max }, forceRegion: true }, function* (es) {
      es.count = yield* fillBox(es.dim, sel.min, sel.max, perm);
    });
    return;
  }
  const pick = picker(pattern);
  perBlock(ses, label, (es, x, y, z) => es.set(x, y, z, pick()));
}

/** @param {import("./state.js").Session} ses */
export function opClear(ses) {
  opFill(ses, [{ id: "minecraft:air", w: 1 }], "Leeren");
}

/** @param {import("./state.js").Session} ses @param {string[]} fromIds */
export function opReplace(ses, fromIds) {
  const set = new Set(fromIds);
  const pick = picker(ses.s.pattern);
  perBlock(
    ses,
    "Ersetzen",
    (es, x, y, z) => {
      const id = es.id(x, y, z);
      if (set.has(id)) es.set(x, y, z, pick());
    },
    { useMask: false }
  );
}

/** Außenhülle / Wände. @param {import("./state.js").Session} ses @param {"walls"|"outline"|"hollow"} kind */
export function opShell(ses, kind) {
  const sel = need(ses);
  if (!sel) return;
  const pick = picker(ses.s.pattern);
  const A = air();
  /** @param {number} x @param {number} y @param {number} z */
  const inside = (x, y, z) => selContains(sel, x, y, z);
  /** @param {number} x @param {number} y @param {number} z */
  const border = (x, y, z) => !inside(x + 1, y, z) || !inside(x - 1, y, z) || !inside(x, y, z + 1) || !inside(x, y, z - 1) || (kind !== "walls" && (!inside(x, y + 1, z) || !inside(x, y - 1, z)));
  const label = kind === "walls" ? "Wände" : kind === "outline" ? "Umriss" : "Aushöhlen";
  perBlock(ses, label, (es, x, y, z) => {
    const b = border(x, y, z);
    if (kind === "hollow") {
      if (!b) es.set(x, y, z, A);
    } else if (b) es.set(x, y, z, pick());
  });
}

/** Spaltenweise: oberster fester Block in der Auswahl. */
function* columns(/** @type {import("./selection.js").Selection} */ sel) {
  /** @type {Map<string, {x:number,z:number,ys:number[]}>} */
  const cols = new Map();
  for (const p of selPositions(sel)) {
    const k = p.x + "," + p.z;
    let c = cols.get(k);
    if (!c) cols.set(k, (c = { x: p.x, z: p.z, ys: [] }));
    c.ys.push(p.y);
  }
  for (const c of cols.values()) {
    c.ys.sort((a, b) => b - a);
    yield c;
  }
}

/** Oberfläche mit Muster überziehen. @param {import("./state.js").Session} ses @param {number} depth */
export function opOverlay(ses, depth) {
  const sel = need(ses);
  if (!sel) return;
  const pick = picker(ses.s.pattern);
  runEdit(ses.player, { label: "Überziehen", region: { min: sel.min, max: v(sel.max.x, sel.max.y + depth, sel.max.z) } }, function* (es) {
    let n = 0;
    for (const c of columns(sel)) {
      for (const y of c.ys) {
        const id = es.id(c.x, y, c.z);
        if (id && isSolidId(id)) {
          for (let d = 1; d <= depth; d++) es.set(c.x, y + d, c.z, pick());
          break;
        }
      }
      if (++n % 64 === 0) yield;
    }
  });
}

/** Natürlich machen: Gras oben, 3 Erde, darunter Stein. @param {import("./state.js").Session} ses */
export function opNaturalize(ses) {
  const sel = need(ses);
  if (!sel) return;
  const G = BlockPermutation.resolve("minecraft:grass_block");
  const D = BlockPermutation.resolve("minecraft:dirt");
  const S = BlockPermutation.resolve("minecraft:stone");
  runEdit(ses.player, { label: "Natürlich machen", region: { min: sel.min, max: sel.max } }, function* (es) {
    let n = 0;
    for (const c of columns(sel)) {
      let depth = -1;
      for (const y of c.ys) {
        const id = es.id(c.x, y, c.z);
        if (!id || !isSolidId(id)) {
          depth = -1;
          continue;
        }
        depth++;
        es.set(c.x, y, c.z, depth === 0 ? G : depth <= 3 ? D : S);
      }
      if (++n % 64 === 0) yield;
    }
  });
}

/** Höhen innerhalb der Auswahl glätten. @param {import("./state.js").Session} ses @param {number} iterations */
export function opSmooth(ses, iterations) {
  const sel = need(ses);
  if (!sel) return;
  runEdit(ses.player, { label: "Glätten", region: { min: sel.min, max: sel.max } }, function* (es) {
    /** @type {Map<string, {x:number,z:number,h:number,top:string,fill:string,ys:number[]}>} */
    const cols = new Map();
    for (const c of columns(sel)) {
      for (const y of c.ys) {
        const id = es.id(c.x, y, c.z);
        if (id && isSolidId(id)) {
          const below = es.id(c.x, y - 1, c.z);
          cols.set(c.x + "," + c.z, { x: c.x, z: c.z, h: y, top: id, fill: below && isSolidId(below) ? below : id, ys: c.ys });
          break;
        }
      }
      yield;
    }
    /** @type {Map<string, number>} */
    let hs = new Map([...cols].map(([k, c]) => [k, c.h]));
    for (let it = 0; it < iterations; it++) {
      /** @type {Map<string, number>} */
      const next = new Map();
      for (const [k, c] of cols) {
        let sum = 0;
        let cnt = 0;
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++) {
            const h = hs.get(c.x + dx + "," + (c.z + dz));
            if (h !== undefined) {
              sum += h;
              cnt++;
            }
          }
        next.set(k, sum / cnt);
      }
      hs = next;
      yield;
    }
    const A = air();
    /** @type {Map<string, BlockPermutation>} */
    const cache = new Map();
    const P = (/** @type {string} */ id) => cache.get(id) ?? cache.set(id, BlockPermutation.resolve(id)).get(id);
    let n = 0;
    for (const [k, c] of cols) {
      const target = Math.round(/** @type {number} */ (hs.get(k)));
      const lo = Math.min(...c.ys);
      const hi = Math.max(...c.ys);
      const tgt = Math.max(lo, Math.min(hi, target));
      if (tgt > c.h) {
        for (let y = c.h; y < tgt; y++) es.set(c.x, y, c.z, /** @type {BlockPermutation} */ (P(c.fill)));
        es.set(c.x, tgt, c.z, /** @type {BlockPermutation} */ (P(c.top)));
      } else if (tgt < c.h) {
        for (let y = c.h; y > tgt; y--) es.set(c.x, y, c.z, A);
        es.set(c.x, tgt, c.z, /** @type {BlockPermutation} */ (P(c.top)));
      }
      if (++n % 64 === 0) yield;
    }
  });
}

/**
 * Auswahl mehrfach in eine Richtung stapeln.
 * @param {import("./state.js").Session} ses
 * @param {{x:number,y:number,z:number}} dir Einheitsvektor
 * @param {number} count
 * @param {number} gap
 */
export function opStack(ses, dir, count, gap) {
  const sel = need(ses);
  if (!sel) return;
  const d = selDims(sel);
  const step = v(dir.x * (d.x + gap), dir.y * (d.y + gap), dir.z * (d.z + gap));
  const last = v(step.x * count, step.y * count, step.z * count);
  const min = vmin(sel.min, v(sel.min.x + last.x, sel.min.y + last.y, sel.min.z + last.z));
  const max = vmax(sel.max, v(sel.max.x + last.x, sel.max.y + last.y, sel.max.z + last.z));
  const player = ses.player;
  runEdit(player, { label: `Stapeln ×${count}`, region: { min, max }, forceRegion: true, useMask: false }, function* (es) {
    const clip = yield* copySelection(player, sel, false, true);
    try {
      for (let i = 1; i <= count; i++) {
        const o = v(sel.min.x + step.x * i, sel.min.y + step.y * i, sel.min.z + step.z * i);
        es.count += yield* pasteClip(player, clip, es.dim, o, { rotation: 0, mirror: "None", air: true, entities: false }, false);
      }
    } finally {
      freeClip(clip);
    }
  });
}

/**
 * Gespiegelte Kopie direkt neben die Auswahl setzen (z.B. zweiter Gebäudeflügel).
 * @param {import("./state.js").Session} ses
 * @param {{x:number,y:number,z:number}} dir horizontale Blickrichtung (Einheitsvektor)
 * @param {number} gap Abstand zwischen Original und Kopie
 */
export function opMirrorCopy(ses, dir, gap) {
  const sel = need(ses);
  if (!sel) return;
  if (dir.y !== 0) return err(ses.player, "Gespiegelte Kopie nur seitlich (nach Norden/Süden/Osten/Westen schauen).");
  const d = selDims(sel);
  const off = v(dir.x * (d.x + gap), 0, dir.z * (d.z + gap));
  const o = v(sel.min.x + off.x, sel.min.y, sel.min.z + off.z);
  const min = vmin(sel.min, o);
  const max = vmax(sel.max, v(o.x + d.x - 1, o.y + d.y - 1, o.z + d.z - 1));
  const mirror = dir.x !== 0 ? "X" : "Z";
  const player = ses.player;
  return runEdit(player, { label: "Gespiegelte Kopie", region: { min, max }, forceRegion: true, useMask: false }, function* (es) {
    const clip = yield* copySelection(player, sel, false, true);
    try {
      es.count += yield* pasteClip(player, clip, es.dim, o, { rotation: 0, mirror, air: sel.kind === "box", entities: false }, false);
    } finally {
      freeClip(clip);
    }
  });
}

/**
 * Array: Kopien mit frei wählbarem Versatz und optionaler Drehung pro Kopie (z.B. Wendeltreppen, Säulenreihen).
 * @param {import("./state.js").Session} ses
 * @param {{x:number,y:number,z:number}} off Versatz pro Kopie
 * @param {number} count
 * @param {number} rotStep Drehung pro Kopie in Grad (0/90/180/270)
 */
export function opArray(ses, off, count, rotStep) {
  const sel = need(ses);
  if (!sel) return;
  const size = selDims(sel);
  const cx = sel.min.x + (size.x - 1) / 2;
  const cz = sel.min.z + (size.z - 1) / 2;
  /** @type {{rot:number, min:{x:number,y:number,z:number}}[]} */
  const copies = [];
  let min = { ...sel.min };
  let max = { ...sel.max };
  for (let i = 1; i <= count; i++) {
    const rot = (rotStep * i) % 360;
    const rs = rotatedSize(size, rot);
    const m = v(Math.round(cx + off.x * i - (rs.x - 1) / 2), sel.min.y + off.y * i, Math.round(cz + off.z * i - (rs.z - 1) / 2));
    copies.push({ rot, min: m });
    min = vmin(min, m);
    max = vmax(max, v(m.x + rs.x - 1, m.y + rs.y - 1, m.z + rs.z - 1));
  }
  const player = ses.player;
  runEdit(player, { label: `Array ×${count}`, region: { min, max }, forceRegion: true, useMask: false }, function* (es) {
    const clip = yield* copySelection(player, sel, false, true);
    try {
      for (const c of copies) es.count += yield* pasteClip(player, clip, es.dim, c.min, { rotation: c.rot, mirror: "None", air: sel.kind === "box", entities: false }, false);
    } finally {
      freeClip(clip);
    }
  });
}

/**
 * Auswahl verschieben (Inhalt + Auswahl).
 * @param {import("./state.js").Session} ses
 * @param {{x:number,y:number,z:number}} dir Einheitsvektor
 * @param {number} dist
 */
export function opMove(ses, dir, dist) {
  const sel = need(ses);
  if (!sel) return;
  const off = v(dir.x * dist, dir.y * dist, dir.z * dist);
  const min = vmin(sel.min, v(sel.min.x + off.x, sel.min.y + off.y, sel.min.z + off.z));
  const max = vmax(sel.max, v(sel.max.x + off.x, sel.max.y + off.y, sel.max.z + off.z));
  const player = ses.player;
  runEdit(player, { label: "Verschieben", region: { min, max }, forceRegion: true, useMask: false }, function* (es) {
    const clip = yield* copySelection(player, sel, false, true);
    try {
      const A = air();
      let n = 0;
      for (const p of selPositions(sel)) {
        es.set(p.x, p.y, p.z, A);
        if (++n % 512 === 0) yield;
      }
      es.count += yield* pasteClip(player, clip, es.dim, v(sel.min.x + off.x, sel.min.y + off.y, sel.min.z + off.z), { rotation: 0, mirror: "None", air: sel.kind === "box", entities: false }, false);
    } finally {
      freeClip(clip);
    }
    ses.sel = shiftSel(sel, off);
  });
}

/**
 * Auswahl an Ort und Stelle drehen/spiegeln.
 * @param {import("./state.js").Session} ses
 * @param {number} rotation
 * @param {string} mirror
 */
export function opTransform(ses, rotation, mirror) {
  const sel = need(ses);
  if (!sel) return;
  const size = selDims(sel);
  const rs = rotatedSize(size, rotation);
  const cx = sel.min.x + (size.x - 1) / 2;
  const cz = sel.min.z + (size.z - 1) / 2;
  const nmin = v(Math.round(cx - (rs.x - 1) / 2), sel.min.y, Math.round(cz - (rs.z - 1) / 2));
  const nmax = v(nmin.x + rs.x - 1, sel.max.y, nmin.z + rs.z - 1);
  const player = ses.player;
  runEdit(player, { label: rotation ? `Drehen ${rotation}°` : "Spiegeln", region: { min: vmin(sel.min, nmin), max: vmax(sel.max, nmax) }, forceRegion: true, useMask: false }, function* (es) {
    const clip = yield* copySelection(player, sel, false, true);
    try {
      const A = air();
      let n = 0;
      for (const p of selPositions(sel)) {
        es.set(p.x, p.y, p.z, A);
        if (++n % 512 === 0) yield;
      }
      es.count += yield* pasteClip(player, clip, es.dim, nmin, { rotation, mirror, air: sel.kind === "box", entities: false }, false);
    } finally {
      freeClip(clip);
    }
    ses.sel = { kind: "box", dim: sel.dim, min: nmin, max: nmax };
  });
}

/** Blöcke zählen. @param {import("./state.js").Session} ses */
export function opAnalyze(ses) {
  const sel = need(ses);
  if (!sel) return;
  const player = ses.player;
  runEdit(player, { label: "Analyse", quiet: true }, function* (es) {
    /** @type {Map<string, number>} */
    const cnt = new Map();
    let n = 0;
    for (const p of selPositions(sel)) {
      const id = es.id(p.x, p.y, p.z);
      if (id) cnt.set(id, (cnt.get(id) ?? 0) + 1);
      if (++n % 1024 === 0) yield;
    }
    const total = selSize(sel);
    const rows = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
    const solid = rows.filter(([id]) => !isAirId(id)).reduce((a, [, c]) => a + c, 0);
    let text = `§dAnalyse§r: ${fmtNum(total)} Positionen, ${fmtNum(solid)} Blöcke (ohne Luft), ${rows.length} Sorten\n`;
    for (const [id, c] of rows.slice(0, 15)) text += `  §e${shortId(id)}§r: ${fmtNum(c)} (${((c / total) * 100).toFixed(1)}%)\n`;
    if (rows.length > 15) text += `  §7… und ${rows.length - 15} weitere`;
    player.sendMessage(text);
  });
}

/**
 * Eingeschlossene Hohlräume füllen: Luft, die nicht mit dem Rand der Auswahl verbunden ist.
 * @param {import("./state.js").Session} ses
 */
export function opFillEnclosed(ses) {
  const sel = need(ses);
  if (!sel) return;
  const pick = picker(ses.s.pattern);
  const { min, max } = sel;
  runEdit(ses.player, { label: "Hohlräume füllen", region: { min, max } }, function* (es) {
    /** @param {number} x @param {number} y @param {number} z */
    const open = (x, y, z) => {
      if (!selContains(sel, x, y, z)) return false;
      const id = es.id(x, y, z);
      return !!id && !isSolidId(id);
    };
    const outside = new Set();
    /** @type {[number,number,number][]} */
    const queue = [];
    // Startpunkte: offene Positionen am Rand der Auswahl
    for (const p of selPositions(sel)) {
      const edge =
        !selContains(sel, p.x + 1, p.y, p.z) || !selContains(sel, p.x - 1, p.y, p.z) || !selContains(sel, p.x, p.y + 1, p.z) ||
        !selContains(sel, p.x, p.y - 1, p.z) || !selContains(sel, p.x, p.y, p.z + 1) || !selContains(sel, p.x, p.y, p.z - 1);
      if (edge && open(p.x, p.y, p.z)) {
        const k = p.x + "," + p.y + "," + p.z;
        if (!outside.has(k)) {
          outside.add(k);
          queue.push([p.x, p.y, p.z]);
        }
      }
    }
    yield;
    let qi = 0;
    const D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    while (qi < queue.length) {
      const [x, y, z] = queue[qi++];
      for (const [dx, dy, dz] of D) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        const k = nx + "," + ny + "," + nz;
        if (outside.has(k) || !open(nx, ny, nz)) continue;
        outside.add(k);
        queue.push([nx, ny, nz]);
      }
      if (qi % 512 === 0) yield;
    }
    let n = 0;
    for (const p of selPositions(sel)) {
      if (!outside.has(p.x + "," + p.y + "," + p.z) && open(p.x, p.y, p.z)) es.set(p.x, p.y, p.z, pick());
      if (++n % 512 === 0) yield;
    }
  });
}

const WATERISH = /^minecraft:(water|flowing_water|seagrass|tall_seagrass|kelp|kelp_plant|bubble_column)$/;

/** Wasser (inkl. Seegras/Seetang) in der Auswahl entfernen. @param {import("./state.js").Session} ses */
export function opDrain(ses) {
  const A = air();
  perBlock(
    ses,
    "Wasser ablassen",
    (es, x, y, z) => {
      if (WATERISH.test(es.id(x, y, z))) es.set(x, y, z, A);
    },
    { useMask: false }
  );
}

/** Luft in der Auswahl mit Wasser füllen. @param {import("./state.js").Session} ses */
export function opFlood(ses) {
  const W = BlockPermutation.resolve("minecraft:water");
  perBlock(
    ses,
    "Mit Wasser füllen",
    (es, x, y, z) => {
      const id = es.id(x, y, z);
      if (id && !isSolidId(id) && !WATERISH.test(id)) es.set(x, y, z, W);
    },
    { useMask: false }
  );
}

/**
 * Auswahl in 3D vergrößern (+n) oder verkleinern (-n).
 * @param {import("./state.js").Session} ses
 * @param {number} n
 */
export function selGrow(ses, n) {
  const sel = need(ses);
  if (!sel) return;
  if (sel.kind === "box") {
    const d = selDims(sel);
    if (n < 0 && (d.x <= -2 * n || d.y <= -2 * n || d.z <= -2 * n)) return err(ses.player, "Auswahl ist dafür zu klein.");
    ses.sel = { kind: "box", dim: sel.dim, min: v(sel.min.x - n, sel.min.y - n, sel.min.z - n), max: v(sel.max.x + n, sel.max.y + n, sel.max.z + n) };
    msg(ses.player, `Auswahl: ${fmtNum(selSize(ses.sel))} Blöcke`);
    return;
  }
  let keys = new Set(sel.keys);
  const D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let i = 0; i < Math.abs(n); i++) {
    const next = new Set(n > 0 ? keys : []);
    for (const k of keys) {
      const [x, y, z] = k.split(",").map(Number);
      if (n > 0) {
        for (const [dx, dy, dz] of D) next.add(`${x + dx},${y + dy},${z + dz}`);
      } else if (D.every(([dx, dy, dz]) => keys.has(`${x + dx},${y + dy},${z + dz}`))) next.add(k);
    }
    if (next.size > SET_LIMIT) return err(ses.player, "Auswahl würde zu groß.");
    keys = next;
  }
  if (!keys.size) return err(ses.player, "Auswahl wäre danach leer.");
  /** @type {import("./selection.js").SetSel} */
  const out = { kind: "set", dim: sel.dim, keys, min: sel.min, max: sel.max };
  recomputeBounds(out);
  ses.sel = out;
  msg(ses.player, `Auswahl: ${fmtNum(keys.size)} Blöcke`);
}

/** Auswahl auf die Oberfläche begrenzen (feste Blöcke mit Luft darüber). @param {import("./state.js").Session} ses */
export function selSurface(ses) {
  const sel = need(ses);
  if (!sel) return;
  const dim = ses.player.dimension;
  const keys = new Set();
  let n = 0;
  for (const p of selPositions(sel)) {
    if (++n > 4000000) break;
    try {
      const b = dim.getBlock(p);
      const up = dim.getBlock({ x: p.x, y: p.y + 1, z: p.z });
      if (b && up && isSolidId(b.typeId) && !isSolidId(up.typeId)) keys.add(`${p.x},${p.y},${p.z}`);
    } catch {}
    if (keys.size > SET_LIMIT) return err(ses.player, "Zu viele Oberflächenblöcke.");
  }
  if (!keys.size) return err(ses.player, "Keine Oberfläche in der Auswahl gefunden.");
  /** @type {import("./selection.js").SetSel} */
  const out = { kind: "set", dim: sel.dim, keys, min: sel.min, max: sel.max };
  recomputeBounds(out);
  ses.sel = out;
  msg(ses.player, `Oberfläche: ${fmtNum(keys.size)} Blöcke ausgewählt`);
}

/**
 * Zwischenablage (z.B. geladene Baum-Blaupause) zufällig auf der Oberfläche der Auswahl verteilen.
 * @param {import("./state.js").Session} ses
 * @param {{count:number, spacing:number, rotate:boolean}} o
 */
export function opScatterClip(ses, o) {
  const sel = need(ses);
  if (!sel) return;
  const player = ses.player;
  const clip = getClip(player);
  if (!clip) return err(player, "Zwischenablage ist leer – erst eine Blaupause laden oder etwas kopieren.");
  const dim = player.dimension;
  // Oberflächenpunkte (oberster fester Block je Spalte mit Luft darüber) sammeln
  /** @type {{x:number,y:number,z:number}[]} */
  const spots = [];
  /** @type {Map<string, number>} */
  const top = new Map();
  for (const p of selPositions(sel)) {
    const k = p.x + "," + p.z;
    if ((top.get(k) ?? -Infinity) >= p.y) continue;
    try {
      const b = dim.getBlock(p);
      const up = dim.getBlock({ x: p.x, y: p.y + 1, z: p.z });
      if (b && up && isSolidId(b.typeId) && !isSolidId(up.typeId)) top.set(k, p.y);
    } catch {}
  }
  for (const [k, y] of top) {
    const [x, z] = k.split(",").map(Number);
    spots.push({ x, y, z });
  }
  if (!spots.length) return err(player, "Keine Oberfläche in der Auswahl gefunden.");
  // Zufällig wählen mit Mindestabstand
  /** @type {{x:number,y:number,z:number, rot:number}[]} */
  const chosen = [];
  for (let tries = 0; tries < o.count * 30 && chosen.length < o.count; tries++) {
    const s = spots[Math.floor(Math.random() * spots.length)];
    if (chosen.some((c) => (c.x - s.x) ** 2 + (c.z - s.z) ** 2 < o.spacing * o.spacing)) continue;
    chosen.push({ ...s, rot: o.rotate ? [0, 90, 180, 270][Math.floor(Math.random() * 4)] : 0 });
  }
  const R = Math.max(clip.size.x, clip.size.z);
  const min = v(sel.min.x - R, sel.min.y, sel.min.z - R);
  const max = v(sel.max.x + R, sel.max.y + clip.size.y + 1, sel.max.z + R);
  runEdit(player, { label: `Streuen ×${chosen.length}`, region: { min, max }, forceRegion: true, useMask: false }, function* (es) {
    for (const c of chosen) {
      const rs = rotatedSize(clip.size, c.rot);
      const origin = v(c.x - Math.floor(rs.x / 2), c.y + 1, c.z - Math.floor(rs.z / 2));
      es.count += yield* pasteClip(player, clip, es.dim, origin, { rotation: c.rot, mirror: "None", air: false, entities: false }, false);
    }
  });
}

/**
 * Verlauf in der Auswahl: Muster 1 → Muster 2 entlang einer Achse, mit zufällig gemischter Übergangszone.
 * Ersetzt nur feste Blöcke.
 * @param {import("./state.js").Session} ses
 * @param {{axis:string, blend:number, reverse:boolean}} o
 */
export function opGradient(ses, o) {
  const sel = need(ses);
  if (!sel) return;
  const p1 = picker(ses.s.pattern);
  const p2 = picker(ses.s.pattern2);
  const ax = /** @type {"x"|"y"|"z"} */ (o.axis);
  const lo = sel.min[ax];
  const hi = sel.max[ax];
  const span = Math.max(1, hi - lo);
  perBlock(ses, "Verlauf", (es, x, y, z) => {
    const id = es.id(x, y, z);
    if (!id || !isSolidId(id)) return;
    let f = (({ x, y, z })[ax] - lo) / span;
    if (o.reverse) f = 1 - f;
    // Übergangszone: je größer „blend", desto breiter die Mischung um die Mitte
    const width = Math.min(1, o.blend / 10);
    const pr = width <= 0 ? (f >= 0.5 ? 1 : 0) : Math.max(0, Math.min(1, (f - 0.5) / width + 0.5));
    es.set(x, y, z, Math.random() < pr ? p2() : p1());
  });
}

/**
 * Auswahl ausdünnen: zufällig X % der festen Blöcke entfernen (oder durch das Muster ersetzen).
 * @param {import("./state.js").Session} ses
 * @param {{percent:number, replace:boolean}} o
 */
export function opThin(ses, o) {
  const A = air();
  const pick = picker(ses.s.pattern);
  perBlock(ses, "Ausdünnen", (es, x, y, z) => {
    const id = es.id(x, y, z);
    if (!id || !isSolidId(id) || Math.random() * 100 >= o.percent) return;
    es.set(x, y, z, o.replace ? pick() : A);
  });
}

/**
 * Landschaft in der Auswahl erzeugen: Höhen aus fraktalem Rauschen, Oberfläche passend (Gras, Fels an Hängen,
 * Sand am Wasser, Schnee oben), Wasser bis zur Meereshöhe. Die Auswahl wird komplett neu gefüllt.
 * @param {import("./state.js").Session} ses
 * @param {{scale:number, relief:number, sea:number, octaves:number}} o
 * @param {number} [seed] Zufallsversatz (fest für Tests)
 */
export function opLandscape(ses, o, seed = Math.random() * 1000) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const sy = max.y - min.y + 1;
  const seaY = o.sea > 0 ? min.y + Math.round(((sy - 1) * o.sea) / 100) : -Infinity;
  const snowY = min.y + Math.round((sy - 1) * 0.85);
  /** @type {Map<string, number>} */
  const H = new Map();
  for (let x = min.x; x <= max.x; x++)
    for (let z = min.z; z <= max.z; z++) {
      const n = fbm((x + seed) / o.scale, 0.37, (z + seed * 0.7) / o.scale, o.octaves);
      const t = Math.pow(Math.min(1, Math.max(0, 0.5 + n * 0.9)), 1.2);
      H.set(x + "," + z, min.y + Math.round(t * (sy - 1) * (o.relief / 100)));
    }
  writeTerrain(ses, sel, H, seaY, snowY, "Landschaft");
}

/**
 * Höhenkarte in die Auswahl schreiben: Boden mit passender Oberfläche, darüber Wasser bis zur Meereshöhe, sonst Luft.
 * @param {import("./state.js").Session} ses
 * @param {import("./selection.js").Selection} sel
 * @param {Map<string, number>} H Bodenhöhe je Spalte
 * @param {number} seaY @param {number} snowY @param {string} label
 */
function writeTerrain(ses, sel, H, seaY, snowY, label) {
  const { min, max } = sel;
  /** @type {Map<string, BlockPermutation>} */
  const cache = new Map();
  const P = (/** @type {string} */ id) => {
    let p = cache.get(id);
    if (!p) cache.set(id, (p = BlockPermutation.resolve(id)));
    return p;
  };
  const W = P("minecraft:water");
  const A = air();
  runEdit(ses.player, { label, region: { min, max } }, function* (es) {
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        const h = /** @type {number} */ (H.get(x + "," + z));
        let slope = 0;
        let wet = h <= seaY + 1;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nh = H.get(x + dx + "," + (z + dz));
          if (nh === undefined) continue;
          slope = Math.max(slope, Math.abs(nh - h));
          if (nh < seaY) wet = wet || h <= seaY + 2;
        }
        let sf = surfaceFor(slope, wet, h, snowY, x, z);
        if (h < seaY) sf = h < seaY - 3 ? { top: "minecraft:gravel", sub: "minecraft:dirt" } : { top: "minecraft:sand", sub: "minecraft:sand" };
        for (let y = min.y; y <= max.y; y++) {
          if (!selContains(sel, x, y, z)) continue;
          if (y > h) es.set(x, y, z, y <= seaY ? W : A);
          else if (y === h) es.set(x, y, z, P(sf.top));
          else es.set(x, y, z, P(h - y <= 3 ? sf.sub : "minecraft:stone"));
        }
      }
      yield;
    }
  });
}

/**
 * Inselgruppe in der Auswahl: Meer mit mehreren Inseln (Strand, Wiese, Fels, bei großen Inseln ein Gipfel).
 * @param {import("./state.js").Session} ses
 * @param {{count:number, size:number, sea:number}} o
 * @param {() => number} [rand]
 */
export function opIslands(ses, o, rand = Math.random) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const sx = max.x - min.x + 1;
  const sy = max.y - min.y + 1;
  const sz = max.z - min.z + 1;
  const seaY = min.y + Math.max(2, Math.round(((sy - 1) * o.sea) / 100));
  const snowY = min.y + Math.round((sy - 1) * 0.9);
  const base = Math.min(sx, sz);
  /** @type {{x:number, z:number, r:number, h:number}[]} */
  const isl = [];
  for (let i = 0; i < o.count; i++) {
    const r = Math.max(3, (base / 2) * (o.size / 100) * (0.5 + rand() * 0.6));
    isl.push({
      x: min.x + r * 0.6 + rand() * Math.max(1, sx - r * 1.2),
      z: min.z + r * 0.6 + rand() * Math.max(1, sz - r * 1.2),
      r,
      h: (max.y - seaY) * (0.35 + rand() * 0.65),
    });
  }
  const seed = rand() * 1000;
  /** @type {Map<string, number>} */
  const H = new Map();
  for (let x = min.x; x <= max.x; x++)
    for (let z = min.z; z <= max.z; z++) {
      // Meeresgrund mit leichten Wellen, Inseln als Hügel mit unregelmäßiger Küste
      let h = seaY - 4 + fbm(x / 12 + seed, 0.2, z / 12, 2) * 2;
      for (const I of isl) {
        const wob = 1 + fbm(x / 7 + seed, 0.6, z / 7 + I.x, 2) * 0.45;
        const d = Math.hypot(x - I.x, z - I.z) / (I.r * wob);
        if (d >= 1) continue;
        const q = 1 - d;
        h = Math.max(h, seaY - 2 + (I.h + 2) * Math.pow(q, 1.4) + (q > 0.15 ? 1.5 : 0));
      }
      H.set(x + "," + z, Math.max(min.y, Math.min(max.y, Math.round(h))));
    }
  writeTerrain(ses, sel, H, seaY, snowY, "Inselgruppe");
}

/**
 * Gletscherspalten in der Auswahl: ein dicker Eispanzer mit Schneedecke, durch den quer zur Blickrichtung (der
 * Fließrichtung des Gletschers) tiefe, schmale, leicht geschwungene Spalten laufen. Die Spaltenwände sind aus Blaueis,
 * oben liegen Schneewehen. Die Auswahl wird neu gefüllt.
 * @param {import("./state.js").Session} ses
 * @param {{spacing:number, depth:number}} o spacing = Abstand der Spalten, depth = Tiefe in % der Eisdicke
 * @param {{x:number, z:number}} dir Blickrichtung (Fließrichtung)
 * @param {() => number} [rand]
 */
export function opCrevasses(ses, o, dir, rand = Math.random) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const sy = max.y - min.y + 1;
  if (sy < 6) return err(ses.player, "Die Auswahl ist zu flach – mindestens 6 Blöcke hoch.");
  const alongX = Math.abs(dir.x) >= Math.abs(dir.z);
  const top0 = min.y + Math.max(3, Math.round((sy - 1) * 0.6));
  const lam = Math.max(5, o.spacing);
  const seed = rand() * 1000;
  /** Abstand zur nächsten Spalte (0 = mitten drin) und ob dort eine Spalte ist. @param {number} x @param {number} z */
  const crev = (x, z) => {
    const u = alongX ? x : z;
    const w = alongX ? z : x;
    const ph = u / lam + fbm(w / 12 + seed, 0.4, seed, 2) * 0.5;
    const f = ph - Math.floor(ph);
    const dist = Math.min(f, 1 - f) * lam;
    const width = 0.6 + (fbm(w / 6 + seed, 1.9, Math.floor(ph), 1) > 0.2 ? 0.6 : 0);
    const open = fbm(w / 9 + seed, 3.7, Math.floor(ph) * 2.3, 2) > -0.25;
    return { open: open && dist <= width, near: open && dist <= width + 1.2, deep: Math.floor(ph) };
  };
  /** @type {Map<string, BlockPermutation>} */
  const cache = new Map();
  const P = (/** @type {string} */ id) => {
    let p = cache.get(id);
    if (!p) cache.set(id, (p = BlockPermutation.resolve(id)));
    return p;
  };
  const A = air();
  runEdit(ses.player, { label: "Gletscherspalten", region: { min, max } }, function* (es) {
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        const top = Math.min(max.y - 1, top0 + Math.round(fbm(x / 14 + seed, 2.8, z / 14, 2) * 1.5));
        const c = crev(x, z);
        const D = Math.round((top - min.y) * (o.depth / 100) * (0.75 + 0.25 * Math.abs(Math.sin(c.deep * 1.7 + seed))));
        const bottom = top - Math.max(2, D);
        const drift = !c.near && fbm(x / 4 + seed, 5.2, z / 4, 1) > 0.35;
        for (let y = min.y; y <= max.y; y++) {
          if (!selContains(sel, x, y, z)) continue;
          let b = A;
          if (y === min.y) b = P("minecraft:stone");
          else if (c.open && y > bottom) b = A;
          else if (c.open && y === bottom) b = P("minecraft:blue_ice");
          else if (y < top) b = P(c.near ? "minecraft:blue_ice" : "minecraft:packed_ice");
          else if (y === top) b = P(c.near ? "minecraft:packed_ice" : "minecraft:snow");
          else if (y === top + 1 && drift) b = P("minecraft:snow_layer");
          es.set(x, y, z, b);
        }
      }
      yield;
    }
  });
}

/**
 * Moorlandschaft in der Auswahl: flaches Land mit vielen Wasserlöchern und Tümpeln (Schlammgrund, Seerosen), dazwischen
 * Moos, dunkle Torferde und kleine Bulten, Gras und abgestorbene Bäume ohne Blätter. Der Rand der Auswahl bleibt Land,
 * damit kein Wasser ausläuft. Die Auswahl wird neu gefüllt.
 * @param {import("./state.js").Session} ses
 * @param {{wet:number, trees:number}} o wet = Wasseranteil in %, trees = tote Bäume (Dichte in %)
 * @param {() => number} [rand]
 */
export function opBog(ses, o, rand = Math.random) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const sy = max.y - min.y + 1;
  if (sy < 10) return err(ses.player, "Die Auswahl ist zu niedrig – mindestens 10 Blöcke hoch.");
  const L = min.y + Math.max(3, Math.round((sy - 8) * 0.4));
  const seed = rand() * 1000;
  // Wasseranteil → Schwelle im Rauschen (ca. -0.5 … 0.3)
  const thr = o.wet <= 0 ? -Infinity : -0.5 + (Math.min(100, o.wet) / 100) * 0.8;
  /** @type {Map<string, {kind:"water"|"deep"|"land"|"bult", n:number}>} */
  const M = new Map();
  for (let x = min.x; x <= max.x; x++)
    for (let z = min.z; z <= max.z; z++) {
      const edge = x === min.x || x === max.x || z === min.z || z === max.z;
      const n = fbm(x / 7 + seed, 0.6, z / 7, 3);
      const kind = !edge && n < thr ? (n < thr - 0.25 ? "deep" : "water") : n > thr + 0.55 ? "bult" : "land";
      M.set(x + "," + z, { kind, n });
    }
  /** @type {Map<string, BlockPermutation>} */
  const cache = new Map();
  const P = (/** @type {string} */ id, /** @type {Record<string, any>} */ st = {}) => {
    const k = id + JSON.stringify(st);
    let p = cache.get(k);
    if (!p) cache.set(k, (p = BlockPermutation.resolve(id, st)));
    return p;
  };
  const A = air();
  const W = P("minecraft:water");
  runEdit(ses.player, { label: "Moorlandschaft", region: { min, max } }, function* (es) {
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        const { kind, n } = /** @type {{kind:string, n:number}} */ (M.get(x + "," + z));
        const r = rand();
        const wet = kind === "water" || kind === "deep";
        const bed = kind === "deep" ? L - 2 : L - 1;
        const top = kind === "bult" ? L + 1 : L;
        const surface = r < 0.45 ? "minecraft:moss_block" : r < 0.75 ? "minecraft:podzol" : r < 0.9 ? "minecraft:coarse_dirt" : "minecraft:mud";
        for (let y = min.y; y <= max.y; y++) {
          if (!selContains(sel, x, y, z)) continue;
          let b = A;
          if (wet) {
            if (y < bed) b = P(L - y <= 4 ? "minecraft:dirt" : "minecraft:stone");
            else if (y === bed) b = P("minecraft:mud");
            else if (y <= L) b = W;
            else if (y === L + 1 && r < 0.12) b = P("minecraft:waterlily");
          } else if (y < top) b = P(top - y <= 4 ? "minecraft:dirt" : "minecraft:stone");
          else if (y === top) b = P(surface);
          else if (y === top + 1 && surface === "minecraft:moss_block" && r < 0.15) b = P("minecraft:moss_carpet");
          else if (y === top + 1 && r > 0.93 + n * 0.02) b = P("minecraft:short_grass");
          es.set(x, y, z, b);
        }
      }
      yield;
    }
    // tote Bäume: kahler Stamm mit ein, zwei abgebrochenen Ästen
    const tries = Math.round(((max.x - min.x + 1) * (max.z - min.z + 1) * o.trees) / 4000);
    /** @type {{x:number, z:number}[]} */
    const trees = [];
    for (let i = 0; i < tries; i++) {
      const x = Math.round(min.x + 2 + rand() * (max.x - min.x - 4));
      const z = Math.round(min.z + 2 + rand() * (max.z - min.z - 4));
      const col = M.get(x + "," + z);
      if (!col || col.kind === "water" || col.kind === "deep") continue;
      if (!trees.every((t) => Math.abs(t.x - x) + Math.abs(t.z - z) >= 5)) continue;
      const g = col.kind === "bult" ? L + 1 : L;
      const H = 3 + Math.floor(rand() * 4);
      if (g + H + 1 > max.y) continue;
      trees.push({ x, z });
      const log = rand() < 0.5 ? "minecraft:spruce_log" : "minecraft:dark_oak_log";
      for (let k = 1; k <= H; k++) es.set(x, g + k, z, P(log, { pillar_axis: "y" }));
      const branches = 1 + Math.floor(rand() * 2);
      for (let b = 0; b < branches; b++) {
        const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
        const by = g + 2 + Math.floor(rand() * (H - 1));
        es.set(x + dx, by, z + dz, P(log, { pillar_axis: dx ? "x" : "z" }));
      }
      yield;
    }
  });
}

/**
 * Kirschblütenhain in der Auswahl: sanfte grüne Hügel mit Kirschbäumen (geschwungener Stamm, breite, flache
 * rosa Krone mit herabhängenden Blättern) und einem Teppich aus rosa Blütenblättern im Gras. Die Auswahl wird neu
 * gefüllt.
 * @param {import("./state.js").Session} ses
 * @param {{trees:number, petals:number}} o trees = Baumdichte in %, petals = Blütenteppich in %
 * @param {() => number} [rand]
 */
export function opCherryGrove(ses, o, rand = Math.random) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const sy = max.y - min.y + 1;
  if (sy < 14) return err(ses.player, "Die Auswahl ist zu niedrig – mindestens 14 Blöcke hoch (für die Bäume).");
  const seed = rand() * 1000;
  const base = min.y + Math.max(2, Math.round((sy - 10) * 0.4));
  const relief = Math.max(1, Math.min(6, max.y - 10 - base));
  /** @type {Map<string, number>} */
  const H = new Map();
  for (let x = min.x; x <= max.x; x++)
    for (let z = min.z; z <= max.z; z++) H.set(x + "," + z, Math.round(base + relief * (0.5 + fbm(x / 16 + seed, 0.3, z / 16, 3) * 0.7)));
  /** @type {Map<string, BlockPermutation>} */
  const cache = new Map();
  const P = (/** @type {string} */ id, /** @type {Record<string, any>} */ st = {}) => {
    const k = id + JSON.stringify(st);
    let p = cache.get(k);
    if (!p) cache.set(k, (p = BlockPermutation.resolve(id, st)));
    return p;
  };
  const A = air();
  runEdit(ses.player, { label: "Kirschblütenhain", region: { min, max } }, function* (es) {
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        const h = /** @type {number} */ (H.get(x + "," + z));
        const petal = rand() * 100 < o.petals;
        for (let y = min.y; y <= max.y; y++) {
          if (!selContains(sel, x, y, z)) continue;
          if (y === h + 1 && petal) es.set(x, y, z, P("minecraft:pink_petals"));
          else if (y > h) es.set(x, y, z, A);
          else if (y === h) es.set(x, y, z, P("minecraft:grass_block"));
          else es.set(x, y, z, P(h - y <= 3 ? "minecraft:dirt" : "minecraft:stone"));
        }
      }
      yield;
    }
    // Bäume mit Abstand
    const log = P("minecraft:cherry_log");
    const leaves = P("minecraft:cherry_leaves", { persistent_bit: true });
    const inSel = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => selContains(sel, x, y, z);
    const leaf = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
      if (!inSel(x, y, z)) return;
      const id = es.id(x, y, z);
      if (!id || id === "minecraft:air" || id === "minecraft:pink_petals") es.set(x, y, z, leaves);
    };
    /** @type {{x:number, z:number}[]} */
    const trees = [];
    const tries = Math.round(((max.x - min.x + 1) * (max.z - min.z + 1) * o.trees) / 2500);
    for (let i = 0; i < tries; i++) {
      const x = Math.round(min.x + 3 + rand() * (max.x - min.x - 6));
      const z = Math.round(min.z + 3 + rand() * (max.z - min.z - 6));
      if (!trees.every((t) => Math.hypot(t.x - x, t.z - z) >= 7)) continue;
      const g = /** @type {number} */ (H.get(x + "," + z));
      const tH = 4 + Math.floor(rand() * 3);
      if (g + tH + 3 > max.y) continue;
      trees.push({ x, z });
      // Stamm, oben ein Stück zur Seite geneigt
      const [lx, lz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
      let cx = x;
      let cz = z;
      for (let k = 1; k <= tH; k++) {
        if (k === tH - 1) {
          cx += lx;
          cz += lz;
        }
        es.set(cx, g + k, cz, log);
      }
      const top = g + tH;
      // breite, flache Krone und herabhängende Blätter am Rand
      for (let dy = -1; dy <= 2; dy++) {
        const r = dy === 2 ? 1.5 : dy === 1 ? 3 : dy === 0 ? 3.5 : 2.5;
        for (let dx = -4; dx <= 4; dx++)
          for (let dz = -4; dz <= 4; dz++) {
            const d = Math.hypot(dx, dz);
            if (d > r) continue;
            if (dy === -1 && d < 1.5) continue;
            leaf(cx + dx, top + dy, cz + dz);
            if (dy === 0 && d > 2.6 && rand() < 0.35) leaf(cx + dx, top - 1, cz + dz);
          }
      }
      yield;
    }
  });
}

/**
 * Tropfsteinhöhle in der Auswahl: eine große, unregelmäßige Höhle wird aus dem Gestein gegraben. Von der Decke hängen
 * Tropfsteine (Stalaktiten), vom Boden wachsen welche nach oben (Stalagmiten), Boden und Decke sind stellenweise aus
 * Tropfsteinblock, in der tiefsten Mulde liegt ein kleiner See. Am besten tief unter der Erde benutzen.
 * @param {import("./state.js").Session} ses
 * @param {{density:number, lake:number}} o density = Tropfsteine in %, lake = Seetiefe (0 = kein See)
 * @param {() => number} [rand]
 */
export function opDripCave(ses, o, rand = Math.random) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const d = selDims(sel);
  if (Math.min(d.x, d.y, d.z) < 6) return err(ses.player, "Die Auswahl ist zu klein – mindestens 6×6×6 Blöcke.");
  const c = v((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  const r = v(d.x / 2 - 0.5, d.y / 2 - 0.5, d.z / 2 - 0.5);
  const seed = rand() * 1000;
  const inCave = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
    if (!selContains(sel, x, y, z)) return false;
    const q = ((x - c.x) / r.x) ** 2 + ((y - c.y) / r.y) ** 2 + ((z - c.z) / r.z) ** 2;
    return q + fbm(x / 6 + seed, y / 5, z / 6, 2) * 0.45 < 0.85;
  };
  /** @type {Map<string, BlockPermutation>} */
  const cache = new Map();
  const P = (/** @type {string} */ id, /** @type {Record<string, any>} */ st = {}) => {
    const k = id + JSON.stringify(st);
    let p = cache.get(k);
    if (!p) cache.set(k, (p = BlockPermutation.resolve(id, st)));
    return p;
  };
  const A = air();
  const W = P("minecraft:water");
  const DB = P("minecraft:dripstone_block");
  /** Teile eines Tropfsteins von der Wurzel zur Spitze. @param {number} L */
  const parts = (L) => (L === 1 ? ["tip"] : L === 2 ? ["frustum", "tip"] : ["base", ...Array(L - 3).fill("middle"), "frustum", "tip"]);
  runEdit(ses.player, { label: "Tropfsteinhöhle", region: { min, max } }, function* (es) {
    // tiefster Höhlenboden → Seehöhe
    let lowest = Infinity;
    for (let x = min.x; x <= max.x; x++) for (let z = min.z; z <= max.z; z++) for (let y = min.y; y <= max.y; y++) if (inCave(x, y, z)) ((lowest = Math.min(lowest, y)), (y = max.y + 1));
    if (lowest === Infinity) return;
    const lakeY = o.lake > 0 ? lowest + o.lake - 1 : -Infinity;
    // Graben
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++)
        for (let y = min.y; y <= max.y; y++) if (inCave(x, y, z)) es.set(x, y, z, y <= lakeY ? W : A);
      yield;
    }
    // Decke und Boden verzieren
    const dens = Math.max(0, o.density) / 100;
    let n = 0;
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++)
        for (let y = min.y; y <= max.y; y++) {
          if (!inCave(x, y, z)) continue;
          const above = !inCave(x, y + 1, z) && isSolidId(es.id(x, y + 1, z) ?? "");
          const below = !inCave(x, y - 1, z) && isSolidId(es.id(x, y - 1, z) ?? "") && y > lakeY;
          if (above) {
            if (rand() < 0.5 && selContains(sel, x, y + 1, z)) es.set(x, y + 1, z, DB);
            if (rand() < dens * 0.35) {
              // Stalaktit: nach unten, höchstens bis kurz über den Boden
              let space = 0;
              while (space < 6 && inCave(x, y - space - 1, z) && es.id(x, y - space - 1, z) === "minecraft:air") space++;
              const L = Math.min(1 + Math.floor(rand() * 4), space);
              if (L >= 1 && es.id(x, y, z) === "minecraft:air") parts(L).forEach((th, i) => es.set(x, y - i, z, P("minecraft:pointed_dripstone", { dripstone_thickness: th, hanging: true })));
            }
          }
          if (below) {
            if (rand() < 0.5 && selContains(sel, x, y - 1, z)) es.set(x, y - 1, z, DB);
            if (rand() < dens * 0.25 && es.id(x, y, z) === "minecraft:air") {
              let space = 0;
              while (space < 6 && inCave(x, y + space + 1, z) && es.id(x, y + space + 1, z) === "minecraft:air") space++;
              const L = Math.min(1 + Math.floor(rand() * 3), space);
              if (L >= 1) parts(L).forEach((th, i) => es.set(x, y + i, z, P("minecraft:pointed_dripstone", { dripstone_thickness: th, hanging: false })));
            }
          }
          if (++n % 256 === 0) yield;
        }
      yield;
    }
  });
}

/**
 * Canyonlandschaft in der Auswahl: Hochplateau, durch das sich eine gewundene Schlucht in Blickrichtung zieht, mit
 * schmaleren Seitenarmen, die zum Plateau hin ansteigen. Die Wände sind gestuft und in bunten Terrakotta-Schichten
 * gefärbt, oben roter Sand mit toten Büschen, unten auf Wunsch ein Fluss. Die Auswahl wird neu gefüllt.
 * @param {import("./state.js").Session} ses
 * @param {{arms:number, width:number, river:boolean}} o
 * @param {{x:number, z:number}} dir Blickrichtung (Verlauf der Schlucht)
 * @param {() => number} [rand]
 */
export function opCanyonland(ses, o, dir, rand = Math.random) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const sy = max.y - min.y + 1;
  if (sy < 8) return err(ses.player, "Die Auswahl ist zu flach – mindestens 8 Blöcke hoch.");
  const alongX = Math.abs(dir.x) >= Math.abs(dir.z);
  const [u0, u1] = alongX ? [min.x, max.x] : [min.z, max.z];
  const [w0, w1] = alongX ? [min.z, max.z] : [min.x, max.x];
  const wMid = (w0 + w1) / 2;
  const half = (w1 - w0) / 2;
  const top = max.y - 2;
  const floorY = min.y + 2;
  const D = top - floorY;
  const fw = Math.max(1, o.width / 2); // halbe Bodenbreite der Hauptschlucht
  const sw = Math.max(3, D * 0.45); // Breite der gestuften Wand
  const seed = rand() * 1000;
  const center = (/** @type {number} */ u) => wMid + fbm(u / 18 + seed, 0.5, seed, 2) * half * 0.45;
  /** @type {{u:number, w:number, ang:number, len:number}[]} */
  const arms = [];
  for (let i = 0; i < Math.max(0, Math.min(8, o.arms)); i++) {
    const u = u0 + (u1 - u0) * ((i + 0.5 + (rand() - 0.5) * 0.6) / Math.max(1, o.arms));
    const side = i % 2 ? 1 : -1;
    arms.push({ u, w: center(u), ang: side * (0.9 + rand() * 0.5), len: half * (0.6 + rand() * 0.4) });
  }
  /** Gestufte Wand: Höhe je nach Abstand zur Mitte. @param {number} d @param {number} f Bodenbreite @param {number} fy Bodenhöhe */
  const profile = (d, f, fy) => {
    if (d <= f) return fy;
    const t = (d - f) / sw;
    if (t >= 1) return top;
    const steps = Math.max(1, Math.round((top - fy) / 3));
    return fy + Math.round((top - fy) * Math.min(1, Math.ceil(t * steps) / steps));
  };
  /** @type {Map<string, {h:number, main:boolean}>} */
  const H = new Map();
  for (let a = u0; a <= u1; a++)
    for (let b = w0; b <= w1; b++) {
      let h = Math.round(top + fbm(a / 9 + seed, 1.1, b / 9, 2) * 1.2);
      const dMain = Math.abs(b - center(a)) + fbm(a / 4 + seed, 2.3, b / 4, 2) * 0.8;
      const hm = profile(dMain, fw, floorY);
      const main = dMain <= fw;
      h = Math.min(h, hm);
      for (const A of arms) {
        // Abstand zum Seitenarm (Strecke vom Abzweig schräg nach außen)
        const ex = Math.cos(A.ang) * 0.5;
        const ew = Math.sin(A.ang);
        const L = Math.hypot(ex, ew);
        const px = a - A.u;
        const pw = b - A.w;
        const s = Math.max(0, Math.min(A.len, (px * ex + pw * ew) / L));
        const d = Math.hypot(px - (ex / L) * s, pw - (ew / L) * s);
        const k = s / A.len;
        const fy = Math.round(floorY + D * 0.75 * k);
        h = Math.min(h, profile(d, fw * 0.6 * (1 - k * 0.5), fy));
      }
      H.set(alongX ? a + "," + b : b + "," + a, { h: Math.max(min.y + 1, Math.min(max.y - 1, h)), main });
    }
  /** @type {Map<string, BlockPermutation>} */
  const cache = new Map();
  const P = (/** @type {string} */ id) => {
    let p = cache.get(id);
    if (!p) cache.set(id, (p = BlockPermutation.resolve(id)));
    return p;
  };
  const A = air();
  const WAT = P("minecraft:water");
  runEdit(ses.player, { label: "Canyonlandschaft", region: { min, max } }, function* (es) {
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        const { h, main } = /** @type {{h:number, main:boolean}} */ (H.get(x + "," + z));
        const river = o.river && main && h <= floorY;
        const plateau = h >= top - 1;
        const bush = plateau && fbm(x / 1.5 + seed, 6.6, z / 1.5, 1) > 0.62;
        for (let y = min.y; y <= max.y; y++) {
          if (!selContains(sel, x, y, z)) continue;
          if (y === h + 1 && bush) es.set(x, y, z, P("minecraft:deadbush"));
          else if (y > h) es.set(x, y, z, A);
          else if (y === h && river) es.set(x, y, z, WAT);
          else if (y === h && (plateau || h <= floorY)) es.set(x, y, z, P("minecraft:red_sand"));
          else if (y < floorY) es.set(x, y, z, P("minecraft:stone"));
          else es.set(x, y, z, P(MESA_BANDS[(((y - floorY) % MESA_BANDS.length) + MESA_BANDS.length) % MESA_BANDS.length]));
        }
      }
      yield;
    }
  });
}

/**
 * Reisterrassen: der Hang in der Auswahl wird zu flachen Stufen (Stufenhöhe einstellbar). Jede Stufe ist ein
 * Reisfeld – flaches Wasser über Schlamm, dazwischen Reispflanzen (Seegras) –, eingefasst von einem Gras-Damm an der
 * Kante zur nächsttieferen Stufe und am Rand der Auswahl, damit das Wasser nicht ausläuft.
 * @param {import("./state.js").Session} ses
 * @param {{step:number, plants:number}} o step = Stufenhöhe, plants = Pflanzen in %
 */
export function opRiceTerraces(ses, o) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const step = Math.max(1, Math.min(4, o.step));
  /** @type {Map<string, number>} */
  const T = new Map();
  runEdit(ses.player, { label: "Reisterrassen", region: { min, max } }, function* (es) {
    // Bodenhöhe je Spalte → auf Stufen abrunden
    for (let x = min.x; x <= max.x; x++)
      for (let z = min.z; z <= max.z; z++) {
        const g = groundY(es, x, z, max.y, max.y - min.y);
        if (g === null) continue;
        T.set(x + "," + z, min.y + Math.floor((g - min.y) / step) * step);
      }
    yield;
    /** @type {Map<string, BlockPermutation>} */
    const cache = new Map();
    const P = (/** @type {string} */ id) => {
      let p = cache.get(id);
      if (!p) cache.set(id, (p = BlockPermutation.resolve(id)));
      return p;
    };
    const A = air();
    let n = 0;
    for (const [k, t] of T) {
      const [x, z] = k.split(",").map(Number);
      // Damm: an der Auswahlkante oder wo ein Nachbar tiefer liegt (bzw. fehlt)
      const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oz]) => {
        const nt = T.get(x + ox + "," + (z + oz));
        return nt === undefined || nt < t || !selContains(sel, x + ox, t, z + oz);
      });
      for (let y = max.y; y > t; y--) if (selContains(sel, x, y, z)) es.set(x, y, z, A);
      if (rim) {
        es.set(x, t, z, P("minecraft:grass_block"));
        if (t - 1 >= min.y) es.set(x, t - 1, z, P("minecraft:dirt"));
      } else {
        const plant = ((x * 31 + z * 17) % 100 + 100) % 100 < o.plants && (x + z) % 2 === 0;
        es.set(x, t, z, P(plant ? "minecraft:seagrass" : "minecraft:water"));
        if (t - 1 >= min.y) es.set(x, t - 1, z, P("minecraft:mud"));
      }
      if (++n % 128 === 0) yield;
    }
  });
}

/**
 * Vulkaninsel in der Auswahl: Meer mit einem großen Vulkankegel in der Mitte, oben ein Krater mit Lavasee. Mehrere
 * Lavaströme laufen in Rinnen den Hang hinab und erstarren an der Küste zu Basalt, der ein Stück ins Meer ragt.
 * Unten Gras, weiter oben Tuff und Schwarzstein, oben Basalt. Die Auswahl wird komplett neu gefüllt.
 * @param {import("./state.js").Session} ses
 * @param {{size:number, flows:number}} o
 * @param {() => number} [rand]
 */
export function opVolcanoIsland(ses, o, rand = Math.random) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const sx = max.x - min.x + 1;
  const sy = max.y - min.y + 1;
  const sz = max.z - min.z + 1;
  if (sy < 10 || Math.min(sx, sz) < 16) return err(ses.player, "Die Auswahl ist zu klein – mindestens 16×10×16 Blöcke.");
  const seaY = min.y + Math.max(3, Math.round((sy - 1) * 0.3));
  const peak = max.y - 2;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const R = (Math.min(sx, sz) / 2) * (o.size / 100);
  const cr = 0.16; // Kraterradius (Anteil)
  const seed = rand() * 1000;
  const rimH = (/** @type {number} */ q) => seaY - 3 + (peak - seaY + 3) * Math.pow(1 - q, 1.3);
  const craterFloor = Math.round(rimH(cr) - Math.max(2, R * 0.12));
  /** @type {Map<string, {h:number, kind:string}>} */
  const H = new Map();
  for (let x = min.x; x <= max.x; x++)
    for (let z = min.z; z <= max.z; z++) {
      const wob = 1 + fbm(x / 8 + seed, 0.4, z / 8, 2) * 0.15;
      const q = Math.hypot(x - cx, z - cz) / (R * wob);
      let h;
      let kind = "slope";
      if (q < cr) {
        h = Math.max(craterFloor, Math.round(rimH(cr) - (rimH(cr) - craterFloor) * Math.min(1, (cr - q) / (cr * 0.5))));
        kind = h <= craterFloor ? "pool" : "crater";
      } else if (q < 1.15) h = Math.round(rimH(Math.min(1, q)) + fbm(x / 5 + seed, 1.7, z / 5, 2) * 1.5);
      else h = seaY - 4;
      if (h < seaY - 4) h = seaY - 4 + Math.round(fbm(x / 10 + seed, 2.2, z / 10, 2));
      H.set(x + "," + z, { h: Math.max(min.y + 1, Math.min(max.y - 1, h)), kind });
    }
  // Lavaströme: vom Kraterrand in Schlangenlinien hangabwärts bis ins Meer
  const N = Math.max(1, Math.min(8, o.flows));
  for (let i = 0; i < N; i++) {
    let a = ((i + rand() * 0.5) / N) * Math.PI * 2;
    let r = cr * R + 1;
    let px = cx + Math.cos(a) * r;
    let pz = cz + Math.sin(a) * r;
    let reef = 0;
    for (let step = 0; step < R * 2 && reef < 4; step++) {
      a += (rand() - 0.5) * 0.25;
      px += Math.cos(a);
      pz += Math.sin(a);
      for (const [ox, oz] of [[0, 0], [1, 0], [0, 1]]) {
        const k = Math.round(px + ox) + "," + Math.round(pz + oz);
        const col = H.get(k);
        if (!col || col.kind !== "slope") continue;
        if (col.h > seaY + 1) {
          // Rinne: Lava einen Block tiefer als der Hang, damit sie seitlich eingefasst ist
          col.kind = "lava";
          col.h -= 1;
        }
        else {
          // erstarrte Lava: Basalt bis knapp über den Wasserspiegel
          col.kind = "basalt";
          col.h = Math.max(col.h, seaY);
        }
      }
      const here = H.get(Math.round(px) + "," + Math.round(pz));
      if (!here || here.h <= seaY) reef++;
    }
  }
  /** @type {Map<string, BlockPermutation>} */
  const cache = new Map();
  const P = (/** @type {string} */ id) => {
    let p = cache.get(id);
    if (!p) cache.set(id, (p = BlockPermutation.resolve(id)));
    return p;
  };
  const W = P("minecraft:water");
  const LAVA = P("minecraft:lava");
  const A = air();
  const upper = seaY + (peak - seaY) * 0.6;
  const mid = seaY + (peak - seaY) * 0.25;
  runEdit(ses.player, { label: "Vulkaninsel", region: { min, max } }, function* (es) {
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        const { h, kind } = /** @type {{h:number, kind:string}} */ (H.get(x + "," + z));
        const n = fbm(x / 3 + seed, 4.4, z / 3, 1);
        let top;
        if (kind === "lava") top = "minecraft:lava";
        else if (kind === "basalt") top = "minecraft:basalt";
        else if (kind === "pool") top = "minecraft:lava";
        else if (kind === "crater") top = n > 0.2 ? "minecraft:magma" : "minecraft:blackstone";
        else if (h < seaY) top = "minecraft:gravel";
        else if (h <= seaY + 1) top = n > 0 ? "minecraft:gravel" : "minecraft:tuff";
        else if (h > upper) top = n > 0 ? "minecraft:basalt" : "minecraft:blackstone";
        else if (h > mid) top = n > 0.25 ? "minecraft:blackstone" : "minecraft:tuff";
        else top = n > 0.45 ? "minecraft:coarse_dirt" : "minecraft:grass_block";
        for (let y = min.y; y <= max.y; y++) {
          if (!selContains(sel, x, y, z)) continue;
          if (y > h) es.set(x, y, z, y <= seaY ? W : A);
          else if (y === h) es.set(x, y, z, top === "minecraft:lava" ? LAVA : P(top));
          else if (y === h - 1 && top === "minecraft:lava") es.set(x, y, z, P("minecraft:basalt"));
          else es.set(x, y, z, P(h - y <= 3 ? (top === "minecraft:grass_block" || top === "minecraft:coarse_dirt" ? "minecraft:dirt" : "minecraft:tuff") : "minecraft:stone"));
        }
      }
      yield;
    }
  });
}

/**
 * Flussdelta in der Auswahl: Ein Fluss kommt von der hinteren Seite, teilt sich in mehrere geschwungene Arme und
 * mündet ins Meer an der vorderen Seite (in Blickrichtung). Flaches Schwemmland mit Gras, zum Meer hin Sand und
 * Sandbänke zwischen den Armen, Flussbett aus Sand und Kies. Die Auswahl wird neu gefüllt.
 * @param {import("./state.js").Session} ses
 * @param {{arms:number, width:number}} o
 * @param {{x:number, z:number}} dir Blickrichtung (zum Meer hin, nur waagerecht)
 * @param {number} [seed]
 */
export function opDelta(ses, o, dir, seed = Math.random() * 1000) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const sy = max.y - min.y + 1;
  if (sy < 5) return err(ses.player, "Die Auswahl ist zu flach – mindestens 5 Blöcke hoch.");
  const seaY = min.y + Math.max(3, Math.round((sy - 1) * 0.4));
  const alongX = Math.abs(dir.x) >= Math.abs(dir.z);
  const sgn = (alongX ? dir.x : dir.z) >= 0 ? 1 : -1;
  const [u0, u1] = alongX ? [min.x, max.x] : [min.z, max.z];
  const [w0, w1] = alongX ? [min.z, max.z] : [min.x, max.x];
  const half = (w1 - w0) / 2;
  const wMid = (w0 + w1) / 2;
  const N = Math.max(2, Math.min(6, o.arms));
  const W = Math.max(2, o.width);
  const split = 0.3;
  /** @type {Map<string, {h:number, water:boolean, sand:boolean}>} */
  const H = new Map();
  for (let a = u0; a <= u1; a++)
    for (let b = w0; b <= w1; b++) {
      const u = u1 > u0 ? (sgn > 0 ? a - u0 : u1 - a) / (u1 - u0) : 0;
      const w = b - wMid;
      const coast = 0.78 + fbm(b / 9 + seed, 0.4, seed, 2) * 0.06;
      // Flussarme: Abstand zur nächsten Mittellinie
      let dist = Infinity;
      let width = W;
      const wig = fbm(a / 11 + seed, 1.9, b / 40, 2) * W * 0.8;
      if (u < split) dist = Math.abs(w - wig);
      else {
        const f = Math.min(1, (u - split) / (coast - split));
        for (let i = 0; i < N; i++) {
          const spread = -1 + (2 * i) / (N - 1);
          const c = spread * half * 0.75 * Math.pow(f, 0.8) + fbm(a / 9 + seed + i * 7.3, 2.6, i, 2) * W * (0.4 + f);
          dist = Math.min(dist, Math.abs(w - c));
        }
        width = W * (1 - 0.35 * f);
      }
      const r = width / 2;
      let h;
      let water = false;
      let sand = false;
      if (u >= coast) {
        // Meer: flacher, nach außen tiefer werdender Grund
        h = seaY - 1 - Math.round(3 * Math.min(1, (u - coast) / Math.max(0.05, 1 - coast)));
        water = true;
        sand = true;
      } else if (dist <= r) {
        h = seaY - 1 - (dist < r * 0.5 ? 1 : 0);
        water = true;
        sand = true;
      } else {
        // Schwemmland: zum Meer hin flacher, Sandbänke nahe der Küste
        h = seaY + Math.round(2 * (1 - u / coast) + fbm(a / 6 + seed, 3.3, b / 6, 2) * 0.8);
        if (u > coast - 0.12) h = Math.min(h, seaY);
        sand = u > coast - 0.18 || dist <= r + 1.5;
        if (h < seaY) water = true;
      }
      H.set(alongX ? a + "," + b : b + "," + a, { h: Math.max(min.y, Math.min(max.y - 1, h)), water, sand });
    }
  /** @type {Map<string, BlockPermutation>} */
  const cache = new Map();
  const P = (/** @type {string} */ id) => {
    let p = cache.get(id);
    if (!p) cache.set(id, (p = BlockPermutation.resolve(id)));
    return p;
  };
  const WAT = P("minecraft:water");
  const A = air();
  runEdit(ses.player, { label: "Flussdelta", region: { min, max } }, function* (es) {
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        const col = /** @type {{h:number, water:boolean, sand:boolean}} */ (H.get(x + "," + z));
        const top = col.water ? (fbm(x / 3 + seed, 5.1, z / 3, 1) > 0.3 ? "minecraft:gravel" : "minecraft:sand") : col.sand ? "minecraft:sand" : "minecraft:grass_block";
        const sub = col.sand || col.water ? "minecraft:sand" : "minecraft:dirt";
        for (let y = min.y; y <= max.y; y++) {
          if (!selContains(sel, x, y, z)) continue;
          if (y > col.h) es.set(x, y, z, col.water && y <= seaY ? WAT : A);
          else if (y === col.h) es.set(x, y, z, P(top));
          else es.set(x, y, z, P(col.h - y <= 3 ? sub : "minecraft:stone"));
        }
      }
      yield;
    }
  });
}

/**
 * Dünenfeld in der Auswahl: viele Wanderdünen quer zum Wind – auf der Wind-Seite flach ansteigend, auf der
 * windabgewandten Seite steil abfallend. Die Kämme sind unterbrochen und leicht geschwungen, sodass einzelne Dünen
 * entstehen. Oben Sand, darunter Sandstein, in den Tälern ab und zu ein toter Busch. Die Auswahl wird neu gefüllt.
 * @param {import("./state.js").Session} ses
 * @param {{height:number, spacing:number}} o height = Dünenhöhe in % der Auswahlhöhe, spacing = Abstand der Kämme
 * @param {{x:number, z:number}} wind Windrichtung (wohin der Wind weht)
 * @param {number} [seed]
 */
export function opDunes(ses, o, wind, seed = Math.random() * 1000) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const sy = max.y - min.y + 1;
  const L = Math.hypot(wind.x, wind.z) || 1;
  const wx = wind.x / L;
  const wz = wind.z / L;
  const base = min.y + Math.min(sy - 2, Math.max(1, Math.round((sy - 1) * 0.2)));
  const amp = Math.max(2, (max.y - 1 - base) * (o.height / 100));
  const lam = Math.max(6, o.spacing);
  /** @type {Map<string, number>} */
  const H = new Map();
  for (let x = min.x; x <= max.x; x++)
    for (let z = min.z; z <= max.z; z++) {
      const u = x * wx + z * wz; // entlang des Windes
      const w = -x * wz + z * wx; // quer zum Wind
      // geschwungene Kämme: Phase verschiebt sich quer zum Wind
      const ph = u / lam + fbm(w / (lam * 1.5) + seed, 0.3, seed * 0.1, 2) * 0.6;
      const t = ph - Math.floor(ph);
      // Sägezahn: 80 % flacher Anstieg (Luv), 20 % steiler Abfall (Lee)
      const prof = t < 0.8 ? Math.pow(t / 0.8, 1.3) : 1 - (t - 0.8) / 0.2;
      // Kämme in einzelne Dünen zerlegen
      const k = Math.max(0, Math.min(1, 0.8 + fbm(w / lam + seed, 2.7, Math.floor(ph) * 3.1, 2) * 1.1));
      const h = base + amp * prof * k + fbm(x / 9 + seed, 5.5, z / 9, 2) * 0.8;
      H.set(x + "," + z, Math.max(min.y, Math.min(max.y - 1, Math.round(h))));
    }
  const SAND = BlockPermutation.resolve("minecraft:sand");
  const STONE = BlockPermutation.resolve("minecraft:sandstone");
  const BUSH = BlockPermutation.resolve("minecraft:deadbush");
  const A = air();
  runEdit(ses.player, { label: "Dünenfeld", region: { min, max } }, function* (es) {
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        const h = /** @type {number} */ (H.get(x + "," + z));
        const low = h <= base;
        const bush = low && fbm(x / 1.3 + seed, 7.7, z / 1.3, 1) > 0.6;
        for (let y = min.y; y <= max.y; y++) {
          if (!selContains(sel, x, y, z)) continue;
          if (y === h + 1 && bush) es.set(x, y, z, BUSH);
          else if (y > h) es.set(x, y, z, A);
          else es.set(x, y, z, h - y <= 3 + (h - base) ? SAND : STONE);
        }
      }
      yield;
    }
  });
}

/**
 * Mondlandschaft in der Auswahl: flacher grauer Boden mit vielen Kratern unterschiedlicher Größe (viele kleine,
 * wenige große) – runde Mulden mit aufgeworfenem Rand, die sich auch überlappen. Oben grauer Staub, Kraterböden
 * dunkler, Ränder aus Andesit und Tuff, ab und zu ein Felsbrocken. Die Auswahl wird komplett neu gefüllt.
 * @param {import("./state.js").Session} ses
 * @param {{count:number, size:number}} o
 * @param {() => number} [rand]
 */
export function opMoon(ses, o, rand = Math.random) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const sx = max.x - min.x + 1;
  const sy = max.y - min.y + 1;
  const sz = max.z - min.z + 1;
  const ground = min.y + Math.max(3, Math.round((sy - 1) * 0.5));
  const big = Math.max(3, (Math.min(sx, sz) / 2) * (o.size / 100));
  /** @type {{x:number, z:number, r:number, d:number}[]} */
  const craters = [];
  for (let i = 0; i < o.count; i++) {
    // Potenzverteilung: meist kleine Krater, selten große
    const r = Math.max(2, big * Math.pow(rand(), 2.2) + 1.5);
    craters.push({ x: min.x + rand() * sx, z: min.z + rand() * sz, r, d: Math.min(ground - min.y - 1, r * (0.35 + rand() * 0.15)) });
  }
  const seed = rand() * 1000;
  /** @type {Map<string, {h:number, kind:"floor"|"rim"|"plain"}>} */
  const H = new Map();
  for (let x = min.x; x <= max.x; x++)
    for (let z = min.z; z <= max.z; z++) {
      let h = ground + fbm(x / 14 + seed, 0.5, z / 14, 2) * 1.5;
      /** @type {"floor"|"rim"|"plain"} */
      let kind = "plain";
      for (const C of craters) {
        const q = Math.hypot(x - C.x, z - C.z) / C.r;
        if (q < 1) {
          // Schüssel
          h -= C.d * (1 - q * q) - C.d * 0.15;
          if (q < 0.6) kind = "floor";
          else if (kind !== "floor") kind = "rim";
        } else if (q < 1.45) {
          // aufgeworfener Rand, nach außen auslaufend
          h += C.d * 0.3 * Math.pow(1 - (q - 1) / 0.45, 2);
          if (kind === "plain" && q < 1.2) kind = "rim";
        }
      }
      H.set(x + "," + z, { h: Math.max(min.y + 1, Math.min(max.y - 1, Math.round(h))), kind });
    }
  /** @type {Map<string, BlockPermutation>} */
  const cache = new Map();
  const P = (/** @type {string} */ id) => {
    let p = cache.get(id);
    if (!p) cache.set(id, (p = BlockPermutation.resolve(id)));
    return p;
  };
  const A = air();
  runEdit(ses.player, { label: "Mondlandschaft", region: { min, max } }, function* (es) {
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        const { h, kind } = /** @type {{h:number, kind:string}} */ (H.get(x + "," + z));
        const n = fbm(x / 3 + seed, 1.3, z / 3, 1);
        const top =
          kind === "floor" ? "minecraft:gray_concrete_powder" : kind === "rim" ? (n > 0 ? "minecraft:andesite" : "minecraft:tuff") : n > 0.35 ? "minecraft:andesite" : "minecraft:light_gray_concrete_powder";
        const boulder = kind !== "floor" && fbm(x / 1.7 + seed, 4.1, z / 1.7, 1) > 0.62;
        for (let y = min.y; y <= max.y; y++) {
          if (!selContains(sel, x, y, z)) continue;
          if (y === h + 1 && boulder) es.set(x, y, z, P("minecraft:tuff"));
          else if (y > h) es.set(x, y, z, A);
          else if (y === h) es.set(x, y, z, P(top));
          else es.set(x, y, z, P(h - y <= 2 ? "minecraft:andesite" : "minecraft:stone"));
        }
      }
      yield;
    }
  });
}

/**
 * Höhlen-Netz in der Auswahl: mehrere „Würmer“ graben sich in Schlangenlinien durch festen Boden, verzweigen sich
 * und öffnen unterwegs größere Kammern. Nur feste Blöcke werden zu Luft (Wasser, Luft bleiben).
 * @param {import("./state.js").Session} ses
 * @param {{tunnels:number, width:number, chambers:number}} o
 * @param {() => number} [rand]
 */
export function opCaves(ses, o, rand = Math.random) {
  const sel = need(ses);
  if (!sel) return;
  const { min, max } = sel;
  const size = selDims(sel);
  const len = Math.max(16, Math.round((size.x + size.y + size.z) * 1.2));
  const A = air();
  runEdit(ses.player, { label: "Höhlen-Netz", region: { min, max } }, function* (es) {
    /** @param {number} cx @param {number} cy @param {number} cz @param {number} r */
    const carve = (cx, cy, cz, r) => {
      const R = Math.ceil(r);
      for (let dx = -R; dx <= R; dx++)
        for (let dy = -R; dy <= R; dy++)
          for (let dz = -R; dz <= R; dz++) {
            if (dx * dx + dy * dy * 1.6 + dz * dz > r * r) continue;
            const x = Math.round(cx + dx);
            const y = Math.round(cy + dy);
            const z = Math.round(cz + dz);
            if (!selContains(sel, x, y, z)) continue;
            const id = es.id(x, y, z);
            if (id && isSolidId(id) && id !== "minecraft:bedrock") es.set(x, y, z, A);
          }
    };
    /** @type {{x:number,y:number,z:number,yaw:number,pitch:number,left:number}[]} */
    const worms = [];
    for (let i = 0; i < o.tunnels; i++)
      worms.push({
        x: min.x + rand() * size.x,
        y: min.y + size.y * (0.2 + rand() * 0.6),
        z: min.z + rand() * size.z,
        yaw: rand() * Math.PI * 2,
        pitch: (rand() - 0.5) * 0.4,
        left: len,
      });
    let steps = 0;
    while (worms.length) {
      const w = /** @type {typeof worms[0]} */ (worms.pop());
      while (w.left-- > 0) {
        const r = o.width / 2 + Math.sin(w.left * 0.3) * 0.4;
        carve(w.x, w.y, w.z, Math.max(1, r));
        // Kammer
        if (rand() < o.chambers * 0.004) carve(w.x, w.y, w.z, o.width + 2 + rand() * 2);
        // Abzweigung
        if (rand() < 0.02 && worms.length < o.tunnels * 3) worms.push({ ...w, yaw: w.yaw + (rand() < 0.5 ? 1 : -1) * 1.2, left: Math.floor(w.left / 2) });
        w.yaw += (rand() - 0.5) * 0.5;
        w.pitch = Math.max(-0.5, Math.min(0.5, w.pitch + (rand() - 0.5) * 0.2));
        w.x += Math.cos(w.yaw) * Math.cos(w.pitch);
        w.z += Math.sin(w.yaw) * Math.cos(w.pitch);
        w.y += Math.sin(w.pitch);
        // An den Rändern der Auswahl umkehren
        if (w.x < min.x || w.x > max.x) w.yaw = Math.PI - w.yaw;
        if (w.z < min.z || w.z > max.z) w.yaw = -w.yaw;
        if (w.y < min.y + 1 || w.y > max.y - 1) w.pitch = -w.pitch;
        w.x = Math.max(min.x, Math.min(max.x, w.x));
        w.y = Math.max(min.y + 1, Math.min(max.y - 1, w.y));
        w.z = Math.max(min.z, Math.min(max.z, w.z));
        if (++steps % 8 === 0) yield;
      }
    }
  });
}

/**
 * Dach auf eine Box-Auswahl setzen (oberhalb der Auswahl).
 * Satteldach: First entlang der längeren Seite, Giebeldreiecke werden mit dem aktiven Muster gefüllt.
 * Walmdach: auf allen vier Seiten geneigt.
 * @param {import("./state.js").Session} ses
 * @param {{type:string, stairs:string, overhang:number}} o
 */
export function opRoof(ses, o) {
  const sel = need(ses);
  if (!sel) return;
  if (sel.kind !== "box") return err(ses.player, "Dach geht nur auf eine Box-Auswahl (Grundriss des Hauses).");
  let stair;
  try {
    stair = normId(o.stairs);
    BlockPermutation.resolve(stair);
  } catch (e) {
    return err(ses.player, "Treppenblock ungültig: " + e);
  }
  const slab = stair === "minecraft:stone_stairs" ? "minecraft:cobblestone_slab" : stair.replace(/_stairs$/, "_slab");
  /** @param {number} dir 0 Ost, 1 West, 2 Süd, 3 Nord (Richtung, in die die Treppe ansteigt) */
  const S = (dir) => BlockPermutation.resolve(stair, { weirdo_direction: dir, upside_down_bit: false });
  let slabPerm;
  try {
    slabPerm = BlockPermutation.resolve(slab);
  } catch {
    slabPerm = S(0);
  }
  const wall = picker(ses.s.pattern);
  const x0 = sel.min.x - o.overhang;
  const x1 = sel.max.x + o.overhang;
  const z0 = sel.min.z - o.overhang;
  const z1 = sel.max.z + o.overhang;
  const base = sel.max.y + 1;
  const along = x1 - x0 >= z1 - z0 ? "x" : "z";
  const half = Math.ceil(((along === "x" ? z1 - z0 : x1 - x0) + 1) / 2);
  const height = o.type === "hip" ? Math.ceil((Math.min(x1 - x0, z1 - z0) + 1) / 2) : half;
  const region = { min: v(x0, base, z0), max: v(x1, base + height + 1, z1) };
  runEdit(ses.player, { label: o.type === "hip" ? "Walmdach" : "Satteldach", region, useMask: false }, function* (es) {
    if (o.type === "hip") {
      for (let k = 0; ; k++) {
        const ax = x0 + k;
        const bx = x1 - k;
        const az = z0 + k;
        const bz = z1 - k;
        if (ax > bx || az > bz) break;
        const y = base + k;
        if (ax === bx || az === bz) {
          for (let x = ax; x <= bx; x++) for (let z = az; z <= bz; z++) es.set(x, y, z, slabPerm);
          break;
        }
        for (let x = ax; x <= bx; x++) {
          es.set(x, y, az, S(2));
          es.set(x, y, bz, S(3));
        }
        for (let z = az + 1; z < bz; z++) {
          es.set(ax, y, z, S(0));
          es.set(bx, y, z, S(1));
        }
        yield;
      }
      return;
    }
    // Satteldach
    const lo = along === "x" ? z0 : x0;
    const hi = along === "x" ? z1 : x1;
    const a0 = along === "x" ? x0 : z0;
    const a1 = along === "x" ? x1 : z1;
    for (let k = 0; lo + k <= hi - k; k++) {
      const y = base + k;
      const p = lo + k;
      const q = hi - k;
      for (let a = a0; a <= a1; a++) {
        const at = (/** @type {number} */ c, /** @type {import("@minecraft/server").BlockPermutation} */ perm) =>
          along === "x" ? es.set(a, y, c, perm) : es.set(c, y, a, perm);
        if (p === q) at(p, slabPerm);
        else {
          at(p, S(along === "x" ? 2 : 0));
          at(q, S(along === "x" ? 3 : 1));
        }
      }
      // Giebel: unter dem Dach an beiden Enden (ohne Überstand) mit Wandmaterial füllen
      if (k > 0) {
        const g0 = along === "x" ? sel.min.x : sel.min.z;
        const g1 = along === "x" ? sel.max.x : sel.max.z;
        for (let c = p; c <= q; c++) {
          for (const g of [g0, g1]) {
            if (along === "x") es.set(g, y - 1, c, wall());
            else es.set(c, y - 1, g, wall());
          }
        }
      }
      yield;
    }
  });
}


/**
 * Fenster-Raster in eine Wand-Auswahl setzen (Wand = Box, die in X oder Z nur dünn ist). Fensterform eckig, mit
 * Rundbogen oder mit Spitzbogen (gotisch) obendrauf; als Block „air“ werden Öffnungen in die Wand geschnitten.
 * @param {import("./state.js").Session} ses
 * @param {{w:number, h:number, gap:number, sill:number, block:string, arch?:string}} o
 */
export function opWindows(ses, o) {
  const sel = need(ses);
  if (!sel) return;
  if (sel.kind !== "box") return err(ses.player, "Fenster-Raster geht nur auf eine Box-Auswahl (die Wand).");
  const d = selDims(sel);
  const along = d.x >= d.z ? "x" : "z";
  let glass;
  try {
    glass = picker(parsePattern(o.block));
  } catch (e) {
    return err(ses.player, "Fensterblock ungültig: " + e);
  }
  const len = along === "x" ? d.x : d.z;
  const step = o.w + o.gap;
  const count = Math.floor((len - o.gap) / step);
  if (count < 1) return err(ses.player, "Wand ist zu schmal für diese Fenstergröße.");
  // Bogen über dem geraden Teil: Zeilen und Test je Zeile (k = 1 …) und Spalte (0 … w-1)
  const arch = o.arch ?? "rect";
  const archH = arch === "round" ? Math.ceil(o.w / 2) : arch === "gothic" ? Math.ceil(o.w * 0.87) : 0;
  const inArch = (/** @type {number} */ k, /** @type {number} */ a) => {
    const yk = k - 0.5;
    if (arch === "round") return yk * yk + (a - (o.w - 1) / 2) ** 2 <= (o.w / 2) ** 2;
    // Spitzbogen: zwei Kreise mit Radius = Breite, Mittelpunkte an den Fensterkanten
    return (a + 0.5) ** 2 + yk * yk <= o.w * o.w && (a - o.w + 0.5) ** 2 + yk * yk <= o.w * o.w;
  };
  const fullH = o.h + archH;
  // Fenster mittig verteilen
  const start = Math.floor((len - (count * step - o.gap)) / 2);
  runEdit(ses.player, { label: "Fenster-Raster", region: { min: sel.min, max: sel.max }, useMask: false }, function* (es) {
    for (let y = sel.min.y + o.sill; y + fullH - 1 <= sel.max.y; y += fullH + Math.max(1, o.gap)) {
      for (let i = 0; i < count; i++) {
        const s0 = start + i * step;
        for (let a = s0; a < s0 + o.w; a++)
          for (let dy = 0; dy < fullH; dy++) {
            if (dy >= o.h && !inArch(dy - o.h + 1, a - s0)) continue;
            if (along === "x") for (let z = sel.min.z; z <= sel.max.z; z++) es.set(sel.min.x + a, y + dy, z, glass());
            else for (let x = sel.min.x; x <= sel.max.x; x++) es.set(x, y + dy, sel.min.z + a, glass());
          }
      }
      yield;
    }
  });
}

/** In Zwischenablage kopieren (optional ausschneiden). @param {import("./state.js").Session} ses @param {boolean} cut */
export function opCopy(ses, cut) {
  const sel = need(ses);
  if (!sel) return;
  const player = ses.player;
  const entities = ses.s.paste.entities;
  return runEdit(player, { label: cut ? "Ausschneiden" : "Kopieren", region: cut ? { min: sel.min, max: sel.max } : undefined, useMask: false, quiet: true }, function* (es) {
    const clip = yield* copySelection(player, sel, entities);
    if (cut) {
      const A = air();
      let n = 0;
      for (const p of selPositions(sel)) {
        es.set(p.x, p.y, p.z, A);
        if (++n % 512 === 0) yield;
      }
    }
    msg(player, `§a${cut ? "Ausgeschnitten" : "Kopiert"}§r: ${clip.size.x}×${clip.size.y}×${clip.size.z} – mit dem §eBaumeister§r einfügen.`);
  });
}

