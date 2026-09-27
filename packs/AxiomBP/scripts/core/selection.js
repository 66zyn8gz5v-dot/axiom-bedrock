// Auswahl: Quader oder freie Blockmenge + Darstellung mit Partikeln.
import { k3, unkey, v, vmax, vmin, volume } from "./vec.js";

/**
 * @typedef {{kind:"box", dim:string, min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} BoxSel
 * @typedef {{kind:"set", dim:string, keys:Set<string>, min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} SetSel
 * @typedef {BoxSel | SetSel} Selection
 */

export const SET_LIMIT = 400000;

/** @param {string} dim @param {{x:number,y:number,z:number}} a @param {{x:number,y:number,z:number}} b @returns {BoxSel} */
export function boxSel(dim, a, b) {
  return { kind: "box", dim, min: vmin(a, b), max: vmax(a, b) };
}

/** @param {Selection} sel */
export function selSize(sel) {
  return sel.kind === "box" ? volume(sel.min, sel.max) : sel.keys.size;
}

/** @param {Selection} sel */
export function selDims(sel) {
  return v(sel.max.x - sel.min.x + 1, sel.max.y - sel.min.y + 1, sel.max.z - sel.min.z + 1);
}

/** @param {Selection} sel @param {number} x @param {number} y @param {number} z */
export function selContains(sel, x, y, z) {
  if (x < sel.min.x || y < sel.min.y || z < sel.min.z || x > sel.max.x || y > sel.max.y || z > sel.max.z) return false;
  return sel.kind === "box" ? true : sel.keys.has(k3(x, y, z));
}

/**
 * Alle Positionen der Auswahl durchlaufen.
 * @param {Selection} sel
 * @returns {Generator<{x:number,y:number,z:number}, void, void>}
 */
export function* selPositions(sel) {
  if (sel.kind === "box") {
    for (let x = sel.min.x; x <= sel.max.x; x++)
      for (let z = sel.min.z; z <= sel.max.z; z++) for (let y = sel.min.y; y <= sel.max.y; y++) yield { x, y, z };
  } else {
    for (const k of sel.keys) yield unkey(k);
  }
}

/** Grenzen einer Mengen-Auswahl neu berechnen. @param {SetSel} sel */
export function recomputeBounds(sel) {
  let min = v(Infinity, Infinity, Infinity);
  let max = v(-Infinity, -Infinity, -Infinity);
  for (const k of sel.keys) {
    const p = unkey(k);
    min = vmin(min, p);
    max = vmax(max, p);
  }
  sel.min = min;
  sel.max = max;
}

/** @param {Selection} sel @returns {SetSel | null} */
export function toSet(sel) {
  if (sel.kind === "set") return sel;
  if (volume(sel.min, sel.max) > SET_LIMIT) return null;
  const keys = new Set();
  for (const p of selPositions(sel)) keys.add(k3(p.x, p.y, p.z));
  return { kind: "set", dim: sel.dim, keys, min: { ...sel.min }, max: { ...sel.max } };
}

/**
 * Neue Teil-Auswahl mit bestehender kombinieren (Ersetzen/Hinzufügen/Entfernen).
 * @param {Selection | null} base
 * @param {Selection} added
 * @param {string} mode "set" | "add" | "sub"
 * @returns {Selection | string} neue Auswahl oder Fehlermeldung
 */
export function combine(base, added, mode) {
  if (mode === "set" || !base || base.dim !== added.dim) {
    if (mode === "sub") return base ?? "Nichts ausgewählt.";
    return added;
  }
  const a = toSet(base);
  const b = toSet(added);
  if (!a || !b) return "Auswahl zu groß zum Kombinieren (max. " + SET_LIMIT + " Blöcke).";
  // Bestehende Menge direkt erweitern (spart Kopien bei Pinselstrichen)
  const keys = a.keys;
  if (mode === "add") {
    if (keys.size + b.keys.size > SET_LIMIT) return "Auswahl zu groß (max. " + SET_LIMIT + " Blöcke).";
    for (const k of b.keys) keys.add(k);
    return { kind: "set", dim: a.dim, keys, min: vmin(a.min, b.min), max: vmax(a.max, b.max) };
  }
  for (const k of b.keys) keys.delete(k);
  /** @type {SetSel} */
  const out = { kind: "set", dim: a.dim, keys, min: a.min, max: a.max };
  recomputeBounds(out);
  return keys.size ? out : "Auswahl ist jetzt leer.";
}

/** Auswahl verschieben. @param {Selection} sel @param {{x:number,y:number,z:number}} d @returns {Selection} */
export function shiftSel(sel, d) {
  const min = v(sel.min.x + d.x, sel.min.y + d.y, sel.min.z + d.z);
  const max = v(sel.max.x + d.x, sel.max.y + d.y, sel.max.z + d.z);
  if (sel.kind === "box") return { kind: "box", dim: sel.dim, min, max };
  const keys = new Set();
  for (const k of sel.keys) {
    const p = unkey(k);
    keys.add(k3(p.x + d.x, p.y + d.y, p.z + d.z));
  }
  return { kind: "set", dim: sel.dim, keys, min, max };
}

// ---------- Darstellung ----------

/**
 * Partikel für die Auswahl eines Spielers zeichnen.
 * @param {import("@minecraft/server").Player} player
 * @param {Selection} sel
 */
export function renderSelection(player, sel) {
  if (player.dimension.id !== sel.dim) return;
  const loc = player.location;
  const budget = 300;
  if (sel.kind === "box") {
    const a = sel.min;
    const b = v(sel.max.x + 1, sel.max.y + 1, sel.max.z + 1);
    const edges = [
      [v(a.x, a.y, a.z), v(b.x, a.y, a.z)],
      [v(a.x, a.y, b.z), v(b.x, a.y, b.z)],
      [v(a.x, b.y, a.z), v(b.x, b.y, a.z)],
      [v(a.x, b.y, b.z), v(b.x, b.y, b.z)],
      [v(a.x, a.y, a.z), v(a.x, b.y, a.z)],
      [v(b.x, a.y, a.z), v(b.x, b.y, a.z)],
      [v(a.x, a.y, b.z), v(a.x, b.y, b.z)],
      [v(b.x, a.y, b.z), v(b.x, b.y, b.z)],
      [v(a.x, a.y, a.z), v(a.x, a.y, b.z)],
      [v(b.x, a.y, a.z), v(b.x, a.y, b.z)],
      [v(a.x, b.y, a.z), v(a.x, b.y, b.z)],
      [v(b.x, b.y, a.z), v(b.x, b.y, b.z)],
    ];
    const total = 4 * (b.x - a.x + b.y - a.y + b.z - a.z);
    const step = Math.max(0.5, total / budget);
    for (const [p, q] of edges) {
      const L = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y), Math.abs(q.z - p.z));
      for (let t = 0; t <= L; t += step) {
        const f = L === 0 ? 0 : t / L;
        const pt = v(p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f, p.z + (q.z - p.z) * f);
        if (Math.abs(pt.x - loc.x) > 96 || Math.abs(pt.z - loc.z) > 96) continue;
        spawn(player, "axiom:sel", pt);
      }
    }
  } else {
    // Randblöcke einer freien Auswahl markieren (Stichprobe)
    let n = 0;
    const size = sel.keys.size;
    const stride = Math.max(1, Math.floor(size / 1500));
    let i = 0;
    for (const k of sel.keys) {
      if (i++ % stride !== 0) continue;
      const p = unkey(k);
      const edge =
        !sel.keys.has(k3(p.x + 1, p.y, p.z)) ||
        !sel.keys.has(k3(p.x - 1, p.y, p.z)) ||
        !sel.keys.has(k3(p.x, p.y + 1, p.z)) ||
        !sel.keys.has(k3(p.x, p.y - 1, p.z)) ||
        !sel.keys.has(k3(p.x, p.y, p.z + 1)) ||
        !sel.keys.has(k3(p.x, p.y, p.z - 1));
      if (!edge) continue;
      if (Math.abs(p.x - loc.x) > 96 || Math.abs(p.z - loc.z) > 96) continue;
      spawn(player, "axiom:sel_block", v(p.x + 0.5, p.y + 0.5, p.z + 0.5));
      if (++n >= budget) break;
    }
  }
}

/** @param {import("@minecraft/server").Player} player @param {string} id @param {{x:number,y:number,z:number}} p */
export function spawn(player, id, p) {
  try {
    player.spawnParticle(id, p);
  } catch {}
}

/** Markierung für einen einzelnen Block (z.B. Eckpunkte, Pfadpunkte). */
export function markBlock(/** @type {import("@minecraft/server").Player} */ player, /** @type {string} */ id, /** @type {{x:number,y:number,z:number}} */ p) {
  for (const [dx, dy, dz] of [
    [0.5, 0.5, 0.5],
    [0, 0, 0],
    [1, 0, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 1],
    [1, 1, 1],
  ])
    spawn(player, id, v(p.x + dx, p.y + dy, p.z + dz));
}
