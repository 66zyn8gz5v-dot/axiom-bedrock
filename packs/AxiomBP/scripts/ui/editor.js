// Editor-Modus (wie bei der Axiom-Mod, nur einfacher): Die Hotbar wird zur Werkzeugleiste (Tasten 1–9),
// Platz 9 öffnet die Übersicht mit allen Werkzeugen und Aktionen. Dazu eine Vogelperspektive von oben.
import { ItemStack, system } from "@minecraft/server";
import { markDirty } from "../core/state.js";
import { err, msg } from "../core/util.js";
import { formatPattern } from "../core/pattern.js";
import { menu } from "./forms.js";

const SAVE_KEY = "axiom:editorSave";

/** Standard-Werkzeugleiste (Platz 1–8; Platz 9 ist immer die Übersicht). */
export const DEFAULT_BAR = [
  "axiom:box_select",
  "axiom:shape",
  "axiom:terrain",
  "axiom:sculpt",
  "axiom:painter",
  "axiom:builder",
  "axiom:path",
  "axiom:undo",
];

/** Gruppen für die Übersicht. */
const GROUPS = /** @type {[string, string[]][]} */ ([
  ["Auswählen", ["axiom:box_select", "axiom:magic_select", "axiom:brush_select"]],
  ["Bauen", ["axiom:shape", "axiom:builder", "axiom:extrude", "axiom:path", "axiom:text"]],
  ["Gelände", ["axiom:terrain", "axiom:sculpt", "axiom:painter"]],
  ["Sonstiges", ["axiom:ruler", "axiom:tinker", "axiom:bulldozer", "axiom:entity", "axiom:undo", "axiom:guide"]],
]);

/** @type {Map<string, (ItemStack|undefined)[]>} gespeicherte Hotbar (vollständige Items, auch Verzauberungen) */
const saved = new Map();

/** @param {import("@minecraft/server").Player} p */
function inventory(p) {
  return p.getComponent("minecraft:inventory")?.container;
}

/** Werkzeug-Item, das nicht verschoben oder fallen gelassen werden kann. @param {string} id */
function lockedTool(id) {
  const it = new ItemStack(id, 1);
  try {
    it.lockMode = /** @type {import("@minecraft/server").ItemLockMode} */ ("slot");
    it.keepOnDeath = true;
  } catch {}
  return it;
}

/** @param {import("../core/state.js").Session} ses */
export function editorBar(ses) {
  const bar = ses.s.editorBar;
  return Array.isArray(bar) && bar.length === 8 ? bar : [...DEFAULT_BAR];
}

/** Hotbar mit der Werkzeugleiste füllen. @param {import("../core/state.js").Session} ses */
function fillBar(ses) {
  const inv = inventory(ses.player);
  if (!inv) return;
  const bar = editorBar(ses);
  for (let s = 0; s < 8; s++) inv.setItem(s, bar[s] ? lockedTool(bar[s]) : undefined);
  inv.setItem(8, lockedTool("axiom:menu"));
}

/** @param {import("../core/state.js").Session} ses */
export function isEditor(ses) {
  return saved.has(ses.player.id);
}

/** Editor-Modus an/aus. @param {import("../core/state.js").Session} ses */
export function toggleEditor(ses) {
  const p = ses.player;
  const inv = inventory(p);
  if (!inv) return;
  if (isEditor(ses)) {
    const items = saved.get(p.id) ?? [];
    for (let s = 0; s < 9; s++) inv.setItem(s, items[s]);
    saved.delete(p.id);
    p.setDynamicProperty(SAVE_KEY, undefined);
    setBirdsEye(ses, false);
    msg(p, "Editor-Modus §caus§r – deine Hotbar ist wieder da.");
    return;
  }
  /** @type {(ItemStack|undefined)[]} */
  const items = [];
  for (let s = 0; s < 9; s++) items.push(inv.getItem(s));
  saved.set(p.id, items);
  // Notfall-Kopie (falls das Spiel im Editor-Modus beendet wird): Art, Anzahl, Name
  p.setDynamicProperty(SAVE_KEY, JSON.stringify(items.map((it) => (it ? { id: it.typeId, n: it.amount, name: it.nameTag } : null))));
  fillBar(ses);
  p.selectedSlotIndex = 0;
  msg(p, "Editor-Modus §aan§r: Tasten §e1–8§r = Werkzeuge, §e9§r = Übersicht (alle Werkzeuge & Aktionen).");
}

/** Nach dem Beitreten: Hotbar zurückgeben, falls das Spiel im Editor-Modus beendet wurde. @param {import("@minecraft/server").Player} p */
export function restoreAfterJoin(p) {
  const raw = p.getDynamicProperty(SAVE_KEY);
  if (typeof raw !== "string") return;
  p.setDynamicProperty(SAVE_KEY, undefined);
  const inv = inventory(p);
  if (!inv) return;
  try {
    /** @type {({id:string, n:number, name?:string}|null)[]} */
    const items = JSON.parse(raw);
    for (let s = 0; s < 9; s++) {
      const e = items[s];
      let it;
      if (e) {
        try {
          it = new ItemStack(e.id, Math.max(1, e.n));
          if (e.name) it.nameTag = e.name;
        } catch {}
      }
      inv.setItem(s, it);
    }
    msg(p, "Editor-Modus beendet – deine Hotbar wurde wiederhergestellt.");
  } catch {}
}

/** Vogelperspektive: Kamera schwebt über dir und schaut nach unten. @param {import("../core/state.js").Session} ses @param {boolean} on */
export function setBirdsEye(ses, on) {
  ses.birdsEye = on ? { height: ses.birdsEye?.height ?? 24 } : undefined;
  if (!on) {
    try {
      ses.player.camera.clear();
    } catch {}
    return;
  }
  updateBirdsEye(ses, true);
}

/** Kamera nachführen (aus der Tick-Schleife). @param {import("../core/state.js").Session} ses @param {boolean} [instant] */
export function updateBirdsEye(ses, instant = false) {
  const b = ses.birdsEye;
  if (!b) return;
  const p = ses.player;
  const l = p.location;
  try {
    p.camera.setCamera("minecraft:free", {
      location: { x: l.x, y: l.y + b.height, z: l.z },
      rotation: { x: 90, y: p.getRotation().y },
      easeOptions: { easeTime: instant ? 0.3 : 0.5, easeType: /** @type {import("@minecraft/server").EasingType} */ ("Linear") },
    });
  } catch {}
}

/** Werkzeug in die Leiste (Editor) bzw. in die Hand legen. @param {import("../core/state.js").Session} ses @param {import("../tools/registry.js").Tool} t */
function pickTool(ses, t) {
  const p = ses.player;
  const inv = inventory(p);
  if (!inv) return;
  if (isEditor(ses)) {
    let slot = p.selectedSlotIndex;
    if (slot === 8) {
      // Platz 9 bleibt die Übersicht: vorhandenen Platz mit dem Werkzeug nehmen, sonst Platz 1
      const bar = editorBar(ses);
      slot = Math.max(0, bar.indexOf(t.id));
    }
    const bar = editorBar(ses);
    bar[slot] = t.id;
    ses.s.editorBar = bar;
    markDirty(ses);
    inv.setItem(slot, lockedTool(t.id));
    p.selectedSlotIndex = slot;
    msg(p, `§e${t.name}§r auf Taste §e${slot + 1}§r: ${t.help}`);
    return;
  }
  // Ohne Editor: in die Hand, falls frei – sonst ins Inventar
  const slot = p.selectedSlotIndex;
  if (!inv.getItem(slot)) inv.setItem(slot, new ItemStack(t.id, 1));
  else inv.addItem(new ItemStack(t.id, 1));
  msg(p, `§e${t.name}§r: ${t.help}`);
}

/**
 * Die Übersicht: alle Werkzeuge mit Bild, nach Gruppen, plus die wichtigsten Aktionen.
 * @param {import("../core/state.js").Session} ses
 */
export async function overviewMenu(ses) {
  const p = ses.player;
  const { TOOLS } = await import("../tools/index.js");
  const { mainMenu, openSection } = await import("./main.js");
  const { doUndo } = await import("../tools/misc.js");
  const ed = isEditor(ses);
  /** @type {{text?:string, icon?:string, header?:string, run?:() => any}[]} */
  const entries = [];
  for (const [group, ids] of GROUPS) {
    entries.push({ header: group });
    for (const id of ids) {
      const t = TOOLS.get(id);
      if (t) entries.push({ text: t.name, icon: "textures/items/" + id.replace("axiom:", "axiom_"), run: () => pickTool(ses, t) });
    }
  }
  entries.push({ header: "Aktionen" });
  entries.push(
    { text: "Auswahl bearbeiten", icon: "textures/items/axiom_box_select", run: () => openSection(ses, "selection") },
    { text: "Block / Muster wählen", icon: "textures/blocks/stone", run: () => openSection(ses, "pattern") },
    { text: "Rückgängig", icon: "textures/items/axiom_undo", run: () => doUndo(p, false) },
    { text: "Wiederherstellen", run: () => doUndo(p, true) },
    { text: ses.birdsEye ? "§cVogelperspektive aus" : "Vogelperspektive (von oben schauen)", run: () => birdsEyeMenu(ses) },
    { text: ed ? "§cEditor-Modus aus (Hotbar zurück)" : "§aEditor-Modus an (Werkzeugleiste 1–9)", run: () => toggleEditor(ses) },
    { text: "Alle Menüs (Axiom-Hauptmenü)", icon: "textures/items/axiom_menu", run: () => mainMenu(ses) }
  );
  if (ed) entries.push({ text: "Werkzeugleiste zurücksetzen", run: () => resetBar(ses) });
  await menu(
    p,
    "§l§dAxiom-Übersicht",
    `${ed ? "Werkzeug antippen = auf die gewählte Taste legen." : "Werkzeug antippen = in die Hand nehmen."}\nMuster: §e${formatPattern(ses.s.pattern)}`,
    entries
  );
}

/** @param {import("../core/state.js").Session} ses */
function resetBar(ses) {
  ses.s.editorBar = [...DEFAULT_BAR];
  markDirty(ses);
  fillBar(ses);
  msg(ses.player, "Werkzeugleiste zurückgesetzt.");
}

/** @param {import("../core/state.js").Session} ses */
async function birdsEyeMenu(ses) {
  const p = ses.player;
  if (ses.birdsEye) {
    setBirdsEye(ses, false);
    return msg(p, "Vogelperspektive aus.");
  }
  await menu(p, "Vogelperspektive", "Die Kamera schwebt über dir und schaut nach unten – gut, um einen großen Bau zu überblicken. Laufen bewegt die Ansicht mit.\n§7Zum Bauen wieder ausschalten (Übersicht → Vogelperspektive aus).", [
    { text: "Niedrig (12 Blöcke)", run: () => startBirds(ses, 12) },
    { text: "Mittel (24 Blöcke)", run: () => startBirds(ses, 24) },
    { text: "Hoch (48 Blöcke)", run: () => startBirds(ses, 48) },
  ]);
}

/** @param {import("../core/state.js").Session} ses @param {number} h */
function startBirds(ses, h) {
  ses.birdsEye = { height: h };
  setBirdsEye(ses, true);
  if (!ses.birdsEye) return err(ses.player, "Vogelperspektive geht hier nicht.");
  system.run(() => msg(ses.player, `Vogelperspektive an (${h} Blöcke hoch).`));
}
