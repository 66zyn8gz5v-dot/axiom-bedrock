// Werkzeug-Schnittstelle + gemeinsame Pinsel-Helfer.
import { now } from "../core/util.js";

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   help: string,
 *   brush?: boolean,
 *   noSneakMenu?: boolean,
 *   onUse: (ses: import("../core/state.js").Session) => any,
 *   onHit?: (ses: import("../core/state.js").Session, block: import("@minecraft/server").Block) => any,
 *   menu?: (ses: import("../core/state.js").Session) => any,
 *   hud?: (ses: import("../core/state.js").Session) => string,
 *   preview?: (ses: import("../core/state.js").Session) => any,
 * }} Tool
 */

/**
 * Kennung für einen zusammenhängenden Pinselstrich (für einen gemeinsamen Verlaufseintrag).
 * @param {import("../core/state.js").Session} ses
 * @param {string} tool
 */
export function strokeId(ses, tool) {
  const t = now();
  if (!ses.strokeId || !ses.strokeId.startsWith(tool) || t - (ses.strokeLast ?? -100) > 12) ses.strokeId = tool + ":" + t;
  ses.strokeLast = t;
  return ses.strokeId;
}

/**
 * Positionen innerhalb einer Kugel.
 * @param {number} r
 * @returns {Generator<[number, number, number, number], void, void>} dx, dy, dz, Abstand²
 */
export function* sphereOffsets(r) {
  const rr = r * r + r * 0.8;
  const ri = Math.ceil(r);
  for (let dx = -ri; dx <= ri; dx++)
    for (let dz = -ri; dz <= ri; dz++)
      for (let dy = -ri; dy <= ri; dy++) {
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= rr) yield [dx, dy, dz, d2];
      }
}
