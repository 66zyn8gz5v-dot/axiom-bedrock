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
    // Aktion starten, Jobs abarbeiten, dann auf das Ergebnis warten (Jobs laufen erst bei drain)
    const pending = Promise.resolve(action());
    await drain();
    await pending;
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
for (const type of ["sphere", "hemisphere", "cuboid", "cylinder", "cone", "pyramid", "torus", "arch", "prism", "spiral"]) {
  Object.assign(ses.s.shape, { type, rx: 4, ry: 3, rz: 4, hollow: type === "sphere", thick: 1, anchor: "center" });
  await roundTrip("Form " + type, () => use("axiom:shape", G));
}
Object.assign(ses.s.shape, { type: "sphere", rx: 28, ry: 28, rz: 28, hollow: false });
await roundTrip("Große Kugel (Struktur-Verlauf)", () => use("axiom:shape", G));
Object.assign(ses.s.shape, { type: "sphere", rx: 3, ry: 3, rz: 3, anchor: "base" });
await roundTrip("Form in der Luft", () => use("axiom:shape", G, { air: true }));

console.log("Modellieren");
for (const mode of ["add", "remove", "smooth", "melt", "fill", "rock", "roughen", "distort", "shatter"]) {
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
for (const mode of ["surface", "top", "replace", "noise", "gradient", "slope"]) {
  ses.s.painter.mode = mode;
  ses.s.pattern = parsePattern("stone, cobblestone");
  await roundTrip("Maler " + mode, () => use("axiom:painter", G));
}
ses.s.painter.mode = "scatter";
ses.s.painter.density = 50;
ses.s.pattern = parsePattern("short_grass, poppy");
await roundTrip("Maler scatter", () => use("axiom:painter", G));
// Flutfüllung: Becken ausheben und mit Wasser füllen
{
  dim.blocks.clear();
  ses.s.pattern = parsePattern("air");
  Object.assign(ses.s.shape, { type: "cuboid", rx: 2, ry: 1, rz: 2, hollow: false, anchor: "center", look: false });
  await use("axiom:shape", { x: 0, y: 63, z: 0 }); // Grube 5x3x5 (y 62..64)
  ses.s.painter.mode = "flood";
  ses.s.pattern = parsePattern("water");
  await roundTrip("Flutfüllung Becken", () => use("axiom:painter", { x: 0, y: 61, z: 0 }));
  await use("axiom:painter", { x: 0, y: 61, z: 0 });
  check(dim._get(0, 62, 0).type.id === "minecraft:water" && dim._get(0, 65, 0).type.id === "minecraft:air", "Flutfüllung füllt nur bis Starthöhe");
  await undo();
  // Undichtes Becken (offene Oberfläche) -> keine Änderung
  ses.s.painter.floodLimit = 500;
  const snap = dim.snapshot();
  system.currentTick += 100;
  await use("axiom:painter", { x: 0, y: 64, z: 0 });
  check(eqSnap(snap, dim.snapshot()) && player.messages.at(-1).includes("nicht dicht"), "Flutfüllung: undichtes Becken abgelehnt");
  ses.s.painter.floodLimit = 20000;
  await undo();
  dim.blocks.clear();
}
// Säubern: erst Gras setzen
dim._set(1, 65, 1, BlockPermutation.resolve("minecraft:short_grass"));
ses.s.painter.mode = "clean";
await roundTrip("Maler clean", () => use("axiom:painter", G));
dim.blocks.clear();

console.log("Terrain");
for (const mode of ["raise", "lower", "flatten", "smooth", "hills", "terrace", "mountain", "crater", "volcano", "mesa", "island", "canyon"]) {
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
await roundTrip("Pfad flach mit Unterbau (Rampe)", async () => {
  ses.pathPoints = [];
  ses.s.path.flat = true;
  ses.s.path.support = true;
  await use("axiom:path", { x: 0, y: 64, z: 0 });
  await use("axiom:path", { x: 12, y: 72, z: 0 });
  answers.push({ selectText: "Pfad bauen" });
  await use("axiom:path", G, { sneak: true });
  ses.s.path.flat = false;
  ses.s.path.support = false;
});
check(true, "");
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
await roundTrip("Mit Wasser füllen", () => ops.opFlood(ses));
ops.opFlood(ses);
await drain();
await roundTrip("Wasser ablassen", () => ops.opDrain(ses));
await undo();
{
  const s0 = ses.sel;
  ops.selGrow(ses, 2);
  check(ses.sel.min.x === s0.min.x - 2 && ses.sel.max.y === s0.max.y + 2, "Box aufblasen");
  ses.sel = s0;
  ops.selSurface(ses);
  check(ses.sel.kind === "set" && [...ses.sel.keys].every((k) => k.split(",")[1] === "64"), "Auf Oberfläche begrenzen");
  const n0 = ses.sel.keys.size;
  ops.selGrow(ses, 1);
  const n1 = ses.sel.keys.size;
  ops.selGrow(ses, -1);
  check(n1 > n0 && ses.sel.keys.size <= n1, "Freie Auswahl aufblasen/schrumpfen");
  ses.sel = s0;
}
// Hohlraum: hohle Kugel bauen und innen füllen
{
  const s0 = ses.sel;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, hollow: true, thick: 1, anchor: "center" });
  ses.s.pattern = parsePattern("stone");
  await use("axiom:shape", { x: 0, y: 80, z: 0 });
  ses.sel = boxSel(dim.id, { x: -6, y: 74, z: -6 }, { x: 6, y: 86, z: 6 });
  ses.s.pattern = parsePattern("sponge");
  await roundTrip("Hohlräume füllen", () => ops.opFillEnclosed(ses));
  ops.opFillEnclosed(ses);
  await drain();
  check(dim._get(0, 80, 0).type.id === "minecraft:sponge" && dim._get(0, 86, 0).type.id === "minecraft:air", "Hohlraum innen gefüllt, außen frei");
  await undo();
  await undo();
  ses.sel = s0;
}
await roundTrip("Natürlich machen", () => ops.opNaturalize(ses));
ses.s.shape = { ...ses.s.shape, type: "cuboid", rx: 1, ry: 3, rz: 1, anchor: "base", hollow: false };
await use("axiom:shape", G);
await roundTrip("Glätten", () => ops.opSmooth(ses, 3));
await roundTrip("Stapeln", () => ops.opStack(ses, { x: 1, y: 0, z: 0 }, 3, 1));
await roundTrip("Array", () => ops.opArray(ses, { x: 2, y: 3, z: 0 }, 4, 90));
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
// Formen nach Blickrichtung drehen
{
  dim.blocks.clear();
  Object.assign(ses.s.shape, { type: "prism", rx: 5, ry: 2, rz: 1, hollow: false, anchor: "base", look: true });
  ses.s.pattern = parsePattern("bricks");
  player.view = { x: 1, y: 0, z: 0 };
  await use("axiom:shape", G);
  const keys = [...dim.blocks.keys()].map((k) => k.split(",").map(Number));
  const spanX = Math.max(...keys.map((k) => k[0])) - Math.min(...keys.map((k) => k[0]));
  const spanZ = Math.max(...keys.map((k) => k[2])) - Math.min(...keys.map((k) => k[2]));
  check(spanZ > spanX, `Prisma quer zur Blickrichtung Osten (X ${spanX}, Z ${spanZ})`);
  await undo();
  player.view = { x: 0, y: 0, z: -1 };
}
// Zwischenablage verstreuen
{
  dim.blocks.clear();
  ses.sel = boxSel(dim.id, { x: 0, y: 65, z: 0 }, { x: 1, y: 67, z: 0 });
  ops.opFill(ses, parsePattern("oak_log"));
  await drain();
  ops.opCopy(ses, false);
  await drain();
  await undo();
  ses.sel = boxSel(dim.id, { x: -20, y: 60, z: -20 }, { x: 20, y: 70, z: 20 });
  await roundTrip("Zwischenablage verstreuen", () => ops.opScatterClip(ses, { count: 5, spacing: 6, rotate: true }));
}
ses.sel = boxSel(dim.id, { x: 0, y: 64, z: 0 }, { x: 2, y: 66, z: 2 });
ops.opCopy(ses, false);
await drain();
const { saveBlueprint, listBlueprints, loadBlueprint } = await import("../packs/AxiomBP/scripts/core/clipboard.js");
saveBlueprint(player, "Mein Häuschen");
check(listBlueprints().some((b) => b.name === "mein_haeuschen"), "Blaupause gespeichert");
loadBlueprint(player, "mein_haeuschen");
await roundTrip("Blaupause einfügen", () => use("axiom:builder", { x: 40, y: 64, z: 40 }));
saveBlueprint(player, "mein_haeuschen");
await roundTrip("Blaupause nach erneutem Speichern unter gleichem Namen", () => use("axiom:builder", { x: 40, y: 64, z: 40 }));
loadBlueprint(player, "mein_haeuschen");
await roundTrip("Blaupause neu geladen", () => use("axiom:builder", { x: 40, y: 64, z: 40 }));

console.log("Kreaturen");
{
  const cow = dim.spawnEntity("minecraft:cow", { x: 5.5, y: 65, z: 5.5 });
  const stand = dim.spawnEntity("minecraft:armor_stand", { x: 6.5, y: 65, z: 5.5 });
  dim.spawnEntity("minecraft:pig", { x: 50, y: 65, z: 50 });
  player.entityHits = [cow];
  await use("axiom:entity", G);
  check(ses.entities.length === 1 && ses.entities[0] === cow, "Kreatur im Blick ausgewählt");
  await use("axiom:entity", G);
  check(ses.entities.length === 0, "Kreatur wieder abgewählt");
  player.entityHits = [];
  ses.s.entity.radius = 4;
  await use("axiom:entity", { x: 5, y: 64, z: 5 });
  check(ses.entities.length === 2, "Umkreis-Auswahl findet 2 Kreaturen: " + ses.entities.length);
  player.view = { x: 1, y: 0, z: 0 };
  answers.push({ selectText: "Verschieben" }, { set: { Blöcke: 3 } });
  await use("axiom:entity", G, { sneak: true });
  check(cow.location.x === 8.5 && stand.location.x === 9.5, "Kreaturen nach Osten verschoben");
  player.view = { x: 0, y: 0, z: -1 };
  answers.push({ selectText: "Drehen" }, { set: { "Wie drehen": "90° im Uhrzeigersinn" } });
  await use("axiom:entity", G, { sneak: true });
  check(cow.getRotation().y === 90, "Kreatur gedreht: " + cow.getRotation().y);
  answers.push({ selectText: "Namen geben" }, { set: { Name: "Berta" } });
  await use("axiom:entity", G, { sneak: true });
  check(cow.nameTag === "Berta", "Kreatur benannt");
  const before = dim.entities.length;
  answers.push({ selectText: "Kopieren" });
  await use("axiom:entity", G, { sneak: true });
  check(dim.entities.length === before + 2, "Kreaturen kopiert");
  answers.push({ selectText: "Löschen" }, { selectText: "Ja" });
  await use("axiom:entity", G, { sneak: true });
  check(!cow.isValid && !stand.isValid && dim.entities.length === before, "Kreaturen gelöscht");
  ses.sel = boxSel(dim.id, { x: 45, y: 60, z: 45 }, { x: 55, y: 70, z: 55 });
  answers.push({ selectText: "Block-Auswahl" });
  await use("axiom:entity", G, { sneak: true });
  check(ses.entities.length === 1 && ses.entities[0].typeId === "minecraft:pig", "Kreaturen in Block-Auswahl");
  await hit("axiom:entity", G);
  check(ses.entities.length === 0, "Schlagen leert Kreaturen-Auswahl");
  dim.entities = [];
}

console.log("Lasso & Anmerkungen");
{
  ses.s.selMode = "set";
  ses.pathPoints = [{ x: 0, y: 64, z: 0 }, { x: 10, y: 64, z: 0 }, { x: 0, y: 64, z: 10 }];
  answers.push({ selectText: "Lasso" }, { set: { "unter dem": 0, "über dem": 0 } });
  await use("axiom:path", G, { sneak: true });
  // Dreieck (0,0)-(10,0)-(0,10): Punkt (2,2) drin, (8,8) draußen
  check(ses.sel?.kind === "set" && ses.sel.keys.has("2,64,2") && !ses.sel.keys.has("8,64,8"), "Lasso-Auswahl im Dreieck: " + ses.sel?.keys?.size);
  ses.pathPoints = [];
  dim.entities = [];
  answers.push({ selectText: "Anmerkungen" }, { selectText: "Neue Anmerkung" }, { set: { Text: "Hier kommt das Tor hin" } });
  await use("axiom:menu", G);
  check(dim.entities.length === 1 && dim.entities[0].typeId === "axiom:note" && dim.entities[0].nameTag.includes("Tor"), "Anmerkung gesetzt");
  answers.push({ selectText: "Anmerkungen" }, { selectText: "Hier kommt" }, { selectText: "Löschen" });
  await use("axiom:menu", G);
  check(dim.entities.length === 0, "Anmerkung gelöscht");
}

console.log("Linien, Masken, Symmetrie+Struktur, Blaupause nach Neustart");
{
  dim.blocks.clear();
  ses.rulerA = null;
  await use("axiom:ruler", { x: 0, y: 64, z: 0 });
  await use("axiom:ruler", { x: 10, y: 70, z: 0 });
  answers.push({ selectText: "Anmerkungen" }, { selectText: "Lineal-Messung" }, { set: { Farbe: "Blau" } });
  await use("axiom:menu", G);
  const lines = JSON.parse(world.getDynamicProperty("axiom:lines"));
  check(lines.length === 1 && lines[0].b.x === 10 && lines[0].c === "axiom:pos2", "Linie aus Lineal gespeichert");
  hold("axiom:ruler");
  tickIntervals(10);
  answers.push({ selectText: "Anmerkungen" }, { selectText: "Linien in der Nähe löschen" });
  await use("axiom:menu", G);
  check(JSON.parse(world.getDynamicProperty("axiom:lines")).length === 0, "Linien gelöscht");

  // Masken: nur Liste / alles außer Liste / nur Luft
  ses.s.pattern = parsePattern("gold_block");
  ses.sel = boxSel(dim.id, { x: 0, y: 62, z: 0 }, { x: 3, y: 66, z: 3 });
  ses.s.mask = { mode: "list", ids: ["minecraft:dirt"] };
  ops.opFill(ses);
  await drain();
  check(dim._get(1, 63, 1).type.id === "minecraft:gold_block" && dim._get(1, 64, 1).type.id === "minecraft:grass_block" && dim._get(1, 65, 1).type.id === "minecraft:air", "Maske „nur diese“");
  await undo();
  ses.s.mask = { mode: "notlist", ids: ["minecraft:dirt"] };
  ops.opFill(ses);
  await drain();
  check(dim._get(1, 63, 1).type.id === "minecraft:dirt" && dim._get(1, 64, 1).type.id === "minecraft:gold_block", "Maske „alles außer“");
  await undo();
  ses.s.mask = { mode: "air", ids: [] };
  ops.opFill(ses);
  await drain();
  check(dim._get(1, 64, 1).type.id === "minecraft:grass_block" && dim._get(1, 65, 1).type.id === "minecraft:gold_block", "Maske „nur Luft“");
  await undo();
  check(dim.blocks.size === 0, "Masken rückgängig");
  ses.s.mask = { mode: "none", ids: [] };

  // Symmetrie mit großer Form (würde sonst Struktur-Verlauf nutzen)
  ses.s.symmetry = { x: true, z: false, center: { x: 0, y: 64, z: 0 } };
  Object.assign(ses.s.shape, { type: "sphere", rx: 25, ry: 25, rz: 25, hollow: false, anchor: "center", look: false });
  await roundTrip("Symmetrie + große Form", () => use("axiom:shape", { x: 40, y: 90, z: 0 }));
  ses.s.symmetry = { x: false, z: false, center: null };

  // Blaupause nach „Neustart“: Zwischenspeicher des Skripts leeren, Daten bleiben in der Welt
  const { listBlueprints: lb, loadBlueprint: ldb } = await import("../packs/AxiomBP/scripts/core/clipboard.js");
  check(lb().length > 0, "Blaupausen-Liste aus Weltdaten");
  ldb(player, lb()[0].name);
  await roundTrip("Blaupause aus Weltdaten erneut laden + einfügen", () => use("axiom:builder", { x: -30, y: 64, z: 30 }));
}

console.log("Verlauf, Ausdünnen, Pixel-Art");
{
  dim.blocks.clear();
  ses.s.mask = { mode: "none", ids: [] };
  ses.s.symmetry = { x: false, z: false, center: null };
  ses.sel = boxSel(dim.id, { x: 0, y: 40, z: 0 }, { x: 4, y: 60, z: 4 });
  ses.s.pattern = parsePattern("stone");
  ses.s.pattern2 = parsePattern("andesite");
  await roundTrip("Verlauf", () => ops.opGradient(ses, { axis: "y", blend: 2, reverse: false }));
  ops.opGradient(ses, { axis: "y", blend: 0, reverse: false });
  await drain();
  check(dim._get(2, 41, 2).type.id === "minecraft:stone" && dim._get(2, 59, 2).type.id === "minecraft:andesite", "Verlauf unten→oben");
  await undo();
  await roundTrip("Ausdünnen", () => ops.opThin(ses, { percent: 40, replace: false }));
  ops.opThin(ses, { percent: 100, replace: false });
  await drain();
  check(dim._get(2, 50, 2).type.id === "minecraft:air", "Ausdünnen 100 %");
  await undo();

  Object.assign(ses.s.text, { mode: "pixel", pixel: "rw/.r", legend: "r=red_wool, w=white_wool", scale: 1, orient: "wall" });
  player.view = { x: 0, y: 0, z: -1 };
  await roundTrip("Pixel-Art", () => use("axiom:text", G));
  await use("axiom:text", G);
  const ids = [...dim.blocks.values()].map((p) => p.type.id).sort().join(",");
  check(dim.blocks.size === 3 && ids === "minecraft:red_wool,minecraft:red_wool,minecraft:white_wool", "Pixel-Art: 3 Blöcke " + ids);
  await undo();
  ses.s.text.mode = "text";
}

console.log("Treppen & Pixel-Vorlagen");
{
  dim.blocks.clear();
  // Stufe: Spalten x>=1 sind 1 Block höher (Stein auf y=65)
  ses.sel = boxSel(dim.id, { x: 1, y: 65, z: -3 }, { x: 4, y: 65, z: 3 });
  ses.s.mask = { mode: "none", ids: [] };
  ops.opFill(ses, parsePattern("stone"));
  await drain();
  ses.s.terrain.mode = "stairs";
  ses.s.terrain.radius = 3;
  await roundTrip("Treppen an Stufenkanten", () => use("axiom:terrain", { x: 0, y: 64, z: 0 }));
  await use("axiom:terrain", { x: 0, y: 64, z: 0 });
  const st = dim._get(0, 65, 0);
  check(st.type.id === "minecraft:normal_stone_stairs" && st.getAllStates().weirdo_direction === 0, "Treppe vor der Stufe, steigt nach Osten an: " + st.type.id);
  await undo();
  ses.s.terrain.slab = true;
  await use("axiom:terrain", { x: 0, y: 64, z: 0 });
  check(dim._get(0, 65, 0).type.id === "minecraft:normal_stone_slab", "Stufen-Platte statt Treppe: " + dim._get(0, 65, 0).type.id);
  await undo();
  ses.s.terrain.slab = false;
  await undo();
  dim.blocks.clear();
  answers.push({ set: { "Pixel-Art-Vorlage": "Herz" } });
  await use("axiom:text", G, { sneak: true });
  check(ses.s.text.mode === "pixel" && ses.s.text.legend === "r=red_wool", "Pixel-Vorlage übernommen");
  await roundTrip("Pixel-Vorlage Herz setzen", () => use("axiom:text", G));
  ses.s.text.mode = "text";
}

console.log("Fluss & Blaupausen-Verwaltung");
{
  dim.blocks.clear();
  ses.s.mask = { mode: "none", ids: [] };
  ses.pathPoints = [{ x: 0, y: 65, z: 0 }, { x: 20, y: 65, z: 5 }];
  answers.push({ selectText: "Fluss" }, { set: { Breite: 2, Tiefe: 2 } });
  await roundTrip("Fluss entlang Pfad", () => use("axiom:path", G, { sneak: true }));
  answers.push({ selectText: "Fluss" }, { set: { Breite: 2, Tiefe: 2 } });
  await use("axiom:path", G, { sneak: true });
  check(dim._get(0, 64, 0).type.id === "minecraft:water" && dim._get(0, 63, 0).type.id === "minecraft:water" && dim._get(0, 62, 0).type.id === "minecraft:sand", "Fluss: Wasser + Sandbett");
  await undo();
  ses.pathPoints = [];
  const { listBlueprints: lb } = await import("../packs/AxiomBP/scripts/core/clipboard.js");
  const first = lb()[0].name;
  answers.push({ selectText: "Zwischenablage" }, { selectText: "Blaupausen" }, { selectText: first }, { selectText: "Umbenennen" }, { set: { "Neuer Name": "Turm Nord" } });
  await use("axiom:menu", G);
  const names = lb().map((b) => b.name);
  check(names.includes("turm_nord") && !names.includes(first), "Blaupause umbenannt: " + names.join(","));
  loadBlueprint(player, "turm_nord");
  await roundTrip("Umbenannte Blaupause einfügen", () => use("axiom:builder", { x: 60, y: 64, z: 60 }));
}

console.log("Blaupausen-Vorschau & Auswahl direkt speichern");
{
  dim.blocks.clear();
  ses.sel = boxSel(dim.id, { x: 0, y: 64, z: 0 }, { x: 3, y: 66, z: 2 });
  answers.push({ selectText: "Zwischenablage" }, { selectText: "Auswahl direkt" }, { set: { Name: "Kiste" } });
  await use("axiom:menu", G);
  const { listBlueprints: lb2 } = await import("../packs/AxiomBP/scripts/core/clipboard.js");
  const kiste = lb2().find((b) => b.name === "kiste");
  check(!!kiste && kiste.size.x === 4 && kiste.size.y === 3 && kiste.size.z === 3, "Auswahl direkt als Blaupause gespeichert");
  check(/^\d\d\.\d\d\.\d{4}$/.test(kiste?.date ?? ""), "Blaupause hat Datum: " + kiste?.date);
  answers.push({ selectText: "Zwischenablage" }, { selectText: "Blaupausen" }, { selectText: "kiste" }, { selectText: "Vorschau" });
  await use("axiom:menu", G);
  check(ses.bpPreview?.name === "kiste", "Blaupausen-Vorschau aktiv");
  hold("minecraft:stone");
  tickIntervals(10);
  check(String(player.actionBar).includes("Vorschau"), "Vorschau in Aktionsleiste");
  system.currentTick += 400;
  tickIntervals(10);
  check(!ses.bpPreview, "Vorschau läuft ab");
}

console.log("Wasserfall");
{
  dim.blocks.clear();
  ses.sel = boxSel(dim.id, { x: 5, y: 65, z: -3 }, { x: 7, y: 74, z: 3 });
  ops.opFill(ses, parsePattern("stone"));
  await drain();
  Object.assign(ses.s.terrain, { mode: "waterfall", radius: 6 });
  await roundTrip("Wasserfall", () => use("axiom:terrain", { x: 5, y: 66, z: 0 }, { face: "West" }));
  await use("axiom:terrain", { x: 5, y: 66, z: 0 }, { face: "West" });
  check(dim._get(6, 74, 0).type.id === "minecraft:water", "Wasserfall: Quelle oben");
  check(dim._get(5, 70, 0).type.id === "minecraft:air", "Wasserfall: Rinne frei");
  check(dim._get(1, 64, 0).type.id === "minecraft:water", "Wasserfall: Becken unten");
  await undo();
  const m0 = player.messages.length;
  system.currentTick += 100;
  await use("axiom:terrain", { x: 0, y: 64, z: 0 }, { face: "Up" });
  check(player.messages.slice(m0).some((m) => m.includes("Felswand")), "Wasserfall: Boden wird abgelehnt");
  await undo();
  dim.blocks.clear();
  ses.s.terrain.mode = "raise";
}

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
  ["Ansichten", [{ selectText: "speichern" }, { set: { Name: "Turm" } }]],
  ["Block / Muster", [{ selectText: "Als Text" }, { set: { Blöcke: "2*stone, dirt" } }]],
  ["Zwischenablage", [{ selectText: "Blaupausen" }, { selectText: "turm_nord" }, { selectText: "In Zwischenablage" }]],
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
player.location = { x: 99, y: 80, z: 99 };
answers.push({ selectText: "Ansichten" }, { selectText: "Turm" }, { selectText: "Hinspringen" });
await use("axiom:menu", G);
check(player.location.x === 0.5 && player.location.y === 65, "Ansicht: zurückgesprungen " + JSON.stringify(player.location));
check(formatPattern(ses.s.pattern) === "2*stone, dirt", "Muster per Menü");
answers.push({ selectText: "Block / Muster" }, { selectText: "Paletten" }, { selectText: "speichern" }, { set: { Name: "Mauer" } });
await use("axiom:menu", G);
ses.s.pattern = parsePattern("glass");
answers.push({ selectText: "Block / Muster" }, { selectText: "Paletten" }, { selectText: "Mauer" }, { selectText: "Laden" });
await use("axiom:menu", G);
check(formatPattern(ses.s.pattern) === "2*stone, dirt", "Palette speichern & laden");
// Zu einem Schritt zurückspringen
{
  const snap0 = dim.snapshot();
  ses.s.pattern = parsePattern("gold_block");
  Object.assign(ses.s.shape, { type: "cuboid", rx: 0, ry: 0, rz: 0, anchor: "center", hollow: false });
  ses.s.symmetry = { x: false, z: false, center: null };
  ses.s.mask = { mode: "none", ids: [] };
  for (let i = 0; i < 3; i++) await use("axiom:shape", { x: 30 + i, y: 70, z: 30 });
  answers.push({ selectText: "Verlauf" }, { selectText: "zurückspringen" }, { selectText: "3." });
  await use("axiom:menu", G);
  check(eqSnap(snap0, dim.snapshot()), "Verlauf: zu Schritt 3 zurückgesprungen");
}
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
