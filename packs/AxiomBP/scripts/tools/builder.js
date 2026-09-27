// Baumeister: Zwischenablage mit Vorschau einfügen, drehen, spiegeln.
import { system } from "@minecraft/server";
import { getClip, pasteClip, rotatedSize } from "../core/clipboard.js";
import { markDirty, getSession } from "../core/state.js";
import { spawn } from "../core/selection.js";
import { err, fmtNum, msg, targetOrAir } from "../core/util.js";
import { v } from "../core/vec.js";
import { Modal } from "../ui/forms.js";

/** Zielbereich für das Einfügen. @param {import("../core/state.js").Session} ses */
export function pasteOrigin(ses) {
  const clip = getClip(ses.player);
  if (!clip) return null;
  const o = ses.s.paste;
  const rs = rotatedSize(clip.size, o.rotation);
  const t = targetOrAir(ses.player, ses.s);
  const base = t.hit ? t.adjacent : t.pos;
  return { min: v(base.x - Math.floor(rs.x / 2), base.y + o.offsetY, base.z - Math.floor(rs.z / 2)), size: rs, clip };
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {import("../core/clipboard.js").Clip} clip
 * @param {{x:number,y:number,z:number}} origin
 */
export function doPaste(player, clip, origin) {
  const ses = getSession(player);
  if (ses.busy) return err(player, "Bitte warten – eine Operation läuft noch.");
  ses.busy = true;
  const dim = player.dimension;
  const o = ses.s.paste;
  system.runJob(
    (function* () {
      try {
        const n = yield* pasteClip(player, clip, dim, origin, o);
        msg(player, `§aEingefügt§r: ${fmtNum(n)} Blöcke`);
      } catch (e) {
        err(player, "Einfügen fehlgeschlagen: " + e);
      }
      ses.busy = false;
    })()
  );
}

/** @type {import("./registry.js").Tool} */
export const builderTool = {
  id: "axiom:builder",
  name: "Baumeister",
  help: "Benutzen: Zwischenablage am Blickziel einfügen (Vorschau-Rahmen sichtbar). Schlagen: um 90° drehen. Schleichen+Benutzen: Einstellungen.",
  onUse(ses) {
    const po = pasteOrigin(ses);
    if (!po) return err(ses.player, "Zwischenablage ist leer – erst eine Auswahl kopieren (Axiom-Menü → Auswahl).");
    doPaste(ses.player, po.clip, po.min);
  },
  onHit(ses) {
    ses.s.paste.rotation = (ses.s.paste.rotation + 90) % 360;
    markDirty(ses);
    msg(ses.player, `Drehung: §e${ses.s.paste.rotation}°`);
  },
  preview(ses) {
    const po = pasteOrigin(ses);
    if (!po) return;
    const a = po.min;
    const b = v(a.x + po.size.x, a.y + po.size.y, a.z + po.size.z);
    const L = 2 * (po.size.x + po.size.y + po.size.z);
    const step = Math.max(1, L / 120);
    /** @param {number} x @param {number} y @param {number} z */
    const s = (x, y, z) => spawn(ses.player, "axiom:marker", v(x, y, z));
    for (let x = a.x; x <= b.x; x += step) {
      s(x, a.y, a.z);
      s(x, a.y, b.z);
      s(x, b.y, a.z);
      s(x, b.y, b.z);
    }
    for (let z = a.z; z <= b.z; z += step) {
      s(a.x, a.y, z);
      s(b.x, a.y, z);
      s(a.x, b.y, z);
      s(b.x, b.y, z);
    }
    for (let y = a.y; y <= b.y; y += step) {
      s(a.x, y, a.z);
      s(b.x, y, a.z);
      s(a.x, y, b.z);
      s(b.x, y, b.z);
    }
  },
  hud(ses) {
    const clip = getClip(ses.player);
    const o = ses.s.paste;
    if (!clip) return "§7Zwischenablage leer";
    return `${clip.name ? "Blaupause „" + clip.name + "“ " : ""}${clip.size.x}×${clip.size.y}×${clip.size.z} · ${o.rotation}°${o.mirror !== "None" ? " · gespiegelt " + o.mirror : ""}${o.air ? "" : " · ohne Luft"}`;
  },
  async menu(ses) {
    const o = ses.s.paste;
    const r = await new Modal("Baumeister / Einfügen")
      .dropdown(
        "rotation",
        "Drehung",
        [
          [0, "0°"],
          [90, "90° im Uhrzeigersinn"],
          [180, "180°"],
          [270, "270° (90° gegen Uhrzeigersinn)"],
        ],
        o.rotation
      )
      .dropdown(
        "mirror",
        "Spiegeln",
        [
          ["None", "Nicht spiegeln"],
          ["X", "Ost-West spiegeln (X)"],
          ["Z", "Nord-Süd spiegeln (Z)"],
          ["XZ", "Beides"],
        ],
        o.mirror
      )
      .toggle("air", "Luft mit einfügen (überschreibt Blöcke)", o.air)
      .toggle("entities", "Kreaturen/Objekte mit einfügen", o.entities)
      .slider("offsetY", "Höhenversatz", -32, 32, 1, o.offsetY)
      .show(ses.player);
    if (!r) return;
    Object.assign(o, r);
    markDirty(ses);
  },
};
