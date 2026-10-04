// Terrain (Höhenkarte): Anheben, Absenken, Einebnen, Glätten, Hügel (Rauschen), Terrassen.
import { BlockPermutation } from "@minecraft/server";
import { runEdit } from "../core/edit.js";
import { air, isSolidId } from "../core/pattern.js";
import { fbm } from "../core/noise.js";
import { markDirty } from "../core/state.js";
import { now, target } from "../core/util.js";
import { Modal } from "../ui/forms.js";
import { strokeId } from "./registry.js";

export const TERRAIN_MODES = /** @type {[string,string][]} */ ([
  ["raise", "Anheben"],
  ["lower", "Absenken"],
  ["flatten", "Einebnen (auf Zielhöhe)"],
  ["smooth", "Höhen glätten"],
  ["hills", "Hügel / Rauschen"],
  ["terrace", "Terrassen (Stufen)"],
  ["mountain", "Stempel: Berg (ein Klick)"],
  ["crater", "Stempel: Krater (ein Klick)"],
  ["volcano", "Stempel: Vulkan (ein Klick)"],
  ["mesa", "Stempel: Hochplateau (ein Klick)"],
  ["island", "Stempel: Insel mit Strand (ein Klick)"],
  ["canyon", "Stempel: Schlucht in Blickrichtung (ein Klick)"],
  ["stairs", "Treppen/Stufen an Stufenkanten setzen"],
]);

/** Richtung zur höheren Nachbarspalte -> weirdo_direction (0 Ost, 1 West, 2 Süd, 3 Nord) */
const STAIR_DIRS = /** @type {[number, number, number][]} */ ([
  [1, 0, 0],
  [-1, 0, 1],
  [0, 1, 2],
  [0, -1, 3],
]);

const STAIR_MAP = /** @type {Record<string,string>} */ ({
  "minecraft:stone": "minecraft:normal_stone_stairs",
  "minecraft:cobblestone": "minecraft:stone_stairs",
  "minecraft:mossy_cobblestone": "minecraft:mossy_cobblestone_stairs",
  "minecraft:sandstone": "minecraft:sandstone_stairs",
  "minecraft:red_sandstone": "minecraft:red_sandstone_stairs",
  "minecraft:andesite": "minecraft:andesite_stairs",
  "minecraft:diorite": "minecraft:diorite_stairs",
  "minecraft:granite": "minecraft:granite_stairs",
  "minecraft:deepslate": "minecraft:cobbled_deepslate_stairs",
  "minecraft:cobbled_deepslate": "minecraft:cobbled_deepslate_stairs",
  "minecraft:stone_bricks": "minecraft:stone_brick_stairs",
  "minecraft:bricks": "minecraft:brick_stairs",
  "minecraft:oak_planks": "minecraft:oak_stairs",
  "minecraft:spruce_planks": "minecraft:spruce_stairs",
  "minecraft:blackstone": "minecraft:blackstone_stairs",
  "minecraft:mud_bricks": "minecraft:mud_brick_stairs",
});

/** Passende Treppe zum Material der höheren Stufe (Gras/Erde -> Bruchstein-Treppe). @param {string} id */
function stairFor(id) {
  // In Bedrock heißt die Bruchsteintreppe „stone_stairs“
  return STAIR_MAP[id] ?? "minecraft:stone_stairs";
}

/** Passende Stufe (Platte) zur Treppe. @param {string} stair */
function slabFor(stair) {
  return stair === "minecraft:stone_stairs" ? "minecraft:cobblestone_slab" : stair.replace(/_stairs$/, "_slab");
}

const NOT_GROUND = /(leaves|log|wood|mushroom_block|vine|bamboo|cactus)/;

/**
 * Oberste Boden-Höhe einer Spalte suchen.
 * @param {import("../core/edit.js").EditSession} es
 * @param {number} x @param {number} z @param {number} from @param {number} range
 */
function groundY(es, x, z, from, range) {
  for (let y = from; y >= from - range; y--) {
    const id = es.id(x, y, z);
    if (id && isSolidId(id) && !NOT_GROUND.test(id)) return y;
  }
  return null;
}

/** @type {import("./registry.js").Tool} */
export const terrainTool = {
  id: "axiom:terrain",
  name: "Terrain",
  brush: true,
  help: "Benutzen (gedrückt halten): Gelände anheben/absenken/glätten … Schleichen+Benutzen: Modus, Radius, Stärke.",
  onUse(ses) {
    const t = target(ses.player, ses.s);
    if (!t) return;
    const c = { ...ses.s.terrain };
    if (["mountain", "crater", "volcano", "mesa", "island", "canyon"].includes(c.mode)) {
      // Stempel nur einmal pro Tastendruck
      const last = ses.floodLast ?? -100;
      ses.floodLast = now();
      if (now() - last < 20) return;
    }
    const ctr = t.pos;
    const R = c.radius;
    const vd = ses.player.getViewDirection();
    const vl = Math.hypot(vd.x, vd.z) || 1;
    const fx = vd.x / vl;
    const fz = vd.z / vl;
    const seed = 77.37;
    runEdit(ses.player, { label: "Terrain", stroke: strokeId(ses, "terrain"), symmetry: true }, function* (es) {
      const A = air();
      const scanTop = ctr.y + Math.max(24, R * 2);
      const range = Math.max(48, R * 4);
      /** @type {Map<string, number|null>} */
      const hm = new Map();
      const H = (/** @type {number} */ x, /** @type {number} */ z) => {
        const k = x + "," + z;
        if (!hm.has(k)) hm.set(k, groundY(es, x, z, scanTop, range));
        return hm.get(k) ?? null;
      };
      const pad = c.mode === "smooth" ? 2 : c.mode === "stairs" ? 1 : 0;
      for (let dx = -R - pad; dx <= R + pad; dx++) {
        for (let dz = -R - pad; dz <= R + pad; dz++) H(ctr.x + dx, ctr.z + dz);
        yield;
      }
      /** @type {Map<string, BlockPermutation>} */
      const cache = new Map();
      const perm = (/** @type {string} */ id) => {
        let p = cache.get(id);
        if (!p) {
          p = BlockPermutation.resolve(id);
          cache.set(id, p);
        }
        return p;
      };
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > R + 0.5) continue;
          const x = ctr.x + dx;
          const z = ctr.z + dz;
          const h = H(x, z);
          if (h === null) continue;
          if (c.mode === "stairs") {
            // Stufe genau 1 Block höher daneben? -> Treppe davor setzen, die zur höheren Seite ansteigt
            const above = es.id(x, h + 1, z);
            if (!above || isSolidId(above)) continue;
            for (const [dx2, dz2, dir] of STAIR_DIRS) {
              if (H(x + dx2, z + dz2) !== h + 1) continue;
              const stair = stairFor(es.id(x + dx2, h + 1, z + dz2));
              try {
                if (c.slab) es.set(x, h + 1, z, BlockPermutation.resolve(slabFor(stair)));
                else es.set(x, h + 1, z, BlockPermutation.resolve(stair, { weirdo_direction: dir, upside_down_bit: false }));
              } catch {}
              break;
            }
            continue;
          }
          const fall = c.falloff ? Math.max(0, Math.cos((Math.min(d, R) / (R + 0.5)) * (Math.PI / 2))) : 1;
          /** @type {string|undefined} */
          let topOverride;
          let target = h;
          switch (c.mode) {
            case "raise":
              target = h + Math.round(c.strength * fall);
              break;
            case "lower":
              target = h - Math.round(c.strength * fall);
              break;
            case "flatten":
              target = Math.round(h + (ctr.y - h) * Math.min(1, fall * (c.strength / 4)));
              break;
            case "smooth": {
              let sum = 0;
              let cnt = 0;
              for (let ax = -2; ax <= 2; ax++)
                for (let az = -2; az <= 2; az++) {
                  const hh = H(x + ax, z + az);
                  if (hh !== null) {
                    sum += hh;
                    cnt++;
                  }
                }
              if (cnt) target = Math.round(h + (sum / cnt - h) * Math.min(1, fall * (c.strength / 3)));
              break;
            }
            case "hills":
              target = h + Math.round(fbm(x / 16 + seed, 0.5, z / 16 + 13.71, 3) * c.strength * 3 * fall);
              break;
            case "mountain": {
              // Spitze Bergform mit etwas Rauschen
              const f = Math.max(0, 1 - d / (R + 0.5));
              target = h + Math.round(c.strength * 4 * Math.pow(f, 1.6) * (1 + 0.35 * fbm(x / 7 + seed, 0.3, z / 7, 2)));
              break;
            }
            case "crater": {
              // Mulde in der Mitte, aufgeworfener Rand außen
              const q = d / (R + 0.5);
              if (q < 0.7) target = h - Math.round(c.strength * 3 * (1 - (q / 0.7) ** 2));
              else target = h + Math.round(c.strength * Math.sin(((q - 0.7) / 0.3) * Math.PI) * 0.9);
              break;
            }
            case "volcano": {
              // Kegel mit Krater oben
              const q = d / (R + 0.5);
              const cone = c.strength * 5 * Math.max(0, 1 - q);
              const pit = q < 0.18 ? c.strength * 2.5 * (1 - q / 0.18) : 0;
              target = h + Math.round(cone - pit);
              break;
            }
            case "mesa": {
              // Flache Oberseite, steile Flanken
              const q = d / (R + 0.5);
              const top = c.strength * 3;
              target = h + Math.round(q < 0.65 ? top : top * Math.max(0, 1 - (q - 0.65) / 0.35) ** 0.6);
              break;
            }
            case "island": {
              // Flacher Hügel, außen Sandstrand
              const q = d / (R + 0.5);
              target = h + Math.round(c.strength * 2.5 * Math.max(0, 1 - q * q));
              if (q > 0.65) topOverride = "minecraft:sand";
              break;
            }
            case "canyon": {
              // Langgezogene Schlucht entlang der Blickrichtung
              const across = Math.abs(dx * fz - dz * fx);
              const along = Math.abs(dx * fx + dz * fz);
              const w = Math.max(1.5, R * 0.35);
              if (across > w) break;
              target = h - Math.round(c.strength * 4 * (1 - (across / w) ** 2) * (1 - (along / (R + 0.5)) ** 4));
              break;
            }
            case "terrace": {
              const step = Math.max(2, c.strength);
              target = Math.round(h + (Math.floor(h / step) * step - h) * fall);
              break;
            }
          }
          if (target === h && !topOverride) continue;
          const topId = topOverride ?? es.id(x, h, z);
          const belowId = es.id(x, h - 1, z);
          const fillId = belowId && isSolidId(belowId) ? belowId : topId;
          if (target > h) {
            // Oberfläche nach oben verschieben: alte Oberfläche wird Füllmaterial
            es.set(x, h, z, perm(fillId));
            for (let y = h + 1; y < target; y++) es.set(x, y, z, perm(fillId));
            es.set(x, target, z, perm(topId));
          } else {
            for (let y = h; y > target; y--) es.set(x, y, z, A);
            es.set(x, target, z, perm(topId));
          }
        }
        yield;
      }
    });
  },
  hud(ses) {
    const c = ses.s.terrain;
    return `${TERRAIN_MODES.find((m) => m[0] === c.mode)?.[1]} · Radius ${c.radius} · Stärke ${c.strength}`;
  },
  async menu(ses) {
    const c = ses.s.terrain;
    const r = await new Modal("Terrain")
      .dropdown("mode", "Modus", TERRAIN_MODES, c.mode)
      .slider("radius", "Radius", 1, 32, 1, c.radius)
      .slider("strength", "Stärke (Blöcke pro Anwendung / Stufenhöhe)", 1, 10, 1, c.strength)
      .toggle("falloff", "Weicher Rand (zur Mitte stärker)", c.falloff)
      .toggle("slab", "Treppen-Modus: Stufen (Platten) statt Treppen", c.slab)
      .show(ses.player);
    if (!r) return;
    Object.assign(c, r);
    markDirty(ses);
  },
};
