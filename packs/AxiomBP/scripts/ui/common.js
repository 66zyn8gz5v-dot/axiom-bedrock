// Gemeinsame Menüs: Muster (aktiver Block) und Maske.
import { BlockPermutation } from "@minecraft/server";
import { markDirty } from "../core/state.js";
import { describeMask, formatPattern, normId, parsePattern, shortId } from "../core/pattern.js";
import { err, msg } from "../core/util.js";
import { Modal, menu } from "./forms.js";

/**
 * Block-IDs aus dem Inventar des Spielers (nur echte Blöcke).
 * @param {import("@minecraft/server").Player} player
 * @param {boolean} [hotbarOnly]
 */
export function inventoryBlocks(player, hotbarOnly = false) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  /** @type {string[]} */
  const out = [];
  if (!inv) return out;
  const n = hotbarOnly ? 9 : inv.size;
  for (let i = 0; i < n; i++) {
    const it = inv.getItem(i);
    if (!it || out.includes(it.typeId) || it.typeId.startsWith("axiom:")) continue;
    try {
      BlockPermutation.resolve(it.typeId);
      out.push(it.typeId);
    } catch {}
  }
  return out;
}

/**
 * Muster bearbeiten.
 * @param {import("../core/state.js").Session} ses
 * @param {"pattern"|"pattern2"} [which]
 */
export async function patternMenu(ses, which = "pattern") {
  const p = ses.player;
  const cur = formatPattern(ses.s[which]);
  await menu(
    p,
    which === "pattern" ? "Aktiver Block / Muster" : "Zweites Muster",
    `Aktuell: §e${cur}\n\n§7Tipp: Mit einem Axiom-Werkzeug einen Block §fschlagen§7 = Pipette (Block übernehmen).`,
    [
      {
        text: "Aus Inventar wählen",
        run: async () => {
          const blocks = inventoryBlocks(p);
          if (!blocks.length) return err(p, "Keine Blöcke im Inventar.");
          await menu(
            p,
            "Block wählen",
            "",
            blocks.map((id) => ({
              text: shortId(id),
              run: () => {
                ses.s[which] = [{ id, w: 1 }];
                markDirty(ses);
                msg(p, `Muster: §e${shortId(id)}`);
              },
            }))
          );
        },
      },
      {
        text: "Hotbar-Blöcke als Mischung",
        run: () => {
          const blocks = inventoryBlocks(p, true);
          if (!blocks.length) return err(p, "Keine Blöcke in der Hotbar.");
          ses.s[which] = blocks.map((id) => ({ id, w: 1 }));
          markDirty(ses);
          msg(p, `Muster: §e${formatPattern(ses.s[which])}`);
        },
      },
      {
        text: "Als Text eingeben",
        run: async () => {
          const r = await new Modal("Muster eingeben")
            .text("t", "Blöcke, Komma-getrennt. Gewichte mit *, Zustände in [].\nz.B.: 3*stone, andesite, oak_log[pillar_axis=x]", "stone", cur)
            .show(p);
          if (!r) return;
          try {
            ses.s[which] = parsePattern(r.t);
            markDirty(ses);
            msg(p, `Muster: §e${formatPattern(ses.s[which])}`);
          } catch (e) {
            err(p, "Ungültiges Muster: " + e);
          }
        },
      },
      {
        text: "Luft (Löschen)",
        run: () => {
          ses.s[which] = [{ id: "minecraft:air", w: 1 }];
          markDirty(ses);
          msg(p, "Muster: §eLuft");
        },
      },
    ]
  );
}

const MASK_MODES = /** @type {[string,string][]} */ ([
  ["none", "Keine Maske (alles verändern)"],
  ["air", "Nur Luft/Pflanzen ersetzen"],
  ["solid", "Nur feste Blöcke ersetzen"],
  ["list", "Nur diese Blöcke …"],
  ["notlist", "Alles außer diesen Blöcken …"],
]);

/** @param {import("../core/state.js").Session} ses */
export async function maskMenu(ses) {
  const m = ses.s.mask;
  const r = await new Modal("Maske")
    .dropdown("mode", `Welche Blöcke dürfen Werkzeuge verändern?\nAktuell: ${describeMask(m)}`, MASK_MODES, m.mode)
    .text("ids", "Blockliste (für „Nur diese“/„Außer“), Komma-getrennt", "stone, dirt", m.ids.map(shortId).join(", "))
    .toggle("hot", "Blockliste aus Hotbar übernehmen", false)
    .show(ses.player);
  if (!r) return;
  m.mode = r.mode;
  if (r.hot) m.ids = inventoryBlocks(ses.player, true);
  else
    m.ids = String(r.ids)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normId);
  markDirty(ses);
  msg(ses.player, "Maske: §e" + describeMask(m));
}
