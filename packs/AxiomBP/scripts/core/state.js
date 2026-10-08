// Spieler-Sitzungen: gespeicherte Einstellungen (dynamische Eigenschaften) + Laufzeitdaten.
import { world } from "@minecraft/server";

const SETTINGS_KEY = "axiom:settings";

export function defaultSettings() {
  return {
    /** Aktives Muster (gewichtete Blockliste) */
    pattern: [{ id: "minecraft:stone", w: 1 }],
    /** Zweites Muster (z.B. für Rauschen-Maler) */
    pattern2: [{ id: "minecraft:andesite", w: 1 }],
    /** Maske: welche Blöcke Werkzeuge verändern dürfen */
    mask: { mode: "none", ids: /** @type {string[]} */ ([]) },
    reach: 160,
    airDist: 6,
    liquids: false,
    caps: { angel: false, replace: false, farPlace: false, nightVision: false },
    symmetry: { x: false, z: false, center: /** @type {{x:number,y:number,z:number}|null} */ (null) },
    selMode: "set",
    showSel: true,
    magic: { mode: "same", limit: 20000, diagonal: false },
    brushSel: { radius: 2 },
    shape: { type: "sphere", rx: 5, ry: 5, rz: 5, hollow: false, thick: 1, anchor: "center", look: true, pitch: 12 },
    sculpt: { mode: "add", radius: 4, noise: false },
    painter: { mode: "surface", radius: 4, depth: 1, scale: 8, threshold: 0, density: 8, slopeDeg: 40, floodLimit: 20000 },
    scatter: { count: 10, spacing: 6, rotate: true },
    terrain: { mode: "raise", radius: 6, strength: 2, falloff: true, slab: false },
    extrude: { mode: "push", sameType: true, limit: 4096 },
    path: { radius: 1, smooth: true, hollow: false, flat: false, support: false },
    /** Gespeicherte Muster-Paletten: Name -> Muster */
    palettes: /** @type {Record<string, {id:string, states?:Record<string, string|number|boolean>, w:number}[]>} */ ({}),
    text: { text: "AXIOM", scale: 1, orient: "wall", spacing: 1, mode: "text", pixel: "rr.rr/rrrrr/.rrr./..r..", legend: "r=red_wool" },
    river: { width: 3, depth: 3, bed: "sand" },
    bridge: { width: 1, arch: 3, railing: "oak_fence", deck: "" },
    gradient: { axis: "y", blend: 3, reverse: false },
    thin: { percent: 30, replace: false },
    paste: { air: true, rotation: 0, mirror: "None", entities: false, offsetY: 0 },
    bulldozer: { radius: 0 },
    stack: { count: 2, gap: 0 },
    move: { distance: 1 },
    entity: { radius: 4 },
  };
}

/**
 * @typedef {ReturnType<typeof defaultSettings>} Settings
 * @typedef {{
 *   player: import("@minecraft/server").Player,
 *   s: Settings,
 *   sel: import("./selection.js").Selection | null,
 *   nextCorner: 1|2,
 *   corner1?: {x:number,y:number,z:number},
 *   selBase?: import("./selection.js").Selection | null,
 *   brushSelLast?: number,
 *   strokeId?: string,
 *   strokeLast?: number,
 *   pathPoints: {x:number,y:number,z:number}[],
 *   rulerA: {x:number,y:number,z:number} | null,
 *   rulerB?: {x:number,y:number,z:number},
 *   rulerLast?: {a:{x:number,y:number,z:number}, b:{x:number,y:number,z:number}},
 *   lastAction: number,
 *   lastHit?: number,
 *   floodLast?: number,
 *   bpPreview?: {size:{x:number,y:number,z:number}, until:number, name:string},
 *   entities?: import("@minecraft/server").Entity[],
 *   using: boolean,
 *   usingUntil: number,
 *   busy: boolean,
 *   dirty: boolean,
 * }} Session
 */

/** @type {Map<string, Session>} */
const sessions = new Map();

/**
 * Tiefes Zusammenführen: gespeicherte Werte über Standardwerte legen (neue Felder bleiben erhalten).
 * @param {any} base @param {any} saved
 */
function merge(base, saved) {
  if (saved === null || typeof saved !== "object" || Array.isArray(saved)) return saved ?? base;
  if (base === null || typeof base !== "object" || Array.isArray(base)) return saved;
  const out = { ...base };
  for (const k of Object.keys(saved)) out[k] = k in base ? merge(base[k], saved[k]) : saved[k];
  return out;
}

/** @param {import("@minecraft/server").Player} player @returns {Session} */
export function getSession(player) {
  let ses = sessions.get(player.id);
  if (ses) {
    ses.player = player;
    return ses;
  }
  let s = defaultSettings();
  try {
    const raw = player.getDynamicProperty(SETTINGS_KEY);
    if (typeof raw === "string") s = merge(s, JSON.parse(raw));
  } catch (e) {
    console.warn("[Axiom] Einstellungen konnten nicht geladen werden: " + e);
  }
  ses = {
    player,
    s,
    sel: null,
    nextCorner: 1,
    pathPoints: [],
    rulerA: null,
    lastAction: -100,
    using: false,
    usingUntil: 0,
    busy: false,
    dirty: false,
  };
  sessions.set(player.id, ses);
  return ses;
}

/** Einstellungen speichern (wird verzögert/gebündelt aufgerufen). @param {Session} ses */
export function saveSettings(ses) {
  try {
    ses.player.setDynamicProperty(SETTINGS_KEY, JSON.stringify(ses.s));
    ses.dirty = false;
  } catch (e) {
    console.warn("[Axiom] Einstellungen konnten nicht gespeichert werden: " + e);
  }
}

/** @param {Session} ses */
export function markDirty(ses) {
  ses.dirty = true;
}

export function flushAll() {
  for (const ses of sessions.values()) {
    if (ses.dirty && ses.player.isValid) saveSettings(ses);
  }
}

/** @param {string} id */
export function dropSession(id) {
  sessions.delete(id);
}

export function allSessions() {
  return sessions.values();
}

/** Welt-Einstellungen (für alle Spieler) */
export function worldFlag(/** @type {string} */ name, /** @type {boolean} */ def = false) {
  const v = world.getDynamicProperty("axiom:flag_" + name);
  return typeof v === "boolean" ? v : def;
}
export function setWorldFlag(/** @type {string} */ name, /** @type {boolean} */ value) {
  world.setDynamicProperty("axiom:flag_" + name, value);
}
