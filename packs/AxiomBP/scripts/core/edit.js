// Bearbeitungs-Sitzung: setzt Blöcke (mit Maske, Symmetrie & Verlauf) über zeitgesteuerte Jobs.
import { BlockVolume, system } from "@minecraft/server";
import { getSession } from "./state.js";
import { getHistory, pushEntry, recordRegion } from "./history.js";
import { maskTest } from "./pattern.js";
import { k3, volume } from "./vec.js";
import { err, fmtNum, msg, bar } from "./util.js";

/** Ab dieser Größe wird der Bereich als Struktur-Schnappschuss gesichert. */
export const REGION_THRESHOLD = 60000;
/** Harte Obergrenze pro Operation */
export const MAX_VOLUME = 4000000;

/** @type {WeakMap<import("@minecraft/server").BlockPermutation, Record<string, string|number|boolean>>} */
const stateCache = new WeakMap();
/** Zustände einer Permutation (zwischengespeichert). @param {import("@minecraft/server").BlockPermutation} p */
function statesOf(p) {
  let s = stateCache.get(p);
  if (!s) stateCache.set(p, (s = p.getAllStates()));
  return s;
}

export class EditSession {
  /**
   * @param {import("./state.js").Session} ses
   * @param {import("@minecraft/server").Dimension} dim
   * @param {{useMask?:boolean, symmetry?:boolean, record?:boolean}} [opts]
   */
  constructor(ses, dim, opts = {}) {
    this.ses = ses;
    this.dim = dim;
    this.useMask = opts.useMask ?? true;
    this.mask = this.useMask ? maskTest(ses.s.mask) : () => true;
    const sym = ses.s.symmetry;
    this.sym = opts.symmetry && sym.center && (sym.x || sym.z) ? sym : null;
    this.record = opts.record ?? true;
    /** @type {Map<string, import("@minecraft/server").BlockPermutation>} */
    this.changes = new Map();
    this.count = 0;
    /** Geschätzte Gesamtzahl (für Prozentanzeige), 0 = unbekannt */
    this.total = 0;
    this.minY = dim.heightRange.min;
    this.maxY = dim.heightRange.max - 1;
  }

  /** @param {number} x @param {number} y @param {number} z */
  block(x, y, z) {
    if (y < this.minY || y > this.maxY) return undefined;
    try {
      return this.dim.getBlock({ x, y, z });
    } catch {
      return undefined;
    }
  }

  /** Block-ID an Position (oder "" falls nicht geladen). @param {number} x @param {number} y @param {number} z */
  id(x, y, z) {
    const b = this.block(x, y, z);
    return b ? b.typeId : "";
  }

  /**
   * @param {number} x @param {number} y @param {number} z
   * @param {import("@minecraft/server").BlockPermutation} perm
   */
  setRaw(x, y, z, perm) {
    const b = this.block(x, y, z);
    if (!b) return false;
    const old = b.permutation;
    if (!this.mask(old.type.id)) return false;
    if (old === perm || old.matches(perm.type.id, statesOf(perm))) return false;
    if (this.record) {
      const k = k3(x, y, z);
      if (!this.changes.has(k)) this.changes.set(k, old);
    }
    try {
      b.setPermutation(perm);
    } catch {
      return false;
    }
    this.count++;
    // Fortschritt bei großen Operationen in der Aktionsleiste anzeigen
    if (this.count % 20000 === 0) {
      const pct = this.total ? ` (${Math.min(99, Math.floor((this.count / this.total) * 100))} %)` : "";
      bar(this.ses.player, `§dArbeite …§r ${fmtNum(this.count)} Blöcke${pct}`);
    }
    return true;
  }

  /**
   * Block setzen (inkl. Symmetrie-Spiegelungen).
   * @param {number} x @param {number} y @param {number} z
   * @param {import("@minecraft/server").BlockPermutation} perm
   */
  set(x, y, z, perm) {
    const r = this.setRaw(x, y, z, perm);
    const s = this.sym;
    if (s && s.center) {
      const mx = 2 * s.center.x - x;
      const mz = 2 * s.center.z - z;
      if (s.x) this.setRaw(mx, y, z, perm);
      if (s.z) this.setRaw(x, y, mz, perm);
      if (s.x && s.z) this.setRaw(mx, y, mz, perm);
    }
    return r;
  }
}

/**
 * @typedef {{
 *   label: string,
 *   useMask?: boolean,
 *   symmetry?: boolean,
 *   region?: {min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}},
 *   forceRegion?: boolean,
 *   stroke?: string,
 *   quiet?: boolean,
 *   dim?: import("@minecraft/server").Dimension,
 * }} EditOptions
 */

/**
 * Bearbeitung als Hintergrund-Job ausführen.
 * @param {import("@minecraft/server").Player} player
 * @param {EditOptions} opts
 * @param {(es: EditSession) => Generator<void, any, void>} body
 * @returns {Promise<number>} Anzahl geänderter Blöcke
 */
export function runEdit(player, opts, body) {
  const ses = getSession(player);
  if (ses.busy) {
    if (!opts.stroke) err(player, "Bitte warten – eine Operation läuft noch.");
    return Promise.resolve(0);
  }
  const dim = opts.dim ?? player.dimension;
  const region = opts.region;
  if (region) {
    const vol = volume(region.min, region.max);
    if (vol > MAX_VOLUME) {
      err(player, `Bereich zu groß (${fmtNum(vol)} Blöcke, max. ${fmtNum(MAX_VOLUME)}).`);
      return Promise.resolve(0);
    }
  }
  // Große Bereiche vorab als Struktur sichern, statt jeden Block einzeln zu protokollieren.
  const useRegion = !!region && (!!opts.forceRegion || (volume(region.min, region.max) > REGION_THRESHOLD && !(ses.s.symmetry.center && opts.symmetry)));
  const es = new EditSession(ses, dim, { useMask: opts.useMask, symmetry: opts.symmetry, record: !useRegion });
  if (region) es.total = volume(region.min, region.max);

  // Pinselstriche zusammenfassen: gleicher Strich -> gleicher Verlaufseintrag
  if (opts.stroke && !useRegion) {
    const h = getHistory(player.id);
    const last = h.undo[h.undo.length - 1];
    if (last && last.kind === "blocks" && last.stroke === opts.stroke && system.currentTick - last.time < 12 && last.dim === dim.id) {
      es.changes = last.changes;
    }
  }

  ses.busy = true;
  const started = system.currentTick;
  return new Promise((resolve) => {
    system.runJob(
      (function* () {
        let result;
        if (useRegion && region) {
          try {
            yield* recordRegion(player.id, opts.label, dim, region.min, region.max);
          } catch (e) {
            err(player, "Bereich konnte nicht gesichert werden (nicht geladen oder außerhalb der Welt?): " + e);
            ses.busy = false;
            resolve(0);
            return;
          }
        }
        try {
          result = yield* body(es);
        } catch (e) {
          err(player, "Fehler: " + e);
          console.warn("[Axiom] " + (e instanceof Error ? e.stack : e));
        }
        ses.busy = false;
        if (!useRegion && es.changes.size) {
          const h = getHistory(player.id);
          const last = h.undo[h.undo.length - 1];
          if (last && last.kind === "blocks" && last.changes === es.changes) {
            last.time = system.currentTick;
          } else {
            pushEntry(player.id, {
              kind: "blocks",
              label: opts.label,
              dim: dim.id,
              changes: es.changes,
              stroke: opts.stroke,
              time: system.currentTick,
            });
          }
        }
        if (!opts.quiet && result !== false) {
          const secs = ((system.currentTick - started) / 20).toFixed(1);
          if (opts.stroke) bar(player, `§d${opts.label}§r: ${fmtNum(es.count)} Blöcke`);
          else msg(player, `§a${opts.label}§r: ${fmtNum(es.count)} Blöcke geändert (${secs}s)`);
        }
        resolve(es.count);
      })()
    );
  });
}

/**
 * Quader schnell füllen (in 32er-Blöcken über fillBlocks).
 * @param {import("@minecraft/server").Dimension} dim
 * @param {{x:number,y:number,z:number}} min
 * @param {{x:number,y:number,z:number}} max
 * @param {import("@minecraft/server").BlockPermutation} perm
 * @param {import("@minecraft/server").BlockFilter} [filter]
 * @returns {Generator<void, number, void>}
 */
export function* fillBox(dim, min, max, perm, filter) {
  const C = 32;
  let n = 0;
  const y0 = Math.max(min.y, dim.heightRange.min);
  const y1 = Math.min(max.y, dim.heightRange.max - 1);
  for (let x = min.x; x <= max.x; x += C) {
    for (let y = y0; y <= y1; y += C) {
      for (let z = min.z; z <= max.z; z += C) {
        const to = { x: Math.min(x + C - 1, max.x), y: Math.min(y + C - 1, y1), z: Math.min(z + C - 1, max.z) };
        try {
          const res = dim.fillBlocks(new BlockVolume({ x, y, z }, to), perm, { blockFilter: filter, ignoreChunkBoundErrors: true });
          n += res.getCapacity();
        } catch (e) {
          console.warn("[Axiom] fillBlocks: " + e);
        }
        yield;
      }
    }
  }
  return n;
}
