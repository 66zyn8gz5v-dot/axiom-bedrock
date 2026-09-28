// Modellieren: Aufbauen, Abtragen, Glätten, Schmelzen, Auffüllen, Felsen, Aufrauen.
import { runEdit } from "../core/edit.js";
import { air, formatPattern, isSolidId, picker, AIR_ID } from "../core/pattern.js";
import { fbm } from "../core/noise.js";
import { markDirty } from "../core/state.js";
import { target, targetOrAir } from "../core/util.js";
import { k3 } from "../core/vec.js";
import { BlockPermutation } from "@minecraft/server";
import { Modal } from "../ui/forms.js";
import { patternMenu } from "../ui/common.js";
import { sphereOffsets, strokeId } from "./registry.js";

export const SCULPT_MODES = /** @type {[string,string][]} */ ([
  ["add", "Aufbauen (Material hinzufügen)"],
  ["remove", "Abtragen (Material entfernen)"],
  ["smooth", "Glätten"],
  ["melt", "Schmelzen / Erodieren"],
  ["fill", "Auffüllen (Löcher schließen)"],
  ["rock", "Felsen (unregelmäßiger Brocken)"],
  ["roughen", "Aufrauen"],
  ["distort", "Verzerren (Blöcke wellenförmig verschieben)"],
  ["shatter", "Zerbrechen (Risse und Spalten)"],
]);

/**
 * Bereich um einen Mittelpunkt einlesen (fest/nicht fest + Block-ID).
 * @param {import("../core/edit.js").EditSession} es
 * @param {{x:number,y:number,z:number}} c
 * @param {number} R
 */
function readArea(es, c, R) {
  /** @type {Map<string,string>} */
  const ids = new Map();
  for (let x = -R; x <= R; x++)
    for (let y = -R; y <= R; y++)
      for (let z = -R; z <= R; z++) {
        const id = es.id(c.x + x, c.y + y, c.z + z);
        ids.set(k3(c.x + x, c.y + y, c.z + z), id);
      }
  return ids;
}

/** Häufigster fester Nachbarblock. @param {Map<string,string>} ids @param {number} x @param {number} y @param {number} z */
function commonNeighbor(ids, x, y, z) {
  /** @type {Map<string, number>} */
  const cnt = new Map();
  let best = "";
  let bestN = 0;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++) {
        const id = ids.get(k3(x + dx, y + dy, z + dz));
        if (!id || !isSolidId(id)) continue;
        // Blöcke darüber nicht bevorzugen (Gras gehört nach oben, nicht in Löcher)
        const n = (cnt.get(id) ?? 0) + (dy < 0 ? 2 : 1);
        cnt.set(id, n);
        if (n > bestN) {
          bestN = n;
          best = id;
        }
      }
  return best;
}

/** @type {import("./registry.js").Tool} */
export const sculptTool = {
  id: "axiom:sculpt",
  name: "Modellieren",
  brush: true,
  help: "Benutzen (gedrückt halten): mit dem Pinsel modellieren. Schleichen+Benutzen: Modus & Radius.",
  onUse(ses) {
    const c = ses.s.sculpt;
    const t = c.mode === "add" || c.mode === "rock" ? targetOrAir(ses.player, ses.s) : target(ses.player, ses.s);
    if (!t) return;
    const ctr = t.pos;
    const r = c.radius;
    const pick = picker(ses.s.pattern);
    const mode = c.mode;
    const noisy = c.noise;
    const seed = Math.random() * 1000;
    runEdit(ses.player, { label: "Modellieren", stroke: strokeId(ses, "sculpt"), symmetry: true }, function* (es) {
      const A = air();
      /** @param {number} x @param {number} y @param {number} z */
      const rough = (x, y, z) => (noisy ? fbm(x / 6 + seed, y / 6, z / 6) * r * 0.35 : 0);
      if (mode === "add" || mode === "remove") {
        let n = 0;
        for (const [dx, dy, dz, d2] of sphereOffsets(r + (noisy ? 2 : 0))) {
          const x = ctr.x + dx;
          const y = ctr.y + dy;
          const z = ctr.z + dz;
          if (noisy && Math.sqrt(d2) > r + rough(x, y, z)) continue;
          const id = es.id(x, y, z);
          if (!id) continue;
          if (mode === "add" && !isSolidId(id)) es.set(x, y, z, pick());
          else if (mode === "remove" && isSolidId(id)) es.set(x, y, z, A);
          if (++n % 256 === 0) yield;
        }
        return;
      }
      if (mode === "rock") {
        const rs = r * 0.8;
        let n = 0;
        for (const [dx, dy, dz] of sphereOffsets(r + 3)) {
          const x = ctr.x + dx;
          const y = ctr.y + dy;
          const z = ctr.z + dz;
          const d = Math.sqrt(dx * dx + dy * dy * 1.6 + dz * dz);
          const nz = fbm(dx / (r * 0.7) + seed, dy / (r * 0.7), dz / (r * 0.7), 3);
          if (d > rs + nz * r * 0.6) continue;
          es.set(x, y, z, pick());
          if (++n % 256 === 0) yield;
        }
        return;
      }
      // Zellbasierte Modi: Umgebung einlesen, dann neue Werte berechnen
      const ids = readArea(es, ctr, r + (mode === "distort" ? 4 : 2));
      yield;
      /** @type {[number,number,number,string][]} */
      const changes = [];
      const solidAt = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
        const id = ids.get(k3(x, y, z));
        return !!id && isSolidId(id);
      };
      let n = 0;
      for (const [dx, dy, dz] of sphereOffsets(r)) {
        const x = ctr.x + dx;
        const y = ctr.y + dy;
        const z = ctr.z + dz;
        const id = ids.get(k3(x, y, z));
        if (!id) continue;
        const solid = isSolidId(id);
        if (mode === "smooth") {
          let cnt = 0;
          for (let ax = -1; ax <= 1; ax++) for (let ay = -1; ay <= 1; ay++) for (let az = -1; az <= 1; az++) if (solidAt(x + ax, y + ay, z + az)) cnt++;
          if (solid && cnt <= 11) changes.push([x, y, z, AIR_ID]);
          else if (!solid && cnt >= 16) changes.push([x, y, z, commonNeighbor(ids, x, y, z) || "minecraft:stone"]);
        } else if (mode === "melt") {
          if (!solid) continue;
          let open = 0;
          if (!solidAt(x + 1, y, z)) open++;
          if (!solidAt(x - 1, y, z)) open++;
          if (!solidAt(x, y + 1, z)) open++;
          if (!solidAt(x, y - 1, z)) open++;
          if (!solidAt(x, y, z + 1)) open++;
          if (!solidAt(x, y, z - 1)) open++;
          if (open >= 3 || (open >= 2 && Math.random() < 0.3)) changes.push([x, y, z, AIR_ID]);
        } else if (mode === "fill") {
          if (solid) continue;
          let cnt = 0;
          if (solidAt(x + 1, y, z)) cnt++;
          if (solidAt(x - 1, y, z)) cnt++;
          if (solidAt(x, y - 1, z)) cnt += 1;
          if (solidAt(x, y + 1, z)) cnt++;
          if (solidAt(x, y, z + 1)) cnt++;
          if (solidAt(x, y, z - 1)) cnt++;
          if (cnt >= 4) changes.push([x, y, z, commonNeighbor(ids, x, y, z) || "minecraft:stone"]);
        } else if (mode === "distort") {
          // Quellblock an verschobener Position holen (Rauschfeld) -> Gelände wirkt verbogen
          const f = 1 / Math.max(3, r * 0.8);
          const ox = Math.round(fbm(x * f + seed, y * f, z * f, 2) * 3);
          const oy = Math.round(fbm(x * f, y * f + seed, z * f, 2) * 3);
          const oz = Math.round(fbm(x * f, y * f, z * f + seed, 2) * 3);
          const src = ids.get(k3(x + ox, y + oy, z + oz));
          if (src && src !== id && (isSolidId(src) || isSolidId(id))) changes.push([x, y, z, isSolidId(src) ? src : AIR_ID]);
        } else if (mode === "shatter") {
          // Risse: dünne Zonen, in denen das Rauschen nahe 0 ist
          if (solid && Math.abs(fbm(x / 5 + seed, y / 5, z / 5, 2)) < 0.06) changes.push([x, y, z, AIR_ID]);
        } else if (mode === "roughen") {
          const nz = fbm(x / 4 + seed, y / 4, z / 4, 2);
          if (solid && nz > 0.25) {
            if (!solidAt(x, y + 1, z) || !solidAt(x + 1, y, z) || !solidAt(x - 1, y, z) || !solidAt(x, y, z + 1) || !solidAt(x, y, z - 1))
              changes.push([x, y, z, AIR_ID]);
          } else if (!solid && nz < -0.25 && solidAt(x, y - 1, z)) {
            changes.push([x, y, z, commonNeighbor(ids, x, y, z) || "minecraft:stone"]);
          }
        }
        if (++n % 512 === 0) yield;
      }
      /** @type {Map<string, BlockPermutation>} */
      const cache = new Map();
      n = 0;
      for (const [x, y, z, id] of changes) {
        let p = cache.get(id);
        if (!p) {
          p = BlockPermutation.resolve(id);
          cache.set(id, p);
        }
        es.set(x, y, z, p);
        if (++n % 256 === 0) yield;
      }
    });
  },
  hud(ses) {
    const c = ses.s.sculpt;
    return `${SCULPT_MODES.find((m) => m[0] === c.mode)?.[1]} · Radius ${c.radius}` + (c.mode === "add" || c.mode === "rock" ? ` · §e${formatPattern(ses.s.pattern)}` : "");
  },
  async menu(ses) {
    const c = ses.s.sculpt;
    const r = await new Modal("Modellieren")
      .dropdown("mode", "Modus", SCULPT_MODES, c.mode)
      .slider("radius", "Radius", 1, 16, 1, c.radius)
      .toggle("noise", "Unregelmäßiger Rand (Rauschen)", c.noise)
      .toggle("pat", "Danach Block/Muster wählen", false)
      .show(ses.player);
    if (!r) return;
    c.mode = r.mode;
    c.radius = r.radius;
    c.noise = r.noise;
    markDirty(ses);
    if (r.pat) await patternMenu(ses);
  },
};
