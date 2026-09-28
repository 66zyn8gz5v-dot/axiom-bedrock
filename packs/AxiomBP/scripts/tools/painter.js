// Maler: Oberfläche bemalen, ersetzen, Rauschen-Maler, Oberseite, Säubern (Clentaminator).
import { runEdit } from "../core/edit.js";
import { air, formatPattern, isLiquidId, isSoftId, isSolidId, isAirId, picker } from "../core/pattern.js";
import { fbm } from "../core/noise.js";
import { markDirty } from "../core/state.js";
import { err, now, target } from "../core/util.js";
import { Modal } from "../ui/forms.js";
import { patternMenu } from "../ui/common.js";
import { sphereOffsets, strokeId } from "./registry.js";

export const PAINT_MODES = /** @type {[string,string][]} */ ([
  ["surface", "Oberfläche bemalen"],
  ["top", "Nur Oberseite (von oben sichtbar)"],
  ["replace", "Alles im Pinsel ersetzen"],
  ["noise", "Rauschen-Maler (2 Muster gemischt)"],
  ["gradient", "Höhenverlauf (unten Muster 1 → oben Muster 2)"],
  ["slope", "Nach Neigung (flach Muster 1, steil Muster 2)"],
  ["scatter", "Streuen (Muster verstreut auf die Oberfläche setzen)"],
  ["clean", "Säubern (Pflanzen & Flüssigkeiten entfernen)"],
  ["flood", "Flutfüllung ab Blickziel (See/Becken füllen, z.B. mit Wasser)"],
]);

/**
 * Flutfüllung wie Wasser: breitet sich seitlich und nach unten aus, nie über die Starthöhe.
 * Läuft das Becken „aus“ (zu groß), wird nichts verändert.
 * @param {import("../core/state.js").Session} ses
 * @param {{x:number,y:number,z:number}} start
 */
function floodFill(ses, start) {
  const limit = ses.s.painter.floodLimit;
  const pick = picker(ses.s.pattern);
  const player = ses.player;
  runEdit(player, { label: "Flutfüllung" }, function* (es) {
    /** @param {number} x @param {number} y @param {number} z */
    const open = (x, y, z) => {
      const id = es.id(x, y, z);
      return !!id && !isSolidId(id) && !isLiquidId(id);
    };
    if (!open(start.x, start.y, start.z)) {
      err(player, "Am Blickziel ist kein freier Platz zum Füllen.");
      return false;
    }
    const seen = new Set([start.x + "," + start.y + "," + start.z]);
    const list = [start];
    const D = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];
    let qi = 0;
    while (qi < list.length) {
      const p = list[qi++];
      for (const [dx, dy, dz] of D) {
        const x = p.x + dx;
        const y = p.y + dy;
        const z = p.z + dz;
        const k = x + "," + y + "," + z;
        if (seen.has(k)) continue;
        seen.add(k);
        if (!open(x, y, z)) continue;
        list.push({ x, y, z });
        if (list.length > limit) {
          err(player, `Das Becken ist nicht dicht oder größer als ${limit} Blöcke – nichts verändert.`);
          return false;
        }
      }
      if (qi % 256 === 0) yield;
    }
    let n = 0;
    for (const p of list) {
      es.set(p.x, p.y, p.z, pick());
      if (++n % 256 === 0) yield;
    }
  });
}

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
    if (c.mode === "flood") {
      // Nur einmal pro Tastendruck, nicht beim Gedrückthalten wiederholen
      const last = ses.floodLast ?? -100;
      ses.floodLast = now();
      if (now() - last < 20) return;
      return floodFill(ses, t.adjacent);
    }
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
        if (mode === "scatter") {
          // Oberster fester Block mit Luft darüber -> mit Wahrscheinlichkeit „Dichte" etwas daraufsetzen
          if (isSolidId(id) && Math.random() * 100 < c.density) {
            const above = es.id(x, y + 1, z);
            if (above && isAirId(above)) es.set(x, y + 1, z, p1());
          }
        } else if (mode === "clean") {
          if (!isAirId(id) && (isSoftId(id) || isLiquidId(id))) es.set(x, y, z, A);
        } else if (isSolidId(id)) {
          if (mode === "replace") es.set(x, y, z, p1());
          else if (mode === "top") {
            let ok = false;
            for (let d = 1; d <= c.depth; d++) if (open(x, y + d, z)) ok = true;
            if (ok) es.set(x, y, z, p1());
          } else if (exposed(x, y, z)) {
            if (mode === "noise") es.set(x, y, z, fbm(x / c.scale, y / c.scale, z / c.scale) > c.threshold / 100 ? p2() : p1());
            else if (mode === "slope") {
              // Oberflächen-Normale grob aus den festen Nachbarn schätzen
              let nx = 0;
              let ny = 0;
              let nz = 0;
              for (let ax = -1; ax <= 1; ax++)
                for (let ay = -1; ay <= 1; ay++)
                  for (let az = -1; az <= 1; az++) {
                    if (open(x + ax, y + ay, z + az)) {
                      nx += ax;
                      ny += ay;
                      nz += az;
                    }
                  }
              const len = Math.hypot(nx, ny, nz) || 1;
              const deg = (Math.acos(Math.max(-1, Math.min(1, ny / len))) * 180) / Math.PI;
              es.set(x, y, z, deg >= c.slopeDeg ? p2() : p1());
            } else if (mode === "gradient") {
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
    const two = c.mode === "noise" || c.mode === "gradient" || c.mode === "slope";
    return `${PAINT_MODES.find((m) => m[0] === c.mode)?.[1]} · R${c.radius}` + (c.mode === "scatter" ? ` · ${c.density}%` : "") + (c.mode === "clean" ? "" : ` · §e${formatPattern(ses.s.pattern)}` + (two ? `§r / §e${formatPattern(ses.s.pattern2)}` : ""));
  },
  async menu(ses) {
    const c = ses.s.painter;
    const r = await new Modal("Maler")
      .dropdown("mode", "Modus", PAINT_MODES, c.mode)
      .slider("radius", "Radius", 1, 16, 1, c.radius)
      .slider("depth", "Tiefe (Schichten unter der Oberfläche)", 1, 6, 1, c.depth)
      .slider("scale", "Rauschen: Größe der Flecken", 2, 40, 1, c.scale)
      .slider("threshold", "Rauschen: Anteil Muster 2 (-100 viel … 100 wenig)", -100, 100, 5, c.threshold)
      .slider("density", "Streuen: Dichte in %", 1, 100, 1, c.density)
      .slider("floodLimit", "Flutfüllung: maximale Blöcke (×1000)", 1, 200, 1, Math.round(c.floodLimit / 1000))
      .slider("slopeDeg", "Neigung: ab wie viel Grad Muster 2", 10, 80, 5, c.slopeDeg)
      .toggle("pat", "Danach Muster 1 wählen", false)
      .toggle("pat2", "Danach Muster 2 wählen", false)
      .show(ses.player);
    if (!r) return;
    Object.assign(c, { mode: r.mode, radius: r.radius, depth: r.depth, scale: r.scale, threshold: r.threshold, density: r.density, slopeDeg: r.slopeDeg, floodLimit: r.floodLimit * 1000 });
    markDirty(ses);
    if (r.pat) await patternMenu(ses, "pattern");
    if (r.pat2) await patternMenu(ses, "pattern2");
  },
};
