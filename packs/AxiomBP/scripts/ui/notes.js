// Anmerkungen: schwebende Texte als Bau-Notizen (unsichtbare Entität „axiom:note“ mit Namensschild).
import { err, msg, targetOrAir } from "../core/util.js";
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
