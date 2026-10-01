// Anmerkungen: schwebende Texte als Bau-Notizen (unsichtbare Entität „axiom:note“ mit Namensschild).
import { world } from "@minecraft/server";
import { err, msg, targetOrAir } from "../core/util.js";
import { spawn } from "../core/selection.js";
import { v } from "../core/vec.js";
import { Modal, confirm, menu } from "./forms.js";

export const NOTE_ID = "axiom:note";

const COLORS = /** @type {[string,string][]} */ ([
  ["§f", "Weiß"],
  ["§e", "Gelb"],
  ["§a", "Grün"],
  ["§b", "Hellblau"],
  ["§c", "Rot"],
  ["§d", "Pink"],
  ["§6", "Gold"],
]);

// ---------- Linien (dauerhaft gespeicherte Partikel-Linien) ----------
const LINES_KEY = "axiom:lines";
const MAX_LINES = 60;
const LINE_COLORS = /** @type {[string,string][]} */ ([
  ["axiom:marker", "Gelb"],
  ["axiom:sel", "Pink"],
  ["axiom:pos1", "Grün"],
  ["axiom:pos2", "Blau"],
  ["axiom:sym", "Rot"],
]);

/** @typedef {{d:string, a:{x:number,y:number,z:number}, b:{x:number,y:number,z:number}, c:string}} Line */

/** @returns {Line[]} */
export function loadLines() {
  try {
    const raw = world.getDynamicProperty(LINES_KEY);
    if (typeof raw === "string") return JSON.parse(raw);
  } catch {}
  return [];
}
/** @param {Line[]} lines */
function storeLines(lines) {
  world.setDynamicProperty(LINES_KEY, JSON.stringify(lines.slice(-MAX_LINES)));
}

/** @type {Line[] | null} */
let lineCache = null;
/** Linien in der Nähe des Spielers zeichnen. @param {import("@minecraft/server").Player} p */
export function renderLines(p) {
  lineCache ??= loadLines();
  const l = p.location;
  let budget = 400;
  for (const ln of lineCache) {
    if (ln.d !== p.dimension.id) continue;
    const mx = (ln.a.x + ln.b.x) / 2;
    const mz = (ln.a.z + ln.b.z) / 2;
    if (Math.abs(mx - l.x) > 128 || Math.abs(mz - l.z) > 128) continue;
    const len = Math.hypot(ln.b.x - ln.a.x, ln.b.y - ln.a.y, ln.b.z - ln.a.z);
    const step = Math.max(0.5, len / 120);
    for (let t = 0; t <= len && budget > 0; t += step, budget--) {
      const f = len ? t / len : 0;
      spawn(p, ln.c, v(ln.a.x + 0.5 + (ln.b.x - ln.a.x) * f, ln.a.y + 0.5 + (ln.b.y - ln.a.y) * f, ln.a.z + 0.5 + (ln.b.z - ln.a.z) * f));
    }
  }
}

/** Anmerkungen in der Nähe (nächste zuerst). @param {import("@minecraft/server").Player} p @param {number} [radius] */
export function nearbyNotes(p, radius = 96) {
  return p.dimension.getEntities({ type: NOTE_ID, location: p.location, maxDistance: radius }).sort((a, b) => {
    const d = (/** @type {import("@minecraft/server").Entity} */ e) => (e.location.x - p.location.x) ** 2 + (e.location.y - p.location.y) ** 2 + (e.location.z - p.location.z) ** 2;
    return d(a) - d(b);
  });
}

/** @param {import("../core/state.js").Session} ses */
export async function notesMenu(ses) {
  const p = ses.player;
  const notes = nearbyNotes(p);
  await menu(p, "Anmerkungen", `Schwebende Bau-Notizen, die alle Spieler sehen.\n${notes.length} in der Nähe.`, [
    {
      text: "§aNeue Anmerkung am Blickziel",
      run: async () => {
        const r = await new Modal("Neue Anmerkung")
          .text("text", "Text (\\n = neue Zeile)", "Hier kommt das Tor hin", "")
          .dropdown("color", "Farbe", COLORS, "§e")
          .slider("height", "Höhe über dem Block", 0, 5, 1, 1)
          .show(p);
        if (!r) return;
        const text = String(r.text).trim().slice(0, 120);
        if (!text) return err(p, "Bitte einen Text eingeben.");
        const t = targetOrAir(p, ses.s);
        const base = t.hit ? t.adjacent : t.pos;
        try {
          const e = p.dimension.spawnEntity(/** @type {any} */ (NOTE_ID), v(base.x + 0.5, base.y + r.height, base.z + 0.5));
          e.nameTag = r.color + text.replace(/\\n/g, "\n");
          msg(p, "Anmerkung gesetzt.");
        } catch (e) {
          err(p, "Anmerkung konnte nicht gesetzt werden: " + e);
        }
      },
    },
    ...notes.slice(0, 20).map((n) => ({
      text: `${n.nameTag.replace(/§./g, "").split("\n")[0].slice(0, 30)}\n§8${Math.round(n.location.x)} ${Math.round(n.location.y)} ${Math.round(n.location.z)}`,
      run: () =>
        menu(p, "Anmerkung", n.nameTag, [
          {
            text: "Hinfliegen",
            run: () => {
              const l = n.location;
              p.teleport(v(l.x, l.y + 1, l.z + 3), { facingLocation: l });
            },
          },
          {
            text: "Text ändern",
            run: async () => {
              const r = await new Modal("Text ändern").text("text", "Text", "", n.nameTag.replace(/^§./, "")).show(p);
              if (!r || !n.isValid) return;
              const color = n.nameTag.match(/^§./)?.[0] ?? "§e";
              n.nameTag = color + String(r.text).slice(0, 120).replace(/\\n/g, "\n");
            },
          },
          {
            text: "Hierher (Blickziel) versetzen",
            run: () => {
              const t = targetOrAir(p, ses.s);
              const b = t.hit ? t.adjacent : t.pos;
              if (n.isValid) n.teleport(v(b.x + 0.5, b.y + 1, b.z + 0.5));
            },
          },
          {
            text: "§cLöschen",
            run: () => {
              if (n.isValid) n.remove();
              msg(p, "Anmerkung gelöscht.");
            },
          },
        ]),
    })),
    {
      text: "Linie aus der letzten Lineal-Messung",
      run: async () => {
        const m = ses.rulerLast;
        if (!m) return err(p, "Erst mit dem Lineal zwei Punkte messen (A, dann B).");
        const r = await new Modal("Linie speichern").dropdown("c", "Farbe", LINE_COLORS, "axiom:marker").show(p);
        if (!r) return;
        const lines = loadLines();
        lines.push({ d: p.dimension.id, a: m.a, b: m.b, c: r.c });
        storeLines(lines);
        lineCache = null;
        msg(p, "Linie gespeichert – sichtbar, solange du ein Axiom-Werkzeug hältst.");
      },
    },
    {
      text: "§cLinien in der Nähe löschen",
      run: () => {
        const l = p.location;
        const all = loadLines();
        const keep = all.filter((ln) => ln.d !== p.dimension.id || Math.hypot((ln.a.x + ln.b.x) / 2 - l.x, (ln.a.z + ln.b.z) / 2 - l.z) > 96);
        storeLines(keep);
        lineCache = null;
        msg(p, `${all.length - keep.length} Linien gelöscht.`);
      },
    },
    {
      text: "§cAlle Anmerkungen in der Nähe löschen",
      run: async () => {
        const list = nearbyNotes(p);
        if (!list.length) return err(p, "Keine Anmerkungen in der Nähe.");
        if (!(await confirm(p, "Alle löschen?", `${list.length} Anmerkungen im Umkreis von 96 Blöcken löschen?`))) return;
        for (const n of list) n.remove();
        msg(p, `${list.length} Anmerkungen gelöscht.`);
      },
    },
  ]);
}
