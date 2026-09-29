// Kreaturen-Werkzeug: Kreaturen, Rüstungsständer, Boote usw. auswählen, verschieben, drehen, benennen, löschen.
import { Player } from "@minecraft/server";
import { markDirty } from "../core/state.js";
import { spawn } from "../core/selection.js";
import { err, msg, targetOrAir } from "../core/util.js";
import { cardinal, dirName, v } from "../core/vec.js";
import { Modal, confirm, menu } from "../ui/forms.js";

/** @param {import("../core/state.js").Session} ses */
function selected(ses) {
  ses.entities = (ses.entities ?? []).filter((e) => e.isValid);
  return ses.entities;
}

/** @param {import("@minecraft/server").Entity} e */
const label = (e) => (e.nameTag ? `„${e.nameTag}“` : e.typeId.replace(/^minecraft:/, ""));

/** @param {import("../core/state.js").Session} ses */
function entityInView(ses) {
  const p = ses.player;
  try {
    const hits = p.getEntitiesFromViewDirection({ maxDistance: ses.s.reach });
    for (const h of hits) if (!(h.entity instanceof Player)) return h.entity;
  } catch {}
  return undefined;
}

/** @param {import("../core/state.js").Session} ses @param {(e: import("@minecraft/server").Entity) => void} fn */
function each(ses, fn) {
  let n = 0;
  for (const e of selected(ses)) {
    try {
      fn(e);
      n++;
    } catch {}
  }
  return n;
}

/** @type {import("./registry.js").Tool} */
export const entityTool = {
  id: "axiom:entity",
  name: "Kreaturen",
  help: "Benutzen: Kreatur/Rüstungsständer im Blick an- oder abwählen (ohne Treffer: alles rund um das Blickziel). Schlagen: Auswahl leeren. Schleichen+Benutzen: Verschieben, Drehen, Holen, Benennen, Löschen …",
  onUse(ses) {
    const list = selected(ses);
    const hit = entityInView(ses);
    if (hit) {
      const i = list.findIndex((e) => e.id === hit.id);
      if (i >= 0) {
        list.splice(i, 1);
        msg(ses.player, `${label(hit)} abgewählt (${list.length} ausgewählt).`);
      } else {
        list.push(hit);
        msg(ses.player, `${label(hit)} ausgewählt (${list.length} ausgewählt).`);
      }
      return;
    }
    const t = targetOrAir(ses.player, ses.s);
    const r = ses.s.entity.radius;
    const found = ses.player.dimension.getEntities({ location: v(t.pos.x + 0.5, t.pos.y + 1, t.pos.z + 0.5), maxDistance: r }).filter((e) => !(e instanceof Player));
    let added = 0;
    for (const e of found) {
      if (!list.some((x) => x.id === e.id)) {
        list.push(e);
        added++;
      }
    }
    if (!found.length) return err(ses.player, `Keine Kreatur im Umkreis von ${r} Blöcken um das Blickziel.`);
    msg(ses.player, `${added} Kreaturen hinzugefügt (${list.length} ausgewählt).`);
  },
  onHit(ses) {
    ses.entities = [];
    msg(ses.player, "Kreaturen-Auswahl geleert.");
  },
  preview(ses) {
    for (const e of selected(ses)) {
      try {
        const l = e.location;
        spawn(ses.player, "axiom:marker", v(l.x, l.y + 2.2, l.z));
        spawn(ses.player, "axiom:marker", v(l.x, l.y + 2.5, l.z));
      } catch {}
    }
  },
  hud: (ses) => `${selected(ses).length} Kreaturen ausgewählt · Umkreis ${ses.s.entity.radius}`,
  async menu(ses) {
    const p = ses.player;
    const list = selected(ses);
    const dir = cardinal(p.getViewDirection());
    await menu(p, "Kreaturen", `${list.length} ausgewählt: ${list.slice(0, 6).map(label).join(", ")}${list.length > 6 ? " …" : ""}`, [
      {
        text: "Alle Kreaturen in der Block-Auswahl wählen",
        run: () => {
          const sel = ses.sel;
          if (!sel) return err(p, "Keine Block-Auswahl vorhanden.");
          const found = p.dimension
            .getEntities({ location: sel.min, volume: v(sel.max.x - sel.min.x + 1, sel.max.y - sel.min.y + 1, sel.max.z - sel.min.z + 1) })
            .filter((e) => !(e instanceof Player));
          ses.entities = found;
          msg(p, `${found.length} Kreaturen ausgewählt.`);
        },
      },
      {
        text: `Verschieben nach ${dirName(dir)} …`,
        run: async () => {
          if (!list.length) return err(p, "Nichts ausgewählt.");
          const r = await new Modal("Verschieben").slider("n", "Blöcke", 1, 64, 1, 1).show(p);
          if (!r) return;
          const n = each(ses, (e) => {
            const l = e.location;
            e.teleport(v(l.x + dir.x * r.n, l.y + dir.y * r.n, l.z + dir.z * r.n));
          });
          msg(p, `${n} Kreaturen verschoben.`);
        },
      },
      {
        text: "Zum Blickziel setzen",
        run: () => {
          if (!list.length) return err(p, "Nichts ausgewählt.");
          const t = targetOrAir(p, ses.s);
          const n = each(ses, (e) => e.teleport(v(t.adjacent.x + 0.5, t.adjacent.y, t.adjacent.z + 0.5)));
          msg(p, `${n} Kreaturen umgesetzt.`);
        },
      },
      {
        text: "Zu mir holen",
        run: () => {
          const l = p.location;
          const n = each(ses, (e) => e.teleport(v(l.x, l.y, l.z)));
          msg(p, `${n} Kreaturen geholt.`);
        },
      },
      {
        text: "Drehen …",
        run: async () => {
          if (!list.length) return err(p, "Nichts ausgewählt.");
          const r = await new Modal("Drehen")
            .dropdown(
              "mode",
              "Wie drehen?",
              [
                ["cw", "90° im Uhrzeigersinn"],
                ["ccw", "90° gegen den Uhrzeigersinn"],
                ["180", "180°"],
                ["me", "Zu mir schauen"],
                ["same", "In meine Blickrichtung"],
              ],
              "cw"
            )
            .show(p);
          if (!r) return;
          const my = p.getRotation().y;
          const n = each(ses, (e) => {
            const rot = e.getRotation();
            let y = rot.y;
            if (r.mode === "cw") y += 90;
            else if (r.mode === "ccw") y -= 90;
            else if (r.mode === "180") y += 180;
            else if (r.mode === "same") y = my;
            else {
              const l = e.location;
              const pl = p.location;
              // Minecraft-Gierwinkel: 0 = Süden (+Z), 90 = Westen (-X)
              y = (Math.atan2(-(pl.x - l.x), pl.z - l.z) * 180) / Math.PI;
            }
            e.setRotation({ x: rot.x, y: ((((y + 180) % 360) + 360) % 360) - 180 });
          });
          msg(p, `${n} Kreaturen gedreht.`);
        },
      },
      {
        text: "Kopieren (gleiche Art daneben)",
        run: () => {
          if (!list.length) return err(p, "Nichts ausgewählt.");
          const n = each(ses, (e) => {
            const l = e.location;
            const c = e.dimension.spawnEntity(/** @type {any} */ (e.typeId), v(l.x + dir.x, l.y, l.z + dir.z));
            c.setRotation(e.getRotation());
            if (e.nameTag) c.nameTag = e.nameTag;
          });
          msg(p, `${n} Kopien erzeugt (ohne Ausrüstung/Inventar).`);
        },
      },
      {
        text: "Namen geben",
        run: async () => {
          if (!list.length) return err(p, "Nichts ausgewählt.");
          const r = await new Modal("Namen geben").text("name", "Name (leer = Name entfernen)", "Bob", list[0].nameTag ?? "").show(p);
          if (!r) return;
          const n = each(ses, (e) => (e.nameTag = String(r.name).slice(0, 40)));
          msg(p, `${n} Kreaturen benannt.`);
        },
      },
      {
        text: "Einstellungen",
        run: async () => {
          const r = await new Modal("Kreaturen").slider("radius", "Umkreis beim Auswählen ohne Treffer", 1, 32, 1, ses.s.entity.radius).show(p);
          if (!r) return;
          ses.s.entity.radius = r.radius;
          markDirty(ses);
        },
      },
      {
        text: "§cLöschen",
        run: async () => {
          if (!list.length) return err(p, "Nichts ausgewählt.");
          if (!(await confirm(p, "Löschen?", `${list.length} Kreaturen endgültig entfernen? Das kann nicht rückgängig gemacht werden.`))) return;
          const n = each(ses, (e) => e.remove());
          ses.entities = [];
          msg(p, `${n} Kreaturen gelöscht.`);
        },
      },
      {
        text: "Auswahl leeren",
        run: () => {
          ses.entities = [];
          msg(p, "Kreaturen-Auswahl geleert.");
        },
      },
    ]);
  },
};
