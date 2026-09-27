// Allgemeine Hilfsfunktionen: Nachrichten, Blickziel, gehaltenes Item.
import { EquipmentSlot, system } from "@minecraft/server";
import { FACE_VEC, add, floor, v } from "./vec.js";

/** @param {import("@minecraft/server").Player} player @param {string} text */
export function msg(player, text) {
  player.sendMessage("§d[Axiom]§r " + text);
}
/** @param {import("@minecraft/server").Player} player @param {string} text */
export function err(player, text) {
  player.sendMessage("§d[Axiom]§c " + text);
}
/** @param {import("@minecraft/server").Player} player @param {string} text */
export function bar(player, text) {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {}
}

/** @param {import("@minecraft/server").Player} player */
export function heldItem(player) {
  try {
    return player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
  } catch {
    return undefined;
  }
}

/**
 * @typedef {{
 *   block: import("@minecraft/server").Block,
 *   pos: {x:number,y:number,z:number},
 *   face: string,
 *   normal: {x:number,y:number,z:number},
 *   adjacent: {x:number,y:number,z:number},
 * }} Target
 */

/**
 * Block im Blickfeld mit großer Reichweite.
 * @param {import("@minecraft/server").Player} player
 * @param {{reach:number, liquids:boolean}} s
 * @returns {Target | undefined}
 */
export function target(player, s) {
  let hit;
  try {
    hit = player.getBlockFromViewDirection({
      maxDistance: s.reach,
      includeLiquidBlocks: s.liquids,
      includePassableBlocks: s.liquids,
    });
  } catch {
    return undefined;
  }
  if (!hit) return undefined;
  const normal = FACE_VEC[/** @type {keyof typeof FACE_VEC} */ (hit.face)] ?? v(0, 1, 0);
  const pos = hit.block.location;
  return { block: hit.block, pos, face: hit.face, normal, adjacent: add(pos, normal) };
}

/**
 * Punkt in der Luft vor dem Spieler (für Engel-Platzierung).
 * @param {import("@minecraft/server").Player} player
 * @param {number} distance
 */
export function pointInFront(player, distance) {
  const head = player.getHeadLocation();
  const d = player.getViewDirection();
  return floor({ x: head.x + d.x * distance, y: head.y + d.y * distance, z: head.z + d.z * distance });
}

/** Ziel oder – falls nichts getroffen – Punkt in der Luft. */
export function targetOrAir(/** @type {import("@minecraft/server").Player} */ player, /** @type {any} */ s) {
  const t = target(player, s);
  if (t) return { pos: t.pos, adjacent: t.adjacent, normal: t.normal, hit: true, block: t.block };
  const p = pointInFront(player, s.airDist);
  return { pos: p, adjacent: p, normal: v(0, 1, 0), hit: false, block: undefined };
}

/** Aktuelle Tick-Nummer */
export const now = () => system.currentTick;

/** @param {number} n */
export const fmtNum = (n) => n.toLocaleString("de-DE");
