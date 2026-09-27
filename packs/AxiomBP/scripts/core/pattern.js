// Muster (gewichtete Blocklisten) und Masken.
import { BlockPermutation } from "@minecraft/server";

/** @typedef {{id:string, states?:Record<string, string|number|boolean>, w:number}} PatternEntry */

/** @param {string} id */
export function normId(id) {
  id = id.trim().toLowerCase().replace(/\s+/g, "_");
  if (!id.includes(":")) id = "minecraft:" + id;
  return id;
}

/** @param {string} id */
export function shortId(id) {
  return id.startsWith("minecraft:") ? id.slice(10) : id;
}

/** @param {string} s */
function parseValue(s) {
  s = s.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  return s.replace(/^"|"$/g, "");
}

/**
 * Text wie "3*stone, andesite, oak_log[pillar_axis=x]" oder "70%stone,30%cobblestone" einlesen.
 * @param {string} text
 * @returns {PatternEntry[]}
 */
export function parsePattern(text) {
  /** @type {PatternEntry[]} */
  const out = [];
  // Kommas innerhalb von [] nicht als Trenner werten
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  for (let part of parts) {
    part = part.trim();
    if (!part) continue;
    let w = 1;
    let m = part.match(/^(\d+(?:\.\d+)?)\s*[*%x]\s*(.+)$/);
    if (m) {
      w = parseFloat(m[1]);
      part = m[2];
    } else if ((m = part.match(/^(.+?)\s*\*\s*(\d+(?:\.\d+)?)$/))) {
      part = m[1];
      w = parseFloat(m[2]);
    }
    /** @type {Record<string, string|number|boolean>|undefined} */
    let states;
    const sm = part.match(/^([^\[]+)\[(.*)\]$/);
    if (sm) {
      part = sm[1];
      states = {};
      for (const kv of sm[2].split(",")) {
        const [k, val] = kv.split("=");
        if (k && val !== undefined) states[k.trim().replace(/^"|"$/g, "")] = parseValue(val);
      }
    }
    const id = normId(part);
    // Prüfen, ob der Block existiert
    BlockPermutation.resolve(id, states);
    out.push(states ? { id, states, w } : { id, w });
  }
  if (!out.length) throw new Error("Leeres Muster");
  return out;
}

/** @param {PatternEntry[]} pattern */
export function formatPattern(pattern) {
  return pattern
    .map((e) => {
      let s = shortId(e.id);
      if (e.states && Object.keys(e.states).length) {
        s +=
          "[" +
          Object.entries(e.states)
            .map(([k, val]) => `${k}=${val}`)
            .join(",") +
          "]";
      }
      return e.w !== 1 ? `${e.w}*${s}` : s;
    })
    .join(", ");
}

/** @param {BlockPermutation} perm @returns {PatternEntry} */
export function entryFromPermutation(perm) {
  const states = perm.getAllStates();
  return Object.keys(states).length ? { id: perm.type.id, states, w: 1 } : { id: perm.type.id, w: 1 };
}

const permCache = new Map();
/** @param {PatternEntry} e @returns {BlockPermutation} */
export function entryPerm(e) {
  const k = e.id + JSON.stringify(e.states ?? {});
  let p = permCache.get(k);
  if (!p) {
    try {
      p = BlockPermutation.resolve(e.id, e.states);
    } catch {
      // Zustände passen evtl. nicht mehr -> ohne Zustände
      p = BlockPermutation.resolve(e.id);
    }
    permCache.set(k, p);
  }
  return p;
}

/**
 * Erzeugt eine Zufallsauswahl-Funktion für ein Muster.
 * @param {PatternEntry[]} pattern
 * @returns {() => BlockPermutation}
 */
export function picker(pattern) {
  const perms = pattern.map(entryPerm);
  if (perms.length === 1) {
    const p = perms[0];
    return () => p;
  }
  const total = pattern.reduce((a, e) => a + Math.max(0, e.w), 0) || 1;
  return () => {
    let r = Math.random() * total;
    for (let i = 0; i < perms.length; i++) {
      r -= Math.max(0, pattern[i].w);
      if (r <= 0) return perms[i];
    }
    return perms[perms.length - 1];
  };
}

export const AIR_ID = "minecraft:air";
/** @type {BlockPermutation|undefined} */
let airPerm;
/** Luft-Permutation (verzögert erzeugt, da beim Laden noch nicht erlaubt). */
export function air() {
  return (airPerm ??= BlockPermutation.resolve("minecraft:air"));
}

const LIQUIDS = new Set(["minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"]);
const SOFT = new Set([
  "minecraft:air",
  "minecraft:short_grass",
  "minecraft:tall_grass",
  "minecraft:fern",
  "minecraft:large_fern",
  "minecraft:deadbush",
  "minecraft:snow_layer",
  "minecraft:vine",
  "minecraft:seagrass",
  "minecraft:structure_void",
  "minecraft:light_block",
  "minecraft:fire",
]);
const FLOWERS = /(flower|tulip|dandelion|poppy|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|rose_bush|lilac|peony|sunflower|mushroom$|sapling|torchflower|pitcher|bush$|sweet_berry)/;

/** @param {string} id */
export const isAirId = (id) => id === "minecraft:air";
/** @param {string} id */
export const isLiquidId = (id) => LIQUIDS.has(id);
/** Weiche/„durchlässige" Blöcke wie Gras, Blumen, Luft. @param {string} id */
export const isSoftId = (id) => SOFT.has(id) || FLOWERS.test(id);
/** Fester Block (kein Luft/Flüssigkeit/Pflanze). @param {string} id */
export const isSolidId = (id) => !SOFT.has(id) && !LIQUIDS.has(id) && !FLOWERS.test(id);

/**
 * @typedef {{mode:string, ids:string[]}} MaskDef
 * Erzeugt Test-Funktion: darf der Block mit dieser ID verändert werden?
 * @param {MaskDef} mask
 * @returns {(id:string)=>boolean}
 */
export function maskTest(mask) {
  switch (mask.mode) {
    case "air":
      return (id) => isAirId(id) || isSoftId(id) || isLiquidId(id);
    case "solid":
      return (id) => isSolidId(id);
    case "list": {
      const set = new Set(mask.ids);
      return (id) => set.has(id);
    }
    case "notlist": {
      const set = new Set(mask.ids);
      return (id) => !set.has(id);
    }
    default:
      return () => true;
  }
}

/** @param {MaskDef} mask */
export function describeMask(mask) {
  switch (mask.mode) {
    case "air":
      return "nur Luft/Pflanzen";
    case "solid":
      return "nur feste Blöcke";
    case "list":
      return "nur: " + mask.ids.map(shortId).join(", ");
    case "notlist":
      return "außer: " + mask.ids.map(shortId).join(", ");
    default:
      return "keine";
  }
}
