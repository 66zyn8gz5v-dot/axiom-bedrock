// Automatischer Rundum-Test aller Werkzeuge gegen die API-Attrappe.
// Aufruf: node --import ./tests/register.mjs tests/run.mjs
import { world, system, Player, ItemStack, drain, tickIntervals, BlockPermutation } from "@minecraft/server";
import { answers } from "@minecraft/server-ui";

// Startup-Ereignis simulieren, bevor das Add-on geladen wird, damit Befehle registriert werden
const commands = new Map();
await import("../packs/AxiomBP/scripts/main.js");
system.beforeEvents.startup._fire({
  customCommandRegistry: {
    registerCommand: (def, fn) => commands.set(def.name, fn),
    registerEnum() {},
  },
});

const { getSession } = await import("../packs/AxiomBP/scripts/core/state.js");
const ops = await import("../packs/AxiomBP/scripts/core/selops.js");
const { getHistory } = await import("../packs/AxiomBP/scripts/core/history.js");
const { parsePattern, formatPattern } = await import("../packs/AxiomBP/scripts/core/pattern.js");
const { transformPoint, rotatedSize } = await import("../packs/AxiomBP/scripts/core/clipboard.js");
const { boxSel } = await import("../packs/AxiomBP/scripts/core/selection.js");

const dim = world.getDimension("minecraft:overworld");
const player = new Player("Tester", dim);
world.players.push(player);
world.afterEvents.playerSpawn._fire({ player, initialSpawn: true });
await drain();

let failures = 0;
let passed = 0;
function check(cond, name) {
  if (cond) passed++;
  else {
    failures++;
    console.log("  ✗ " + name);
  }
}
const eqSnap = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

function hold(id) {
  player.inventory.setItem(0, new ItemStack(id, 1));
  player.selectedSlotIndex = 0;
}
async function use(id, pos, { face = "Up", sneak = false, air = false } = {}) {
  hold(id);
  player.isSneaking = sneak;
  player.rayHit = air ? undefined : { pos, face };
  system.currentTick += 40;
  world.afterEvents.itemUse._fire({ source: player, itemStack: player.inventory.getItem(0) });
  await drain();
  player.isSneaking = false;
}
async function hit(id, pos) {
  hold(id);
  system.currentTick += 40;
  world.afterEvents.entityHitBlock._fire({ damagingEntity: player, hitBlock: dim.getBlock(pos), hitBlockPermutation: dim.getBlock(pos).permutation });
  await drain();
}
async function undo() {
  await use("axiom:undo", { x: 0, y: 64, z: 0 });
}
async function redo() {
  await use("axiom:undo", { x: 0, y: 64, z: 0 }, { sneak: true });
}

/** Führt eine Aktion aus, prüft dass sich etwas geändert hat und dass Rückgängig/Wiederherstellen stimmt. */
async function roundTrip(name, action, { expectChange = true } = {}) {
  const before = dim.snapshot();
  const msgs = player.messages.length;
  const f0 = failures;
  try {
    await action();
    await drain();
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}: Ausnahme ${e.stack}`);
    return;
  }
  const errs = player.messages.slice(msgs).filter((m) => m.includes("§c"));
  check(errs.length === 0, `${name}: Fehlermeldung ${errs.join(" | ")}`);
  const after = dim.snapshot();
  const changed = !eqSnap(before, after);
  check(changed === expectChange, `${name}: Änderung erwartet=${expectChange}, war=${changed}`);
  if (!expectChange) return;
  await undo();
  check(eqSnap(before, dim.snapshot()), `${name}: Rückgängig stellt Welt nicht wieder her`);
  await redo();
  check(eqSnap(after, dim.snapshot()), `${name}: Wiederherstellen ergibt anderen Zustand`);
  await undo();
  check(eqSnap(before, dim.snapshot()), `${name}: zweites Rückgängig fehlerhaft`);
  if (failures === f0) console.log(`  ✓ ${name}`);
}

const ses = getSession(player);
const G = { x: 0, y: 64, z: 0 };

console.log("Muster");
check(formatPattern(parsePattern("3*stone, andesite")) === "3*stone, andesite", "Muster Format");
check(parsePattern("oak_log[pillar_axis=x]")[0].states.pillar_axis === "x", "Muster Zustand");
let threw = false;
try {
  parsePattern("diamond_sword");
} catch {
  threw = true;
}
check(threw, "Muster: Nicht-Block wird abgelehnt");

console.log("Zwischenablage-Transformation (Kacheln)");
for (const rot of [0, 90, 180, 270])
  for (const mir of ["None", "X", "Z", "XZ"]) {
    const size = { x: 70, y: 3, z: 130 };
    const rs = rotatedSize(size, rot);
    const seen = new Set();
    // jeder Punkt muss auf einen eindeutigen Punkt innerhalb der gedrehten Größe abgebildet werden
    let ok = true;
    for (let x = 0; x < size.x; x += 3)
      for (let z = 0; z < size.z; z += 3) {
        const p = transformPoint({ x, y: 0, z }, size, rot, mir);
        if (p.x < 0 || p.z < 0 || p.x >= rs.x || p.z >= rs.z) ok = false;
        const k = p.x + "," + p.z;
        if (seen.has(k)) ok = false;
        seen.add(k);
      }
    check(ok, `transformPoint ${rot} ${mir}`);
  }

console.log("Formen");
for (const type of ["sphere", "hemisphere", "cuboid", "cylinder", "cone", "pyramid", "torus", "arch"]) {
  Object.assign(ses.s.shape, { type, rx: 4, ry: 3, rz: 4, hollow: type === "sphere", thick: 1, anchor: "center" });
  await roundTrip("Form " + type, () => use("axiom:shape", G));
}
Object.assign(ses.s.shape, { type: "sphere", rx: 28, ry: 28, rz: 28, hollow: false });
await roundTrip("Große Kugel (Struktur-Verlauf)", () => use("axiom:shape", G));
Object.assign(ses.s.shape, { type: "sphere", rx: 3, ry: 3, rz: 3, anchor: "base" });
await roundTrip("Form in der Luft", () => use("axiom:shape", G, { air: true }));

console.log("Modellieren");
for (const mode of ["add", "remove", "smooth", "melt", "fill", "rock", "roughen"]) {
  ses.s.sculpt.mode = mode;
  ses.s.sculpt.radius = 4;
  // Für Glätten/Schmelzen/Auffüllen erst eine Kante bauen
  if (["smooth", "melt", "fill"].includes(mode)) {
    Object.assign(ses.s.shape, { type: "cuboid", rx: 2, ry: 2, rz: 2, hollow: false, anchor: "base" });
    await use("axiom:shape", G);
    if (mode === "fill") {
      ses.s.sculpt.mode = "remove";
      ses.s.sculpt.radius = 1;
      await use("axiom:sculpt", { x: 0, y: 66, z: 0 });
      ses.s.sculpt.mode = "fill";
      ses.s.sculpt.radius = 4;
    }
  }
  await roundTrip("Modellieren " + mode, () => use("axiom:sculpt", { x: 0, y: 66, z: 0 }));
}
ses.s.sculpt.noise = true;
ses.s.sculpt.mode = "add";
await roundTrip("Modellieren add + Rauschen", () => use("axiom:sculpt", G));
ses.s.sculpt.noise = false;

console.log("Maler");
ses.s.pattern2 = parsePattern("andesite");
for (const mode of ["surface", "top", "replace", "noise", "gradient"]) {
  ses.s.painter.mode = mode;
  ses.s.pattern = parsePattern("stone, cobblestone");
  await roundTrip("Maler " + mode, () => use("axiom:painter", G));
}
// Säubern: erst Gras setzen
dim._set(1, 65, 1, BlockPermutation.resolve("minecraft:short_grass"));
ses.s.painter.mode = "clean";
await roundTrip("Maler clean", () => use("axiom:painter", G));
dim.blocks.clear();

console.log("Terrain");
for (const mode of ["raise", "lower", "flatten", "smooth", "hills", "terrace"]) {
  ses.s.terrain.mode = mode;
  ses.s.terrain.strength = 3;
  if (mode === "flatten" || mode === "smooth" || mode === "terrace") {
    ses.s.terrain.mode = "raise";
    await use("axiom:terrain", { x: 3, y: 64, z: 3 });
    ses.s.terrain.mode = mode;
  }
  await roundTrip("Terrain " + mode, () => use("axiom:terrain", mode === "flatten" ? { x: 0, y: 62, z: 0 } : G));
}
dim.blocks.clear();

console.log("Extrudieren / Bulldozer / Pfad / Text / Blockzustand");
ses.s.extrude.mode = "push";
await roundTrip("Extrudieren", () => use("axiom:extrude", G));
ses.s.extrude.mode = "pull";
await roundTrip("Eindrücken", () => use("axiom:extrude", G));
ses.s.bulldozer.radius = 2;
await roundTrip("Bulldozer", () => use("axiom:bulldozer", G));
await roundTrip("Pfad", async () => {
  ses.pathPoints = [];
  await use("axiom:path", { x: 0, y: 64, z: 0 });
  await use("axiom:path", { x: 10, y: 70, z: 5 });
  await use("axiom:path", { x: 20, y: 64, z: -5 });
  answers.push({ selectText: "Pfad bauen" });
  await use("axiom:path", G, { sneak: true });
});
for (const orient of ["wall", "floor"]) {
  ses.s.text.orient = orient;
  ses.s.text.text = "Hallo Welt!";
  await roundTrip("Text " + orient, () => use("axiom:text", G));
}
dim._set(2, 65, 2, BlockPermutation.resolve("minecraft:oak_log"));
const baseSnap = dim.snapshot();
answers.push({ set: { pillar_axis: "x" } });
await roundTrip("Blockzustand-Editor", () => use("axiom:tinker", { x: 2, y: 65, z: 2 }));
await roundTrip("Blockzustand drehen (Schlagen)", () => hit("axiom:tinker", { x: 2, y: 65, z: 2 }));
check(eqSnap(baseSnap, dim.snapshot()), "Blockzustand: Ausgangszustand");
dim.blocks.clear();

console.log("Auswahl");
await use("axiom:box_select", { x: -3, y: 60, z: -3 });
await use("axiom:box_select", { x: 3, y: 66, z: 4 });
check(ses.sel && ses.sel.kind === "box" && ses.sel.max.z === 4, "Box-Auswahl");
ses.s.pattern = parsePattern("glass");
await roundTrip("Füllen (schnell)", () => ops.opFill(ses));
ses.s.pattern = parsePattern("glass, stone");
await roundTrip("Füllen (Muster)", () => ops.opFill(ses));
ses.s.pattern = parsePattern("gold_block");
await roundTrip("Ersetzen", () => ops.opReplace(ses, ["minecraft:dirt"]));
await roundTrip("Leeren", () => ops.opClear(ses));
for (const k of ["walls", "outline", "hollow"]) await roundTrip("Hülle " + k, () => ops.opShell(ses, k));
await roundTrip("Überziehen", () => ops.opOverlay(ses, 2));
await roundTrip("Natürlich machen", () => ops.opNaturalize(ses));
ses.s.shape = { ...ses.s.shape, type: "cuboid", rx: 1, ry: 3, rz: 1, anchor: "base", hollow: false };
await use("axiom:shape", G);
await roundTrip("Glätten", () => ops.opSmooth(ses, 3));
await roundTrip("Stapeln", () => ops.opStack(ses, { x: 1, y: 0, z: 0 }, 3, 1));
await roundTrip("Verschieben", async () => {
  const s0 = ses.sel;
  await ops.opMove(ses, { x: 0, y: 0, z: -1 }, 5);
  await drain();
  ses.sel = s0;
});
await roundTrip("Drehen 90", async () => {
  const s0 = ses.sel;
  ops.opTransform(ses, 90, "None");
  await drain();
  ses.sel = s0;
});
dim._set(-3, 65, -3, BlockPermutation.resolve("minecraft:gold_block"));
await roundTrip("Spiegeln", async () => {
  const s0 = ses.sel;
  ops.opTransform(ses, 0, "X");
  await drain();
  ses.sel = s0;
});
ops.opAnalyze(ses);
await drain();
check(player.messages.some((m) => m.includes("Analyse")), "Analyse");
await roundTrip("Kopieren (keine Änderung)", () => ops.opCopy(ses, false), { expectChange: false });
await roundTrip("Einfügen (Baumeister)", () => use("axiom:builder", { x: 20, y: 64, z: 20 }));
ses.s.paste.rotation = 90;
ses.s.paste.air = false;
await roundTrip("Einfügen gedreht ohne Luft", () => use("axiom:builder", { x: 20, y: 64, z: 20 }));
ses.s.paste = { air: true, rotation: 0, mirror: "None", entities: false, offsetY: 0 };
await roundTrip("Ausschneiden", () => ops.opCopy(ses, true));
// Große Zwischenablage über mehrere Kacheln
ses.sel = boxSel(dim.id, { x: 0, y: 60, z: 0 }, { x: 80, y: 66, z: 70 });
ops.opCopy(ses, false);
await drain();
await roundTrip("Große Zwischenablage einfügen (Kacheln)", () => use("axiom:builder", { x: 200, y: 64, z: 200 }));
ses.s.paste.rotation = 270;
ses.s.paste.mirror = "X";
await roundTrip("Große Zwischenablage gedreht+gespiegelt", () => use("axiom:builder", { x: 200, y: 64, z: 200 }));
ses.s.paste = { air: true, rotation: 0, mirror: "None", entities: false, offsetY: 0 };

console.log("Magische & Pinsel-Auswahl");
dim.blocks.clear();
ses.s.selMode = "set";
ses.s.magic.mode = "surface";
ses.s.magic.limit = 500;
await use("axiom:magic_select", G);
check(ses.sel && ses.sel.kind === "set" && ses.sel.keys.size === 500, "Magische Auswahl (Oberfläche, Limit) " + ses.sel?.kind + " " + ses.sel?.keys?.size + " " + player.messages.slice(-2).join("|"));
ses.s.magic.mode = "same";
ses.s.magic.limit = 2000;
await use("axiom:magic_select", G);
check(ses.sel && ses.sel.kind === "set" && ses.sel.keys.size > 100, "Magische Auswahl (gleich)");
ses.s.pattern = parsePattern("diamond_block");
await roundTrip("Füllen freie Auswahl", () => ops.opFill(ses));
await roundTrip("Kopieren freie Auswahl + Einfügen", async () => {
  ops.opCopy(ses, false);
  await drain();
  await use("axiom:builder", { x: -50, y: 64, z: -50 });
});
ses.s.brushSel.radius = 2;
await use("axiom:brush_select", G);
const n1 = ses.sel.keys.size;
ses.s.selMode = "add";
await use("axiom:brush_select", { x: 3, y: 64, z: 0 });
check(ses.sel.keys.size !== n1, "Pinsel-Auswahl wächst beim Weitermalen");
ses.s.selMode = "sub";
await use("axiom:magic_select", G);
check(true, "Auswahl-Subtraktion ohne Fehler");
ses.s.selMode = "set";

console.log("Blaupausen");
ses.sel = boxSel(dim.id, { x: 0, y: 64, z: 0 }, { x: 2, y: 66, z: 2 });
ops.opCopy(ses, false);
await drain();
const { saveBlueprint, listBlueprints, loadBlueprint } = await import("../packs/AxiomBP/scripts/core/clipboard.js");
saveBlueprint(player, "Mein Häuschen");
check(listBlueprints().some((b) => b.name === "mein_haeuschen"), "Blaupause gespeichert");
loadBlueprint(player, "mein_haeuschen");
await roundTrip("Blaupause einfügen", () => use("axiom:builder", { x: 40, y: 64, z: 40 }));

console.log("Fähigkeiten & Symmetrie");
ses.s.symmetry = { x: true, z: true, center: { x: 0, y: 64, z: 0 } };
Object.assign(ses.s.shape, { type: "cuboid", rx: 0, ry: 0, rz: 0, anchor: "center" });
ses.s.pattern = parsePattern("red_wool");
await roundTrip("Symmetrie (4 Blöcke)", () => use("axiom:shape", { x: 5, y: 70, z: 3 }));
await use("axiom:shape", { x: 5, y: 70, z: 3 });
check(dim._get(-5, 70, -3).type.id === "minecraft:red_wool" && dim._get(5, 70, -3).type.id === "minecraft:red_wool", "Symmetrie spiegelt");
await undo();
ses.s.symmetry = { x: false, z: false, center: null };
dim.blocks.clear();
ses.s.caps.angel = true;
hold("minecraft:stone");
player.rayHit = undefined;
world.afterEvents.itemUse._fire({ source: player, itemStack: new ItemStack("minecraft:bricks") });
await drain();
check(dim.blocks.size === 1, "Engel-Platzierung " + dim.blocks.size + " " + [...dim.blocks.keys()].slice(0, 5).join(" ") + player.messages.slice(-2).join("|"));
await undo();
check(dim.blocks.size === 0, "Engel-Platzierung rückgängig");
ses.s.caps.replace = true;
const ev = { itemStack: new ItemStack("minecraft:bricks"), player, block: dim.getBlock(G), isFirstEvent: true, cancel: false };
world.beforeEvents.playerInteractWithBlock._fire(ev);
await drain();
check(ev.cancel && dim._get(0, 64, 0).type.id === "minecraft:bricks", "Ersetzen-Modus");
await undo();
ses.s.caps.replace = false;

console.log("Menüs");
answers.push({ selectText: "Werkzeuge holen" }, { selectText: "Alle Werkzeuge" });
await use("axiom:menu", G);
const inv = player.inventory.items.filter(Boolean).map((i) => i.typeId);
check(inv.includes("axiom:sculpt") && inv.includes("axiom:undo"), "Alle Werkzeuge geben");
player.inventory.items.fill(undefined);
for (const [label, extra] of [
  ["Fähigkeiten", [{ set: { Reichweite: 200 } }]],
  ["Welt", [{ set: { Tageszeit: "Mittag" } }]],
  ["Symmetrie", [{ set: { "Nord-Süd": true } }]],
  ["Maske", [{ set: { "Welche Blöcke": "Nur feste" } }]],
  ["Hotbar-Sätze", [{ selectText: "Satz 1" }, { selectText: "speichern" }]],
  ["Verlauf", [{ selectText: "Rückgängig" }]],
  ["Hilfe", [{ selectText: "Formen" }, { selectText: "OK" }]],
  ["Block / Muster", [{ selectText: "Als Text" }, { set: { Blöcke: "2*stone, dirt" } }]],
  ["Zwischenablage", [{ selectText: "Blaupause laden" }, { selectText: "mein_haeuschen" }]],
]) {
  const m0 = player.messages.length;
  answers.push({ selectText: label }, ...extra);
  try {
    await use("axiom:menu", G);
    const errs = player.messages.slice(m0).filter((m) => m.includes("§c"));
    check(errs.length === 0 && answers.length === 0, `Menü ${label} (${errs.join("|")}, offene Antworten ${answers.length})`);
  } catch (e) {
    check(false, `Menü ${label}: ${e}`);
  }
  answers.length = 0;
}
check(ses.s.reach === 200, "Fähigkeiten übernommen");
check(formatPattern(ses.s.pattern) === "2*stone, dirt", "Muster per Menü");
ses.s.mask = { mode: "none", ids: [] };
ses.s.symmetry = { x: false, z: false, center: null };

// Werkzeug-Einstellungsmenüs (Schleichen+Benutzen) einmal öffnen
const { TOOL_LIST } = await import("../packs/AxiomBP/scripts/tools/index.js");
for (const t of TOOL_LIST) {
  if (t.noSneakMenu) continue;
  answers.push({ set: {} }, { canceled: true });
  try {
    await use(t.id, G, { sneak: true });
    check(true, "");
  } catch (e) {
    check(false, `Einstellungsmenü ${t.name}: ${e}`);
  }
  answers.length = 0;
}

console.log("Tick-Schleife / Anzeige");
ses.sel = boxSel(dim.id, { x: 0, y: 64, z: 0 }, { x: 5, y: 66, z: 5 });
for (const t of TOOL_LIST) {
  hold(t.id);
  try {
    tickIntervals(10);
  } catch (e) {
    check(false, `HUD ${t.name}: ${e}`);
  }
}
check(typeof player.actionBar === "string" && player.actionBar.length > 0, "Aktionsleiste");

console.log("Chat-Befehle");
for (const name of ["axiom:tools", "axiom:undo", "axiom:menu"]) {
  const fn = commands.get(name);
  check(!!fn, "Befehl registriert: " + name);
  if (fn) fn({ sourceEntity: player });
  await drain();
}

console.log(`\n${passed} bestanden, ${failures} fehlgeschlagen`);
console.log(`Verlaufseinträge: ${getHistory(player.id).undo.length}`);
process.exit(failures ? 1 : 0);
