// Formen-Werkzeug: Kugel, Quader, Zylinder, Kegel, Pyramiden, Torus, Bogen, Keil, Vieleck, Stern, Herz u.v.m.
import { runEdit } from "../core/edit.js";
import { formatPattern, isSolidId, picker, air } from "../core/pattern.js";
import { markDirty } from "../core/state.js";
import { markBlock, selContains, spawn } from "../core/selection.js";
import { drawFrame } from "./builder.js";
import { STAIR_DIRS, stairFor } from "./terrain.js";
import { BlockPermutation, system } from "@minecraft/server";
import { err, msg, target, targetOrAir } from "../core/util.js";
import { cardinal, v } from "../core/vec.js";
import { Modal, menu } from "../ui/forms.js";
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
  ["onion", "Zwiebelturm (Kuppel mit Spitze)"],
  ["winding", "Wendeltreppe mit echten Treppen (Radius X, Höhe = 2×Radius Y+1)"],
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
    case "onion":
      // Zwiebelform: unten schmaler, in der unteren Hälfte bauchig, dann zur Spitze eingezogen
      return {
        inside: (x, y, z) => {
          if (Math.abs(y) > c.ry) return false;
          const t = (y + c.ry + 0.5) / (2 * c.ry + 1);
          const f = t < 0.35 ? 0.7 + 0.3 * Math.sin((t / 0.35) * (Math.PI / 2)) : Math.pow(Math.max(0, 1 - (t - 0.35) / 0.65), 1.6);
          if (x === 0 && z === 0) return true;
          if (f <= 0) return false;
          return (x * x) / (rx * rx * f * f) + (z * z) / (rz * rz * f * f) <= 1;
        },
        ext: v(c.rx, c.ry, c.rz),
        yMin: -c.ry,
      };
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
  let f = shapeFn(c);
  if (c.look) {
    const d = cardinal(ses.player.getViewDirection(), true);
    if (d.x !== 0) {
      const g = f;
      f = { inside: (x, y, z) => g.inside(z, y, x), ext: v(g.ext.z, g.ext.y, g.ext.x), yMin: g.yMin };
    }
  }
  return rotateShape(f, c.yaw ?? 0, c.tilt ?? 0, c.roll ?? 0);
}

/**
 * Form frei drehen: um die senkrechte Achse (yaw), nach vorne kippen (tilt, um X) und seitlich neigen (roll, um Z).
 * Jeder Weltblock wird in die Form zurückgedreht und dort getestet – so entstehen keine Löcher.
 * @param {ReturnType<typeof shapeFn>} f @param {number} yaw @param {number} tilt @param {number} roll Grad
 * @returns {ReturnType<typeof shapeFn>}
 */
export function rotateShape(f, yaw, tilt, roll) {
  if (!yaw && !tilt && !roll) return f;
  const r = Math.PI / 180;
  const [cy, sy, cx, sx, cz, sz] = [Math.cos(yaw * r), Math.sin(yaw * r), Math.cos(tilt * r), Math.sin(tilt * r), Math.cos(roll * r), Math.sin(roll * r)];
  // M = Ry · Rx · Rz (lokal → Welt); zurück mit der Transponierten
  const M = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
  const e = f.ext;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const px of [-e.x, e.x])
    for (const py of [f.yMin, e.y])
      for (const pz of [-e.z, e.z]) {
        mx = Math.max(mx, Math.abs(M[0][0] * px + M[0][1] * py + M[0][2] * pz));
        my = Math.max(my, Math.abs(M[1][0] * px + M[1][1] * py + M[1][2] * pz));
        mz = Math.max(mz, Math.abs(M[2][0] * px + M[2][1] * py + M[2][2] * pz));
      }
  return {
    inside: (x, y, z) =>
      f.inside(
        Math.round(M[0][0] * x + M[1][0] * y + M[2][0] * z),
        Math.round(M[0][1] * x + M[1][1] * y + M[2][1] * z),
        Math.round(M[0][2] * x + M[1][2] * y + M[2][2] * z)
      ),
    ext: v(Math.ceil(mx), Math.ceil(my), Math.ceil(mz)),
    yMin: -Math.ceil(my),
  };
}

/** Formen, die unten bei y = 0 beginnen: Anteil von Radius Y an der Höhe (zum Einpassen in eine Auswahl). */
const BASE_SHAPES = /** @type {Record<string, number>} */ ({ hemisphere: 1, arch: 1, prism: 0.5, wedge: 0.5, disk: 0 });

/**
 * Form genau in eine Auswahl einpassen: Radien aus der Auswahlgröße, Mitte = Mitte der Auswahl.
 * @param {import("../core/state.js").Settings["shape"]} c
 * @param {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} sel
 * @returns {{f: ReturnType<typeof shapeFn>, at: (x:number, y:number, z:number) => {x:number,y:number,z:number}}}
 */
export function fitShape(c, sel) {
  const sx = sel.max.x - sel.min.x + 1;
  const sy = sel.max.y - sel.min.y + 1;
  const sz = sel.max.z - sel.min.z + 1;
  const c2 = { ...c, rx: (sx - 1) / 2, ry: (sy - 1) / 2, rz: (sz - 1) / 2 };
  const base = c.type in BASE_SHAPES;
  if (base && BASE_SHAPES[c.type]) c2.ry = (sy - 1) * BASE_SHAPES[c.type];
  if (c.type === "torus") {
    c2.ry = Math.min(c2.ry, (Math.min(sx, sz) - 3) / 4);
    c2.rx = Math.max(0, (Math.min(sx, sz) - 1) / 2 - c2.ry - 1);
  }
  const f = shapeFn(c2);
  const mx = (sel.min.x + sel.max.x) / 2;
  const my = base ? sel.min.y : (sel.min.y + sel.max.y) / 2;
  const mz = (sel.min.z + sel.max.z) / 2;
  // Weltblock → Formkoordinate (bei gerader Größe halbzahlig)
  return { f, at: (x, y, z) => v(x - mx, y - my, z - mz) };
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
  const key = JSON.stringify([c.type, c.rx, c.ry, c.rz, c.pitch, c.sides, c.step, c.look && d.x !== 0, c.yaw, c.tilt, c.roll]);
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

/**
 * Material einer Form: ein Muster, Verlauf von unten (Muster 1) nach oben (Muster 2) oder Rand aus Muster 2.
 * @param {import("../core/state.js").Session} ses
 * @param {{material?:string, band?:number, sides?:number}} c
 * @param {(x:number, y:number, z:number) => boolean} In Weltkoordinaten
 * @param {number} y0 unterste Höhe @param {number} y1 oberste Höhe (Welt)
 * @param {{x:number, z:number}} [mid] Mitte der Form (für Rippen)
 * @returns {(x:number, y:number, z:number) => import("@minecraft/server").BlockPermutation}
 */
export function paintFn(ses, c, In, y0, y1, mid = { x: 0, z: 0 }) {
  const cx = mid.x;
  const cz = mid.z;
  if (c.material === "carve") {
    // Ausschneiden: die Form wird zu Luft (Loch, Tunnel, Fensteröffnung)
    const A = air();
    return () => A;
  }
  const p1 = picker(ses.s.pattern);
  if (!c.material || c.material === "single") return () => p1();
  const p2 = picker(ses.s.pattern2);
  const w = Math.max(1, c.band ?? 1);
  const band = (/** @type {number} */ n) => Math.floor(n / w) & 1;
  if (c.material === "stripesH") return (x, y, z) => (band(y) ? p2() : p1());
  if (c.material === "stripesV") return (x, y, z) => (band(x + z) ? p2() : p1());
  if (c.material === "ribs") {
    // Rippen: senkrechte Bänder rund um die Mitte (Anzahl = Ecken-Regler), z.B. Kuppel mit Rippen
    const n = Math.max(3, c.sides ?? 6);
    const seg = (Math.PI * 2) / n;
    const half = Math.min(seg / 2, (seg / 2) * 0.3 * w);
    return (x, y, z) => {
      const r = ((Math.atan2(z - cz, x - cx) % seg) + seg) % seg;
      return r < half || seg - r < half ? p2() : p1();
    };
  }
  if (c.material === "checker") return (x, y, z) => (band(x) ^ band(y) ^ band(z) ? p2() : p1());
  if (c.material === "gradient") {
    const span = Math.max(1, y1 - y0);
    return (x, y, z) => {
      // Fließender Übergang: zufällig gestreut, aber fest pro Block
      const r = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) / 4294967296;
      return r < (y - y0) / span ? p2() : p1();
    };
  }
  // Rand: Blöcke mit freier Seite aus Muster 2, innen Muster 1
  return (x, y, z) =>
    !In(x + 1, y, z) || !In(x - 1, y, z) || !In(x, y + 1, z) || !In(x, y - 1, z) || !In(x, y, z + 1) || !In(x, y, z - 1) ? p2() : p1();
}

/**
 * Welche Blöcke einer Form werden gesetzt? Voll, hohl (mit Wandstärke, Boden/Deckel offen) oder nur die Kanten.
 * @param {(x:number, y:number, z:number) => boolean} In liegt der Block in der Form?
 * @param {{hollow:boolean, thick:number, open?:string, wire?:boolean}} c
 * @returns {(x:number, y:number, z:number) => boolean}
 */
export function keepFn(In, c) {
  const th = Math.max(1, c.thick);
  if (c.wire) {
    // Drahtgitter: Block liegt an mindestens zwei Seiten (verschiedene Achsen) am Rand
    return (x, y, z) => {
      const ax = !In(x + 1, y, z) || !In(x - 1, y, z) ? 1 : 0;
      const ay = !In(x, y + 1, z) || !In(x, y - 1, z) ? 1 : 0;
      const az = !In(x, y, z + 1) || !In(x, y, z - 1) ? 1 : 0;
      return ax + ay + az >= 2;
    };
  }
  if (!c.hollow) return () => true;
  const openBottom = c.open === "bottom" || c.open === "both";
  const openTop = c.open === "top" || c.open === "both";
  return (x, y, z) =>
    !In(x + th, y, z) ||
    !In(x - th, y, z) ||
    !In(x, y, z + th) ||
    !In(x, y, z - th) ||
    (!openTop && !In(x, y + th, z)) ||
    (!openBottom && !In(x, y - th, z));
}

/**
 * Form zwischen zwei Punkten: Achse (Höhe) der Form läuft von A nach B, Radius X/Z bleibt.
 * @param {import("../core/state.js").Settings["shape"]} c
 * @param {{x:number,y:number,z:number}} A @param {{x:number,y:number,z:number}} B
 */
export function shapeBetween(c, A, B) {
  const d = v(B.x - A.x, B.y - A.y, B.z - A.z);
  const L = Math.hypot(d.x, d.y, d.z);
  const a = L ? v(d.x / L, d.y / L, d.z / L) : v(0, 1, 0);
  // Senkrechte Richtungen zur Achse
  let e1 = Math.abs(a.y) > 0.9 ? v(1, 0, 0) : v(-a.z, 0, a.x);
  const n1 = Math.hypot(e1.x, e1.y, e1.z);
  e1 = v(e1.x / n1, e1.y / n1, e1.z / n1);
  const e2 = v(a.y * e1.z - a.z * e1.y, a.z * e1.x - a.x * e1.z, a.x * e1.y - a.y * e1.x);
  const type = c.type === "tube" ? "cylinder" : c.type;
  const f = shapeFn({ ...c, type, ry: L / 2 });
  const M = v((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  const r = Math.max(c.rx, c.rz) + 1;
  return {
    min: v(Math.floor(Math.min(A.x, B.x) - r), Math.floor(Math.min(A.y, B.y) - r), Math.floor(Math.min(A.z, B.z) - r)),
    max: v(Math.ceil(Math.max(A.x, B.x) + r), Math.ceil(Math.max(A.y, B.y) + r), Math.ceil(Math.max(A.z, B.z) + r)),
    In: (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
      const px = x - M.x;
      const py = y - M.y;
      const pz = z - M.z;
      return f.inside(px * e1.x + py * e1.y + pz * e1.z, px * a.x + py * a.y + pz * a.z, px * e2.x + py * e2.y + pz * e2.z);
    },
  };
}

/** Formen, die sich nicht zwischen zwei Punkte legen lassen. */
const NO_AB = ["pillar", "disk", "spiral", "torus", "winding"];

/**
 * Zwei-Punkte-Modus: 1. Benutzen = Punkt A, 2. Benutzen = Punkt B und bauen.
 * @param {import("../core/state.js").Session} ses
 * @param {import("../core/state.js").Settings["shape"]} c
 */
function buildBetween(ses, c) {
  if (NO_AB.includes(c.type)) return err(ses.player, "Diese Form geht nicht zwischen zwei Punkten – nimm z.B. Zylinder, Kegel, Pyramide oder Quader.");
  const t = targetOrAir(ses.player, ses.s);
  const p = t.hit ? t.pos : t.adjacent;
  if (!ses.shapeA) {
    ses.shapeA = p;
    return msg(ses.player, `Punkt A gesetzt: §e${p.x} ${p.y} ${p.z}§r – jetzt auf Punkt B zielen und benutzen (Schlagen bricht ab).`);
  }
  const A = ses.shapeA;
  ses.shapeA = undefined;
  const g = shapeBetween(c, A, p);
  const keep = keepFn(g.In, c);
  const paint = paintFn(ses, c, g.In, g.min.y, g.max.y, { x: (g.min.x + g.max.x) / 2, z: (g.min.z + g.max.z) / 2 });
  runEdit(ses.player, { label: "Form A→B: " + (SHAPES.find((s) => s[0] === c.type)?.[1] ?? c.type), symmetry: true, region: { min: g.min, max: g.max } }, function* (es) {
    let n = 0;
    for (let x = g.min.x; x <= g.max.x; x++)
      for (let z = g.min.z; z <= g.max.z; z++)
        for (let y = g.min.y; y <= g.max.y; y++) {
          if (!g.In(x, y, z) || !keep(x, y, z)) continue;
          es.set(x, y, z, paint(x, y, z));
          if (++n % 256 === 0) yield;
        }
  });
}

/**
 * Form in die aktuelle Auswahl einpassen und bauen.
 * @param {import("../core/state.js").Session} ses
 * @param {import("../core/state.js").Settings["shape"]} c
 */
function buildInSelection(ses, c) {
  const sel = ses.sel;
  if (!sel) return err(ses.player, "Zum Einpassen erst eine Auswahl machen (z.B. Box-Auswahl).");
  const { f, at } = fitShape(c, sel);
  const In = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
    const q = at(x, y, z);
    return selContains(sel, x, y, z) && f.inside(q.x, q.y, q.z);
  };
  const keep = keepFn(In, c);
  const paint = paintFn(ses, c, In, sel.min.y, sel.max.y, { x: (sel.min.x + sel.max.x) / 2, z: (sel.min.z + sel.max.z) / 2 });
  runEdit(ses.player, { label: "Form in Auswahl: " + (SHAPES.find((s) => s[0] === c.type)?.[1] ?? c.type), symmetry: true, region: { min: sel.min, max: sel.max } }, function* (es) {
    let n = 0;
    for (let x = sel.min.x; x <= sel.max.x; x++)
      for (let z = sel.min.z; z <= sel.max.z; z++)
        for (let y = sel.min.y; y <= sel.max.y; y++) {
          if (!In(x, y, z) || !keep(x, y, z)) continue;
          es.set(x, y, z, paint(x, y, z));
          if (++n % 256 === 0) yield;
        }
  });
}

/**
 * Wendeltreppe: Mittelsäule (Muster 2) und Stufen aus echten Treppenblöcken, die sich nach oben drehen.
 * Treppenart passend zum Muster (Stein → Steintreppe, Eichenholz → Eichentreppe …). Stufen pro Umdrehung =
 * „Spirale: Höhe pro Umdrehung“. Steht auf dem Blickziel.
 * @param {import("../core/state.js").Session} ses
 * @param {import("../core/state.js").Settings["shape"]} c
 */
function windingStairs(ses, c) {
  const t = targetOrAir(ses.player, ses.s);
  const base = t.hit ? t.adjacent : t.pos;
  const R = Math.max(2, c.rx);
  const H = 2 * c.ry + 1;
  const per = Math.max(4, c.pitch ?? 12);
  const core = picker(ses.s.pattern2);
  const mat = ses.s.pattern[0]?.id ?? "minecraft:stone";
  let stair = stairFor(mat);
  try {
    BlockPermutation.resolve(stair);
  } catch {
    stair = "minecraft:stone_stairs";
  }
  /** @param {number} dx @param {number} dz */
  const dirOf = (dx, dz) => {
    const [sx, sz] = Math.abs(dx) >= Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
    return STAIR_DIRS.find(([a, b]) => a === sx && b === sz)?.[2] ?? 0;
  };
  runEdit(ses.player, { label: "Wendeltreppe", symmetry: true }, function* (es) {
    for (let k = 0; k < H; k++) {
      const y = base.y + k;
      es.set(base.x, y, base.z, core());
      const a0 = (k / per) * Math.PI * 2;
      const a1 = ((k + 1) / per) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      // Stufe steigt in Drehrichtung an (Tangente)
      const perm = BlockPermutation.resolve(stair, { weirdo_direction: dirOf(-Math.sin(mid), Math.cos(mid)), upside_down_bit: false });
      for (let dx = -R; dx <= R; dx++)
        for (let dz = -R; dz <= R; dz++) {
          if (!dx && !dz) continue;
          const d = Math.hypot(dx, dz);
          if (d > R + 0.5) continue;
          let a = Math.atan2(dz, dx);
          if (a < 0) a += Math.PI * 2;
          const s0 = ((a0 % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          let rel = a - s0;
          if (rel < -1e-9) rel += Math.PI * 2; // Rundungsfehler an der Sektorgrenze nicht als volle Runde werten
          else if (rel < 0) rel = 0;
          if (rel >= a1 - a0) continue;
          es.set(base.x + dx, y, base.z + dz, perm);
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
    if (c.type === "winding") return windingStairs(ses, c);
    if (c.anchor === "sel") return buildInSelection(ses, c);
    if (c.anchor === "ab") return buildBetween(ses, c);
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
    const keep = keepFn(f.inside, c);
    const e = f.ext;
    const paint = paintFn(ses, c, f.inside, -e.y, e.y);
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
              if (!f.inside(x, y, z) || !keep(x, y, z)) continue;
              es.set(ctr.x + x, ctr.y + y, ctr.z + z, paint(x, y, z));
              if (++n % 256 === 0) yield;
            }
      }
    );
  },
  onHit(ses) {
    if (ses.shapeA) {
      ses.shapeA = undefined;
      msg(ses.player, "Punkt A verworfen.");
      return true;
    }
    if (!ses.shapeLock) return false;
    ses.shapeLock = undefined;
    msg(ses.player, "Vorschau abgebrochen.");
    return true;
  },
  preview(ses) {
    const c = ses.s.shape;
    if (c.type === "pillar" || c.type === "winding") return markBlock(ses.player, "axiom:marker", center(ses));
    if (c.anchor === "sel") return; // die Auswahl ist schon sichtbar
    if (c.anchor === "ab") {
      // Punkt A und Linie zum Blickziel
      const t = targetOrAir(ses.player, ses.s);
      const B = t.hit ? t.pos : t.adjacent;
      markBlock(ses.player, "axiom:marker", B);
      const A = ses.shapeA;
      if (!A) return;
      markBlock(ses.player, "axiom:pos1", A);
      const L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
      const n = Math.min(60, Math.ceil(L * 2));
      for (let i = 0; i <= n; i++) {
        const k = i / Math.max(1, n);
        spawn(ses.player, "axiom:pos2", v(A.x + 0.5 + (B.x - A.x) * k, A.y + 0.5 + (B.y - A.y) * k, A.z + 0.5 + (B.z - A.z) * k));
      }
      return;
    }
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
    return `${SHAPES.find((s) => s[0] === c.type)?.[1]} ${c.rx * 2 + 1}×${c.ry * 2 + 1}×${c.rz * 2 + 1}${c.hollow ? " hohl" : ""}${c.yaw || c.tilt || c.roll ? ` · ↻${c.yaw ?? 0}/${c.tilt ?? 0}/${c.roll ?? 0}°` : ""}${c.anchor === "sel" ? " · in Auswahl" : ""} · §e${formatPattern(ses.s.pattern)}`;
  },
  async menu(ses) {
    const favs = ses.s.shapeFavs ?? [];
    if (!favs.length) return shapeSettings(ses);
    await menu(ses.player, "Formen", "Lieblingsform antippen = sofort benutzen.", [
      { text: "§lEinstellungen ändern", run: () => shapeSettings(ses) },
      ...favs.map((fv) => ({
        text: "★ " + fv.name + "\n§8" + (SHAPES.find((s) => s[0] === fv.cfg.type)?.[1] ?? fv.cfg.type),
        run: () => {
          Object.assign(ses.s.shape, fv.cfg);
          ses.shapeLock = undefined;
          ses.shapeA = undefined;
          markDirty(ses);
          msg(ses.player, `Lieblingsform §e${fv.name}§r gewählt.`);
        },
      })),
      {
        text: "§cLieblingsform löschen …",
        run: () =>
          menu(
            ses.player,
            "Lieblingsform löschen",
            "",
            favs.map((fv, i) => ({
              text: fv.name,
              run: () => {
                favs.splice(i, 1);
                ses.s.shapeFavs = favs;
                markDirty(ses);
                msg(ses.player, `„${fv.name}“ gelöscht.`);
              },
            }))
          ),
      },
    ]);
  },
};

/** Einstellungen des Formen-Werkzeugs. @param {import("../core/state.js").Session} ses */
async function shapeSettings(ses) {
  {
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
        "open",
        "Hohl: offen lassen",
        [
          ["none", "Nichts (rundum zu)"],
          ["bottom", "Boden offen"],
          ["top", "Deckel offen"],
          ["both", "Boden & Deckel offen (Röhre)"],
        ],
        c.open ?? "none"
      )
      .toggle("wire", "Nur Kanten (Drahtgitter) – gut für Quader, Pyramide, Prisma", c.wire ?? false)
      .dropdown(
        "anchor",
        "Platzierung",
        [
          ["center", "Mittelpunkt am Blickziel"],
          ["base", "Auf dem Boden stehend"],
          ["sel", "In die Auswahl einpassen (Größe = Auswahl)"],
          ["ab", "Von Punkt A nach Punkt B ziehen (2× benutzen)"],
        ],
        c.anchor
      )
      .toggle("look", "Nach Blickrichtung drehen (Bogen/Prisma stehen quer zu dir)", c.look)
      .slider("yaw", "Drehen (Grad, um die senkrechte Achse)", 0, 345, 15, c.yaw ?? 0)
      .slider("tilt", "Nach vorne kippen (Grad)", 0, 345, 15, c.tilt ?? 0)
      .slider("roll", "Zur Seite neigen (Grad)", 0, 345, 15, c.roll ?? 0)
      .slider("pitch", "Spirale: Höhe pro Umdrehung", 3, 40, 1, c.pitch)
      .slider("sides", "Vieleck-Turm: Anzahl Ecken", 3, 12, 1, c.sides)
      .slider("step", "Stufenpyramide: Stufenhöhe", 1, 8, 1, c.step)
      .toggle("confirm", "Vorschau-Modus: 1. Benutzen zeigt die Form, 2. Benutzen baut sie", c.confirm)
      .dropdown(
        "material",
        "Material",
        [
          ["single", "Ein Muster"],
          ["gradient", "Verlauf: unten Muster 1 → oben Muster 2"],
          ["rim", "Rand aus Muster 2, innen Muster 1"],
          ["stripesH", "Streifen waagerecht (Muster 1 / 2)"],
          ["stripesV", "Streifen senkrecht (Muster 1 / 2)"],
          ["checker", "Schachbrett (Muster 1 / 2)"],
          ["ribs", "Rippen rundherum (Muster 2, Anzahl = Ecken-Regler)"],
          ["carve", "Ausschneiden: Form wird zu Luft (Loch, Tunnel)"],
        ],
        c.material ?? "single"
      )
      .slider("band", "Streifen/Schachbrett: Breite", 1, 8, 1, c.band ?? 1)
      .toggle("pat", "Danach Block/Muster wählen", false)
      .toggle("fav", "Diese Einstellungen als Lieblingsform speichern", false)
      .text("favName", "Name der Lieblingsform", "z.B. Turmdach", "")
      .show(ses.player);
    if (!r) return;
    Object.assign(c, { look: r.look, pitch: r.pitch, sides: r.sides, step: r.step, type: r.type, rx: r.rx, ry: r.same ? r.rx : r.ry, rz: r.same ? r.rx : r.rz, hollow: r.hollow, thick: r.thick, anchor: r.anchor, open: r.open, wire: r.wire, confirm: r.confirm, yaw: r.yaw, tilt: r.tilt, roll: r.roll, material: r.material, band: r.band });
    ses.shapeLock = undefined;
    markDirty(ses);
    if (r.fav) saveFavorite(ses, String(r.favName ?? ""));
    if (r.pat) await patternMenu(ses);
    if (r.pat && c.material && c.material !== "single") await patternMenu(ses, "pattern2");
  }
}

/** Aktuelle Form als Lieblingsform merken (max. 12, gleicher Name wird ersetzt). @param {import("../core/state.js").Session} ses @param {string} name */
export function saveFavorite(ses, name) {
  const c = ses.s.shape;
  const label = name.trim() || (SHAPES.find((s) => s[0] === c.type)?.[1] ?? c.type) + ` ${c.rx * 2 + 1}×${c.ry * 2 + 1}×${c.rz * 2 + 1}`;
  const favs = (ses.s.shapeFavs ?? []).filter((f) => f.name !== label);
  favs.unshift({ name: label, cfg: { ...c } });
  ses.s.shapeFavs = favs.slice(0, 12);
  markDirty(ses);
  msg(ses.player, `Lieblingsform §e${label}§r gespeichert – Schleichen + Benutzen zeigt deine Lieblingsformen.`);
}
