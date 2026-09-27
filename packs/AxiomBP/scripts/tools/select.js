// Auswahl-Werkzeuge: Box-Auswahl, Magische Auswahl, Pinsel-Auswahl.
import { system } from "@minecraft/server";
import { boxSel, combine, selDims, selSize, SET_LIMIT } from "../core/selection.js";
import { markDirty } from "../core/state.js";
import { err, fmtNum, msg, now, target, bar } from "../core/util.js";
import { fmt, k3, NEIGHBORS6, v } from "../core/vec.js";
import { isSoftId, isSolidId, isAirId, isLiquidId } from "../core/pattern.js";
import { Modal } from "../ui/forms.js";

export const SEL_MODES = /** @type {[string,string][]} */ ([
  ["set", "Ersetzen (neue Auswahl)"],
  ["add", "Hinzufügen (+)"],
  ["sub", "Entfernen (-)"],
]);

/** @param {import("../core/state.js").Session} ses @param {import("../core/selection.js").Selection} part */
export function applySel(ses, part) {
  const r = combine(ses.sel, part, ses.s.selMode);
  if (typeof r === "string") {
    err(ses.player, r);
    return false;
  }
  ses.sel = r;
  return true;
}

/** @param {import("../core/state.js").Session} ses */
export function selInfo(ses) {
  if (!ses.sel) return "§7keine Auswahl";
  const d = selDims(ses.sel);
  return `§b${fmtNum(selSize(ses.sel))}§r Blöcke (${d.x}×${d.y}×${d.z})`;
}

/** @param {import("../core/state.js").Session} ses */
async function selModeMenu(ses) {
  const r = await new Modal("Auswahl-Modus").dropdown("mode", "Neue Auswahl soll …", SEL_MODES, ses.s.selMode).show(ses.player);
  if (!r) return;
  ses.s.selMode = r.mode;
  markDirty(ses);
}

// ---------- Box-Auswahl ----------
/** @type {import("./registry.js").Tool} */
export const boxSelect = {
  id: "axiom:box_select",
  name: "Box-Auswahl",
  help: "Benutzen: Ecke 1, dann Ecke 2 setzen. Schlagen: Ecke 1 (nah). Schleichen+Benutzen: Menü.",
  onUse(ses) {
    const t = target(ses.player, ses.s);
    if (!t) return err(ses.player, "Kein Block im Blick.");
    corner(ses, t.pos);
  },
  onHit(ses, block) {
    ses.nextCorner = 1;
    corner(ses, block.location);
  },
  hud: (ses) => `Ecke ${ses.nextCorner} setzen · ${selInfo(ses)}`,
  menu: selModeMenu,
};

/** @param {import("../core/state.js").Session} ses @param {{x:number,y:number,z:number}} pos */
function corner(ses, pos) {
  const dim = ses.player.dimension.id;
  if (ses.nextCorner === 1 || !ses.corner1) {
    ses.corner1 = { ...pos };
    ses.selBase = ses.sel;
    ses.nextCorner = 2;
    if (ses.s.selMode === "set") ses.sel = boxSel(dim, pos, pos);
    msg(ses.player, `Ecke 1: §e${fmt(pos)}`);
  } else {
    const part = boxSel(dim, ses.corner1, pos);
    ses.sel = ses.selBase ?? null;
    if (ses.s.selMode === "set") ses.sel = part;
    else applySel(ses, part);
    ses.nextCorner = 1;
    msg(ses.player, `Ecke 2: §e${fmt(pos)}§r → ${selInfo(ses)}`);
  }
}

// ---------- Magische Auswahl ----------
const MAGIC_MODES = /** @type {[string,string][]} */ ([
  ["same", "Gleicher Blocktyp (3D)"],
  ["surface", "Oberfläche (gleicher Typ, sichtbare Seite)"],
  ["anysurface", "Oberfläche (alle Blöcke, sichtbare Seite)"],
  ["solid", "Alle festen Blöcke (3D, verbunden)"],
]);

/** @type {import("./registry.js").Tool} */
export const magicSelect = {
  id: "axiom:magic_select",
  name: "Magische Auswahl",
  help: "Benutzen: verbundene Blöcke automatisch auswählen. Schleichen+Benutzen: Einstellungen.",
  onUse(ses) {
    const t = target(ses.player, ses.s);
    if (!t) return err(ses.player, "Kein Block im Blick.");
    const player = ses.player;
    const dim = player.dimension;
    const cfg = ses.s.magic;
    const startId = t.block.typeId;
    const start = t.pos;
    const n = t.normal;
    const limit = Math.min(cfg.limit, SET_LIMIT);
    const dirs = cfg.diagonal ? neighbors26() : NEIGHBORS6;
    const surfaceDirs = neighbors26();
    const exposed = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
      try {
        const b = dim.getBlock({ x: x + n.x, y: y + n.y, z: z + n.z });
        return !b || isSoftId(b.typeId) || isLiquidId(b.typeId);
      } catch {
        return false;
      }
    };
    /** @param {string} id */
    const ok = (id) => {
      switch (cfg.mode) {
        case "solid":
          return isSolidId(id);
        case "anysurface":
          return !isAirId(id) && !isSoftId(id) && !isLiquidId(id);
        default:
          return id === startId;
      }
    };
    const surface = cfg.mode === "surface" || cfg.mode === "anysurface";
    ses.busy = true;
    system.runJob(
      (function* () {
        try {
          yield* flood();
        } catch (e) {
          err(player, "Fehler: " + e);
        }
        ses.busy = false;
      })()
    );
    function* flood() {
      {
        const keys = new Set([k3(start.x, start.y, start.z)]);
        const queue = [start];
        let min = { ...start };
        let max = { ...start };
        let hitLimit = false;
        let qi = 0;
        while (qi < queue.length) {
          const p = queue[qi++];
          for (const d of surface ? surfaceDirs : dirs) {
            const x = p.x + d.x;
            const y = p.y + d.y;
            const z = p.z + d.z;
            const k = k3(x, y, z);
            if (keys.has(k)) continue;
            let b;
            try {
              b = dim.getBlock({ x, y, z });
            } catch {
              continue;
            }
            if (!b || !ok(b.typeId)) continue;
            if (surface && !exposed(x, y, z)) continue;
            keys.add(k);
            queue.push({ x, y, z });
            if (x < min.x) min.x = x;
            if (y < min.y) min.y = y;
            if (z < min.z) min.z = z;
            if (x > max.x) max.x = x;
            if (y > max.y) max.y = y;
            if (z > max.z) max.z = z;
            if (keys.size >= limit) {
              hitLimit = true;
              break;
            }
          }
          if (hitLimit) break;
          if (qi % 64 === 0) yield;
        }
        const part = { kind: /** @type {"set"} */ ("set"), dim: dim.id, keys, min, max };
        if (applySel(ses, part)) {
          msg(player, `Magische Auswahl: ${fmtNum(keys.size)} Blöcke → ${selInfo(ses)}` + (hitLimit ? " §6(Limit erreicht)" : ""));
        }
      }
    }
  },
  hud: (ses) => `Modus: ${MAGIC_MODES.find((m) => m[0] === ses.s.magic.mode)?.[1]} · ${selInfo(ses)}`,
  async menu(ses) {
    const c = ses.s.magic;
    const r = await new Modal("Magische Auswahl")
      .dropdown("mode", "Was wird ausgewählt?", MAGIC_MODES, c.mode)
      .dropdown("sel", "Auswahl-Modus", SEL_MODES, ses.s.selMode)
      .slider("limit", "Maximale Blöcke (×1000)", 1, 400, 1, Math.round(c.limit / 1000))
      .toggle("diagonal", "Auch diagonal verbundene Blöcke", c.diagonal)
      .show(ses.player);
    if (!r) return;
    c.mode = r.mode;
    c.limit = r.limit * 1000;
    c.diagonal = r.diagonal;
    ses.s.selMode = r.sel;
    markDirty(ses);
  },
};

function neighbors26() {
  const out = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) out.push(v(x, y, z));
  return out;
}

// ---------- Pinsel-Auswahl (Freihand) ----------
/** @type {import("./registry.js").Tool} */
export const brushSelect = {
  id: "axiom:brush_select",
  name: "Pinsel-Auswahl",
  brush: true,
  help: "Benutzen (gedrückt halten): Blöcke mit dem Pinsel zur Auswahl hinzufügen. Modus „Entfernen“ radiert. Schleichen+Benutzen: Einstellungen.",
  onUse(ses) {
    const t = target(ses.player, ses.s);
    if (!t) return;
    const r = ses.s.brushSel.radius;
    const dim = ses.player.dimension;
    const keys = new Set();
    for (let x = -r; x <= r; x++)
      for (let y = -r; y <= r; y++)
        for (let z = -r; z <= r; z++) {
          if (x * x + y * y + z * z > r * r + r) continue;
          const p = v(t.pos.x + x, t.pos.y + y, t.pos.z + z);
          try {
            const b = dim.getBlock(p);
            if (b && !isAirId(b.typeId)) keys.add(k3(p.x, p.y, p.z));
          } catch {}
        }
    if (!keys.size) return;
    const part = { kind: /** @type {"set"} */ ("set"), dim: dim.id, keys, min: v(t.pos.x - r, t.pos.y - r, t.pos.z - r), max: v(t.pos.x + r, t.pos.y + r, t.pos.z + r) };
    // Neuer Strich im Modus "Ersetzen" beginnt eine neue Auswahl, danach wird hinzugefügt
    const newStroke = now() - (ses.brushSelLast ?? -100) > 12;
    ses.brushSelLast = now();
    const mode = ses.s.selMode === "set" ? (newStroke ? "set" : "add") : ses.s.selMode;
    const res = combine(ses.sel, part, mode);
    if (typeof res === "string") return err(ses.player, res);
    ses.sel = res;
    bar(ses.player, `Pinsel-Auswahl: ${selInfo(ses)}`);
  },
  hud: (ses) => `Radius ${ses.s.brushSel.radius} · ${selInfo(ses)}`,
  async menu(ses) {
    const r = await new Modal("Pinsel-Auswahl")
      .slider("radius", "Pinsel-Radius", 0, 12, 1, ses.s.brushSel.radius)
      .dropdown("sel", "Auswahl-Modus", SEL_MODES, ses.s.selMode)
      .show(ses.player);
    if (!r) return;
    ses.s.brushSel.radius = r.radius;
    ses.s.selMode = r.sel;
    markDirty(ses);
  },
};
