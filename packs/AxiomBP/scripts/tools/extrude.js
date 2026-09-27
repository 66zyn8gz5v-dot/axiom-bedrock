// Extrudieren: eine Fläche verbundener Blöcke herausziehen oder hineindrücken.
import { runEdit } from "../core/edit.js";
import { air, isSolidId } from "../core/pattern.js";
import { markDirty } from "../core/state.js";
import { err, target } from "../core/util.js";
import { k3, v } from "../core/vec.js";
import { Modal } from "../ui/forms.js";

/** @type {import("./registry.js").Tool} */
export const extrudeTool = {
  id: "axiom:extrude",
  name: "Extrudieren",
  help: "Benutzen auf eine Blockseite: die ganze verbundene Fläche um 1 Block herausziehen (bzw. hineindrücken). Schleichen+Benutzen: Einstellungen.",
  onUse(ses) {
    const t = target(ses.player, ses.s);
    if (!t) return err(ses.player, "Kein Block im Blick.");
    const c = ses.s.extrude;
    const n = t.normal;
    const startId = t.block.typeId;
    // Zwei Achsen innerhalb der Fläche
    const axes = n.x !== 0 ? [v(0, 1, 0), v(0, 0, 1)] : n.y !== 0 ? [v(1, 0, 0), v(0, 0, 1)] : [v(1, 0, 0), v(0, 1, 0)];
    /** @type {{x:number,y:number,z:number}[]} */
    const dirs = [];
    for (const a of axes) {
      dirs.push(a, v(-a.x, -a.y, -a.z));
    }
    // auch diagonal innerhalb der Fläche
    dirs.push(v(axes[0].x + axes[1].x, axes[0].y + axes[1].y, axes[0].z + axes[1].z));
    dirs.push(v(axes[0].x - axes[1].x, axes[0].y - axes[1].y, axes[0].z - axes[1].z));
    dirs.push(v(-axes[0].x + axes[1].x, -axes[0].y + axes[1].y, -axes[0].z + axes[1].z));
    dirs.push(v(-axes[0].x - axes[1].x, -axes[0].y - axes[1].y, -axes[0].z - axes[1].z));
    const push = c.mode === "push";
    runEdit(ses.player, { label: push ? "Extrudieren" : "Eindrücken", useMask: false }, function* (es) {
      /** @param {number} x @param {number} y @param {number} z */
      const ok = (x, y, z) => {
        const id = es.id(x, y, z);
        if (!id || !isSolidId(id)) return false;
        if (c.sameType && id !== startId) return false;
        const front = es.id(x + n.x, y + n.y, z + n.z);
        return !!front && !isSolidId(front);
      };
      const seen = new Set([k3(t.pos.x, t.pos.y, t.pos.z)]);
      const list = [t.pos];
      let qi = 0;
      while (qi < list.length && list.length < c.limit) {
        const p = list[qi++];
        for (const d of dirs) {
          const x = p.x + d.x;
          const y = p.y + d.y;
          const z = p.z + d.z;
          const k = k3(x, y, z);
          if (seen.has(k)) continue;
          seen.add(k);
          if (ok(x, y, z)) list.push(v(x, y, z));
        }
        if (qi % 128 === 0) yield;
      }
      const A = air();
      let i = 0;
      for (const p of list) {
        const b = es.block(p.x, p.y, p.z);
        if (!b) continue;
        if (push) es.set(p.x + n.x, p.y + n.y, p.z + n.z, b.permutation);
        else es.set(p.x, p.y, p.z, A);
        if (++i % 256 === 0) yield;
      }
    });
  },
  hud: (ses) => (ses.s.extrude.mode === "push" ? "Herausziehen" : "Hineindrücken") + (ses.s.extrude.sameType ? " · nur gleicher Block" : " · alle Blöcke"),
  async menu(ses) {
    const c = ses.s.extrude;
    const r = await new Modal("Extrudieren")
      .dropdown(
        "mode",
        "Richtung",
        [
          ["push", "Herausziehen (+1 Schicht)"],
          ["pull", "Hineindrücken (-1 Schicht)"],
        ],
        c.mode
      )
      .toggle("sameType", "Nur gleicher Blocktyp", c.sameType)
      .slider("limit", "Maximale Flächengröße", 64, 16384, 64, c.limit)
      .show(ses.player);
    if (!r) return;
    Object.assign(c, r);
    markDirty(ses);
  },
};
