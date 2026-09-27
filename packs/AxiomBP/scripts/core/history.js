// Verlauf (Rückgängig / Wiederherstellen) pro Spieler.
// Zwei Eintragsarten:
//  - "blocks": Liste alter Block-Permutationen (für Pinsel & kleinere Änderungen)
//  - "region": Schnappschuss eines ganzen Bereichs als Struktur-Kacheln (für große Operationen)
import { world, system, StructureSaveMode } from "@minecraft/server";
import { unkey, volume } from "./vec.js";

export const TILE = 64;
const MAX_ENTRIES = 40;
let counter = 0;

/**
 * @typedef {{id:string, loc:{x:number,y:number,z:number}}} Tile
 * @typedef {{kind:"blocks", label:string, dim:string, changes:Map<string, import("@minecraft/server").BlockPermutation>, stroke?:string, time:number}} BlocksEntry
 * @typedef {{kind:"region", label:string, dim:string, min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}, tiles:Tile[], time:number}} RegionEntry
 * @typedef {BlocksEntry | RegionEntry} Entry
 * @typedef {{undo:Entry[], redo:Entry[]}} History
 */

/** @type {Map<string, History>} */
const histories = new Map();

/** @param {string} playerId @returns {History} */
export function getHistory(playerId) {
  let h = histories.get(playerId);
  if (!h) {
    h = { undo: [], redo: [] };
    histories.set(playerId, h);
  }
  return h;
}

/** @param {Entry} e */
function freeEntry(e) {
  if (e.kind === "region") {
    for (const t of e.tiles) {
      try {
        world.structureManager.delete(t.id);
      } catch {}
    }
  }
}

/** @param {string} playerId @param {Entry} entry */
export function pushEntry(playerId, entry) {
  const h = getHistory(playerId);
  h.undo.push(entry);
  for (const e of h.redo) freeEntry(e);
  h.redo = [];
  while (h.undo.length > MAX_ENTRIES) freeEntry(/** @type {Entry} */ (h.undo.shift()));
}

/** @param {string} playerId */
export function clearHistory(playerId) {
  const h = getHistory(playerId);
  for (const e of h.undo) freeEntry(e);
  for (const e of h.redo) freeEntry(e);
  h.undo = [];
  h.redo = [];
}

/**
 * Bereich als Struktur-Kacheln im Speicher sichern.
 * @param {import("@minecraft/server").Dimension} dim
 * @param {{x:number,y:number,z:number}} min
 * @param {{x:number,y:number,z:number}} max
 * @param {string} [prefix]
 * @param {boolean} [entities]
 * @returns {Tile[]}
 */
export function snapshotTiles(dim, min, max, prefix = "axiom:h", entities = false) {
  /** @type {Tile[]} */
  const tiles = [];
  const id = ++counter;
  let i = 0;
  const lo = dim.heightRange.min;
  const hi = dim.heightRange.max - 1;
  const y0 = Math.max(min.y, lo);
  const y1 = Math.min(max.y, hi);
  for (let x = min.x; x <= max.x; x += TILE) {
    for (let y = y0; y <= y1; y += TILE) {
      for (let z = min.z; z <= max.z; z += TILE) {
        const from = { x, y, z };
        const to = { x: Math.min(x + TILE - 1, max.x), y: Math.min(y + TILE - 1, y1), z: Math.min(z + TILE - 1, max.z) };
        const sid = `${prefix}${id}_${i++}`;
        try {
          world.structureManager.delete(sid);
        } catch {}
        world.structureManager.createFromWorld(sid, dim, from, to, {
          includeEntities: entities,
          includeBlocks: true,
          saveMode: StructureSaveMode.Memory,
        });
        tiles.push({ id: sid, loc: from });
      }
    }
  }
  return tiles;
}

/**
 * Bereich vor einer großen Änderung sichern und Verlaufseintrag anlegen.
 * @param {string} playerId
 * @param {string} label
 * @param {import("@minecraft/server").Dimension} dim
 * @param {{x:number,y:number,z:number}} min
 * @param {{x:number,y:number,z:number}} max
 */
export function recordRegion(playerId, label, dim, min, max) {
  const tiles = snapshotTiles(dim, min, max);
  pushEntry(playerId, { kind: "region", label, dim: dim.id, min, max, tiles, time: system.currentTick });
}

/**
 * Eintrag anwenden (zurücksetzen) und Gegen-Eintrag liefern.
 * @param {Entry} entry
 * @returns {Generator<void, Entry, void>}
 */
function* applyEntry(entry) {
  const dim = world.getDimension(entry.dim);
  if (entry.kind === "region") {
    const back = snapshotTiles(dim, entry.min, entry.max);
    for (const t of entry.tiles) {
      world.structureManager.place(t.id, dim, t.loc, { includeEntities: false });
      yield;
    }
    freeEntry(entry);
    return { ...entry, tiles: back, time: system.currentTick };
  }
  /** @type {Map<string, import("@minecraft/server").BlockPermutation>} */
  const back = new Map();
  let n = 0;
  for (const [k, perm] of entry.changes) {
    const p = unkey(k);
    try {
      const b = dim.getBlock(p);
      if (b) {
        back.set(k, b.permutation);
        b.setPermutation(perm);
      }
    } catch {}
    if (++n % 64 === 0) yield;
  }
  return { kind: "blocks", label: entry.label, dim: entry.dim, changes: back, time: system.currentTick };
}

/**
 * @param {string} playerId
 * @param {boolean} redo
 * @returns {Generator<void, string|null, void>} Beschriftung des Eintrags oder null
 */
export function* undoRedo(playerId, redo) {
  const h = getHistory(playerId);
  const from = redo ? h.redo : h.undo;
  const to = redo ? h.undo : h.redo;
  const e = from.pop();
  if (!e) return null;
  const counter = yield* applyEntry(e);
  to.push(counter);
  return e.label;
}

/** @param {Entry} e */
export function entrySize(e) {
  return e.kind === "blocks" ? e.changes.size : volume(e.min, e.max);
}
