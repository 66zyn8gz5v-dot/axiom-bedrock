// Operationen auf der Auswahl: Füllen, Ersetzen, Wände, Hohl, Überziehen, Natürlich, Glätten,
// Stapeln, Verschieben, Drehen, Spiegeln, Analysieren, Kopieren/Ausschneiden.
import { BlockPermutation } from "@minecraft/server";
import { fillBox, runEdit } from "./edit.js";
import { air, isSolidId, picker, shortId, isAirId } from "./pattern.js";
import { selContains, selPositions, selSize, shiftSel, selDims, recomputeBounds, SET_LIMIT } from "./selection.js";
import { copySelection, freeClip, getClip, pasteClip, rotatedSize } from "./clipboard.js";
import { err, fmtNum, msg } from "./util.js";
import { v, vmax, vmin } from "./vec.js";

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

/** In Zwischenablage kopieren (optional ausschneiden). @param {import("./state.js").Session} ses @param {boolean} cut */
export function opCopy(ses, cut) {
  const sel = need(ses);
  if (!sel) return;
  const player = ses.player;
  const entities = ses.s.paste.entities;
  runEdit(player, { label: cut ? "Ausschneiden" : "Kopieren", region: cut ? { min: sel.min, max: sel.max } : undefined, useMask: false, quiet: true }, function* (es) {
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

