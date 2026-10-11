// Formen-Werkzeug: Kugel, Quader, Zylinder, Kegel, Pyramiden, Torus, Bogen, Keil, Vieleck, Stern, Herz u.v.m.
import { runEdit } from "../core/edit.js";
import { formatPattern, isSolidId, picker } from "../core/pattern.js";
import { markDirty } from "../core/state.js";
import { markBlock, spawn } from "../core/selection.js";
import { drawFrame } from "./builder.js";
import { system } from "@minecraft/server";
import { msg, target, targetOrAir } from "../core/util.js";
import { cardinal, v } from "../core/vec.js";
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
  ["pillar", "Säule mit Sockel & Kapitell (bis zum Boden)"],
  ["wedge", "Keil / Rampe (steigt von dir weg an)"],
  ["tetra", "Dreieck-Pyramide (Tetraeder)"],
  ["octa", "Doppelpyramide (Oktaeder)"],
  ["polygon", "Vieleck-Turm (3–12 Ecken)"],
  ["ziggurat", "Stufenpyramide"],
  ["tube", "Rohr / Walze (liegend)"],
  ["disk", "Scheibe (flacher Kreis)"],
  ["frustum", "Kegelstumpf"],
  ["star", "Stern (steht vor dir)"],
  ["heart", "Herz (steht vor dir)"],
  ["cross", "Kreuz / Plus (steht vor dir)"],
]);

/**
 * Punkt-in-Vieleck-Test (Strahlverfahren).
 * @param {number} x @param {number} y @param {number[][]} poly
 */
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Liefert Test-Funktion (dx,dy,dz) -> innerhalb? und die Ausdehnung.
 * @param {{type:string, rx:number, ry:number, rz:number, pitch?:number, sides?:number, step?:number}} c
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
      const pitch = Math.max(3, c.pitch ?? 12);
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
    case "wedge":
      // Rampe: vorne (z = -rz) flach, hinten (z = +rz) volle Höhe 2·ry+1
      return {
        inside: (x, y, z) => Math.abs(x) <= c.rx && Math.abs(z) <= c.rz && y >= 0 && y <= Math.max(0, ((z + c.rz + 1) / (2 * c.rz + 1)) * (2 * c.ry + 1) - 1),
        ext: v(c.rx, 2 * c.ry, c.rz),
        yMin: 0,
      };
    case "tetra": {
      // Dreieckige Grundfläche (Umkreisradius rx/rz), Spitze oben
      return {
        inside: (x, y, z) => {
          if (Math.abs(y) > c.ry) return false;
          const f = (c.ry - y + 0.5) / (2 * c.ry + 1);
          const X = x / rx;
          const Z = z / rz - 0.25; // Dreieck mittig in den Hüllquader rücken
          for (let k = 0; k < 3; k++) {
            const a = Math.PI / 2 + (k * 2 * Math.PI) / 3;
            if (X * Math.cos(a) + Z * Math.sin(a) > 0.5 * f + 0.06) return false;
          }
          return true;
        },
        ext: v(c.rx, c.ry, c.rz),
        yMin: -c.ry,
      };
    }
    case "octa":
      return { inside: (x, y, z) => Math.abs(x) / rx + Math.abs(y) / ry + Math.abs(z) / rz <= 1, ext: v(c.rx, c.ry, c.rz), yMin: -c.ry };
    case "polygon": {
      const n = Math.max(3, Math.min(12, c.sides ?? 6));
      const ap = Math.cos(Math.PI / n);
      return {
        inside: (x, y, z) => {
          if (Math.abs(y) > c.ry) return false;
          const X = x / rx;
          const Z = z / rz;
          for (let k = 0; k < n; k++) {
            const a = (k * 2 * Math.PI) / n + Math.PI / 2;
            if (X * Math.cos(a) + Z * Math.sin(a) > ap) return false;
          }
          return true;
        },
        ext: v(c.rx, c.ry, c.rz),
        yMin: -c.ry,
      };
    }
    case "ziggurat": {
      const st = Math.max(1, c.step ?? 2);
      const H = 2 * c.ry + 1;
      return {
        inside: (x, y, z) => {
          if (Math.abs(y) > c.ry) return false;
          const band = Math.floor((y + c.ry) / st) * st;
          const f = 1 - band / H;
          return Math.abs(x) <= c.rx * f + 0.5 && Math.abs(z) <= c.rz * f + 0.5;
        },
        ext: v(c.rx, c.ry, c.rz),
        yMin: -c.ry,
      };
    }
    case "tube":
      // Liegende Walze entlang X (mit „Hohl“ ein Rohr)
      return { inside: (x, y, z) => Math.abs(x) <= c.rx && (y * y) / (ry * ry) + (z * z) / (rz * rz) <= 1, ext: v(c.rx, c.ry, c.rz), yMin: -c.ry };
    case "disk":
      return { inside: (x, y, z) => y === 0 && (x * x) / (rx * rx) + (z * z) / (rz * rz) <= 1, ext: v(c.rx, 0, c.rz), yMin: 0 };
    case "frustum":
      // Kegelstumpf: oben halb so breit wie unten
      return {
        inside: (x, y, z) => {
          if (Math.abs(y) > c.ry) return false;
          const t = c.ry ? (y + c.ry) / (2 * c.ry) : 0;
          const f = 1 - 0.5 * t;
          return (x * x) / (rx * rx * f * f) + (z * z) / (rz * rz * f * f) <= 1;
        },
        ext: v(c.rx, c.ry, c.rz),
        yMin: -c.ry,
      };
    case "star": {
      // Fünfzackiger Stern in der X-Y-Ebene, Dicke über Radius Z
      /** @type {number[][]} */
      const poly = [];
      for (let k = 0; k < 10; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 ? 0.42 : 1;
        poly.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return { inside: (x, y, z) => Math.abs(z) <= c.rz && inPoly(x / rx, y / ry + 0.1, poly), ext: v(c.rx, c.ry, c.rz), yMin: -c.ry };
    }
    case "heart":
      return {
        inside: (x, y, z) => {
          if (Math.abs(z) > c.rz) return false;
          const X = (x / rx) * 1.15;
          const Y = (y / ry) * 1.15 + 0.12;
          const q = X * X + Y * Y - 1;
          return q * q * q - X * X * Y * Y * Y <= 0;
        },
        ext: v(c.rx, c.ry, c.rz),
        yMin: -c.ry,
      };
    case "cross": {
      const w = Math.max(0, Math.round(Math.min(c.rx, c.ry) / 4));
      return {
        inside: (x, y, z) => Math.abs(z) <= c.rz && ((Math.abs(x) <= c.rx && Math.abs(y) <= w) || (Math.abs(y) <= c.ry && Math.abs(x) <= w)),
        ext: v(c.rx, c.ry, c.rz),
        yMin: -c.ry,
      };
    }
    default:
      return { inside: (x, y, z) => (x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz) <= 1, ext: v(c.rx, c.ry, c.rz), yMin: -c.ry };
  }
}

/**
 * Form ggf. nach Blickrichtung drehen: schaut der Spieler nach Osten/Westen, werden X und Z getauscht,
 * damit Bogen, Prisma, Quader usw. immer quer zum Spieler stehen.
 * @param {import("../core/state.js").Session} ses
 * @param {import("../core/state.js").Settings["shape"]} c
 * @returns {ReturnType<typeof shapeFn>}
 */
export function orientedShape(ses, c) {
  const f = shapeFn(c);
  if (!c.look) return f;
  const d = cardinal(ses.player.getViewDirection(), true);
  if (d.x === 0) return f;
  return { inside: (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => f.inside(z, y, x), ext: v(f.ext.z, f.ext.y, f.ext.x), yMin: f.yMin };
}

/** Größte Form (Blöcke im Hüllquader), für die noch ein genauer Partikel-Umriss berechnet wird. */
const OUTLINE_MAX = 70000;
const OUTLINE_BUDGET = 260;

/**
 * Randpunkte einer Form (Blöcke mit mindestens einer freien Seite), ausgedünnt auf ein Partikel-Budget.
 * Wird zwischengespeichert, solange sich Form und Blickrichtung nicht ändern.
 * @param {import("../core/state.js").Session} ses
 * @returns {number[][] | null} null = zu groß, nur Rahmen zeichnen
 */
export function shapeOutline(ses) {
  const c = ses.s.shape;
  const d = c.look ? cardinal(ses.player.getViewDirection(), true) : v(0, 0, 1);
  const key = JSON.stringify([c.type, c.rx, c.ry, c.rz, c.pitch, c.sides, c.step, c.look && d.x !== 0]);
  if (ses.shapeOutline?.key === key) return ses.shapeOutline.pts.length ? ses.shapeOutline.pts : null;
  const f = orientedShape(ses, c);
  const e = f.ext;
  /** @type {number[][]} */
  let pts = [];
  if ((2 * e.x + 1) * (2 * e.y + 1) * (2 * e.z + 1) <= OUTLINE_MAX) {
    for (let x = -e.x; x <= e.x; x++)
      for (let y = -e.y; y <= e.y; y++)
        for (let z = -e.z; z <= e.z; z++) {
          if (!f.inside(x, y, z)) continue;
          if (f.inside(x + 1, y, z) && f.inside(x - 1, y, z) && f.inside(x, y + 1, z) && f.inside(x, y - 1, z) && f.inside(x, y, z + 1) && f.inside(x, y, z - 1))
            continue;
          pts.push([x, y, z]);
        }
    if (pts.length > OUTLINE_BUDGET) {
      const stride = pts.length / OUTLINE_BUDGET;
      /** @type {number[][]} */
      const thin = [];
      for (let i = 0; i < pts.length; i += stride) thin.push(pts[Math.floor(i)]);
      pts = thin;
    }
  }
  ses.shapeOutline = { key, pts };
  return pts.length ? pts : null;
}

/** @param {import("../core/state.js").Session} ses */
function center(ses) {
  const c = ses.s.shape;
  const t = targetOrAir(ses.player, ses.s);
  const f = orientedShape(ses, c);
  if (c.anchor === "base") return v(t.adjacent.x, t.adjacent.y - f.yMin, t.adjacent.z);
  return t.hit ? t.pos : t.adjacent;
}

/**
 * Säule: runder Schaft (Radius X) mit breiterem Sockel unten und Kapitell oben (Muster 2).
 * Auf den Boden zielen = nach oben bauen (Höhe 2×Radius Y + 1); auf Decke/Wand/Luft zielen = nach unten bis zum Boden.
 * @param {import("../core/state.js").Session} ses
 * @param {import("../core/state.js").Settings["shape"]} c
 */
function pillar(ses, c) {
  const t = target(ses.player, ses.s);
  const air0 = targetOrAir(ses.player, ses.s);
  const shaft = picker(ses.s.pattern);
  const deco = picker(ses.s.pattern2);
  const r = c.rx;
  runEdit(ses.player, { label: "Säule", symmetry: true }, function* (es) {
    let bottom;
    let top;
    if (t && t.face === "Up") {
      bottom = t.adjacent.y;
      top = bottom + 2 * c.ry;
    } else {
      // Von oben nach unten bis zum festen Boden
      const start = t ? t.adjacent : air0.pos;
      top = start.y;
      bottom = top;
      for (let y = top - 1; y > top - 128; y--) {
        const id = es.id(start.x, y, start.z);
        if (!id || isSolidId(id)) break;
        bottom = y;
      }
    }
    const base = t ? t.adjacent : air0.pos;
    for (let y = bottom; y <= top; y++) {
      const ring = y === bottom || y === top ? r + 1 : r;
      const pick = y === bottom || y === top ? deco : shaft;
      for (let dx = -ring; dx <= ring; dx++)
        for (let dz = -ring; dz <= ring; dz++) {
          if (dx * dx + dz * dz > ring * ring + ring * 0.8) continue;
          es.set(base.x + dx, y, base.z + dz, pick());
        }
      yield;
    }
  });
}

/** @type {import("./registry.js").Tool} */
export const shapeTool = {
  id: "axiom:shape",
  name: "Formen",
  help: "Benutzen: Form am Blickziel platzieren. Schleichen+Benutzen: Form, Größe, hohl, Block wählen.",
  onUse(ses) {
    const c = { ...ses.s.shape };
    if (c.type === "pillar") return pillar(ses, c);
    const f = orientedShape(ses, c);
    let ctr = center(ses);
    if (c.confirm) {
      // Vorschau-Modus: 1. Klick merkt die Stelle, 2. Klick setzt die Form dort
      const lock = ses.shapeLock;
      if (!lock || system.currentTick > lock.until) {
        ses.shapeLock = { ctr, until: system.currentTick + 20 * 30 };
        msg(ses.player, "Vorschau: Form wird hier gesetzt – nochmal §ebenutzen§r zum Bauen, §eschlagen§r zum Abbrechen.");
        return;
      }
      ctr = lock.ctr;
      ses.shapeLock = undefined;
    }
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
  onHit(ses) {
    if (!ses.shapeLock) return false;
    ses.shapeLock = undefined;
    msg(ses.player, "Vorschau abgebrochen.");
    return true;
  },
  preview(ses) {
    const c = ses.s.shape;
    if (c.type === "pillar") return markBlock(ses.player, "axiom:marker", center(ses));
    const lock = ses.shapeLock && system.currentTick <= ses.shapeLock.until ? ses.shapeLock : undefined;
    const ctr = lock ? lock.ctr : center(ses);
    const particle = lock ? "axiom:pos2" : "axiom:marker";
    markBlock(ses.player, particle, ctr);
    const pts = shapeOutline(ses);
    if (!pts) {
      const e = orientedShape(ses, c).ext;
      drawFrame(ses.player, v(ctr.x - e.x, ctr.y - e.y, ctr.z - e.z), v(2 * e.x + 1, 2 * e.y + 1, 2 * e.z + 1), particle);
      return;
    }
    for (const [x, y, z] of pts) spawn(ses.player, particle, v(ctr.x + x + 0.5, ctr.y + y + 0.5, ctr.z + z + 0.5));
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
      .toggle("look", "Nach Blickrichtung drehen (Bogen/Prisma stehen quer zu dir)", c.look)
      .slider("pitch", "Spirale: Höhe pro Umdrehung", 3, 40, 1, c.pitch)
      .slider("sides", "Vieleck-Turm: Anzahl Ecken", 3, 12, 1, c.sides)
      .slider("step", "Stufenpyramide: Stufenhöhe", 1, 8, 1, c.step)
      .toggle("confirm", "Vorschau-Modus: 1. Benutzen zeigt die Form, 2. Benutzen baut sie", c.confirm)
      .toggle("pat", "Danach Block/Muster wählen", false)
      .show(ses.player);
    if (!r) return;
    Object.assign(c, { look: r.look, pitch: r.pitch, sides: r.sides, step: r.step, type: r.type, rx: r.rx, ry: r.same ? r.rx : r.ry, rz: r.same ? r.rx : r.rz, hollow: r.hollow, thick: r.thick, anchor: r.anchor, confirm: r.confirm });
    ses.shapeLock = undefined;
    markDirty(ses);
    if (r.pat) await patternMenu(ses);
  },
};
