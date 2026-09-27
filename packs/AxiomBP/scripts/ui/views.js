// Ansichten (wie Axiom „Views“): Position + Blickrichtung speichern und wieder hinspringen.
import { world } from "@minecraft/server";
import { err, msg } from "../core/util.js";
import { Modal, confirm, menu } from "./forms.js";

const VIEWS_KEY = "axiom:views";
const MAX_VIEWS = 30;

/**
 * @typedef {{name:string, dim:string, x:number, y:number, z:number, rx:number, ry:number}} View
 */

/** @param {import("@minecraft/server").Player} p @returns {View[]} */
export function loadViews(p) {
  try {
    const raw = p.getDynamicProperty(VIEWS_KEY);
    if (typeof raw === "string") return JSON.parse(raw);
  } catch {}
  return [];
}

/** @param {import("@minecraft/server").Player} p @param {View[]} views */
function storeViews(p, views) {
  p.setDynamicProperty(VIEWS_KEY, JSON.stringify(views));
}

/** @param {import("@minecraft/server").Player} p @param {string} name */
export function saveView(p, name) {
  const views = loadViews(p).filter((v) => v.name !== name);
  const r = p.getRotation();
  const l = p.location;
  views.unshift({ name, dim: p.dimension.id, x: +l.x.toFixed(2), y: +l.y.toFixed(2), z: +l.z.toFixed(2), rx: +r.x.toFixed(1), ry: +r.y.toFixed(1) });
  storeViews(p, views.slice(0, MAX_VIEWS));
}

/** @param {import("@minecraft/server").Player} p @param {View} v */
export function gotoView(p, v) {
  p.teleport({ x: v.x, y: v.y, z: v.z }, { dimension: world.getDimension(v.dim), rotation: { x: v.rx, y: v.ry } });
}

/** @param {import("../core/state.js").Session} ses */
export async function viewsMenu(ses) {
  const p = ses.player;
  const views = loadViews(p);
  await menu(p, "Ansichten", "Speichere Standpunkte mit Blickrichtung und springe später zurück – praktisch bei großen Bauten.", [
    {
      text: "§aAktuelle Ansicht speichern",
      run: async () => {
        const r = await new Modal("Ansicht speichern").text("name", "Name", "Eingang", `Ansicht ${views.length + 1}`).show(p);
        if (!r) return;
        const name = String(r.name).trim().slice(0, 32);
        if (!name) return err(p, "Bitte einen Namen eingeben.");
        saveView(p, name);
        msg(p, `Ansicht §e${name}§r gespeichert.`);
      },
    },
    ...views.map((v) => ({
      text: `${v.name}\n§8${Math.round(v.x)} ${Math.round(v.y)} ${Math.round(v.z)}`,
      run: () =>
        menu(p, v.name, "", [
          {
            text: "Hinspringen",
            run: () => {
              gotoView(p, v);
              msg(p, `Ansicht §e${v.name}§r.`);
            },
          },
          {
            text: "§cLöschen",
            run: async () => {
              if (!(await confirm(p, "Löschen?", `Ansicht „${v.name}“ löschen?`))) return;
              storeViews(
                p,
                loadViews(p).filter((x) => x.name !== v.name)
              );
              msg(p, "Gelöscht.");
            },
          },
        ]),
    })),
  ]);
}
