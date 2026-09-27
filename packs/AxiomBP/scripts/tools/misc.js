// Lineal, Blockzustand-Editor (Tinker), Bulldozer, Rückgängig, Axiom-Menü.
import { BlockStates, system } from "@minecraft/server";
import { runEdit } from "../core/edit.js";
import { air, shortId } from "../core/pattern.js";
import { markDirty } from "../core/state.js";
import { markBlock } from "../core/selection.js";
import { undoRedo, getHistory } from "../core/history.js";
import { err, fmtNum, msg, target, targetOrAir } from "../core/util.js";
import { fmt, v } from "../core/vec.js";
import { Modal } from "../ui/forms.js";
import { sphereOffsets, strokeId } from "./registry.js";
import { getSession } from "../core/state.js";

// ---------- Lineal ----------
/** @type {import("./registry.js").Tool} */
export const rulerTool = {
  id: "axiom:ruler",
  name: "Lineal",
  help: "Benutzen: Punkt A, dann Punkt B setzen – zeigt Abstände. Schlagen: zurücksetzen.",
  onUse(ses) {
    const t = targetOrAir(ses.player, ses.s);
    const p = t.pos;
    if (!ses.rulerA) {
      ses.rulerA = p;
      msg(ses.player, `Lineal Punkt A: §e${fmt(p)}`);
      return;
    }
    const a = ses.rulerA;
    const dx = Math.abs(p.x - a.x) + 1;
    const dy = Math.abs(p.y - a.y) + 1;
    const dz = Math.abs(p.z - a.z) + 1;
    const d = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
    msg(
      ses.player,
      `Lineal: §eA ${fmt(a)} → B ${fmt(p)}\n` +
        `  Größe (Blöcke): §b${dx} × ${dy} × ${dz}§r = ${fmtNum(dx * dy * dz)} Blöcke\n` +
        `  Luftlinie: §b${d.toFixed(2)}§r · horizontal: §b${Math.hypot(p.x - a.x, p.z - a.z).toFixed(2)}`
    );
    ses.rulerB = p;
    ses.rulerA = null;
  },
  onHit(ses) {
    ses.rulerA = null;
    ses.rulerB = undefined;
    msg(ses.player, "Lineal zurückgesetzt.");
  },
  preview(ses) {
    if (ses.rulerA) markBlock(ses.player, "axiom:pos1", ses.rulerA);
    if (ses.rulerB) markBlock(ses.player, "axiom:pos2", ses.rulerB);
  },
  hud: (ses) => (ses.rulerA ? `A: ${fmt(ses.rulerA)} – Punkt B setzen` : "Punkt A setzen"),
};

// ---------- Blockzustand-Editor ----------
/** @type {import("./registry.js").Tool} */
export const tinkerTool = {
  id: "axiom:tinker",
  name: "Blockzustand-Editor",
  help: "Benutzen auf einen Block: Zustände (Richtung, Farbe, offen/zu, Stufe …) direkt bearbeiten. Schlagen: Block drehen (falls möglich).",
  noSneakMenu: true,
  async onUse(ses) {
    const t = target(ses.player, ses.s);
    if (!t) return err(ses.player, "Kein Block im Blick.");
    const block = t.block;
    const perm = block.permutation;
    const states = perm.getAllStates();
    const names = Object.keys(states);
    if (!names.length) return msg(ses.player, `§e${shortId(block.typeId)}§r hat keine veränderbaren Zustände.`);
    const m = new Modal("Zustände: " + shortId(block.typeId));
    /** @type {Record<string, (string|number|boolean)[]>} */
    const valid = {};
    for (const n of names) {
      const cur = states[n];
      const vv = BlockStates.get(n)?.validValues ?? [cur];
      valid[n] = vv;
      if (typeof cur === "boolean") m.toggle(n, n, cur);
      else
        m.dropdown(
          n,
          n,
          vv.map((x) => [x, String(x)]),
          cur
        );
    }
    const r = await m.show(ses.player);
    if (!r) return;
    let np = perm;
    for (const n of names) {
      try {
        np = np.withState(/** @type {any} */ (n), r[n]);
      } catch {}
    }
    const loc = block.location;
    runEdit(ses.player, { label: "Blockzustand", useMask: false, quiet: true }, function* (es) {
      es.setRaw(loc.x, loc.y, loc.z, np);
      yield;
    }).then(() => msg(ses.player, "Blockzustand geändert."));
  },
  onHit(ses, block) {
    // Schnell drehen: bekannte Richtungs-Zustände weiterschalten
    const perm = block.permutation;
    const st = perm.getAllStates();
    const keys = ["minecraft:cardinal_direction", "facing_direction", "direction", "weirdo_direction", "pillar_axis", "ground_sign_direction", "minecraft:facing_direction", "rotation"];
    for (const k of keys) {
      if (!(k in st)) continue;
      const vv = BlockStates.get(k)?.validValues;
      if (!vv) continue;
      const i = vv.indexOf(st[k]);
      const next = vv[(i + 1) % vv.length];
      try {
        const np = perm.withState(/** @type {any} */ (k), next);
        const loc = block.location;
        runEdit(ses.player, { label: "Drehen", useMask: false, quiet: true }, function* (es) {
          es.setRaw(loc.x, loc.y, loc.z, np);
          yield;
        });
        return;
      } catch {}
    }
    msg(ses.player, "Dieser Block lässt sich nicht drehen.");
  },
  hud: () => "Benutzen: Zustände bearbeiten · Schlagen: drehen",
};

// ---------- Bulldozer ----------
/** @type {import("./registry.js").Tool} */
export const bulldozerTool = {
  id: "axiom:bulldozer",
  name: "Bulldozer",
  brush: true,
  help: "Benutzen (gedrückt halten): Blöcke auf große Entfernung sofort abbauen. Schleichen+Benutzen: Radius.",
  onUse(ses) {
    const t = target(ses.player, ses.s);
    if (!t) return;
    const r = ses.s.bulldozer.radius;
    const p = t.pos;
    runEdit(ses.player, { label: "Bulldozer", stroke: strokeId(ses, "bulldozer"), symmetry: true }, function* (es) {
      const A = air();
      if (r === 0) {
        es.set(p.x, p.y, p.z, A);
        return;
      }
      let n = 0;
      for (const [dx, dy, dz] of sphereOffsets(r)) {
        es.set(p.x + dx, p.y + dy, p.z + dz, A);
        if (++n % 256 === 0) yield;
      }
    });
  },
  hud: (ses) => `Radius ${ses.s.bulldozer.radius}`,
  async menu(ses) {
    const r = await new Modal("Bulldozer").slider("radius", "Radius (0 = einzelner Block)", 0, 10, 1, ses.s.bulldozer.radius).show(ses.player);
    if (!r) return;
    ses.s.bulldozer.radius = r.radius;
    markDirty(ses);
  },
};

// ---------- Rückgängig ----------
/** @param {import("@minecraft/server").Player} player @param {boolean} redo */
export function doUndo(player, redo) {
  const ses = getSession(player);
  if (ses.busy) return err(player, "Bitte warten – eine Operation läuft noch.");
  ses.busy = true;
  system.runJob(
    (function* () {
      let label = null;
      try {
        label = yield* undoRedo(player.id, redo);
      } catch (e) {
        err(player, "Fehler: " + e);
      }
      ses.busy = false;
      const h = getHistory(player.id);
      if (label === null) err(player, redo ? "Nichts zum Wiederherstellen." : "Nichts zum Rückgängigmachen.");
      else msg(player, `${redo ? "§aWiederhergestellt" : "§eRückgängig"}§r: ${label} §7(${h.undo.length} zurück / ${h.redo.length} vor)`);
    })()
  );
}

/** @type {import("./registry.js").Tool} */
export const undoTool = {
  id: "axiom:undo",
  name: "Rückgängig",
  noSneakMenu: true,
  help: "Benutzen: Rückgängig. Schleichen+Benutzen: Wiederherstellen.",
  onUse(ses) {
    doUndo(ses.player, ses.player.isSneaking);
  },
  hud(ses) {
    const h = getHistory(ses.player.id);
    const last = h.undo[h.undo.length - 1];
    return `${h.undo.length} Schritte zurück · ${h.redo.length} vor` + (last ? ` · zuletzt: ${last.label}` : "");
  },
};

// Kleiner Export, damit der Symmetrie-Marker gezeichnet werden kann
/** @param {import("../core/state.js").Session} ses */
export function renderSymmetry(ses) {
  const c = ses.s.symmetry.center;
  if (!c || (!ses.s.symmetry.x && !ses.s.symmetry.z)) return;
  if (Math.abs(c.x - ses.player.location.x) > 80 || Math.abs(c.z - ses.player.location.z) > 80) return;
  const y = Math.floor(ses.player.location.y);
  for (let d = -12; d <= 12; d++) {
    if (ses.s.symmetry.x) ses.player.spawnParticle("axiom:sym", v(c.x + 0.5, y + 0.2, c.z + d + 0.5));
    if (ses.s.symmetry.z) ses.player.spawnParticle("axiom:sym", v(c.x + d + 0.5, y + 0.2, c.z + 0.5));
  }
}

