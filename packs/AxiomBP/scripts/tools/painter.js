// Maler: Oberfläche bemalen, ersetzen, Rauschen-Maler, Oberseite, Säubern (Clentaminator).
import { runEdit } from "../core/edit.js";
import { air, formatPattern, isLiquidId, isSoftId, isSolidId, isAirId, picker } from "../core/pattern.js";
import { fbm } from "../core/noise.js";
import { markDirty } from "../core/state.js";
import { target } from "../core/util.js";
import { Modal } from "../ui/forms.js";
import { patternMenu } from "../ui/common.js";
import { sphereOffsets, strokeId } from "./registry.js";

export const PAINT_MODES = /** @type {[string,string][]} */ ([
  ["surface", "Oberfläche bemalen"],
  ["top", "Nur Oberseite (von oben sichtbar)"],
  ["replace", "Alles im Pinsel ersetzen"],
  ["noise", "Rauschen-Maler (2 Muster gemischt)"],
  ["gradient", "Höhenverlauf (unten Muster 1 → oben Muster 2)"],
  ["clean", "Säubern (Pflanzen & Flüssigkeiten entfernen)"],
]);

/** @type {import("./registry.js").Tool} */
export const painterTool = {
  id: "axiom:painter",
  name: "Maler",
  brush: true,
  help: "Benutzen (gedrückt halten): Blöcke im Pinsel bemalen. Schleichen+Benutzen: Modus, Radius, Muster.",
  onUse(ses) {
    const t = target(ses.player, ses.s);
    if (!t) return;
    const c = ses.s.painter;
    const ctr = t.pos;
    const r = c.radius;
    const p1 = picker(ses.s.pattern);
    const p2 = picker(ses.s.pattern2);
    const mode = c.mode;
    runEdit(ses.player, { label: "Maler", stroke: strokeId(ses, "painter"), symmetry: true }, function* (es) {
      const A = air();
      /** @param {number} x @param {number} y @param {number} z */
      const open = (x, y, z) => {
        const id = es.id(x, y, z);
        return !id || !isSolidId(id);
      };
      /** Freiliegend innerhalb der Tiefe? @param {number} x @param {number} y @param {number} z */
      const exposed = (x, y, z) => {
        for (let d = 1; d <= c.depth; d++) {
          if (open(x + d, y, z) || open(x - d, y, z) || open(x, y + d, z) || open(x, y - d, z) || open(x, y, z + d) || open(x, y, z - d)) return true;
        }
        return false;
      };
      let n = 0;
      for (const [dx, dy, dz] of sphereOffsets(r)) {
        const x = ctr.x + dx;
        const y = ctr.y + dy;
        const z = ctr.z + dz;
        const id = es.id(x, y, z);
        if (!id) continue;
        if (mode === "clean") {
          if (!isAirId(id) && (isSoftId(id) || isLiquidId(id))) es.set(x, y, z, A);
        } else if (isSolidId(id)) {
          if (mode === "replace") es.set(x, y, z, p1());
          else if (mode === "top") {
            let ok = false;
            for (let d = 1; d <= c.depth; d++) if (open(x, y + d, z)) ok = true;
            if (ok) es.set(x, y, z, p1());
          } else if (exposed(x, y, z)) {
            if (mode === "noise") es.set(x, y, z, fbm(x / c.scale, y / c.scale, z / c.scale) > c.threshold / 100 ? p2() : p1());
            else if (mode === "gradient") {
              const f = (dy + r) / (2 * r + 1) + (Math.random() - 0.5) * 0.35;
              es.set(x, y, z, f > 0.5 ? p2() : p1());
            } else es.set(x, y, z, p1());
          }
        }
        if (++n % 256 === 0) yield;
      }
    });
  },
  hud(ses) {
    const c = ses.s.painter;
    const two = c.mode === "noise" || c.mode === "gradient";
    return `${PAINT_MODES.find((m) => m[0] === c.mode)?.[1]} · R${c.radius}` + (c.mode === "clean" ? "" : ` · §e${formatPattern(ses.s.pattern)}` + (two ? `§r / §e${formatPattern(ses.s.pattern2)}` : ""));
  },
  async menu(ses) {
    const c = ses.s.painter;
    const r = await new Modal("Maler")
      .dropdown("mode", "Modus", PAINT_MODES, c.mode)
      .slider("radius", "Radius", 1, 16, 1, c.radius)
      .slider("depth", "Tiefe (Schichten unter der Oberfläche)", 1, 6, 1, c.depth)
      .slider("scale", "Rauschen: Größe der Flecken", 2, 40, 1, c.scale)
      .slider("threshold", "Rauschen: Anteil Muster 2 (-100 viel … 100 wenig)", -100, 100, 5, c.threshold)
      .toggle("pat", "Danach Muster 1 wählen", false)
      .toggle("pat2", "Danach Muster 2 wählen", false)
      .show(ses.player);
    if (!r) return;
    Object.assign(c, { mode: r.mode, radius: r.radius, depth: r.depth, scale: r.scale, threshold: r.threshold });
    markDirty(ses);
    if (r.pat) await patternMenu(ses, "pattern");
    if (r.pat2) await patternMenu(ses, "pattern2");
  },
};
