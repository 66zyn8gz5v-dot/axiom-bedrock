// Axiom-Hauptmenü: Werkzeuge, Muster, Maske, Auswahl, Zwischenablage, Verlauf, Fähigkeiten, Welt, Hotbars, Hilfe.
import { GameMode, ItemStack, world, WeatherType, system } from "@minecraft/server";
import { getSession, markDirty, setWorldFlag, worldFlag } from "../core/state.js";
import { describeMask, formatPattern, normId } from "../core/pattern.js";
import { err, msg, target, targetOrAir } from "../core/util.js";
import { boxSel, selDims, shiftSel } from "../core/selection.js";
import { cardinal, dirName, fmt, v } from "../core/vec.js";
import { getClip, listBlueprints, loadBlueprint, saveBlueprint, deleteBlueprint, renameBlueprint, rotatedSize } from "../core/clipboard.js";
import { getHistory, clearHistory } from "../core/history.js";
import * as ops from "../core/selops.js";
import { Modal, confirm, menu } from "./forms.js";
import { maskMenu, patternMenu } from "./common.js";
import { viewsMenu } from "./views.js";
import { notesMenu } from "./notes.js";
import { selInfo } from "../tools/select.js";
import { doUndo } from "../tools/misc.js";
import { TOOL_LIST } from "../tools/index.js";

/** @param {import("../core/state.js").Session} ses */
export async function mainMenu(ses) {
  const p = ses.player;
  const h = getHistory(p.id);
  const clip = getClip(p);
  await menu(
    p,
    "§l§dAxiom",
    `Muster: §e${formatPattern(ses.s.pattern)}§r\nMaske: §e${describeMask(ses.s.mask)}§r\nAuswahl: ${selInfo(ses)}\nZwischenablage: ${clip ? `${clip.size.x}×${clip.size.y}×${clip.size.z}` : "§7leer"}§r\nVerlauf: ${h.undo.length} zurück / ${h.redo.length} vor`,
    [
      { text: "Werkzeuge holen", icon: "textures/items/axiom_menu", run: () => toolsMenu(ses) },
      { text: "Block / Muster wählen", icon: "textures/blocks/stone", run: () => patternMenu(ses) },
      { text: "Maske", run: () => maskMenu(ses) },
      { text: "Auswahl bearbeiten", icon: "textures/items/axiom_box_select", run: () => selectionMenu(ses) },
      { text: "Zwischenablage & Blaupausen", icon: "textures/items/axiom_builder", run: () => clipboardMenu(ses) },
      { text: "Verlauf (Rückgängig)", icon: "textures/items/axiom_undo", run: () => historyMenu(ses) },
      { text: "Fähigkeiten", run: () => capsMenu(ses) },
      { text: "Symmetrie", run: () => symmetryMenu(ses) },
      { text: "Ansichten (Standpunkte)", run: () => viewsMenu(ses) },
      { text: "Anmerkungen (Bau-Notizen)", run: () => notesMenu(ses) },
      { text: "Welt (Zeit, Wetter, Regeln)", run: () => worldMenu(ses) },
      { text: "Hotbar-Sätze", run: () => hotbarMenu(ses) },
      { text: "Hilfe", run: () => helpMenu(ses) },
    ]
  );
}

// ---------- Werkzeuge ----------
/** @param {import("../core/state.js").Session} ses */
async function toolsMenu(ses) {
  const p = ses.player;
  const give = (/** @type {string} */ id) => {
    const inv = p.getComponent("minecraft:inventory")?.container;
    if (!inv) return;
    for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === id) return;
    inv.addItem(new ItemStack(id, 1));
  };
  await menu(p, "Werkzeuge", "Werkzeuge ins Inventar legen. Jedes Werkzeug: §eBenutzen§r = Aktion, §eSchleichen+Benutzen§r = Einstellungen, §eSchlagen§r = Pipette/Zusatzaktion.", [
    {
      text: "§aAlle Werkzeuge",
      run: () => {
        for (const t of TOOL_LIST) give(t.id);
        msg(p, "Alle Werkzeuge ins Inventar gelegt.");
      },
    },
    ...TOOL_LIST.map((t) => ({
      text: t.name,
      icon: "textures/items/" + t.id.replace("axiom:", "axiom_"),
      run: () => {
        give(t.id);
        msg(p, `§e${t.name}§r: ${t.help}`);
      },
    })),
  ]);
}

// ---------- Auswahl ----------
/** @param {import("../core/state.js").Session} ses */
function lookDir(ses) {
  return cardinal(ses.player.getViewDirection());
}

/** @param {import("../core/state.js").Session} ses */
export async function selectionMenu(ses) {
  const p = ses.player;
  await menu(p, "Auswahl bearbeiten", `Auswahl: ${selInfo(ses)}\nMuster: §e${formatPattern(ses.s.pattern)}`, [
    { text: "Füllen (mit Muster)", run: () => ops.opFill(ses) },
    {
      text: "Ersetzen …",
      run: async () => {
        const r = await new Modal("Ersetzen").text("from", "Welche Blöcke ersetzen? (Komma-getrennt)", "dirt, grass_block", "").toggle("look", "Stattdessen: Block im Blick ersetzen", false).show(p);
        if (!r) return;
        let ids = String(r.from)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map(normId);
        if (r.look) {
          const t = target(p, ses.s);
          if (!t) return err(p, "Kein Block im Blick.");
          ids = [t.block.typeId];
        }
        if (!ids.length) return err(p, "Keine Blöcke angegeben.");
        ops.opReplace(ses, ids);
      },
    },
    { text: "Leeren (Luft)", run: () => ops.opClear(ses) },
    { text: "Hohlräume füllen (Innenräume)", run: () => ops.opFillEnclosed(ses) },
    { text: "Wasser ablassen", run: () => ops.opDrain(ses) },
    { text: "Mit Wasser füllen", run: () => ops.opFlood(ses) },
    {
      text: "Verlauf (Muster 1 → Muster 2)",
      run: async () => {
        const c = ses.s.gradient;
        const r = await new Modal("Verlauf")
          .dropdown(
            "axis",
            `Richtung (Muster 1: ${formatPattern(ses.s.pattern)} → Muster 2: ${formatPattern(ses.s.pattern2)})`,
            [
              ["y", "Von unten nach oben"],
              ["x", "Von West nach Ost"],
              ["z", "Von Nord nach Süd"],
            ],
            c.axis
          )
          .toggle("reverse", "Umkehren", c.reverse)
          .slider("blend", "Breite der Übergangszone", 0, 10, 1, c.blend)
          .toggle("pat2", "Vorher Muster 2 wählen", false)
          .show(p);
        if (!r) return;
        Object.assign(c, { axis: r.axis, reverse: r.reverse, blend: r.blend });
        markDirty(ses);
        if (r.pat2) await patternMenu(ses, "pattern2");
        ops.opGradient(ses, c);
      },
    },
    {
      text: "Ausdünnen (Ruinen / Verfall)",
      run: async () => {
        const c = ses.s.thin;
        const r = await new Modal("Ausdünnen")
          .slider("percent", "Anteil der Blöcke in %", 1, 100, 1, c.percent)
          .toggle("replace", "Durch aktives Muster ersetzen statt entfernen (z.B. bemooster Bruchstein)", c.replace)
          .show(p);
        if (!r) return;
        Object.assign(c, r);
        markDirty(ses);
        ops.opThin(ses, c);
      },
    },
    { text: "Wände", run: () => ops.opShell(ses, "walls") },
    { text: "Umriss (Hülle)", run: () => ops.opShell(ses, "outline") },
    { text: "Aushöhlen", run: () => ops.opShell(ses, "hollow") },
    {
      text: "Überziehen (Schicht oben drauf)",
      run: async () => {
        const r = await new Modal("Überziehen").slider("d", "Dicke", 1, 5, 1, 1).show(p);
        if (r) ops.opOverlay(ses, r.d);
      },
    },
    { text: "Natürlich machen (Gras/Erde/Stein)", run: () => ops.opNaturalize(ses) },
    {
      text: "Glätten",
      run: async () => {
        const r = await new Modal("Glätten").slider("it", "Stärke (Durchgänge)", 1, 10, 1, 3).show(p);
        if (r) ops.opSmooth(ses, r.it);
      },
    },
    { text: "Kopieren", run: () => ops.opCopy(ses, false) },
    { text: "Ausschneiden", run: () => ops.opCopy(ses, true) },
    {
      text: "Stapeln (in Blickrichtung)",
      run: async () => {
        const d = lookDir(ses);
        const r = await new Modal(`Stapeln nach ${dirName(d)}`)
          .slider("count", "Anzahl Kopien", 1, 64, 1, ses.s.stack.count)
          .slider("gap", "Abstand dazwischen", 0, 32, 1, ses.s.stack.gap)
          .show(p);
        if (!r) return;
        ses.s.stack = { count: r.count, gap: r.gap };
        markDirty(ses);
        ops.opStack(ses, d, r.count, r.gap);
      },
    },
    {
      text: "Array (Versatz + Drehung pro Kopie)",
      run: async () => {
        const r = await new Modal("Array")
          .slider("count", "Anzahl Kopien", 1, 64, 1, 4)
          .slider("dx", "Versatz X (Ost +)", -64, 64, 1, 0)
          .slider("dy", "Versatz Y (hoch +)", -64, 64, 1, 1)
          .slider("dz", "Versatz Z (Süd +)", -64, 64, 1, 0)
          .dropdown(
            "rot",
            "Drehung pro Kopie",
            [
              [0, "keine"],
              [90, "90°"],
              [180, "180°"],
              [270, "270°"],
            ],
            0
          )
          .show(p);
        if (!r) return;
        ops.opArray(ses, v(r.dx, r.dy, r.dz), r.count, r.rot);
      },
    },
    {
      text: "Verschieben (in Blickrichtung)",
      run: async () => {
        const d = lookDir(ses);
        const r = await new Modal(`Verschieben nach ${dirName(d)}`).slider("dist", "Blöcke", 1, 128, 1, ses.s.move.distance).show(p);
        if (!r) return;
        ses.s.move.distance = r.dist;
        markDirty(ses);
        ops.opMove(ses, d, r.dist);
      },
    },
    {
      text: "Drehen / Spiegeln",
      run: () =>
        menu(p, "Drehen / Spiegeln", "Der Inhalt der Auswahl wird an Ort und Stelle gedreht.", [
          { text: "90° im Uhrzeigersinn", run: () => ops.opTransform(ses, 90, "None") },
          { text: "180°", run: () => ops.opTransform(ses, 180, "None") },
          { text: "90° gegen Uhrzeigersinn", run: () => ops.opTransform(ses, 270, "None") },
          { text: "Ost-West spiegeln", run: () => ops.opTransform(ses, 0, "X") },
          { text: "Nord-Süd spiegeln", run: () => ops.opTransform(ses, 0, "Z") },
        ]),
    },
    {
      text: "Zwischenablage verstreuen (z.B. Bäume)",
      run: async () => {
        const c = ses.s.scatter;
        const r = await new Modal("Verstreuen")
          .slider("count", "Anzahl", 1, 100, 1, c.count)
          .slider("spacing", "Mindestabstand", 1, 64, 1, c.spacing)
          .toggle("rotate", "Zufällig drehen", c.rotate)
          .show(p);
        if (!r) return;
        Object.assign(c, r);
        markDirty(ses);
        ops.opScatterClip(ses, c);
      },
    },
    { text: "Analysieren (Blöcke zählen)", run: () => ops.opAnalyze(ses) },
    { text: "Auswahl anpassen …", run: () => adjustSelection(ses) },
    {
      text: "§cAuswahl aufheben",
      run: () => {
        ses.sel = null;
        ses.nextCorner = 1;
        msg(p, "Auswahl aufgehoben.");
      },
    },
  ]);
}

/** @param {import("../core/state.js").Session} ses */
async function adjustSelection(ses) {
  const p = ses.player;
  const sel = ses.sel;
  if (!sel) return err(p, "Keine Auswahl.");
  const d = cardinal(p.getViewDirection());
  await menu(p, "Auswahl anpassen", `Blickrichtung: §e${dirName(d)}§r\n${selInfo(ses)}`, [
    {
      text: "Erweitern in Blickrichtung",
      run: async () => {
        const r = await new Modal("Erweitern").slider("n", "Blöcke", 1, 128, 1, 5).show(p);
        if (!r || !ses.sel) return;
        grow(ses, d, r.n);
      },
    },
    {
      text: "Verkleinern von Blickrichtung",
      run: async () => {
        const r = await new Modal("Verkleinern").slider("n", "Blöcke", 1, 128, 1, 1).show(p);
        if (!r || !ses.sel) return;
        grow(ses, d, -r.n);
      },
    },
    {
      text: "In alle Richtungen vergrößern (3D)",
      run: async () => {
        const r = await new Modal("Aufblasen").slider("n", "Blöcke", 1, 16, 1, 1).show(p);
        if (r) ops.selGrow(ses, r.n);
      },
    },
    {
      text: "In alle Richtungen verkleinern (3D)",
      run: async () => {
        const r = await new Modal("Schrumpfen").slider("n", "Blöcke", 1, 16, 1, 1).show(p);
        if (r) ops.selGrow(ses, -r.n);
      },
    },
    { text: "Auf Oberfläche begrenzen", run: () => ops.selSurface(ses) },
    {
      text: "Nach oben & unten bis zum Weltrand",
      run: () => {
        if (!ses.sel || ses.sel.kind !== "box") return err(p, "Nur für Box-Auswahl.");
        const hr = p.dimension.heightRange;
        ses.sel = boxSel(ses.sel.dim, v(ses.sel.min.x, hr.min, ses.sel.min.z), v(ses.sel.max.x, hr.max - 1, ses.sel.max.z));
        msg(p, selInfo(ses));
      },
    },
    {
      text: "Auswahl verschieben (ohne Inhalt)",
      run: async () => {
        const r = await new Modal("Auswahl verschieben").slider("n", "Blöcke", 1, 128, 1, 1).show(p);
        if (!r || !ses.sel) return;
        ses.sel = shiftSel(ses.sel, v(d.x * r.n, d.y * r.n, d.z * r.n));
        msg(p, selInfo(ses));
      },
    },
    {
      text: "Koordinaten eingeben",
      run: async () => {
        const s = ses.sel;
        const r = await new Modal("Box-Auswahl per Koordinaten")
          .text("a", "Ecke 1 (x y z)", "0 64 0", s ? fmt(s.min) : "")
          .text("b", "Ecke 2 (x y z)", "10 70 10", s ? fmt(s.max) : "")
          .show(p);
        if (!r) return;
        const pa = String(r.a).trim().split(/[\s,]+/).map(Number);
        const pb = String(r.b).trim().split(/[\s,]+/).map(Number);
        if (pa.length !== 3 || pb.length !== 3 || [...pa, ...pb].some((x) => !Number.isFinite(x))) return err(p, "Ungültige Koordinaten.");
        ses.sel = boxSel(p.dimension.id, v(pa[0], pa[1], pa[2]), v(pb[0], pb[1], pb[2]));
        msg(p, selInfo(ses));
      },
    },
  ]);
}

/** Box-Auswahl in eine Richtung vergrößern/verkleinern. @param {import("../core/state.js").Session} ses @param {{x:number,y:number,z:number}} d @param {number} n */
function grow(ses, d, n) {
  const s = ses.sel;
  if (!s) return;
  if (s.kind !== "box") return err(ses.player, "Nur für Box-Auswahl.");
  const min = { ...s.min };
  const max = { ...s.max };
  if (d.x > 0) max.x += n;
  if (d.x < 0) min.x -= n;
  if (d.y > 0) max.y += n;
  if (d.y < 0) min.y -= n;
  if (d.z > 0) max.z += n;
  if (d.z < 0) min.z -= n;
  ses.sel = boxSel(s.dim, min, max);
  const dd = selDims(ses.sel);
  msg(ses.player, `Auswahl: ${dd.x}×${dd.y}×${dd.z}`);
}

// ---------- Zwischenablage ----------
/** @param {import("../core/state.js").Session} ses */
async function clipboardMenu(ses) {
  const p = ses.player;
  const clip = getClip(p);
  await menu(p, "Zwischenablage & Blaupausen", clip ? `Zwischenablage: ${clip.size.x}×${clip.size.y}×${clip.size.z}${clip.name ? " („" + clip.name + "“)" : ""}` : "Zwischenablage ist leer.", [
    { text: "Auswahl kopieren", run: () => ops.opCopy(ses, false) },
    { text: "Auswahl ausschneiden", run: () => ops.opCopy(ses, true) },
    {
      text: "Als Blaupause speichern",
      run: async () => {
        if (!clip) return err(p, "Zwischenablage ist leer.");
        const r = await new Modal("Blaupause speichern").text("name", "Name", "mein_haus", clip.name ?? "").show(p);
        if (!r) return;
        try {
          const n = saveBlueprint(p, String(r.name));
          msg(p, `Blaupause §e${n}§r gespeichert.`);
        } catch (e) {
          err(p, String(e));
        }
      },
    },
    {
      text: "Auswahl direkt als Blaupause speichern",
      run: async () => {
        if (!ses.sel) return err(p, "Keine Auswahl.");
        const r = await new Modal("Auswahl als Blaupause").text("name", "Name", "mein_haus", "").show(p);
        if (!r) return;
        await ops.opCopy(ses, false);
        try {
          const n = saveBlueprint(p, String(r.name));
          msg(p, `Auswahl als Blaupause §e${n}§r gespeichert.`);
        } catch (e) {
          err(p, String(e));
        }
      },
    },
    {
      text: "Blaupausen (laden, umbenennen, löschen)",
      run: () => blueprintMenu(ses),
    },
  ]);
}

/** Blaupausen-Verwaltung. @param {import("../core/state.js").Session} ses */
async function blueprintMenu(ses) {
  const p = ses.player;
  const list = listBlueprints();
  if (!list.length) return err(p, "Noch keine Blaupausen gespeichert.");
  await menu(
    p,
    "Blaupausen",
    `${list.length} gespeichert. Wählen zum Laden, Umbenennen oder Löschen.`,
    list.map((b) => ({
      text: `${b.name}\n§8${b.size.x}×${b.size.y}×${b.size.z} · ${b.author}${b.date ? " · " + b.date : ""}`,
      run: () =>
        menu(p, b.name, `Größe ${b.size.x}×${b.size.y}×${b.size.z}\nvon ${b.author}${b.date ? " am " + b.date : ""}`, [
          {
            text: "Vorschau am Blickziel (15 Sekunden)",
            run: () => {
              ses.bpPreview = { size: rotatedSize(b.size, ses.s.paste.rotation), until: system.currentTick + 300, name: b.name };
              msg(p, "Vorschau-Rahmen (blau) folgt deinem Blick – so groß würde die Blaupause.");
            },
          },
          {
            text: "§aIn Zwischenablage laden",
            run: () => {
              try {
                loadBlueprint(p, b.name);
                msg(p, `Blaupause §e${b.name}§r geladen – mit dem §eBaumeister§r einfügen.`);
              } catch (e) {
                err(p, String(e));
              }
            },
          },
          {
            text: "Umbenennen",
            run: async () => {
              const r = await new Modal("Umbenennen").text("name", "Neuer Name", "burg_tor", b.name).show(p);
              if (!r) return;
              try {
                const n = renameBlueprint(b.name, String(r.name));
                msg(p, `Umbenannt in §e${n}§r.`);
              } catch (e) {
                err(p, String(e));
              }
            },
          },
          {
            text: "§cLöschen",
            run: async () => {
              if (await confirm(p, "Löschen?", `Blaupause „${b.name}“ wirklich löschen?`)) {
                deleteBlueprint(b.name);
                msg(p, "Gelöscht.");
              }
            },
          },
        ]),
    }))
  );
}

// ---------- Verlauf ----------
/** @param {import("../core/state.js").Session} ses */
async function historyMenu(ses) {
  const p = ses.player;
  const h = getHistory(p.id);
  const list = h.undo
    .slice(-10)
    .reverse()
    .map((e, i) => `${i + 1}. ${e.label}`)
    .join("\n");
  await menu(p, "Verlauf", `Letzte Schritte:\n${list || "§7(leer)"}`, [
    { text: "Rückgängig", run: () => doUndo(p, false) },
    { text: "Wiederherstellen", run: () => doUndo(p, true) },
    {
      text: "Zu einem Schritt zurückspringen …",
      run: async () => {
        if (!h.undo.length) return err(p, "Verlauf ist leer.");
        const entries = h.undo.slice(-20).reverse();
        await menu(
          p,
          "Zurückspringen",
          "Alles bis einschließlich des gewählten Schritts wird rückgängig gemacht.",
          entries.map((e, i) => ({
            text: `${i + 1}. ${e.label}`,
            run: async () => {
              for (let k = 0; k <= i; k++) {
                doUndo(p, false);
                await system.waitTicks(2);
                while (getSession(p).busy) await system.waitTicks(2);
              }
            },
          }))
        );
      },
    },
    {
      text: "Mehrere Schritte rückgängig …",
      run: async () => {
        if (h.undo.length < 2) return doUndo(p, false);
        const r = await new Modal("Mehrere Schritte").slider("n", "Anzahl", 1, h.undo.length, 1, 1).show(p);
        if (!r) return;
        for (let i = 0; i < r.n; i++) {
          doUndo(p, false);
          await system.waitTicks(4);
          while (getSession(p).busy) await system.waitTicks(2);
        }
      },
    },
    {
      text: "§cVerlauf löschen",
      run: () => {
        clearHistory(p.id);
        msg(p, "Verlauf gelöscht.");
      },
    },
  ]);
}

// ---------- Fähigkeiten ----------
/** @param {import("../core/state.js").Session} ses */
async function capsMenu(ses) {
  const p = ses.player;
  const c = ses.s.caps;
  const spectator = p.getGameMode() === GameMode.Spectator;
  const r = await new Modal("Fähigkeiten")
    .slider("reach", "Reichweite der Werkzeuge (Blöcke)", 8, 512, 8, ses.s.reach)
    .slider("airDist", "Abstand für Platzieren in der Luft", 2, 32, 1, ses.s.airDist)
    .toggle("liquids", "Wasser, Lava & Pflanzen anvisieren", ses.s.liquids)
    .toggle("farPlace", "Weit platzieren: normale Blöcke auf große Entfernung setzen", c.farPlace)
    .toggle("angel", "Engel-Platzierung: Blöcke in die Luft setzen", c.angel)
    .toggle("replace", "Ersetzen-Modus: angeklickten Block ersetzen statt daneben bauen", c.replace)
    .toggle("nightVision", "Nachtsicht", c.nightVision)
    .toggle("noclip", "Durch Wände fliegen (Zuschauer-Modus)", spectator)
    .toggle("showSel", "Auswahl immer anzeigen (nicht nur mit Werkzeug)", ses.s.showSel)
    .toggle("ops", "Nur Operatoren dürfen Axiom benutzen (Welt-Einstellung)", worldFlag("ops_only"))
    .show(p);
  if (!r) return;
  ses.s.reach = r.reach;
  ses.s.airDist = r.airDist;
  ses.s.liquids = r.liquids;
  ses.s.showSel = r.showSel;
  Object.assign(c, { farPlace: r.farPlace, angel: r.angel, replace: r.replace, nightVision: r.nightVision });
  if (!r.nightVision) p.removeEffect("night_vision");
  if (r.noclip !== spectator) p.setGameMode(r.noclip ? GameMode.Spectator : GameMode.Creative);
  if (r.ops !== worldFlag("ops_only")) setWorldFlag("ops_only", r.ops);
  markDirty(ses);
  msg(p, "Fähigkeiten gespeichert.");
}

// ---------- Symmetrie ----------
/** @param {import("../core/state.js").Session} ses */
async function symmetryMenu(ses) {
  const p = ses.player;
  const s = ses.s.symmetry;
  const r = await new Modal("Symmetrie")
    .toggle("x", "Spiegeln an Nord-Süd-Linie (links/rechts, X)", s.x)
    .toggle("z", "Spiegeln an Ost-West-Linie (vorne/hinten, Z)", s.z)
    .dropdown(
      "center",
      `Mittelpunkt (aktuell: ${s.center ? fmt(s.center) : "keiner"})`,
      [
        ["keep", "Beibehalten"],
        ["look", "Blickziel als Mittelpunkt"],
        ["feet", "Meine Position als Mittelpunkt"],
      ],
      s.center ? "keep" : "look"
    )
    .show(p);
  if (!r) return;
  s.x = r.x;
  s.z = r.z;
  if (r.center === "look") s.center = targetOrAir(p, ses.s).pos;
  else if (r.center === "feet") s.center = v(Math.floor(p.location.x), Math.floor(p.location.y), Math.floor(p.location.z));
  markDirty(ses);
  msg(p, s.x || s.z ? `Symmetrie aktiv um §e${s.center ? fmt(s.center) : "?"}§r – gilt für Werkzeuge und normales Bauen/Abbauen.` : "Symmetrie aus.");
}

// ---------- Welt ----------
/** @param {import("../core/state.js").Session} ses */
async function worldMenu(ses) {
  const p = ses.player;
  const g = world.gameRules;
  const r = await new Modal("Welt")
    .dropdown(
      "time",
      "Tageszeit",
      [
        ["keep", "Nicht ändern"],
        [1000, "Morgen"],
        [6000, "Mittag"],
        [12000, "Sonnenuntergang"],
        [13000, "Nacht"],
        [18000, "Mitternacht"],
        [23000, "Sonnenaufgang"],
      ],
      "keep"
    )
    .toggle("dayCycle", "Tageszeit läuft weiter", g.doDayLightCycle)
    .dropdown(
      "weather",
      "Wetter",
      [
        ["keep", "Nicht ändern"],
        ["clear", "Klar"],
        ["rain", "Regen"],
        ["thunder", "Gewitter"],
      ],
      "keep"
    )
    .toggle("weatherCycle", "Wetter wechselt", g.doWeatherCycle)
    .toggle("mobs", "Monster/Tiere spawnen", g.doMobSpawning)
    .toggle("fire", "Feuer breitet sich aus", g.doFireTick)
    .toggle("grief", "Creeper & Co. zerstören Blöcke", g.mobGriefing)
    .slider("tick", "Zufalls-Tick (Pflanzenwachstum, 0 = aus)", 0, 20, 1, g.randomTickSpeed)
    .toggle("coords", "Koordinaten anzeigen", g.showCoordinates)
    .show(p);
  if (!r) return;
  if (r.time !== "keep") world.setTimeOfDay(r.time);
  if (r.weather !== "keep") p.dimension.setWeather(r.weather === "clear" ? WeatherType.Clear : r.weather === "rain" ? WeatherType.Rain : WeatherType.Thunder, 20 * 60 * 20);
  g.doDayLightCycle = r.dayCycle;
  g.doWeatherCycle = r.weatherCycle;
  g.doMobSpawning = r.mobs;
  g.doFireTick = r.fire;
  g.mobGriefing = r.grief;
  g.randomTickSpeed = r.tick;
  g.showCoordinates = r.coords;
  msg(p, "Welt-Einstellungen übernommen.");
}

// ---------- Hotbar-Sätze ----------
const HOTBAR_KEY = "axiom:hotbars";

/** @param {import("@minecraft/server").Player} p @returns {(({id:string, n:number}|null)[] | null)[]} */
function loadHotbars(p) {
  try {
    const raw = p.getDynamicProperty(HOTBAR_KEY);
    if (typeof raw === "string") return JSON.parse(raw);
  } catch {}
  return Array(9).fill(null);
}

/** @param {import("../core/state.js").Session} ses */
async function hotbarMenu(ses) {
  const p = ses.player;
  const bars = loadHotbars(p);
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  const describe = (/** @type {({id:string, n:number}|null)[] | null} */ b) =>
    b
      ? b
          .filter(Boolean)
          .map((x) => /** @type {{id:string}} */ (x).id.replace(/^.*:/, ""))
          .slice(0, 4)
          .join(", ") + (b.filter(Boolean).length > 4 ? " …" : "")
      : "§7leer";
  await menu(
    p,
    "Hotbar-Sätze",
    "Wie bei Axiom: bis zu 9 Hotbars speichern und schnell wechseln.\n§7(Gespeichert werden Item-Art und Anzahl – keine Verzauberungen/Namen.)",
    bars.map((b, i) => ({
      text: `Satz ${i + 1}: ${describe(b)}`,
      run: () =>
        menu(p, `Hotbar-Satz ${i + 1}`, describe(b), [
          {
            text: "§aLaden (aktuelle Hotbar ersetzen)",
            run: () => {
              if (!b) return err(p, "Dieser Satz ist leer.");
              for (let s = 0; s < 9; s++) {
                const e = b[s];
                try {
                  inv.setItem(s, e ? new ItemStack(e.id, Math.max(1, e.n)) : undefined);
                } catch {
                  inv.setItem(s, undefined);
                }
              }
              msg(p, `Hotbar-Satz ${i + 1} geladen.`);
            },
          },
          {
            text: "Aktuelle Hotbar hier speichern",
            run: () => {
              const cur = [];
              for (let s = 0; s < 9; s++) {
                const it = inv.getItem(s);
                cur.push(it ? { id: it.typeId, n: it.amount } : null);
              }
              bars[i] = cur;
              p.setDynamicProperty(HOTBAR_KEY, JSON.stringify(bars));
              msg(p, `Hotbar in Satz ${i + 1} gespeichert.`);
            },
          },
          {
            text: "§cSatz leeren",
            run: () => {
              bars[i] = null;
              p.setDynamicProperty(HOTBAR_KEY, JSON.stringify(bars));
            },
          },
        ]),
    }))
  );
}

// ---------- Hilfe ----------
/** @param {import("../core/state.js").Session} ses */
async function helpMenu(ses) {
  const p = ses.player;
  await menu(
    p,
    "Hilfe",
    "§lSteuerung (Controller)§r\n" +
      "§eBenutzen§r (linker Trigger) = Werkzeug-Aktion\n" +
      "§eSchleichen + Benutzen§r = Werkzeug-Einstellungen\n" +
      "§eSchlagen§r (rechter Trigger) auf Block = Pipette (Block als Muster übernehmen) bzw. Zusatzaktion\n\n" +
      "§lAblauf§r\n1. Mit Box-/Magischer/Pinsel-Auswahl etwas auswählen\n2. Im Axiom-Menü → Auswahl bearbeiten\n3. Kopieren → mit dem Baumeister einfügen\n4. Fehler? Rückgängig-Werkzeug benutzen\n\n" +
      "§lChat-Befehle§r (PC/Handy): /axiom:menu, /axiom:undo, /axiom:redo, /axiom:tools\n\nWähle ein Werkzeug für Details:",
    TOOL_LIST.map((t) => ({ text: t.name, run: () => menu(p, t.name, t.help, [{ text: "OK", run: () => helpMenu(ses) }]) }))
  );
}

