// Formen-Werkzeug: Kugel, Halbkugel, Quader, Zylinder, Kegel, Pyramide, Torus, Bogen.
import { runEdit } from "../core/edit.js";
import { formatPattern, picker } from "../core/pattern.js";
import { markDirty } from "../core/state.js";
import { markBlock } from "../core/selection.js";
import { targetOrAir } from "../core/util.js";
import { v } from "../core/vec.js";
import { Modal } from "../ui/forms.js";
import { patternMenu } from "../ui/common.js";

export const SHAPES = /** @type {[string,string][]} */ ([
  ["sphere", "Kugel / Ellipsoid"],
  ["hemisphere", "Halbkugel (Kuppel)"],
  ["cuboid", "Quader"],
  ["cylinder", "Zylinder (senkrecht)"],
  ["cone", "Kegel"],
  ["pyramid", "Pyramide"],
  ["torus", "Torus (Ring)"],
  ["arch", "Bogen"],
  ["prism", "Prisma (Dach, entlang X)"],
  ["spiral", "Spirale (Wendelrampe)"],
]);

/**
 * Liefert Test-Funktion (dx,dy,dz) -> innerhalb? und die Ausdehnung.
 * @param {{type:string, rx:number, ry:number, rz:number}} c
 * @returns {{inside:(x:number,y:number,z:number)=>boolean, ext:{x:number,y:number,z:number}, yMin:number}}
 */
export function shapeFn(c) {
  const rx = c.rx + 0.5;
  const ry = c.ry + 0.5;
  const rz = c.rz + 0.5;
  switch (c.type) {
    case "hemisphere":
      return {
        inside: (x, y, z) => y >= 0 && (x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz) <= 1,
        ext: v(c.rx, c.ry, c.rz),
        yMin: 0,
      };
    case "cuboid":
      return { inside: (x, y, z) => Math.abs(x) <= c.rx && Math.abs(y) <= c.ry && Math.abs(z) <= c.rz, ext: v(c.rx, c.ry, c.rz), yMin: -c.ry };
    case "cylinder":
      return { inside: (x, y, z) => Math.abs(y) <= c.ry && (x * x) / (rx * rx) + (z * z) / (rz * rz) <= 1, ext: v(c.rx, c.ry, c.rz), yMin: -c.ry };
    case "cone":
      return {
        inside: (x, y, z) => {
          if (Math.abs(y) > c.ry) return false;
          const f = (c.ry - y) / (2 * c.ry + 1) + 0.5 / (2 * c.ry + 1);
          const a = rx * f;
          const b = rz * f;
          return (x * x) / (a * a) + (z * z) / (b * b) <= 1;
        },
        ext: v(c.rx, c.ry, c.rz),
        yMin: -c.ry,
      };
    case "pyramid":
      return {
        inside: (x, y, z) => {
          if (Math.abs(y) > c.ry) return false;
          const f = (c.ry - y) / (2 * c.ry + 1);
          return Math.abs(x) <= c.rx * f + 0.5 && Math.abs(z) <= c.rz * f + 0.5;
        },
        ext: v(c.rx, c.ry, c.rz),
        yMin: -c.ry,
      };
    case "torus": {
      // rx = Hauptradius, ry = Rohrradius
      const R = c.rx;
      const r = c.ry + 0.5;
      return {
        inside: (x, y, z) => {
          const q = Math.sqrt(x * x + z * z) - R;
          return q * q + y * y <= r * r;
        },
        ext: v(c.rx + c.ry + 1, c.ry, c.rx + c.ry + 1),
        yMin: -c.ry,
      };
    }
    case "arch": {
      // Halbkreis-Bogen in X-Richtung, Dicke rz (Tiefe), Wandstärke über "hohl"
      return {
        inside: (x, y, z) => y >= 0 && Math.abs(z) <= c.rz && (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1,
        ext: v(c.rx, c.ry, c.rz),
        yMin: 0,
      };
    }
    case "prism":
      // Dreieckiger Querschnitt (Satteldach): unten breit (rz), oben spitz, Länge rx
      return {
        inside: (x, y, z) => {
          if (Math.abs(x) > c.rx || y < 0 || y > 2 * c.ry) return false;
          const f = 1 - y / (2 * c.ry + 1);
          return Math.abs(z) <= c.rz * f + 0.5;
        },
        ext: v(c.rx, 2 * c.ry, c.rz),
        yMin: 0,
      };
    case "spiral": {
      // Wendelrampe: Radius rx, Breite rz, Höhe 2*ry+1, 12 Blöcke Steigung pro Umdrehung
      const pitch = 12;
      const w = Math.max(1, c.rz);
      return {
        inside: (x, y, z) => {
          if (Math.abs(y) > c.ry) return false;
          const rho = Math.sqrt(x * x + z * z);
          if (rho > c.rx + 0.5 || rho < c.rx - w + 0.5) return false;
          const th = (Math.atan2(z, x) + Math.PI) / (2 * Math.PI);
          const d = (((y + c.ry - th * pitch) % pitch) + pitch) % pitch;
          return d < 1.2;
        },
        ext: v(c.rx, c.ry, c.rx),
        yMin: -c.ry,
      };
    }
    default:
      return { inside: (x, y, z) => (x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz) <= 1, ext: v(c.rx, c.ry, c.rz), yMin: -c.ry };
  }
}

/** @param {import("../core/state.js").Session} ses */
function center(ses) {
  const c = ses.s.shape;
  const t = targetOrAir(ses.player, ses.s);
  const f = shapeFn(c);
  if (c.anchor === "base") return v(t.adjacent.x, t.adjacent.y - f.yMin, t.adjacent.z);
  return t.hit ? t.pos : t.adjacent;
}

/** @type {import("./registry.js").Tool} */
export const shapeTool = {
  id: "axiom:shape",
  name: "Formen",
  help: "Benutzen: Form am Blickziel platzieren. Schleichen+Benutzen: Form, Größe, hohl, Block wählen.",
  onUse(ses) {
    const c = { ...ses.s.shape };
    const f = shapeFn(c);
    const ctr = center(ses);
    const pick = picker(ses.s.pattern);
    const hollow = c.hollow;
    const th = Math.max(1, c.thick);
    // Eine Form ist "hohl", wenn ein Nachbar im Abstand th außerhalb liegt
    const edge = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) =>
      !f.inside(x + th, y, z) || !f.inside(x - th, y, z) || !f.inside(x, y + th, z) || !f.inside(x, y - th, z) || !f.inside(x, y, z + th) || !f.inside(x, y, z - th);
    const e = f.ext;
    runEdit(
      ses.player,
      {
        label: "Form: " + (SHAPES.find((s) => s[0] === c.type)?.[1] ?? c.type),
        symmetry: true,
        region: { min: v(ctr.x - e.x, ctr.y - e.y, ctr.z - e.z), max: v(ctr.x + e.x, ctr.y + e.y, ctr.z + e.z) },
      },
      function* (es) {
        let n = 0;
        for (let x = -e.x; x <= e.x; x++)
          for (let z = -e.z; z <= e.z; z++)
            for (let y = -e.y; y <= e.y; y++) {
              if (!f.inside(x, y, z)) continue;
              if (hollow && !edge(x, y, z)) continue;
              es.set(ctr.x + x, ctr.y + y, ctr.z + z, pick());
              if (++n % 256 === 0) yield;
            }
      }
    );
  },
  preview(ses) {
    markBlock(ses.player, "axiom:marker", center(ses));
  },
  hud(ses) {
    const c = ses.s.shape;
    return `${SHAPES.find((s) => s[0] === c.type)?.[1]} ${c.rx * 2 + 1}×${c.ry * 2 + 1}×${c.rz * 2 + 1}${c.hollow ? " hohl" : ""} · §e${formatPattern(ses.s.pattern)}`;
  },
  async menu(ses) {
    const c = ses.s.shape;
    const r = await new Modal("Formen")
      .dropdown("type", "Form", SHAPES, c.type)
      .slider("rx", "Radius X (Torus: Ringradius)", 0, 64, 1, c.rx)
      .slider("ry", "Radius Y / Höhe (Torus: Rohrradius)", 0, 64, 1, c.ry)
      .slider("rz", "Radius Z", 0, 64, 1, c.rz)
      .toggle("same", "Alle Radien = Radius X (gleichmäßig)", c.rx === c.ry && c.ry === c.rz)
      .toggle("hollow", "Hohl", c.hollow)
      .slider("thick", "Wandstärke (wenn hohl)", 1, 8, 1, c.thick)
      .dropdown(
        "anchor",
        "Platzierung",
        [
          ["center", "Mittelpunkt am Blickziel"],
          ["base", "Auf dem Boden stehend"],
        ],
        c.anchor
      )
      .toggle("pat", "Danach Block/Muster wählen", false)
      .show(ses.player);
    if (!r) return;
    Object.assign(c, { type: r.type, rx: r.rx, ry: r.same ? r.rx : r.ry, rz: r.same ? r.rx : r.rz, hollow: r.hollow, thick: r.thick, anchor: r.anchor });
    markDirty(ses);
    if (r.pat) await patternMenu(ses);
  },
};
