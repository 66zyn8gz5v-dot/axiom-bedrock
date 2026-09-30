// Pfad-Werkzeug (Linien/Kurven durch Punkte) und Text-Werkzeug.
import { runEdit } from "../core/edit.js";
import { formatPattern, isSolidId, picker } from "../core/pattern.js";
import { markDirty } from "../core/state.js";
import { markBlock, spawn } from "../core/selection.js";
import { err, msg, targetOrAir } from "../core/util.js";
import { cardinal, fmt, k3, v } from "../core/vec.js";
import { Modal, menu } from "../ui/forms.js";
import { patternMenu } from "../ui/common.js";
import { FONT } from "./font.js";
import { SEL_MODES, applySel, selInfo } from "./select.js";
import { SET_LIMIT } from "../core/selection.js";

/**
 * Catmull-Rom-Kurve durch Punkte abtasten.
 * @param {{x:number,y:number,z:number}[]} pts
 * @param {boolean} smooth
 */
export function samplePath(pts, smooth) {
  /** @type {{x:number,y:number,z:number}[]} */
  const out = [];
  if (pts.length === 1) return [{ ...pts[0] }];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    const steps = Math.max(1, Math.ceil(segLen * 3));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (!smooth) {
        out.push(v(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t, p1.z + (p2.z - p1.z) * t));
        continue;
      }
      const t2 = t * t;
      const t3 = t2 * t;
      /** @param {"x"|"y"|"z"} a */
      const f = (a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3);
      out.push(v(f("x"), f("y"), f("z")));
    }
  }
  return out;
}

/** @param {import("../core/state.js").Session} ses */
function buildPath(ses) {
  const pts = ses.pathPoints;
  if (pts.length < 2) return err(ses.player, "Mindestens 2 Punkte setzen.");
  const c = ses.s.path;
  const samples = samplePath(pts, c.smooth);
  const pick = picker(ses.s.pattern);
  const r = c.radius;
  const rr = (r + 0.5) * (r + 0.5);
  const inner = (r - 0.5) * (r - 0.5);
  runEdit(ses.player, { label: "Pfad", symmetry: true }, function* (es) {
    const done = new Set();
    let n = 0;
    for (const s of samples) {
      const ri = Math.ceil(r);
      const ry = c.flat ? 0 : ri;
      for (let dx = -ri; dx <= ri; dx++)
        for (let dy = -ry; dy <= ry; dy++)
          for (let dz = -ri; dz <= ri; dz++) {
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > rr) continue;
            const x = Math.round(s.x + dx);
            const y = Math.round(s.y + dy);
            const z = Math.round(s.z + dz);
            const k = k3(x, y, z);
            if (done.has(k)) continue;
            done.add(k);
            if (c.hollow && !c.flat && r >= 1 && d2 < inner) continue;
            es.set(x, y, z, pick());
            if (c.flat && c.support) {
              // Unterbau bis zum Boden (max. 48 Blöcke)
              for (let yy = y - 1; yy > y - 48; yy--) {
                const id = es.id(x, yy, z);
                if (!id || isSolidId(id)) break;
                es.set(x, yy, z, pick());
              }
            }
            if (++n % 256 === 0) yield;
          }
      yield;
    }
  });
}

/**
 * Punkt-in-Polygon (XZ-Ebene, Strahltest).
 * @param {{x:number,z:number}[]} poly @param {number} x @param {number} z
 */
export function inPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Lasso: alle Blöcke, deren Mitte im Umriss der Pfadpunkte liegt, zwischen tiefstem und höchstem Punkt (± Rand).
 * @param {import("../core/state.js").Session} ses @param {number} below @param {number} above @param {boolean} solidOnly
 */
function lassoSelect(ses, below, above, solidOnly) {
  const pts = ses.pathPoints.map((p) => ({ x: p.x + 0.5, z: p.z + 0.5 }));
  const xs = ses.pathPoints.map((p) => p.x);
  const zs = ses.pathPoints.map((p) => p.z);
  const ys = ses.pathPoints.map((p) => p.y);
  const dim = ses.player.dimension;
  const y0 = Math.max(dim.heightRange.min, Math.min(...ys) - below);
  const y1 = Math.min(dim.heightRange.max - 1, Math.max(...ys) + above);
  const keys = new Set();
  for (let x = Math.min(...xs); x <= Math.max(...xs); x++)
    for (let z = Math.min(...zs); z <= Math.max(...zs); z++) {
      if (!inPolygon(pts, x + 0.5, z + 0.5)) continue;
      for (let y = y0; y <= y1; y++) {
        if (solidOnly) {
          try {
            const b = dim.getBlock({ x, y, z });
            if (!b || !isSolidId(b.typeId)) continue;
          } catch {
            continue;
          }
        }
        keys.add(k3(x, y, z));
        if (keys.size > SET_LIMIT) return err(ses.player, "Lasso-Fläche zu groß.");
      }
    }
  if (!keys.size) return err(ses.player, "Nichts innerhalb des Lassos gefunden.");
  const part = {
    kind: /** @type {"set"} */ ("set"),
    dim: dim.id,
    keys,
    min: v(Math.min(...xs), y0, Math.min(...zs)),
    max: v(Math.max(...xs), y1, Math.max(...zs)),
  };
  if (applySel(ses, part)) msg(ses.player, `Lasso: ${keys.size} Blöcke → ${selInfo(ses)}`);
}

/** @type {import("./registry.js").Tool} */
export const pathTool = {
  id: "axiom:path",
  name: "Pfad",
  help: "Benutzen: Punkt hinzufügen. Schlagen: letzten Punkt entfernen. Schleichen+Benutzen: Pfad bauen / Einstellungen.",
  onUse(ses) {
    const t = targetOrAir(ses.player, ses.s);
    ses.pathPoints.push(t.hit ? t.adjacent : t.pos);
    msg(ses.player, `Punkt ${ses.pathPoints.length}: §e${fmt(ses.pathPoints[ses.pathPoints.length - 1])}§r (Schleichen+Benutzen zum Bauen)`);
  },
  onHit(ses) {
    const p = ses.pathPoints.pop();
    if (p) msg(ses.player, `Punkt entfernt (${ses.pathPoints.length} übrig).`);
  },
  preview(ses) {
    const pts = ses.pathPoints;
    for (const p of pts) markBlock(ses.player, "axiom:marker", p);
    if (pts.length >= 2) {
      const s = samplePath(pts, ses.s.path.smooth);
      const step = Math.max(1, Math.floor(s.length / 200));
      for (let i = 0; i < s.length; i += step) spawn(ses.player, "axiom:sel", v(s[i].x + 0.5, s[i].y + 0.5, s[i].z + 0.5));
    }
  },
  hud: (ses) => `${ses.pathPoints.length} Punkte · Radius ${ses.s.path.radius}${ses.s.path.flat ? " · flach" : ""}${ses.s.path.smooth ? " · Kurve" : " · gerade"} · §e${formatPattern(ses.s.pattern)}`,
  async menu(ses) {
    await menu(ses.player, "Pfad", `${ses.pathPoints.length} Punkte gesetzt.`, [
      { text: "§aPfad bauen", run: () => buildPath(ses) },
      {
        text: "Lasso: Fläche innerhalb der Punkte auswählen",
        run: async () => {
          if (ses.pathPoints.length < 3) return err(ses.player, "Für das Lasso mindestens 3 Punkte setzen.");
          const r = await new Modal("Lasso-Auswahl")
            .slider("below", "Blöcke unter dem tiefsten Punkt", 0, 64, 1, 3)
            .slider("above", "Blöcke über dem höchsten Punkt", 0, 64, 1, 3)
            .toggle("solid", "Nur feste Blöcke auswählen", false)
            .dropdown("sel", "Auswahl-Modus", SEL_MODES, ses.s.selMode)
            .show(ses.player);
          if (!r) return;
          ses.s.selMode = r.sel;
          markDirty(ses);
          lassoSelect(ses, r.below, r.above, r.solid);
        },
      },
      {
        text: "Einstellungen",
        run: async () => {
          const c = ses.s.path;
          const r = await new Modal("Pfad")
            .slider("radius", "Dicke (Radius, 0 = 1 Block)", 0, 10, 1, c.radius)
            .toggle("smooth", "Weiche Kurve (statt gerader Linien)", c.smooth)
            .toggle("hollow", "Hohl (Röhre)", c.hollow)
            .toggle("flat", "Flach (Straße / Rampe statt Rohr)", c.flat)
            .toggle("support", "Rampe: Unterbau bis zum Boden auffüllen", c.support)
            .show(ses.player);
          if (!r) return;
          Object.assign(c, r);
          markDirty(ses);
        },
      },
      { text: "Block/Muster wählen", run: () => patternMenu(ses) },
      {
        text: "§cAlle Punkte löschen",
        run: () => {
          ses.pathPoints = [];
          msg(ses.player, "Pfadpunkte gelöscht.");
        },
      },
    ]);
  },
};

// ---------- Text ----------

/** @type {import("./registry.js").Tool} */
export const textTool = {
  id: "axiom:text",
  name: "Text",
  help: "Benutzen: Text aus Blöcken an das Blickziel schreiben. Schleichen+Benutzen: Text, Größe, Ausrichtung.",
  onUse(ses) {
    const c = ses.s.text;
    const t = targetOrAir(ses.player, ses.s);
    const f = cardinal(ses.player.getViewDirection(), true);
    const right = v(-f.z, 0, f.x);
    const chars = [...c.text.toUpperCase()];
    const S = Math.max(1, c.scale);
    const glyphW = 5 * S + c.spacing;
    const totalW = chars.length * glyphW - c.spacing;
    const pick = picker(ses.s.pattern);
    const base = t.hit ? t.adjacent : t.pos;
    const wall = c.orient === "wall";
    runEdit(ses.player, { label: "Text" }, function* (es) {
      let col0 = -Math.floor(totalW / 2);
      for (const ch of chars) {
        const g = FONT[ch] ?? FONT["?"];
        for (let row = 0; row < 7; row++)
          for (let col = 0; col < 5; col++) {
            if (g[row][col] !== "#") continue;
            for (let sx = 0; sx < S; sx++)
              for (let sy = 0; sy < S; sy++) {
                const u = col0 + col * S + sx; // nach rechts
                const w = (6 - row) * S + sy; // nach oben (Wand) bzw. vom Spieler weg (Boden)
                const p = wall
                  ? v(base.x + right.x * u, base.y + w, base.z + right.z * u)
                  : v(base.x + right.x * u + f.x * w, base.y, base.z + right.z * u + f.z * w);
                es.set(p.x, p.y, p.z, pick());
              }
          }
        col0 += glyphW;
        yield;
      }
    });
  },
  hud: (ses) => `„${ses.s.text.text}“ · Größe ${ses.s.text.scale} · ${ses.s.text.orient === "wall" ? "Wand" : "Boden"} · §e${formatPattern(ses.s.pattern)}`,
  async menu(ses) {
    const c = ses.s.text;
    const r = await new Modal("Text")
      .text("text", "Text (A–Z, 0–9, ÄÖÜ, Satzzeichen)", "Hallo", c.text)
      .slider("scale", "Größe", 1, 8, 1, c.scale)
      .slider("spacing", "Abstand zwischen Buchstaben", 0, 4, 1, c.spacing)
      .dropdown(
        "orient",
        "Ausrichtung",
        [
          ["wall", "Senkrecht (Wand, zu dir gedreht)"],
          ["floor", "Flach auf dem Boden"],
        ],
        c.orient
      )
      .toggle("pat", "Danach Block/Muster wählen", false)
      .show(ses.player);
    if (!r) return;
    Object.assign(c, { text: String(r.text).slice(0, 64) || "AXIOM", scale: r.scale, spacing: r.spacing, orient: r.orient });
    markDirty(ses);
    if (r.pat) await patternMenu(ses);
  },
};
