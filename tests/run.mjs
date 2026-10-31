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
for (const type of ["sphere", "hemisphere", "cuboid", "cylinder", "cone", "pyramid", "torus", "arch", "prism", "spiral", "wedge", "tetra", "octa", "polygon", "ziggurat", "tube", "disk", "frustum", "star", "heart", "cross", "onion", "gothic", "rose", "barrel", "groin"]) {
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
  check(dim._get(0, 64, -3).type.id === "minecraft:sand" && dim._get(0, 64, -6).type.id === "minecraft:grass_block", "Fluss: Sandufer neben dem Wasser");
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

console.log("Biom-Malen");
{
  dim.blocks.clear();
  const top = (x, z) => {
    for (let y = 140; y > 50; y--) {
      const id = dim._get(x, y, z).type.id;
      if (id !== "minecraft:air") return { y, id };
    }
    return { y: 0, id: "" };
  };
  Object.assign(ses.s.terrain, { mode: "mountain", radius: 8, strength: 5, falloff: true, biome: true, snowY: 76 });
  await roundTrip("Biom-Malen: Berg", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  const peak = top(0, 0);
  check(peak.y >= 76 && peak.id === "minecraft:snow", "Biom-Malen: Schnee auf dem Gipfel (" + peak.y + " " + peak.id + ")");
  let stone = 0;
  let grass = 0;
  for (let x = -8; x <= 8; x++)
    for (let z = -8; z <= 8; z++) {
      const t = top(x, z);
      if (t.id === "minecraft:stone" || t.id === "minecraft:andesite") stone++;
      if (t.id === "minecraft:grass_block") {
        grass++;
        if (dim._get(x, t.y - 1, z).type.id !== "minecraft:dirt") check(false, `Biom-Malen: Erde unter Gras bei ${x},${z}`);
      }
    }
  check(stone > 0, "Biom-Malen: steile Hänge aus Stein (" + stone + ")");
  check(grass > 0, "Biom-Malen: flache Stellen bleiben Gras (" + grass + ")");
  check(dim._get(0, peak.y - 6, 0).type.id === "minecraft:stone", "Biom-Malen: Stein im Berginneren");
  await undo();
  check(top(0, 0).y === 64 && top(0, 0).id === "minecraft:grass_block", "Biom-Malen: Rückgängig stellt Boden wieder her");

  // Nur Oberfläche: Sand am Wasser, Bauwerke bleiben
  for (let x = 12; x <= 14; x++) for (let z = -2; z <= 2; z++) dim._set(x, 64, z, BlockPermutation.resolve("minecraft:water"));
  dim._set(8, 64, 3, BlockPermutation.resolve("minecraft:oak_planks"));
  Object.assign(ses.s.terrain, { mode: "biome", radius: 4 });
  await roundTrip("Biom-Malen: nur Oberfläche", () => use("axiom:terrain", { x: 9, y: 64, z: 0 }));
  await use("axiom:terrain", { x: 9, y: 64, z: 0 });
  check(dim._get(11, 63, 0).type.id === "minecraft:sand" || dim._get(10, 64, 0).type.id === "minecraft:sand", "Biom-Malen: Sand am Wasser");
  check(dim._get(10, 64, 0).type.id === "minecraft:sand", "Biom-Malen: Ufer wird Sand");
  check(dim._get(6, 64, 0).type.id === "minecraft:grass_block", "Biom-Malen: weiter weg bleibt Gras");
  check(dim._get(8, 64, 3).type.id === "minecraft:oak_planks", "Biom-Malen: Bauwerke bleiben unberührt");
  await undo();
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2, biome: false });
  dim.blocks.clear();
}

console.log("Erosion");
{
  const { rainErosion } = await import("../packs/AxiomBP/scripts/tools/terrain.js");
  // Reine Rechnung: schräge Ebene + Mulde – Tropfen tragen oben ab und lagern unten ab
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const Hs = (x, z) => (x <= -5 ? 60 : 60 + x + 5);
  const er = rainErosion(Hs, 0, 0, 6, 4, rnd);
  check(er.size > 0, "Erosion: Regen verändert einen Hang (" + er.size + ")");
  check([...er].some(([k, v]) => v < Hs(...k.split(",").map(Number))), "Erosion: Regen trägt Boden ab");
  check([...er].every(([k, v]) => Math.abs(v - Hs(...k.split(",").map(Number))) <= 4), "Erosion: höchstens Stärke-abhängig tief");
  const flat = rainErosion(() => 64, 0, 0, 6, 4, rnd);
  check(flat.size === 0, "Erosion: flaches Land bleibt unverändert");

  dim.blocks.clear();
  Object.assign(ses.s.terrain, { mode: "mountain", radius: 8, strength: 4, biome: false });
  await use("axiom:terrain", G);
  ses.s.terrain.mode = "rain";
  await roundTrip("Erosion: Regen", () => use("axiom:terrain", G));
  ses.s.terrain.mode = "melt";
  await roundTrip("Erosion: Schmelzen", () => use("axiom:terrain", G));
  await undo();
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2 });
  dim.blocks.clear();
}

console.log("Formen-Vorschau");
{
  dim.blocks.clear();
  const { shapeTool, shapeOutline, shapeFn } = await import("../packs/AxiomBP/scripts/tools/shape.js");
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, hollow: false, anchor: "center", look: false, confirm: false });
  ses.shapeOutline = undefined;
  const pts = shapeOutline(ses);
  const f = shapeFn(ses.s.shape);
  check(!!pts && pts.length > 20 && pts.length <= 260, "Vorschau: Umriss der Kugel (" + pts?.length + " Punkte)");
  check(!!pts && pts.every(([x, y, z]) => f.inside(x, y, z) && !(f.inside(x + 1, y, z) && f.inside(x - 1, y, z) && f.inside(x, y + 1, z) && f.inside(x, y - 1, z) && f.inside(x, y, z + 1) && f.inside(x, y, z - 1))), "Vorschau: nur Randblöcke");
  player.rayHit = { pos: G, face: "Up" };
  player.particles = 0;
  shapeTool.preview(ses);
  check(player.particles > 20, "Vorschau: Partikel werden gezeigt (" + player.particles + ")");
  Object.assign(ses.s.shape, { rx: 60, ry: 60, rz: 60 });
  check(shapeOutline(ses) === null, "Vorschau: riesige Form nur als Rahmen");
  player.particles = 0;
  shapeTool.preview(ses);
  check(player.particles > 20, "Vorschau: Rahmen bei riesiger Form");

  // Vorschau-Modus: erst zeigen, dann bauen
  Object.assign(ses.s.shape, { type: "cuboid", rx: 1, ry: 1, rz: 1, confirm: true });
  const snap = dim.snapshot();
  await use("axiom:shape", { x: 10, y: 66, z: 10 });
  check(eqSnap(snap, dim.snapshot()) && !!ses.shapeLock, "Vorschau-Modus: 1. Benutzen baut noch nichts");
  await use("axiom:shape", { x: -10, y: 66, z: -10 });
  check(dim._get(10, 66, 10).type.id !== "minecraft:air" && dim._get(-10, 66, -10).type.id === "minecraft:air", "Vorschau-Modus: 2. Benutzen baut an der gemerkten Stelle");
  check(!ses.shapeLock, "Vorschau-Modus: danach wieder frei");
  await undo();
  await use("axiom:shape", { x: 10, y: 66, z: 10 });
  const before = formatPattern(ses.s.pattern);
  await hit("axiom:shape", G);
  check(!ses.shapeLock, "Vorschau-Modus: Schlagen bricht ab");
  check(before === formatPattern(ses.s.pattern), "Vorschau-Modus: Abbrechen ändert das Muster nicht");
  await hit("axiom:shape", G);
  check(formatPattern(ses.s.pattern).includes("grass"), "Formen: ohne Vorschau ist Schlagen wieder Pipette");
  ses.s.pattern = parsePattern(before);
  Object.assign(ses.s.shape, { confirm: false, look: true });
  dim.blocks.clear();
}

console.log("Neue Grundformen");
{
  const { shapeFn } = await import("../packs/AxiomBP/scripts/tools/shape.js");
  const count = (c) => {
    const f = shapeFn(c);
    const e = f.ext;
    let n = 0;
    for (let x = -e.x; x <= e.x; x++) for (let y = -e.y; y <= e.y; y++) for (let z = -e.z; z <= e.z; z++) if (f.inside(x, y, z)) n++;
    return n;
  };
  const wedge = shapeFn({ type: "wedge", rx: 2, ry: 3, rz: 4 });
  check(wedge.inside(0, 0, -4) && !wedge.inside(0, 2, -4) && wedge.inside(0, 6, 4), "Keil: vorne flach, hinten hoch");
  const oct = shapeFn({ type: "octa", rx: 4, ry: 4, rz: 4 });
  check(oct.inside(0, 4, 0) && oct.inside(4, 0, 0) && !oct.inside(3, 3, 0), "Oktaeder: Spitzen, keine Ecken");
  const hex = shapeFn({ type: "polygon", rx: 6, ry: 2, rz: 6, sides: 6 });
  const sq = shapeFn({ type: "polygon", rx: 6, ry: 2, rz: 6, sides: 4 });
  check(hex.inside(0, 0, 5) && sq.inside(4, 0, 4) && !sq.inside(6, 0, 6) && !hex.inside(6, 0, 3), "Vieleck: Sechseck & Quadrat");
  check(count({ type: "polygon", rx: 6, ry: 0, rz: 6, sides: 3 }) < count({ type: "polygon", rx: 6, ry: 0, rz: 6, sides: 8 }), "Vieleck: mehr Ecken = mehr Fläche");
  const zig = shapeFn({ type: "ziggurat", rx: 6, ry: 4, rz: 6, step: 2 });
  check(zig.inside(6, -4, 0) && zig.inside(6, -3, 0) && !zig.inside(6, -2, 0), "Stufenpyramide: Stufen 2 hoch");
  const tet = shapeFn({ type: "tetra", rx: 7, ry: 4, rz: 7 });
  check(tet.inside(0, -4, 0) && tet.inside(0, 4, 2) && !tet.inside(0, 4, -3) && !tet.inside(7, -4, -7), "Tetraeder: Grundfläche & Spitze");
  check(count({ type: "tetra", rx: 7, ry: 4, rz: 7 }) < count({ type: "pyramid", rx: 7, ry: 4, rz: 7 }), "Tetraeder kleiner als Pyramide");
  const disk = shapeFn({ type: "disk", rx: 5, ry: 3, rz: 5 });
  check(disk.inside(5, 0, 0) && !disk.inside(0, 1, 0), "Scheibe: nur eine Lage");
  const fr = shapeFn({ type: "frustum", rx: 6, ry: 3, rz: 6 });
  check(fr.inside(6, -3, 0) && !fr.inside(6, 3, 0) && fr.inside(3, 3, 0), "Kegelstumpf: oben halb so breit");
  const tube = shapeFn({ type: "tube", rx: 6, ry: 2, rz: 2 });
  check(tube.inside(6, 0, 0) && !tube.inside(0, 3, 0) && tube.inside(-6, 2, 0), "Rohr: liegt entlang X");
  const heart = shapeFn({ type: "heart", rx: 7, ry: 7, rz: 0 });
  check(heart.inside(-4, 5, 0) && heart.inside(4, 5, 0) && !heart.inside(0, 6, 0) && heart.inside(0, -6, 0), "Herz: zwei Bögen oben, Spitze unten");
  const star = shapeFn({ type: "star", rx: 8, ry: 8, rz: 0 });
  check(star.inside(0, 6, 0) && !star.inside(3, 5, 0) && star.inside(0, 0, 0), "Stern: Zacke oben, Lücke daneben");
  const cr = shapeFn({ type: "cross", rx: 5, ry: 5, rz: 0 });
  check(cr.inside(5, 0, 0) && cr.inside(0, 5, 0) && !cr.inside(4, 4, 0), "Kreuz: Arme ohne Ecken");
  // Herz steht vor dem Spieler: mit Blickrichtung Ost wird die Ebene gedreht
  dim.blocks.clear();
  Object.assign(ses.s.shape, { type: "heart", rx: 4, ry: 4, rz: 0, hollow: false, anchor: "center", look: true });
  const oldView = player.view;
  player.view = { x: 1, y: 0, z: 0 };
  await use("axiom:shape", { x: 0, y: 70, z: 0 });
  let xs = 0;
  let zs = 0;
  for (const k of dim.blocks.keys()) {
    const [x, , z] = k.split(",").map(Number);
    if (x !== 0) xs++;
    if (z !== 0) zs++;
  }
  check(xs === 0 && zs > 0, "Herz: steht quer zur Blickrichtung");
  player.view = oldView;
  await undo();
  dim.blocks.clear();
}

console.log("Editor-Modus & Übersicht");
{
  const ed = await import("../packs/AxiomBP/scripts/ui/editor.js");
  const inv = player.inventory;
  for (let i = 0; i < 9; i++) inv.setItem(i, undefined);
  inv.setItem(0, new ItemStack("minecraft:dirt", 5));
  inv.setItem(3, new ItemStack("minecraft:diamond_sword", 1));
  ed.toggleEditor(ses);
  check(ed.isEditor(ses), "Editor: an");
  check(ed.DEFAULT_BAR.every((id, i) => inv.getItem(i)?.typeId === id) && inv.getItem(8)?.typeId === "axiom:menu", "Editor: Werkzeugleiste 1–8 + Übersicht auf 9");
  check(inv.getItem(1)?.lockMode === "slot", "Editor: Werkzeuge sind festgesetzt");
  check(typeof player.getDynamicProperty("axiom:editorSave") === "string", "Editor: Notfall-Kopie der Hotbar");
  // Übersicht: Werkzeug auf die gewählte Taste legen
  player.selectedSlotIndex = 4;
  answers.push({ selectText: "Text" });
  await ed.overviewMenu(ses);
  await drain();
  check(inv.getItem(4)?.typeId === "axiom:text" && ses.s.editorBar[4] === "axiom:text", "Übersicht: Werkzeug auf Taste 5 gelegt");
  // Platz 9 bleibt die Übersicht
  player.selectedSlotIndex = 8;
  answers.push({ selectText: "Formen" });
  await ed.overviewMenu(ses);
  await drain();
  check(inv.getItem(8)?.typeId === "axiom:menu" && player.selectedSlotIndex === 1, "Übersicht: Platz 9 bleibt, springt zur Taste mit dem Werkzeug");
  // Menü-Item im Editor öffnet die Übersicht
  const { shown } = await import("@minecraft/server-ui");
  const n0 = shown.length;
  system.currentTick += 40;
  player.selectedSlotIndex = 8;
  world.afterEvents.itemUse._fire({ source: player, itemStack: inv.getItem(8) });
  await drain();
  await new Promise((r) => setTimeout(r, 20));
  check(shown.slice(n0).some((f) => String(f.form._title).includes("Übersicht")), "Editor: Menü-Item öffnet die Übersicht ");
  // Vogelperspektive
  ed.setBirdsEye(ses, true);
  check(player.camera.last?.preset === "minecraft:free" && player.camera.last.opts.rotation.x === 90, "Vogelperspektive: Kamera von oben");
  player.location = { x: 10, y: 70, z: 0 };
  ed.updateBirdsEye(ses);
  check(player.camera.last.opts.location.x === 10 && player.camera.last.opts.location.y === 94, "Vogelperspektive: folgt dem Spieler");
  // Ausschalten: Hotbar zurück, Kamera normal
  ed.toggleEditor(ses);
  check(!ed.isEditor(ses) && inv.getItem(0)?.typeId === "minecraft:dirt" && inv.getItem(0).amount === 5 && inv.getItem(3)?.typeId === "minecraft:diamond_sword", "Editor aus: Hotbar wiederhergestellt");
  check(player.camera.last === null && !ses.birdsEye, "Editor aus: Vogelperspektive beendet");
  check(player.getDynamicProperty("axiom:editorSave") === undefined, "Editor aus: Notfall-Kopie gelöscht");
  // Spiel im Editor-Modus beendet → beim Beitreten Hotbar zurück
  player.setDynamicProperty("axiom:editorSave", JSON.stringify([{ id: "minecraft:stone", n: 3, name: "Lieblingsstein" }, null, null, null, null, null, null, null, null]));
  inv.setItem(0, new ItemStack("axiom:shape", 1));
  ed.restoreAfterJoin(player);
  check(inv.getItem(0)?.typeId === "minecraft:stone" && inv.getItem(0).amount === 3 && inv.getItem(0).nameTag === "Lieblingsstein", "Editor: Hotbar nach Neustart wiederhergestellt");
  // Hauptmenü bietet Übersicht & Editor-Modus
  answers.push({ selectText: "Editor-Modus an" });
  const { mainMenu } = await import("../packs/AxiomBP/scripts/ui/main.js");
  await mainMenu(ses);
  await drain();
  check(ed.isEditor(ses), "Hauptmenü: Editor-Modus einschalten");
  ed.toggleEditor(ses);
  for (let i = 0; i < 9; i++) inv.setItem(i, undefined);
  player.location = { x: 0, y: 65, z: 0 };
}

console.log("Stempel einstellbar");
{
  const { stampAxis, terrainTool } = await import("../packs/AxiomBP/scripts/tools/terrain.js");
  const a0 = stampAxis({ x: 1, y: 0, z: 0 }, 0);
  const a90 = stampAxis({ x: 1, y: 0, z: 0 }, 90);
  check(Math.abs(a0.ax - 1) < 1e-9 && Math.abs(a90.ax) < 1e-9 && Math.abs(Math.abs(a90.az) - 1) < 1e-9, "Stempel: Drehung der Längsachse");
  const top = (x, z) => {
    for (let y = 140; y > 50; y--) if (dim._get(x, y, z).type.id !== "minecraft:air") return y;
    return 0;
  };
  const oldView = player.view;
  player.view = { x: 1, y: 0, z: 0 };
  dim.blocks.clear();
  Object.assign(ses.s.terrain, { mode: "mesa", radius: 4, strength: 2, falloff: false, biome: false, jag: 0, rot: 0, stretch: 30 });
  await roundTrip("Stempel gestreckt", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  check(top(10, 0) > 64 && top(-10, 0) > 64 && top(0, 8) === 64, "Stempel: Streckung macht ihn in Blickrichtung länger");
  await undo();
  ses.s.terrain.rot = 90;
  await use("axiom:terrain", G);
  check(top(0, 10) > 64 && top(10, 0) === 64, "Stempel: Drehung um 90°");
  await undo();
  Object.assign(ses.s.terrain, { mode: "mountain", radius: 6, strength: 4, rot: 0, stretch: 10, jag: 0 });
  await use("axiom:terrain", G);
  const sym = [[3, 0], [0, 3], [-3, 0], [0, -3], [2, 2], [-2, -2]].map(([x, z]) => top(x, z));
  check(sym.slice(0, 4).every((h) => h === sym[0]) && sym[4] === sym[5], "Stempel: Zackigkeit 0 = glatt & gleichmäßig");
  await undo();
  ses.s.terrain.jag = 10;
  await use("axiom:terrain", G);
  const ring = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ring.push(top(Math.round(Math.cos(a) * 3), Math.round(Math.sin(a) * 3)));
  }
  check(new Set(ring).size > 2, "Stempel: Zackigkeit 10 = unregelmäßig (" + [...new Set(ring)].join(",") + ")");
  await undo();
  // Vorschau-Umriss
  player.rayHit = { pos: G, face: "Up" };
  player.particles = 0;
  terrainTool.preview(ses);
  check(player.particles >= 24, "Stempel: Vorschau-Umriss (" + player.particles + ")");
  ses.s.terrain.mode = "raise";
  player.particles = 0;
  terrainTool.preview(ses);
  check(player.particles === 0, "Pinsel-Modi: kein Stempel-Umriss");
  player.view = oldView;
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2, falloff: true, jag: 3, rot: 0, stretch: 10 });
  dim.blocks.clear();
}

console.log("Neue Stempel");
{
  const topB = (x, z) => {
    for (let y = 140; y > 50; y--) {
      const id = dim._get(x, y, z).type.id;
      if (id !== "minecraft:air") return { y, id };
    }
    return { y: 0, id: "" };
  };
  const oldView = player.view;
  player.view = { x: 1, y: 0, z: 0 };
  dim.blocks.clear();
  Object.assign(ses.s.terrain, { mode: "dune", radius: 6, strength: 4, falloff: false, biome: false, jag: 0, rot: 0, stretch: 10 });
  await roundTrip("Stempel Düne", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  const crest = topB(2, 0);
  check(crest.id === "minecraft:sand" && crest.y > 66, "Düne: Sandkamm (" + crest.y + ")");
  check(topB(-4, 0).y < crest.y && topB(5, 0).y < crest.y && crest.y - topB(5, 0).y > topB(-1, 0).y - topB(-4, 0).y - 1, "Düne: flach vorne, steil hinten");
  check(dim._get(2, crest.y - 2, 0).type.id === "minecraft:sand", "Düne: innen Sand");
  await undo();
  Object.assign(ses.s.terrain, { mode: "snowpeak", radius: 7 });
  await roundTrip("Stempel Schneegipfel", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  check(topB(0, 0).id === "minecraft:snow" && topB(0, 0).y > 80, "Schneegipfel: Schnee oben");
  check(topB(4, 0).id === "minecraft:stone", "Schneegipfel: Fels an der Flanke");
  check(topB(7, 0).id === "minecraft:grass_block", "Schneegipfel: unten Gras");
  await undo();
  Object.assign(ses.s.terrain, { mode: "cliff", radius: 6, strength: 3 });
  await roundTrip("Stempel Klippe", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  check(topB(3, 0).y >= 64 + 12 && topB(-3, 0).y === 64, "Klippe: hinten hoch, vorne unverändert");
  check(dim._get(3, 70, 0).type.id === "minecraft:stone", "Klippe: Felswand aus Stein");
  await undo();
  player.view = oldView;
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2, falloff: true, jag: 3 });
  dim.blocks.clear();
}

console.log("Formen drehen & einpassen");
{
  const { shapeFn, rotateShape, fitShape } = await import("../packs/AxiomBP/scripts/tools/shape.js");
  const count = (f) => {
    const e = f.ext;
    let n = 0;
    for (let x = -e.x; x <= e.x; x++) for (let y = -e.y; y <= e.y; y++) for (let z = -e.z; z <= e.z; z++) if (f.inside(x, y, z)) n++;
    return n;
  };
  const cyl = shapeFn({ type: "cylinder", rx: 2, ry: 6, rz: 2 });
  const lying = rotateShape(cyl, 0, 90, 0);
  check(lying.inside(0, 0, 6) && !lying.inside(0, 6, 0) && lying.ext.z >= 6 && lying.ext.y <= 3, "Drehen: gekippter Zylinder liegt");
  const side = rotateShape(cyl, 0, 0, 90);
  check(side.inside(6, 0, 0) && !side.inside(0, 6, 0), "Drehen: zur Seite geneigt");
  const wedge = shapeFn({ type: "wedge", rx: 2, ry: 3, rz: 4 });
  check(count(rotateShape(wedge, 90, 0, 0)) === count(wedge) && count(rotateShape(wedge, 180, 0, 0)) === count(wedge), "Drehen: 90°/180° behalten die Blockzahl");
  const sq = shapeFn({ type: "cuboid", rx: 4, ry: 0, rz: 4 });
  const dia = rotateShape(sq, 45, 0, 0);
  check(!sq.inside(5, 0, 0) && dia.inside(5, 0, 0) && !dia.inside(4, 0, 4), "Drehen: 45° macht aus dem Quadrat eine Raute");
  check(rotateShape(sq, 0, 0, 0) === sq, "Drehen: 0° ändert nichts");
  // Einpassen in eine Auswahl (gerade Größe → halbzahlige Mitte)
  const fit = fitShape({ type: "sphere", rx: 1, ry: 1, rz: 1 }, { min: { x: 0, y: 0, z: 0 }, max: { x: 9, y: 5, z: 9 } });
  const q0 = fit.at(0, 2, 4);
  const q9 = fit.at(9, 2, 4);
  check(fit.f.inside(q0.x, q0.y, q0.z) === fit.f.inside(q9.x, q9.y, q9.z) && fit.f.inside(q0.x, q0.y, q0.z), "Einpassen: Kugel berührt beide Seiten gleich");
  dim.blocks.clear();
  ses.sel = boxSel(dim.id, { x: 0, y: 70, z: 0 }, { x: 9, y: 75, z: 7 });
  Object.assign(ses.s.shape, { type: "sphere", anchor: "sel", hollow: false, yaw: 0, tilt: 0, roll: 0 });
  await roundTrip("Form in Auswahl", () => use("axiom:shape", G));
  await use("axiom:shape", G);
  let out = 0;
  const hit = { x0: false, x9: false, y0: false, y5: false, z0: false, z7: false };
  for (const k of dim.blocks.keys()) {
    const [x, y, z] = k.split(",").map(Number);
    if (dim._get(x, y, z).type.id === "minecraft:air") continue;
    if (y < 65) continue;
    if (x < 0 || x > 9 || y < 70 || y > 75 || z < 0 || z > 7) out++;
    if (x === 0) hit.x0 = true;
    if (x === 9) hit.x9 = true;
    if (y === 70) hit.y0 = true;
    if (y === 75) hit.y5 = true;
    if (z === 0) hit.z0 = true;
    if (z === 7) hit.z7 = true;
  }
  check(out === 0 && Object.values(hit).every(Boolean), "Einpassen: Ellipsoid füllt die Auswahl genau aus " + JSON.stringify(hit));
  await undo();
  ses.s.shape.type = "hemisphere";
  await use("axiom:shape", G);
  check(dim._get(4, 70, 3).type.id !== "minecraft:air" && dim._get(4, 75, 3).type.id !== "minecraft:air" && dim._get(0, 75, 0).type.id === "minecraft:air", "Einpassen: Kuppel steht auf dem Boden der Auswahl");
  await undo();
  const m0 = player.messages.length;
  ses.sel = null;
  await use("axiom:shape", G);
  check(player.messages.slice(m0).some((m) => m.includes("Auswahl")), "Einpassen: ohne Auswahl kommt ein Hinweis");
  Object.assign(ses.s.shape, { type: "sphere", anchor: "center" });
  // Gedrehte Form bauen + Rückgängig
  Object.assign(ses.s.shape, { type: "cylinder", rx: 2, ry: 5, rz: 2, tilt: 45, look: false });
  await roundTrip("Gekippter Zylinder", () => use("axiom:shape", { x: 0, y: 80, z: 0 }));
  Object.assign(ses.s.shape, { tilt: 0, look: true, rx: 4, ry: 4, rz: 4 });
  dim.blocks.clear();
}

console.log("Felsbogen, Höhle, Hügelkette");
{
  const topB = (x, z) => {
    for (let y = 140; y > 50; y--) {
      const id = dim._get(x, y, z).type.id;
      if (id !== "minecraft:air") return { y, id };
    }
    return { y: 0, id: "" };
  };
  const rock = (id) => ["minecraft:stone", "minecraft:andesite", "minecraft:cobblestone"].includes(id);
  const oldView = player.view;
  player.view = { x: 1, y: 0, z: 0 };
  dim.blocks.clear();
  Object.assign(ses.s.terrain, { mode: "rockarch", radius: 6, strength: 2, jag: 0, rot: 0, stretch: 10, biome: false });
  await roundTrip("Felsbogen", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  check(rock(dim._get(0, 71, 0).type.id) && dim._get(0, 66, 0).type.id === "minecraft:air", "Felsbogen: Bogen oben, darunter frei");
  check(rock(dim._get(6, 65, 0).type.id) && rock(dim._get(-6, 65, 0).type.id), "Felsbogen: Füße stehen auf dem Boden");
  check(dim._get(0, 71, 4).type.id === "minecraft:air", "Felsbogen: steht quer (schmal in Z)");
  await undo();
  // Höhle: in einen Steinhang (Wand) graben
  ses.sel = boxSel(dim.id, { x: 3, y: 65, z: -6 }, { x: 20, y: 75, z: 6 });
  ops.opFill(ses, parsePattern("stone"));
  await drain();
  Object.assign(ses.s.terrain, { mode: "cave", radius: 5, strength: 3 });
  await roundTrip("Höhleneingang", () => use("axiom:terrain", { x: 3, y: 66, z: 0 }, { face: "West" }));
  await use("axiom:terrain", { x: 3, y: 66, z: 0 }, { face: "West" });
  check(dim._get(5, 66, 0).type.id === "minecraft:air" && dim._get(9, 65, 0).type.id === "minecraft:air", "Höhle: Stollen führt in den Hang");
  check(dim._get(5, 75, 0).type.id === "minecraft:stone" && dim._get(5, 66, 6).type.id === "minecraft:stone", "Höhle: Decke & Seitenwände bleiben");
  await undo();
  dim.blocks.clear();
  // Hügelkette entlang der Pfadpunkte
  Object.assign(ses.s.terrain, { mode: "ridge", radius: 4, strength: 3, jag: 0 });
  ses.pathPoints = [];
  const m0 = player.messages.length;
  await use("axiom:terrain", G);
  check(player.messages.slice(m0).some((m) => m.includes("Pfad")), "Hügelkette: ohne Punkte kommt ein Hinweis");
  ses.pathPoints = [{ x: -15, y: 65, z: 0 }, { x: 0, y: 65, z: 5 }, { x: 15, y: 65, z: 0 }];
  await roundTrip("Hügelkette", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  const mid = topB(0, 5);
  check(mid.y >= 64 + 10 && mid.id === "minecraft:grass_block", "Hügelkette: Kamm in der Mitte (" + mid.y + ")");
  check(topB(-15, 0).y < mid.y - 5 && topB(0, -5).y === 64, "Hügelkette: Enden flach, daneben unverändert");
  check(dim._get(0, mid.y - 6, 5).type.id === "minecraft:stone", "Hügelkette: innen Stein");
  await undo();
  ses.pathPoints = [];
  player.view = oldView;
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2, jag: 3 });
  dim.blocks.clear();
}

console.log("Formen A→B, offen & Drahtgitter");
{
  const { shapeFn, shapeBetween, keepFn } = await import("../packs/AxiomBP/scripts/tools/shape.js");
  const base = { rx: 1, ry: 1, rz: 1, hollow: false, thick: 1 };
  const g = shapeBetween({ ...base, type: "cylinder" }, { x: 0, y: 70, z: 0 }, { x: 10, y: 70, z: 0 });
  check(g.In(0, 70, 0) && g.In(10, 70, 0) && g.In(5, 71, 0) && !g.In(5, 73, 0) && !g.In(12, 70, 0), "A→B: liegender Zylinder zwischen den Punkten");
  const dg = shapeBetween({ ...base, type: "cylinder" }, { x: 0, y: 70, z: 0 }, { x: 8, y: 78, z: 0 });
  let gaps = 0;
  for (let k = 0; k <= 8; k++) if (!dg.In(k, 70 + k, 0)) gaps++;
  check(gaps === 0 && !dg.In(8, 70, 0), "A→B: schräger Zylinder ohne Lücken");
  const cone = shapeBetween({ ...base, type: "cone", rx: 3, rz: 3 }, { x: 0, y: 70, z: 0 }, { x: 0, y: 70, z: 10 });
  check(cone.In(2, 70, 1) && !cone.In(2, 70, 9) && cone.In(0, 70, 10), "A→B: Kegel – breit bei A, Spitze bei B");
  // Hohl mit offenem Boden & Deckel, Drahtgitter
  const cub = shapeFn({ type: "cuboid", rx: 2, ry: 2, rz: 2 });
  const tube = keepFn(cub.inside, { hollow: true, thick: 1, open: "both" });
  const capped = keepFn(cub.inside, { hollow: true, thick: 1, open: "none" });
  const bottomOpen = keepFn(cub.inside, { hollow: true, thick: 1, open: "bottom" });
  check(!tube(0, 2, 0) && !tube(0, -2, 0) && tube(2, 0, 0) && capped(0, 2, 0) && capped(0, -2, 0), "Hohl: Boden & Deckel offen = Röhre");
  check(!bottomOpen(0, -2, 0) && bottomOpen(0, 2, 0), "Hohl: nur Boden offen");
  const wire = keepFn(cub.inside, { hollow: false, thick: 1, wire: true });
  let wn = 0;
  for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) if (cub.inside(x, y, z) && wire(x, y, z)) wn++;
  check(wn === 44, "Drahtgitter: Quader 5×5×5 hat 44 Kantenblöcke (" + wn + ")");
  // Werkzeug: zweimal benutzen
  dim.blocks.clear();
  Object.assign(ses.s.shape, { type: "cylinder", rx: 1, ry: 1, rz: 1, anchor: "ab", hollow: false, wire: false, open: "none", yaw: 0, tilt: 0, roll: 0 });
  const snap = dim.snapshot();
  await use("axiom:shape", { x: 0, y: 70, z: 0 });
  check(eqSnap(snap, dim.snapshot()) && !!ses.shapeA, "A→B: erster Klick setzt nur Punkt A");
  await hit("axiom:shape", G);
  check(!ses.shapeA, "A→B: Schlagen verwirft Punkt A");
  await use("axiom:shape", { x: 0, y: 70, z: 0 });
  await roundTrip("Form A→B", () => use("axiom:shape", { x: 0, y: 70, z: 8 }));
  await use("axiom:shape", { x: 0, y: 70, z: 0 });
  await use("axiom:shape", { x: 0, y: 70, z: 8 });
  check(dim._get(0, 70, 4).type.id !== "minecraft:air" && dim._get(0, 70, 0).type.id !== "minecraft:air" && dim._get(0, 70, 8).type.id !== "minecraft:air", "A→B: Zylinder gebaut");
  await undo();
  ses.s.shape.type = "torus";
  const m0 = player.messages.length;
  await use("axiom:shape", { x: 0, y: 70, z: 0 });
  check(player.messages.slice(m0).some((m) => m.includes("zwei Punkten")), "A→B: Torus wird abgelehnt");
  Object.assign(ses.s.shape, { type: "sphere", anchor: "center", rx: 4, ry: 4, rz: 4 });
  ses.shapeA = undefined;
  // Drahtgitter-Quader im Spiel
  Object.assign(ses.s.shape, { type: "cuboid", rx: 2, ry: 2, rz: 2, wire: true, look: false });
  await roundTrip("Drahtgitter-Quader", () => use("axiom:shape", { x: 0, y: 80, z: 0 }));
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, wire: false, look: true });
  dim.blocks.clear();
}

console.log("Landschaft erzeugen");
{
  dim.blocks.clear();
  ses.sel = boxSel(dim.id, { x: 0, y: 60, z: 0 }, { x: 31, y: 89, z: 31 });
  const o = { scale: 16, relief: 90, sea: 30, octaves: 4 };
  await roundTrip("Landschaft", () => ops.opLandscape(ses, o, 42));
  ops.opLandscape(ses, o, 42);
  await drain();
  const seaY = 60 + Math.round(29 * 0.3);
  const heights = [];
  let water = 0;
  let waterAbove = 0;
  let badUnder = 0;
  for (let x = 0; x <= 31; x++)
    for (let z = 0; z <= 31; z++) {
      let h = 0;
      for (let y = 89; y >= 60; y--) {
        const id = dim._get(x, y, z).type.id;
        if (id === "minecraft:water") {
          water++;
          if (y > seaY) waterAbove++;
        } else if (id !== "minecraft:air") {
          h = y;
          if (y < seaY && !["minecraft:sand", "minecraft:gravel"].includes(id)) badUnder++;
          break;
        }
      }
      heights.push(h);
    }
  check(Math.max(...heights) - Math.min(...heights) >= 8, "Landschaft: Berge & Täler (" + Math.min(...heights) + "–" + Math.max(...heights) + ")");
  check(water > 0 && waterAbove === 0, "Landschaft: Seen bis zur Meereshöhe (" + water + ")");
  check(badUnder === 0, "Landschaft: unter Wasser Sand/Kies");
  check(dim._get(5, 60, 5).type.id === "minecraft:stone", "Landschaft: unten Stein");
  check(heights.every((h) => h >= 60), "Landschaft: jede Spalte hat Boden");
  await undo();
  ops.opLandscape(ses, { ...o, sea: 0 }, 42);
  await drain();
  let w2 = 0;
  for (const k of dim.blocks.keys()) if (dim.blocks.get(k)?.type?.id === "minecraft:water") w2++;
  check(w2 === 0, "Landschaft: Meereshöhe 0 = kein Wasser");
  await undo();
  dim.blocks.clear();
}

console.log("Formen: Material & Lieblingsformen");
{
  const { shapeTool, saveFavorite } = await import("../packs/AxiomBP/scripts/tools/shape.js");
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("stone");
  ses.s.pattern2 = parsePattern("gold_block");
  Object.assign(ses.s.shape, { type: "cuboid", rx: 2, ry: 5, rz: 2, hollow: false, wire: false, anchor: "center", look: false, material: "gradient", yaw: 0, tilt: 0, roll: 0 });
  await roundTrip("Form mit Verlauf", () => use("axiom:shape", { x: 0, y: 80, z: 0 }));
  await use("axiom:shape", { x: 0, y: 80, z: 0 });
  const layer = (y) => {
    let gold = 0;
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (dim._get(x, y, z).type.id === "minecraft:gold_block") gold++;
    return gold;
  };
  check(layer(75) <= 3 && layer(85) >= 22 && layer(80) > 3 && layer(80) < 22, "Material: Verlauf von unten (Stein) nach oben (Gold) – " + [layer(75), layer(80), layer(85)].join("/"));
  await undo();
  Object.assign(ses.s.shape, { type: "sphere", rx: 3, ry: 3, rz: 3, material: "rim" });
  await use("axiom:shape", { x: 0, y: 80, z: 0 });
  check(dim._get(0, 80, 0).type.id === "minecraft:stone" && dim._get(3, 80, 0).type.id === "minecraft:gold_block" && dim._get(0, 83, 0).type.id === "minecraft:gold_block", "Material: Rand aus Muster 2, innen Muster 1");
  await undo();
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  // Lieblingsformen
  ses.s.shapeFavs = [];
  Object.assign(ses.s.shape, { type: "polygon", sides: 8, rx: 5, ry: 9, rz: 5, material: "single" });
  saveFavorite(ses, "Achteck-Turm");
  saveFavorite(ses, "");
  check(ses.s.shapeFavs.length === 2 && ses.s.shapeFavs[1].name === "Achteck-Turm" && ses.s.shapeFavs[0].name.startsWith("Vieleck"), "Lieblingsformen: gespeichert (mit und ohne Namen)");
  saveFavorite(ses, "Achteck-Turm");
  check(ses.s.shapeFavs.length === 2, "Lieblingsformen: gleicher Name wird ersetzt");
  Object.assign(ses.s.shape, { type: "sphere", rx: 2, ry: 2, rz: 2, sides: 6 });
  answers.push({ selectText: "Achteck-Turm" });
  await shapeTool.menu(ses);
  check(ses.s.shape.type === "polygon" && ses.s.shape.sides === 8 && ses.s.shape.ry === 9, "Lieblingsformen: antippen lädt die Form");
  answers.push({ selectText: "löschen" }, { selectText: "Achteck-Turm" });
  await shapeTool.menu(ses);
  check(ses.s.shapeFavs.length === 1 && !ses.s.shapeFavs.some((f) => f.name === "Achteck-Turm"), "Lieblingsformen: löschen");
  const { shown } = await import("@minecraft/server-ui");
  const n0 = shown.length;
  answers.push({ selectText: "Einstellungen ändern" });
  await shapeTool.menu(ses);
  check(shown.slice(n0).some((f) => f.kind === "modal"), "Lieblingsformen: „Einstellungen ändern“ öffnet die Einstellungen");
  ses.s.shapeFavs = [];
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, look: true, material: "single" });
  dim.blocks.clear();
}

console.log("See bis zum Überlauf");
{
  const { findLake } = await import("../packs/AxiomBP/scripts/tools/terrain.js");
  const bowl = (x, z) => {
    const d = Math.max(Math.abs(x), Math.abs(z));
    return d <= 5 ? 60 + d : d === 6 ? 66 : 62;
  };
  const r1 = findLake(bowl, 0, 0, 5000);
  check(!("error" in r1) && r1.level === 66 && r1.cols.length === 121, "See: Mulde bis zum Rand (" + (r1.level ?? r1.error) + ")");
  const notch = (x, z) => (x === 6 && z === 0 ? 63 : bowl(x, z));
  const r2 = findLake(notch, 0, 0, 5000);
  check(!("error" in r2) && r2.level === 65, "See: Kerbe im Rand senkt den Wasserspiegel (" + r2.level + ")");
  check("error" in findLake(() => 64, 0, 0, 500), "See: flaches Land = keine Mulde");
  const pit = (x, z) => (Math.abs(x) <= 2 && Math.abs(z) <= 2 ? 61 : 64);
  const r3 = findLake(pit, 0, 0, 500);
  check(!("error" in r3) && r3.level === 64 && r3.cols.length === 25 && !r3.partial, "See: Grube in flachem Land (vollständig)");
  const big = findLake((x, z) => 70 - Math.max(0, 20 - Math.abs(x) - Math.abs(z)), 0, 0, 50);
  check(!("error" in big) && big.partial && big.cols.length <= 50 && big.level < 70, "See: riesige Mulde nur teilweise (dicht) gefüllt");
  // Im Spiel: Grube graben und füllen
  dim.blocks.clear();
  ses.sel = boxSel(dim.id, { x: -2, y: 62, z: -2 }, { x: 2, y: 64, z: 2 });
  ops.opClear(ses);
  await drain();
  Object.assign(ses.s.terrain, { mode: "lake" });
  await roundTrip("See füllen", () => use("axiom:terrain", { x: 0, y: 61, z: 0 }));
  await use("axiom:terrain", { x: 0, y: 61, z: 0 });
  check(dim._get(0, 64, 0).type.id === "minecraft:water" && dim._get(2, 62, 2).type.id === "minecraft:water", "See: Grube voll Wasser bis zum Rand");
  check(dim._get(0, 61, 0).type.id === "minecraft:sand" && dim._get(0, 65, 0).type.id === "minecraft:air" && dim._get(3, 65, 0).type.id === "minecraft:air", "See: Sandgrund, nichts läuft über");
  await undo();
  Object.assign(ses.s.terrain, { mode: "raise" });
  dim.blocks.clear();
}

console.log("Pinselformen");
{
  const { brushFalloff } = await import("../packs/AxiomBP/scripts/tools/terrain.js");
  check(brushFalloff(0, 6, "spike") === 1 && brushFalloff(3, 6, "spike") < 0.35 && brushFalloff(3, 6, "plateau") === 1 && brushFalloff(6, 6, "hard") === 1, "Pinselformen: Rechenwerte");
  check(brushFalloff(3, 6, "round") > brushFalloff(3, 6, "soft") && brushFalloff(3, 6, "soft") > brushFalloff(3, 6, "spike"), "Pinselformen: Rund > Weich > Spitz");
  const top = (x, z) => {
    for (let y = 140; y > 50; y--) if (dim._get(x, y, z).type.id !== "minecraft:air") return y;
    return 0;
  };
  const prof = {};
  for (const brush of ["spike", "plateau", "hard"]) {
    dim.blocks.clear();
    Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 6, brush, falloff: brush !== "hard", biome: false });
    if (brush === "spike") await roundTrip("Pinsel spitz", () => use("axiom:terrain", G));
    await use("axiom:terrain", G);
    prof[brush] = [top(0, 0), top(3, 0), top(6, 0)];
    await undo();
  }
  check(prof.spike[0] === 70 && prof.spike[1] <= 66, "Pinsel spitz: hoher Gipfel, schmaler Fuß (" + prof.spike + ")");
  check(prof.plateau[0] === 70 && prof.plateau[1] === 70 && prof.plateau[2] < 70, "Pinsel Plateau: flach oben (" + prof.plateau + ")");
  check(prof.hard.every((h) => h === 70), "Pinsel hart: überall gleich (" + prof.hard + ")");
  Object.assign(ses.s.terrain, { radius: 6, strength: 2, brush: "soft", falloff: true });
  dim.blocks.clear();
}

console.log("Formen ausschneiden");
{
  dim.blocks.clear();
  ses.sel = boxSel(dim.id, { x: -6, y: 65, z: -6 }, { x: 6, y: 77, z: 6 });
  ops.opFill(ses, parsePattern("stone"));
  await drain();
  Object.assign(ses.s.shape, { type: "cylinder", rx: 2, ry: 2, rz: 2, anchor: "ab", material: "carve", hollow: false, wire: false });
  await use("axiom:shape", { x: -6, y: 70, z: 0 });
  await roundTrip("Tunnel ausschneiden", () => use("axiom:shape", { x: 6, y: 70, z: 0 }));
  await use("axiom:shape", { x: -6, y: 70, z: 0 });
  await use("axiom:shape", { x: 6, y: 70, z: 0 });
  check(dim._get(0, 70, 0).type.id === "minecraft:air" && dim._get(0, 70, 2).type.id === "minecraft:air" && dim._get(0, 70, 4).type.id === "minecraft:stone" && dim._get(0, 74, 0).type.id === "minecraft:stone", "Ausschneiden: Tunnel durch den Steinblock");
  await undo();
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, anchor: "center", material: "single" });
  dim.blocks.clear();
}

console.log("Bepflanzen");
{
  const tally = () => {
    const c = { log: 0, leaves: 0, grass: 0, flower: 0, persistent: true };
    for (const p of dim.blocks.values()) {
      const id = p.type.id;
      if (id.endsWith("_log")) c.log++;
      else if (id.endsWith("_leaves")) {
        c.leaves++;
        if (p.getAllStates().persistent_bit !== true) c.persistent = false;
      } else if (id === "minecraft:short_grass") c.grass++;
      else if (/dandelion|poppy|cornflower|bluet|daisy/.test(id)) c.flower++;
    }
    return c;
  };
  dim.blocks.clear();
  Object.assign(ses.s.terrain, { mode: "plant", radius: 10, strength: 6, veg: "mix", snowY: 120 });
  await roundTrip("Bepflanzen gemischt", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  const mix = tally();
  check(mix.log > 0 && mix.leaves > mix.log && mix.grass > 20 && mix.flower > 0, "Bepflanzen: Bäume, Gras & Blumen " + JSON.stringify(mix));
  check(mix.persistent, "Bepflanzen: Blätter zerfallen nicht");
  await undo();
  ses.s.terrain.veg = "meadow";
  await use("axiom:terrain", G);
  const meadow = tally();
  check(meadow.log === 0 && meadow.grass > 20, "Bepflanzen: Wiese ohne Bäume");
  await undo();
  Object.assign(ses.s.terrain, { veg: "taiga", strength: 10 });
  await use("axiom:terrain", G);
  let spruce = 0;
  let other = 0;
  for (const p of dim.blocks.values()) {
    if (p.type.id === "minecraft:spruce_log") spruce++;
    else if (/oak_log|birch_log/.test(p.type.id)) other++;
  }
  check(spruce > 0 && other === 0, "Bepflanzen: Nadelwald nur Fichten (" + spruce + ")");
  await undo();
  // Auf Stein wächst nichts
  ses.sel = boxSel(dim.id, { x: -5, y: 64, z: -5 }, { x: 5, y: 64, z: 5 });
  ops.opFill(ses, parsePattern("stone"));
  await drain();
  const before = dim.snapshot();
  Object.assign(ses.s.terrain, { veg: "mix", radius: 4 });
  await use("axiom:terrain", G);
  check(eqSnap(before, dim.snapshot()), "Bepflanzen: auf Stein wächst nichts");
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2, veg: "mix" });
  dim.blocks.clear();
}

console.log("Formen: Streifen & Schachbrett");
{
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("white_wool");
  ses.s.pattern2 = parsePattern("red_wool");
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  Object.assign(ses.s.shape, { type: "cuboid", rx: 3, ry: 3, rz: 3, hollow: false, wire: false, anchor: "center", look: false, material: "stripesH", band: 2, yaw: 0, tilt: 0, roll: 0 });
  await roundTrip("Form mit Streifen", () => use("axiom:shape", { x: 0, y: 80, z: 0 }));
  await use("axiom:shape", { x: 0, y: 80, z: 0 });
  check(id(0, 80, 0) === id(3, 80, 3) && id(0, 80, 0) === id(0, 81, 0) && id(0, 80, 0) !== id(0, 82, 0), "Streifen waagerecht: 2 Lagen gleich, dann Wechsel");
  await undo();
  ses.s.shape.material = "stripesV";
  ses.s.shape.band = 1;
  await use("axiom:shape", { x: 0, y: 80, z: 0 });
  check(id(0, 78, 0) === id(0, 82, 0) && id(0, 80, 0) !== id(1, 80, 0), "Streifen senkrecht");
  await undo();
  ses.s.shape.material = "checker";
  await use("axiom:shape", { x: 0, y: 80, z: 0 });
  check(id(0, 80, 0) !== id(1, 80, 0) && id(0, 80, 0) !== id(0, 81, 0) && id(0, 80, 0) === id(1, 81, 0), "Schachbrett");
  await undo();
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, look: true, material: "single", band: 1 });
  dim.blocks.clear();
}

console.log("Wendeltreppe");
{
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("stone");
  ses.s.pattern2 = parsePattern("cobblestone");
  Object.assign(ses.s.shape, { type: "winding", rx: 2, ry: 4, rz: 2, pitch: 8, anchor: "center", material: "single" });
  await roundTrip("Wendeltreppe", () => use("axiom:shape", G));
  await use("axiom:shape", G);
  let core = 0;
  const cover = new Set();
  const dirs = new Set();
  const perLevel = [];
  for (let k = 0; k < 9; k++) {
    if (dim._get(0, 65 + k, 0).type.id === "minecraft:cobblestone") core++;
    let n = 0;
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) {
        const p = dim._get(x, 65 + k, z);
        if (p.type.id !== "minecraft:normal_stone_stairs") continue;
        n++;
        if (k < 8) cover.add(x + "," + z);
        dirs.add(p.getAllStates().weirdo_direction);
      }
    perLevel.push(n);
  }
  check(core === 9, "Wendeltreppe: Mittelsäule aus Muster 2");
  check(perLevel.every((n) => n > 0 && n < 8), "Wendeltreppe: jede Stufe ein Tortenstück (" + perLevel + ")");
  check(cover.size === 20 && dirs.size === 4, "Wendeltreppe: eine Umdrehung, Treppen in alle 4 Richtungen (" + cover.size + ")");
  await undo();
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, pitch: 12 });
  dim.blocks.clear();
}

console.log("Küste");
{
  const { coast } = await import("../packs/AxiomBP/scripts/tools/terrain.js");
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  dim.blocks.clear();
  ses.pathPoints = [];
  coast(ses, { width: 10, side: "right", style: "beach", cliff: 6 });
  check(player.messages.at(-1).includes("Pfad"), "Küste: ohne Punkte kommt ein Hinweis");
  ses.pathPoints = [{ x: -10, y: 65, z: 0 }, { x: 10, y: 65, z: 0 }];
  await roundTrip("Küste mit Strand", () => coast(ses, { width: 10, side: "right", style: "beach", cliff: 6 }));
  coast(ses, { width: 10, side: "right", style: "beach", cliff: 6 });
  await drain();
  check(id(0, 64, 4) === "minecraft:water" && id(0, 62, 4) === "minecraft:water" && id(0, 61, 4) === "minecraft:sand", "Küste: flaches Wasser mit Sandgrund");
  check(id(0, 64, 10) === "minecraft:water" && id(0, 58, 10) === "minecraft:gravel", "Küste: weiter draußen tiefer mit Kies");
  check(id(0, 65, -2) === "minecraft:sand" && id(0, 64, -6) === "minecraft:grass_block", "Küste: Sandstrand an Land, dahinter Wiese");
  check(id(0, 64, -2) !== "minecraft:water", "Küste: Land bleibt trocken");
  await undo();
  coast(ses, { width: 10, side: "left", style: "cliff", cliff: 6 });
  await drain();
  check(id(0, 64, -4) === "minecraft:water" && id(0, 64, 4) !== "minecraft:water", "Küste: Meer links");
  check(["minecraft:stone", "minecraft:andesite", "minecraft:cobblestone"].includes(id(0, 69, 1)) && id(0, 70, 2) === "minecraft:grass_block", "Küste: Felsklippe mit Wiese oben");
  await undo();
  ses.pathPoints = [];
  dim.blocks.clear();
}

console.log("Zwiebelturm & Rippen");
{
  const { shapeFn } = await import("../packs/AxiomBP/scripts/tools/shape.js");
  const on = shapeFn({ type: "onion", rx: 5, ry: 8, rz: 5 });
  const width = (y) => {
    let w = 0;
    for (let x = -5; x <= 5; x++) if (on.inside(x, y, 0)) w++;
    return w;
  };
  check(width(8) === 1 && width(-3) === 11 && width(-8) < width(-3) && width(3) < width(-3), "Zwiebelturm: unten schmaler, bauchig, Spitze oben (" + [width(-8), width(-3), width(3), width(8)] + ")");
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("white_concrete");
  ses.s.pattern2 = parsePattern("gold_block");
  Object.assign(ses.s.shape, { type: "hemisphere", rx: 6, ry: 6, rz: 6, hollow: true, thick: 1, anchor: "center", look: false, material: "ribs", sides: 4, band: 1, open: "none", wire: false, yaw: 0, tilt: 0, roll: 0 });
  await roundTrip("Kuppel mit Rippen", () => use("axiom:shape", { x: 0, y: 70, z: 0 }));
  await use("axiom:shape", { x: 0, y: 70, z: 0 });
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  check(id(6, 70, 0) === "minecraft:gold_block" && id(0, 70, 6) === "minecraft:gold_block" && id(-6, 70, 0) === "minecraft:gold_block", "Rippen: 4 Rippen auf den Achsen");
  check(id(4, 70, 4) === "minecraft:white_concrete", "Rippen: dazwischen Muster 1");
  await undo();
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, hollow: false, look: true, material: "single", sides: 6 });
  dim.blocks.clear();
}

console.log("Höhlen-Netz");
{
  dim.blocks.clear();
  ses.sel = boxSel(dim.id, { x: 0, y: 30, z: 0 }, { x: 31, y: 55, z: 31 });
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  await roundTrip("Höhlen-Netz", () => ops.opCaves(ses, { tunnels: 4, width: 3, chambers: 5 }, rnd));
  seed = 7;
  ops.opCaves(ses, { tunnels: 4, width: 3, chambers: 5 }, rnd);
  await drain();
  let holes = 0;
  let outside = 0;
  for (const [k, p] of dim.blocks) {
    if (p.type.id !== "minecraft:air") continue;
    const [x, y, z] = k.split(",").map(Number);
    if (x < 0 || x > 31 || y < 30 || y > 55 || z < 0 || z > 31) outside++;
    else holes++;
  }
  check(holes > 400 && outside === 0, "Höhlen-Netz: Gänge gegraben, nur in der Auswahl (" + holes + ")");
  check(dim._get(5, 64, 5).type.id === "minecraft:grass_block", "Höhlen-Netz: Oberfläche bleibt");
  await undo();
  dim.blocks.clear();
}

console.log("Bogengang");
{
  const { buildArcade } = await import("../packs/AxiomBP/scripts/tools/path.js");
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("stone_bricks");
  ses.s.pattern2 = parsePattern("quartz_block");
  ses.s.path.smooth = false;
  ses.pathPoints = [{ x: 0, y: 65, z: 0 }, { x: 18, y: 65, z: 0 }];
  await roundTrip("Bogengang", () => buildArcade(ses, { span: 6, height: 4, depth: 1 }));
  buildArcade(ses, { span: 6, height: 4, depth: 1 });
  await drain();
  const id = (x, y) => dim._get(x, y, 0).type.id;
  check(id(0, 65) === "minecraft:quartz_block" && id(6, 66) === "minecraft:quartz_block" && id(18, 65) === "minecraft:quartz_block", "Bogengang: Säulen alle 6 Blöcke");
  check(id(3, 65) === "minecraft:air" && id(3, 68) === "minecraft:air", "Bogengang: Durchgang unter dem Bogen");
  check(id(3, 72) === "minecraft:stone_bricks" && id(1, 70) === "minecraft:stone_bricks", "Bogengang: Bogen und Balken oben");
  await undo();
  ses.pathPoints = [];
  ses.s.path.smooth = true;
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  dim.blocks.clear();
}

console.log("Turm & Treppengeländer");
{
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("stone_bricks");
  ses.s.pattern2 = parsePattern("dark_oak_planks");
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  Object.assign(ses.s.shape, { type: "tower", rx: 4, ry: 5, rz: 4, anchor: "center", material: "single", roof: true });
  await roundTrip("Turm", () => use("axiom:shape", G));
  await use("axiom:shape", G);
  // Basis y=65, Höhe 11 → Mauer 66..75, Zinnen 76, Dach ab 77
  check(id(0, 65, 0) === "minecraft:stone_bricks" && id(0, 70, 0) === "minecraft:air" && id(4, 70, 1) === "minecraft:stone_bricks", "Turm: Boden, hohl, runde Mauer");
  check(id(0, 67, 4) === "minecraft:air" && id(0, 68, 4) === "minecraft:air" && id(0, 69, 4) === "minecraft:stone_bricks", "Turm: Schießscharte");
  let crenel = 0;
  let gap = 0;
  for (let dx = -4; dx <= 4; dx++)
    for (let dz = -4; dz <= 4; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > 4.5 || d <= 3.5) continue;
      if (id(dx, 76, dz) === "minecraft:stone_bricks") crenel++;
      else gap++;
    }
  check(crenel > 4 && gap > 4, "Turm: Zinnen mit Lücken (" + crenel + "/" + gap + ")");
  check(id(0, 77, 0) === "minecraft:dark_oak_planks" && id(5, 77, 0) === "minecraft:dark_oak_planks" && id(0, 77 + 8, 0) === "minecraft:dark_oak_planks", "Turm: Spitzdach aus Muster 2");
  await undo();
  ses.s.pattern = parsePattern("spruce_planks");
  ses.s.pattern2 = parsePattern("spruce_log");
  Object.assign(ses.s.shape, { type: "winding", rx: 3, ry: 4, pitch: 12, rail: true });
  await use("axiom:shape", G);
  let fence = 0;
  for (const p of dim.blocks.values()) if (p.type.id === "minecraft:spruce_fence") fence++;
  check(fence > 5, "Wendeltreppe: Geländer aus Zaun der Holzart (" + fence + ")");
  await undo();
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, pitch: 12 });
  dim.blocks.clear();
}

console.log("Terrassenfelder");
{
  dim.blocks.clear();
  // Schräger Hang: Höhe steigt mit x (y 65..76)
  for (let x = -8; x <= 8; x++) {
    const h = 64 + Math.round((x + 8) * 0.7);
    for (let z = -8; z <= 8; z++) for (let y = 65; y <= h; y++) dim._set(x, y, z, BlockPermutation.resolve(y === h ? "minecraft:grass_block" : "minecraft:dirt"));
  }
  const top = (x, z) => {
    for (let y = 100; y > 50; y--) if (dim._get(x, y, z).type.id !== "minecraft:air") return y;
    return 0;
  };
  Object.assign(ses.s.terrain, { mode: "fields", radius: 6, strength: 3, wall: "minecraft:stone_bricks", biome: false });
  await roundTrip("Terrassenfelder", () => use("axiom:terrain", { x: 0, y: top(0, 0), z: 0 }));
  await use("axiom:terrain", { x: 0, y: top(0, 0), z: 0 });
  const hs = [];
  for (let x = -5; x <= 5; x++) hs.push(top(x, 0));
  check(hs.every((h) => h % 3 === 0), "Terrassenfelder: nur Stufenhöhen (" + hs + ")");
  check(new Set(hs).size >= 2 && hs.every((h, i) => i === 0 || h >= hs[i - 1]), "Terrassenfelder: ebene Stufen bergauf");
  let walls = 0;
  for (const p of dim.blocks.values()) if (p.type.id === "minecraft:stone_bricks") walls++;
  check(walls > 5, "Terrassenfelder: Stützmauern aus Steinziegeln (" + walls + ")");
  await undo();
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2 });
  dim.blocks.clear();
}

console.log("Fachwerk");
{
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("white_concrete");
  ses.s.pattern2 = parsePattern("dark_oak_planks");
  ses.sel = boxSel(dim.id, { x: 0, y: 70, z: 0 }, { x: 8, y: 74, z: 0 });
  Object.assign(ses.s.shape, { type: "cuboid", anchor: "sel", material: "timber", band: 2, hollow: false, wire: false, yaw: 0, tilt: 0, roll: 0 });
  await roundTrip("Fachwerkwand", () => use("axiom:shape", G));
  await use("axiom:shape", G);
  const id = (x, y) => dim._get(x, y, 0).type.id;
  const D = "minecraft:dark_oak_planks";
  const W = "minecraft:white_concrete";
  check(id(0, 70) === D && id(4, 72) === D && id(8, 71) === D, "Fachwerk: Riegel & Ständer alle 4 Blöcke");
  check(id(1, 71) === D && id(3, 71) === D && id(2, 73) === W, "Fachwerk: Andreaskreuz im Feld");
  await undo();
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, anchor: "center", material: "single", band: 1 });
  dim.blocks.clear();
}

console.log("Trampelpfad");
{
  const { trail } = await import("../packs/AxiomBP/scripts/tools/terrain.js");
  dim.blocks.clear();
  // Hügel, damit der Weg der Höhe folgen muss
  for (let x = 5; x <= 9; x++) for (let z = -4; z <= 4; z++) for (let y = 65; y <= 67; y++) dim._set(x, y, z, BlockPermutation.resolve(y === 67 ? "minecraft:grass_block" : "minecraft:dirt"));
  dim._set(2, 65, 0, BlockPermutation.resolve("minecraft:short_grass"));
  ses.pathPoints = [{ x: 0, y: 65, z: 0 }, { x: 14, y: 65, z: 0 }];
  await roundTrip("Trampelpfad", () => trail(ses, { width: 3, style: "dirt" }));
  trail(ses, { width: 3, style: "dirt" });
  await drain();
  const PATH = ["minecraft:grass_path", "minecraft:coarse_dirt", "minecraft:dirt"];
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  check(PATH.includes(id(2, 64, 0)) && PATH.includes(id(12, 64, 0)) && id(2, 65, 0) === "minecraft:air", "Trampelpfad: Weg auf dem Boden, Gras entfernt");
  check(PATH.includes(id(7, 67, 0)) && id(7, 68, 0) === "minecraft:air", "Trampelpfad: folgt dem Hügel");
  check(id(7, 64, 6) === "minecraft:grass_block" && id(2, 64, 4) === "minecraft:grass_block", "Trampelpfad: daneben bleibt Wiese");
  await undo();
  trail(ses, { width: 3, style: "stone" });
  await drain();
  check(["minecraft:cobblestone", "minecraft:mossy_cobblestone", "minecraft:stone_bricks", "minecraft:gravel"].includes(id(2, 64, 0)), "Trampelpfad: Pflaster");
  await undo();
  ses.pathPoints = [];
  dim.blocks.clear();
}

console.log("Spitzbogen & Rosette");
{
  const { shapeFn } = await import("../packs/AxiomBP/scripts/tools/shape.js");
  const g = shapeFn({ type: "gothic", rx: 3, ry: 7, rz: 0 });
  const row = (y) => {
    let w = 0;
    for (let x = -3; x <= 3; x++) if (g.inside(x, y, 0)) w++;
    return w;
  };
  check(row(-7) === 7 && row(0) === 7 && row(7) <= 3 && row(7) >= 1 && g.inside(0, 7, 0), "Spitzbogen: unten gerade, oben spitz (" + [row(-7), row(0), row(5), row(7)] + ")");
  const r = shapeFn({ type: "rose", rx: 7, ry: 7, rz: 0, sides: 8 });
  check(r.inside(7, 0, 0) && r.inside(0, 0, 0) && r.inside(4, 0, 0) && !r.inside(5, 2, 0) && !r.inside(2, 5, 0), "Rosette: Ring, Nabe, Speichen, dazwischen frei");
  let filled = 0;
  for (let x = -7; x <= 7; x++) for (let y = -7; y <= 7; y++) if (r.inside(x, y, 0)) filled++;
  check(filled > 40 && filled < 120, "Rosette: Maßwerk statt voller Scheibe (" + filled + ")");
}

console.log("Inselgruppe");
{
  dim.blocks.clear();
  ses.sel = boxSel(dim.id, { x: 0, y: 50, z: 0 }, { x: 47, y: 79, z: 47 });
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const o = { count: 4, size: 45, sea: 40 };
  await roundTrip("Inselgruppe", () => ops.opIslands(ses, o, rnd));
  seed = 11;
  ops.opIslands(ses, o, rnd);
  await drain();
  const seaY = 50 + Math.round(29 * 0.4);
  let land = 0;
  let sea = 0;
  let sand = 0;
  let grass = 0;
  for (let x = 0; x <= 47; x++)
    for (let z = 0; z <= 47; z++) {
      for (let y = 79; y >= 50; y--) {
        const id = dim._get(x, y, z).type.id;
        if (id === "minecraft:air") continue;
        if (id === "minecraft:water") sea++;
        else {
          land++;
          if (id === "minecraft:sand") sand++;
          if (id === "minecraft:grass_block") grass++;
        }
        break;
      }
    }
  check(sea > 500 && land > 100, "Inselgruppe: Meer und Inseln (" + sea + "/" + land + ")");
  check(sand > 20 && grass > 20, "Inselgruppe: Strände und Wiesen (" + sand + "/" + grass + ")");
  check(dim._get(0, seaY, 0).type.id === "minecraft:water" || dim._get(47, seaY, 47).type.id === "minecraft:water", "Inselgruppe: Rand ist Meer");
  await undo();
  dim.blocks.clear();
}

console.log("Gewölbe");
{
  dim.blocks.clear();
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  const oldP = ses.s.pattern;
  ses.s.pattern = parsePattern("stone_bricks");
  // Halle 11 breit, 5 hoch, 11 tief – Gewölbe in die Auswahl einpassen
  ses.sel = boxSel(dim.id, { x: 0, y: 70, z: 0 }, { x: 10, y: 74, z: 10 });
  Object.assign(ses.s.shape, { type: "barrel", anchor: "sel", material: "single", hollow: false, wire: false, yaw: 0, tilt: 0, roll: 0 });
  await roundTrip("Tonnengewölbe", () => use("axiom:shape", G));
  await use("axiom:shape", G);
  check(id(5, 72, 5) === "minecraft:air" && id(5, 73, 5) === "minecraft:air" && id(5, 74, 5) === "minecraft:stone_bricks" && id(0, 73, 5) === "minecraft:stone_bricks", "Tonnengewölbe: Mitte frei, Scheitel und Seiten gemauert");
  check(id(5, 74, 0) === id(5, 74, 10) && id(0, 73, 3) === id(0, 73, 7), "Tonnengewölbe: entlang Z gleich");
  await undo();
  ses.s.shape.type = "groin";
  await use("axiom:shape", G);
  check(id(5, 73, 0) === "minecraft:air" && id(0, 73, 5) === "minecraft:air" && id(0, 74, 0) === "minecraft:stone_bricks" && id(1, 73, 1) === "minecraft:stone_bricks", "Kreuzgewölbe: Tonnen in beide Richtungen, Ecken als Pfeiler-Ansatz");
  await undo();
  ses.s.pattern = oldP;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, anchor: "center" });
  dim.blocks.clear();
}

console.log("Eis & Gletscher");
{
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  const ICE = ["minecraft:packed_ice", "minecraft:blue_ice", "minecraft:snow"];
  dim.blocks.clear();
  // Meer: Wasser y 58..64 über Sandgrund
  ses.sel = boxSel(dim.id, { x: -12, y: 58, z: -12 }, { x: 12, y: 64, z: 12 });
  ops.opFill(ses, parsePattern("water"));
  await drain();
  Object.assign(ses.s.terrain, { mode: "iceberg", radius: 4, strength: 3, jag: 3 });
  await roundTrip("Eisberg", () => use("axiom:terrain", { x: 0, y: 57, z: 0 }));
  await use("axiom:terrain", { x: 0, y: 57, z: 0 });
  check(ICE.includes(id(0, 66, 0)) && ICE.includes(id(0, 60, 0)) && id(0, 75, 0) === "minecraft:air", "Eisberg: über und unter Wasser");
  check(id(10, 64, 10) === "minecraft:water", "Eisberg: Meer drumherum bleibt");
  await undo();
  const m0 = player.messages.length;
  dim.blocks.clear();
  await use("axiom:terrain", G);
  check(player.messages.slice(m0).some((m) => m.includes("Wasser")), "Eisberg: an Land kommt ein Hinweis");
  const oldView = player.view;
  player.view = { x: 1, y: 0, z: 0 };
  Object.assign(ses.s.terrain, { mode: "glacier", radius: 5, strength: 4, jag: 0, rot: 0, stretch: 20, biome: false });
  await roundTrip("Gletscher", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  const top = (x, z) => {
    for (let y = 100; y > 50; y--) if (id(x, y, z) !== "minecraft:air") return y;
    return 0;
  };
  check(top(-8, 0) > top(8, 0) && top(8, 0) > 64, "Gletscher: hinten dick, vorne dünner (" + top(-8, 0) + "/" + top(8, 0) + ")");
  check(id(-8, top(-8, 0), 0) === "minecraft:snow" && ICE.includes(id(8, top(8, 0), 0)) && id(0, 65, 0) === "minecraft:packed_ice", "Gletscher: Schnee oben, Eis vorne und innen");
  await undo();
  player.view = oldView;
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2, jag: 3, stretch: 10 });
  dim.blocks.clear();
}

console.log("Leuchtturm");
{
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("white_concrete");
  ses.s.pattern2 = parsePattern("red_concrete");
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  Object.assign(ses.s.shape, { type: "lighthouse", rx: 4, ry: 7, rz: 4, band: 2, anchor: "center", material: "single" });
  await roundTrip("Leuchtturm", () => use("axiom:shape", G));
  await use("axiom:shape", G);
  // Basis 65, Turm 15 hoch → Galerie auf 80
  const walls = new Set();
  for (let y = 66; y <= 78; y++) for (let x = -4; x <= 4; x++) {
    const w = id(x, y, 0);
    if (w.endsWith("_concrete")) walls.add(w);
  }
  check(walls.has("minecraft:white_concrete") && walls.has("minecraft:red_concrete"), "Leuchtturm: rot-weiß gestreift");
  check(id(0, 70, 0) === "minecraft:air", "Leuchtturm: innen hohl");
  check(id(0, 80, 0) === "minecraft:smooth_stone" && [...Array(9)].some((_, i) => id(i - 4, 81, 0) === "minecraft:iron_bars" || id(0, 81, i - 4) === "minecraft:iron_bars"), "Leuchtturm: Galerie mit Geländer");
  check(id(0, 82, 0) === "minecraft:sea_lantern" && [...Array(7)].some((_, i) => id(i - 3, 82, 0) === "minecraft:glass"), "Leuchtturm: Laterne mit Licht");
  let roof = 0;
  for (let y = 85; y <= 90; y++) if (id(0, y, 0) === "minecraft:red_concrete") roof++;
  check(roof >= 2, "Leuchtturm: Dach aus Muster 2");
  await undo();
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, band: 1 });
  dim.blocks.clear();
}

console.log("Badlands");
{
  dim.blocks.clear();
  // Steile Felswand: x>=3 bis y 80 aus Stein
  ses.sel = boxSel(dim.id, { x: 3, y: 65, z: -6 }, { x: 10, y: 80, z: 6 });
  ops.opFill(ses, parsePattern("stone"));
  await drain();
  Object.assign(ses.s.terrain, { mode: "badlands", radius: 6 });
  await roundTrip("Badlands", () => use("axiom:terrain", { x: 3, y: 72, z: 0 }));
  await use("axiom:terrain", { x: 3, y: 72, z: 0 });
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  const colors = new Set();
  for (let y = 66; y <= 79; y++) colors.add(id(3, y, 0));
  check([...colors].every((c) => c.endsWith("_terracotta")) && colors.size >= 3, "Badlands: Wand in bunten Schichten (" + colors.size + ")");
  check(id(3, 72, 0) === id(3, 72, 1), "Badlands: Schichten waagerecht");
  check(id(6, 80, 0) === "minecraft:red_sand" && id(6, 75, 0) === "minecraft:stone", "Badlands: oben roter Sand, innen bleibt Stein");
  check(id(0, 64, 0) === "minecraft:red_sand" || id(0, 64, 0).endsWith("_terracotta") || id(0, 64, 0) === "minecraft:grass_block", "Badlands: Boden davor");
  await undo();
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6 });
  dim.blocks.clear();
}

console.log("Brunnen");
{
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("cobblestone");
  ses.s.pattern2 = parsePattern("spruce_planks");
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  const oldView = player.view;
  player.view = { x: 0, y: 0, z: 1 };
  Object.assign(ses.s.shape, { type: "well", rx: 2, ry: 4, rz: 2, sides: 6, anchor: "center", material: "single" });
  await roundTrip("Brunnen", () => use("axiom:shape", G));
  await use("axiom:shape", G);
  // Boden auf 64: Wasser 60..63, Rand auf 65, Boden 59
  check(id(0, 62, 0) === "minecraft:water" && id(0, 63, 0) === "minecraft:water" && id(0, 59, 0) === "minecraft:cobblestone", "Brunnen: Schacht mit Wasser und Boden");
  check(id(2, 65, 0) === "minecraft:cobblestone" && id(0, 65, 0) === "minecraft:air" && id(2, 61, 0) === "minecraft:cobblestone", "Brunnen: Rand und gemauerter Schacht");
  check(id(2, 67, 0) === "minecraft:spruce_planks" && id(-2, 67, 0) === "minecraft:spruce_planks" && id(0, 69, 0) === "minecraft:spruce_planks", "Brunnen: Pfosten und Dach");
  await undo();
  ses.s.shape.sides = 4;
  await use("axiom:shape", G);
  check(id(2, 65, 2) === "minecraft:cobblestone", "Brunnen: eckig mit „4 Ecken“");
  await undo();
  player.view = oldView;
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, sides: 6 });
  dim.blocks.clear();
}

console.log("Sumpf");
{
  dim.blocks.clear();
  Object.assign(ses.s.terrain, { mode: "swamp", radius: 10 });
  await roundTrip("Sumpf", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  const count = {};
  for (const p of dim.blocks.values()) count[p.type.id] = (count[p.type.id] ?? 0) + 1;
  check((count["minecraft:water"] ?? 0) > 20 && (count["minecraft:mud"] ?? 0) > 10, "Sumpf: Wasser und Schlamm " + JSON.stringify({ w: count["minecraft:water"], m: count["minecraft:mud"] }));
  check((count["minecraft:waterlily"] ?? 0) > 0 && (count["minecraft:reeds"] ?? 0) + (count["minecraft:mangrove_roots"] ?? 0) > 0, "Sumpf: Seerosen und Schilf/Wurzeln");
  let above = 0;
  for (const [k, p] of dim.blocks) if (p.type.id === "minecraft:water" && Number(k.split(",")[1]) > 64) above++;
  check(above === 0, "Sumpf: Wasser nur bis zur Zielhöhe");
  await undo();
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6 });
  dim.blocks.clear();
}

console.log("Windmühle");
{
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("white_concrete");
  ses.s.pattern2 = parsePattern("spruce_planks");
  const oldView = player.view;
  player.view = { x: 0, y: 0, z: 1 };
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  Object.assign(ses.s.shape, { type: "windmill", rx: 3, ry: 6, rz: 3, anchor: "center", material: "single" });
  await roundTrip("Windmühle", () => use("axiom:shape", G));
  await use("axiom:shape", G);
  // Turm 13 hoch ab 65, Dach ab 78, Nabe vor dem Turm (z negativ, zum Spieler) auf y 76
  check(id(3, 66, 0) === "minecraft:white_concrete" && id(0, 70, 0) === "minecraft:air", "Windmühle: hohler Turm");
  check(id(0, 78, 0) === "minecraft:spruce_planks", "Windmühle: Kegeldach");
  let wool = 0;
  let hubZ = null;
  for (const [k, p] of dim.blocks) {
    if (p.type.id === "minecraft:white_wool") {
      wool++;
      hubZ ??= Number(k.split(",")[2]);
    }
  }
  check(wool > 20 && hubZ !== null && hubZ < -2, "Windmühle: vier Flügel mit Segeln vor dem Turm (" + wool + ", z=" + hubZ + ")");
  await undo();
  player.view = oldView;
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4 });
  dim.blocks.clear();
}

console.log("Lava-Vulkan");
{
  dim.blocks.clear();
  Object.assign(ses.s.terrain, { mode: "volcano", radius: 10, strength: 3, lava: true, jag: 6, rot: 0, stretch: 10, biome: false, falloff: true });
  await roundTrip("Lava-Vulkan", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  const count = {};
  for (const p of dim.blocks.values()) count[p.type.id] = (count[p.type.id] ?? 0) + 1;
  check((count["minecraft:lava"] ?? 0) > 0, "Lava-Vulkan: Lavasee im Krater (" + (count["minecraft:lava"] ?? 0) + ")");
  check((count["minecraft:basalt"] ?? 0) + (count["minecraft:blackstone"] ?? 0) > 30 && (count["minecraft:magma"] ?? 0) > 0, "Lava-Vulkan: Basalt, Schwarzstein, Magma");
  let lavaHigh = 0;
  for (const [k, p] of dim.blocks) if (p.type.id === "minecraft:lava" && Number(k.split(",")[1]) > 64 + Math.round(3 * 5 * 0.82) - 2) lavaHigh++;
  check(lavaHigh === 0, "Lava-Vulkan: Lava läuft nicht über den Rand");
  await undo();
  ses.s.terrain.lava = false;
  await use("axiom:terrain", G);
  let lava = 0;
  for (const p of dim.blocks.values()) if (p.type.id === "minecraft:lava") lava++;
  check(lava === 0, "Vulkan ohne Lava wie bisher");
  await undo();
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2, jag: 3 });
  dim.blocks.clear();
}

console.log("Hängebrücke");
{
  const { buildSuspension } = await import("../packs/AxiomBP/scripts/tools/path.js");
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("oak_planks");
  ses.s.pattern2 = parsePattern("stone_bricks");
  ses.pathPoints = [{ x: 0, y: 71, z: 0 }, { x: 20, y: 71, z: 0 }];
  await roundTrip("Hängebrücke", () => buildSuspension(ses, { width: 3, tower: 8 }));
  buildSuspension(ses, { width: 3, tower: 8 });
  await drain();
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  check(id(10, 70, 0) === "minecraft:oak_planks" && id(10, 70, 1) === "minecraft:oak_planks" && id(10, 69, 0) === "minecraft:air", "Hängebrücke: Belag frei in der Luft");
  check(id(0, 78, 2) === "minecraft:stone_bricks" && id(0, 66, 2) === "minecraft:stone_bricks" && id(20, 78, -2) === "minecraft:stone_bricks", "Hängebrücke: Türme bis zum Boden");
  check(id(10, 71, 2) === "minecraft:chain" && id(3, 75, 2) === "minecraft:chain", "Hängebrücke: Ketten im Bogen");
  ses.pathPoints = [{ x: 0, y: 71, z: 0 }, { x: 2, y: 71, z: 0 }];
  const m0 = player.messages.length;
  buildSuspension(ses, { width: 3, tower: 8 });
  check(player.messages.slice(m0).some((m) => m.includes("4 Blöcke")), "Hängebrücke: zu kurz wird abgelehnt");
  await undo();
  ses.pathPoints = [];
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  dim.blocks.clear();
}

console.log("Wasserfall-Kaskade");
{
  const { cascade } = await import("../packs/AxiomBP/scripts/tools/terrain.js");
  dim.blocks.clear();
  // Treppenförmiger Hang: x 0..5 Höhe 72, 6..11 Höhe 68, ab 12 flach (64)
  for (let x = 0; x <= 11; x++)
    for (let z = -4; z <= 4; z++) {
      const h = x <= 5 ? 72 : 68;
      for (let y = 65; y <= h; y++) dim._set(x, y, z, BlockPermutation.resolve(y === h ? "minecraft:grass_block" : "minecraft:dirt"));
    }
  ses.pathPoints = [{ x: 2, y: 73, z: 0 }, { x: 8, y: 69, z: 0 }, { x: 16, y: 65, z: 0 }];
  await roundTrip("Kaskade", () => cascade(ses, { pool: 1 }));
  cascade(ses, { pool: 1 });
  await drain();
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  check(id(2, 72, 0) === "minecraft:water" && id(8, 68, 0) === "minecraft:water" && id(16, 64, 0) === "minecraft:water", "Kaskade: Becken auf jeder Stufe");
  check(id(2, 70, 0) === "minecraft:gravel" && id(2, 72, 2) === "minecraft:mossy_cobblestone", "Kaskade: Kiesboden und bemooster Rand");
  let groove = 0;
  for (let x = 4; x <= 14; x++) for (let y = 62; y <= 73; y++) if (id(x, y, 0) === "minecraft:gravel") groove++;
  check(groove >= 5, "Kaskade: Rinnen zwischen den Becken (" + groove + ")");
  await undo();
  ses.pathPoints = [];
  dim.blocks.clear();
}

console.log("Gerade Treppe");
{
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  ses.s.pattern = parsePattern("oak_planks");
  Object.assign(ses.s.shape, { type: "straight", rx: 1 });
  ses.shapeA = undefined;
  const snap = dim.snapshot();
  await use("axiom:shape", { x: 0, y: 64, z: 0 });
  check(eqSnap(snap, dim.snapshot()) && !!ses.shapeA, "Gerade Treppe: erster Klick merkt Punkt A");
  await roundTrip("Gerade Treppe", () => use("axiom:shape", { x: 20, y: 75, z: 2 }));
  await use("axiom:shape", { x: 0, y: 64, z: 0 });
  await use("axiom:shape", { x: 20, y: 75, z: 2 });
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  // A = (0,65,0), B = (20,76,2) → 11 Stufen in +x, Podest nach 8 Stufen
  check(id(0, 65, 0) === "minecraft:oak_stairs" && id(1, 66, 0) === "minecraft:oak_stairs" && id(1, 66, 1) === "minecraft:oak_stairs", "Gerade Treppe: Stufen aus Eichentreppen, 3 breit");
  check(id(8, 72, 0) === "minecraft:oak_planks" && id(9, 72, 0) === "minecraft:oak_planks" && id(10, 73, 0) === "minecraft:oak_stairs", "Gerade Treppe: Podest nach 8 Stufen");
  check(id(5, 66, 0) === "minecraft:oak_planks", "Gerade Treppe: massive Wange darunter");
  check(dim._get(0, 65, 0).getAllStates().weirdo_direction === 0, "Gerade Treppe: Stufen steigen nach Osten an");
  await undo();
  ses.s.pattern = oldP;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4 });
  dim.blocks.clear();
}

console.log("Schlucht mit Fluss");
{
  dim.blocks.clear();
  const oldView = player.view;
  player.view = { x: 1, y: 0, z: 0 };
  Object.assign(ses.s.terrain, { mode: "canyon", radius: 10, strength: 3, river: true, jag: 0, rot: 0, stretch: 10, biome: false });
  await roundTrip("Schlucht mit Fluss", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  const riverY = 64 - 12;
  let water = 0;
  let wrong = 0;
  for (const [k, p] of dim.blocks) {
    if (p.type.id !== "minecraft:water") continue;
    water++;
    if (Number(k.split(",")[1]) > riverY) wrong++;
  }
  check(water > 3 && wrong === 0, "Schlucht: Fluss am Grund auf einer Höhe (" + water + ")");
  let gravel = 0;
  for (const p of dim.blocks.values()) if (p.type.id === "minecraft:gravel") gravel++;
  check(gravel > 3, "Schlucht: Kies-Ufer und Flussbett");
  check(id(0, 60, 6) !== "minecraft:air", "Schlucht: Ränder bleiben stehen");
  await undo();
  player.view = oldView;
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2, river: false, jag: 3 });
  dim.blocks.clear();
}

console.log("Stadtmauer");
{
  const { buildCityWall } = await import("../packs/AxiomBP/scripts/tools/path.js");
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  ses.s.pattern = parsePattern("stone_bricks");
  ses.pathPoints = [{ x: 0, y: 65, z: 0 }, { x: 20, y: 65, z: 0 }, { x: 20, y: 65, z: 16 }];
  await roundTrip("Stadtmauer", () => buildCityWall(ses, { height: 6, thick: 3, towers: true }));
  buildCityWall(ses, { height: 6, thick: 3, towers: true });
  await drain();
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  const SB = "minecraft:stone_bricks";
  check(id(10, 65, 0) === SB && id(10, 70, 1) === SB && id(10, 70, -1) === SB && id(10, 71, 0) === "minecraft:air", "Stadtmauer: 3 dick, Wehrgang oben frei");
  let crenel = 0;
  for (let x = 6; x <= 14; x++) if (id(x, 71, 1) === SB) crenel++;
  check(crenel >= 3 && crenel <= 6, "Stadtmauer: Zinnen mit Lücken (" + crenel + ")");
  check(id(20, 72, 8) === "minecraft:air" && id(20, 70, 8) === SB, "Stadtmauer: Ecke folgt dem zweiten Abschnitt");
  check(id(0, 73, 3) === SB && id(0, 72, 0) === "minecraft:air", "Stadtmauer: hohler Turm am Punkt");
  await undo();
  ses.pathPoints = [];
  ses.s.pattern = oldP;
  dim.blocks.clear();
}

console.log("Blumenwiese");
{
  const { FLOWER_SETS } = await import("../packs/AxiomBP/scripts/tools/terrain.js");
  dim.blocks.clear();
  Object.assign(ses.s.terrain, { mode: "flowers", radius: 8, strength: 6, snowY: 120 });
  await roundTrip("Blumenwiese", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  const all = new Set([...FLOWER_SETS.low, ...FLOWER_SETS.mid, ...FLOWER_SETS.high]);
  /** @type {Map<string,string>} */
  const fl = new Map();
  let grass = 0;
  for (const [k, p] of dim.blocks) {
    if (all.has(p.type.id)) fl.set(k, p.type.id);
    if (p.type.id === "minecraft:short_grass") grass++;
  }
  check(fl.size > 20 && grass > 5, "Blumenwiese: Blumen und Gras (" + fl.size + "/" + grass + ")");
  check([...fl.values()].every((id) => FLOWER_SETS.low.includes(id)), "Blumenwiese: im Tal Tal-Blumen");
  // Gruppen: Nachbarn haben oft dieselbe Sorte
  let same = 0;
  let pairs = 0;
  for (const [k, id] of fl) {
    const [x, y, z] = k.split(",").map(Number);
    const nb = fl.get(x + 1 + "," + y + "," + z);
    if (nb) {
      pairs++;
      if (nb === id) same++;
    }
  }
  check(pairs > 0 && same / pairs > 0.4, "Blumenwiese: Blumen in Gruppen (" + same + "/" + pairs + ")");
  // Auf belegte Blöcke und Stein wird nichts gesetzt
  const snap = dim.snapshot();
  await use("axiom:terrain", G);
  check(eqSnap(snap, dim.snapshot()), "Blumenwiese: zweimal malen ändert nichts mehr");
  await undo();
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2 });
  dim.blocks.clear();
}

console.log("Pavillon");
{
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("smooth_stone");
  ses.s.pattern2 = parsePattern("spruce_planks");
  const oldView = player.view;
  player.view = { x: 0, y: 0, z: 1 };
  Object.assign(ses.s.shape, { type: "pavilion", rx: 4, ry: 1, rz: 4, sides: 8, anchor: "center" });
  await roundTrip("Pavillon", () => use("axiom:shape", G));
  await use("axiom:shape", G);
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  let cols = 0;
  let fence = 0;
  for (const [k, p] of dim.blocks) {
    const y = Number(k.split(",")[1]);
    if (p.type.id === "minecraft:spruce_planks" && y === 67) cols++;
    if (p.type.id === "minecraft:spruce_fence") fence++;
  }
  check(id(0, 65, 0) === "minecraft:smooth_stone" && cols === 8, "Pavillon: Boden und 8 Säulen (" + cols + ")");
  check(fence > 5 && id(0, 66, -4) !== "minecraft:spruce_fence", "Pavillon: Geländer mit Eingang zum Spieler (" + fence + ")");
  check(id(0, 69, 0) === "minecraft:spruce_planks" && id(0, 66, 0) === "minecraft:air", "Pavillon: Dach, innen frei");
  await undo();
  player.view = oldView;
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4, sides: 6 });
  dim.blocks.clear();
}

console.log("Felsnadeln");
{
  dim.blocks.clear();
  ses.sel = boxSel(dim.id, { x: -12, y: 64, z: -12 }, { x: 12, y: 64, z: 12 });
  ops.opFill(ses, parsePattern("sand"));
  await drain();
  Object.assign(ses.s.terrain, { mode: "hoodoos", radius: 8, strength: 4 });
  await roundTrip("Felsnadeln", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  // Säulen zählen: Spalten mit Sandstein in Höhe 68
  let cols = 0;
  let caps = 0;
  for (const [k, p] of dim.blocks) {
    const y = Number(k.split(",")[1]);
    if (y === 68 && /sandstone/.test(p.type.id)) cols++;
    if (y > 69 && p.type.id === "minecraft:red_sandstone") caps++;
  }
  check(cols >= 3, "Felsnadeln: mehrere Säulen aus Sandstein (" + cols + ")");
  check(caps > 0, "Felsnadeln: Decksteine");
  await undo();
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2 });
  dim.blocks.clear();
}

console.log("Säulenhalle");
{
  dim.blocks.clear();
  const oldP = ses.s.pattern;
  const oldP2 = ses.s.pattern2;
  ses.s.pattern = parsePattern("quartz_block");
  ses.s.pattern2 = parsePattern("bricks");
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  // 15 lang (X), 11 breit (Z), 12 hoch
  ses.sel = boxSel(dim.id, { x: 0, y: 65, z: 0 }, { x: 14, y: 76, z: 10 });
  Object.assign(ses.s.shape, { type: "temple", anchor: "center", roof: true });
  await roundTrip("Säulenhalle", () => use("axiom:shape", G));
  await use("axiom:shape", G);
  let cols = 0;
  for (const [k, p] of dim.blocks) if (p.type.id === "minecraft:quartz_block" && Number(k.split(",")[1]) === 68) cols++;
  check(id(0, 65, 0) === "minecraft:quartz_block" && id(7, 65, 5) === "minecraft:quartz_block", "Säulenhalle: Stufen-Sockel");
  check(cols === 14 && id(1, 66, 1) === "minecraft:quartz_block" && id(2, 66, 1) === "minecraft:air" && id(7, 68, 5) === "minecraft:air", "Säulenhalle: 14 Säulen, dazwischen frei (" + cols + ")");
  check(id(7, 73, 5) === "minecraft:quartz_block" && id(0, 73, 5) === "minecraft:quartz_block" && id(-1, 73, 5) === "minecraft:air", "Säulenhalle: Gebälk mit Überstand bis zum Rand");
  check(id(7, 74, 0) === "minecraft:bricks" && id(7, 76, 5) === "minecraft:bricks" && id(7, 74, 5) === "minecraft:air" && id(7, 77, 5) === "minecraft:air", "Säulenhalle: Giebeldach mit First entlang X");
  check(id(1, 74, 5) === "minecraft:quartz_block" && id(13, 75, 5) === "minecraft:quartz_block", "Säulenhalle: Giebelwände vorn und hinten");
  await undo();
  // Flachdach, Säulen dann höher
  ses.s.shape.roof = false;
  await use("axiom:shape", G);
  check(id(1, 75, 1) === "minecraft:quartz_block" && id(7, 76, 5) === "minecraft:quartz_block" && id(7, 77, 5) === "minecraft:air", "Säulenhalle: ohne Dach = Flachdach");
  await undo();
  ses.s.shape.roof = true;
  // zu niedrig / zu schmal: nichts passiert
  const snap = dim.snapshot();
  ses.sel = boxSel(dim.id, { x: 0, y: 65, z: 0 }, { x: 14, y: 70, z: 10 });
  await use("axiom:shape", G);
  ses.sel = boxSel(dim.id, { x: 0, y: 65, z: 0 }, { x: 3, y: 76, z: 10 });
  await use("axiom:shape", G);
  check(eqSnap(snap, dim.snapshot()), "Säulenhalle: zu niedrige oder schmale Auswahl ändert nichts");
  ses.s.pattern = oldP;
  ses.s.pattern2 = oldP2;
  Object.assign(ses.s.shape, { type: "sphere", rx: 4, ry: 4, rz: 4 });
  ses.sel = undefined;
  dim.blocks.clear();
}

console.log("Oase");
{
  dim.blocks.clear();
  const id = (x, y, z) => dim._get(x, y, z).type.id;
  Object.assign(ses.s.terrain, { mode: "oasis", radius: 8 });
  await roundTrip("Oase", () => use("axiom:terrain", G));
  await use("axiom:terrain", G);
  const count = (pred) => {
    let k = 0;
    for (const [key, p] of dim.blocks) if (pred(p.type.id, Number(key.split(",")[1]))) k++;
    return k;
  };
  const water = count((b) => b === "minecraft:water");
  check(id(0, 64, 0) === "minecraft:water" && ["minecraft:water", "minecraft:seagrass"].includes(id(0, 62, 0)) && id(0, 61, 0) === "minecraft:sand" && water > 40, "Oase: See in der Mitte, 3 tief mit Sandgrund (" + water + ")");
  check(count((b, y) => b === "minecraft:water" && y > 64) === 0, "Oase: Wasser nicht über dem Spiegel");
  const logs = count((b) => b === "minecraft:jungle_log");
  const leaves = count((b) => b === "minecraft:jungle_leaves");
  check(logs >= 10 && leaves >= 20, "Oase: Palmen am Ufer (" + logs + " Stamm, " + leaves + " Blätter)");
  check(count((b) => b === "minecraft:reeds") > 0 && count((b, y) => b === "minecraft:grass_block" && y === 65) > 5, "Oase: grünes Ufer mit Schilf");
  check(count((b, y) => b === "minecraft:sand" && y === 64) > 10, "Oase: außen Sand");
  await undo();
  Object.assign(ses.s.terrain, { mode: "raise", radius: 6, strength: 2 });
  dim.blocks.clear();
}

console.log("Gespiegelte Kopie & Brücke");
{
  dim.blocks.clear();
  ses.s.mask = { mode: "none", ids: [] };
  ses.s.symmetry = { x: false, z: false, center: null };
  // Asymmetrisches L: Block bei x=0 hoch, Rest flach
  ses.sel = boxSel(dim.id, { x: 0, y: 65, z: 0 }, { x: 3, y: 65, z: 0 });
  ops.opFill(ses, parsePattern("bricks"));
  await drain();
  dim._set(0, 66, 0, BlockPermutation.resolve("minecraft:gold_block"));
  ses.sel = boxSel(dim.id, { x: 0, y: 65, z: 0 }, { x: 3, y: 66, z: 0 });
  await roundTrip("Gespiegelte Kopie", () => ops.opMirrorCopy(ses, { x: 1, y: 0, z: 0 }, 0));
  ops.opMirrorCopy(ses, { x: 1, y: 0, z: 0 }, 0);
  await drain();
  check(dim._get(7, 66, 0).type.id === "minecraft:gold_block" && dim._get(4, 66, 0).type.id === "minecraft:air", "Kopie gespiegelt: Turm am äußeren Ende");
  await undo();
  dim.blocks.clear();
  ses.pathPoints = [{ x: 0, y: 70, z: 0 }, { x: 20, y: 70, z: 0 }];
  answers.push({ selectText: "Brücke" }, { set: { "Halbe Breite": 1, Bogenhöhe: 4, Belag: "oak_planks", Geländer: "oak_fence" } });
  await roundTrip("Brücke", () => use("axiom:path", G, { sneak: true }));
  answers.push({ selectText: "Brücke" }, { set: { "Halbe Breite": 1, Bogenhöhe: 4, Belag: "oak_planks", Geländer: "oak_fence" } });
  await use("axiom:path", G, { sneak: true });
  check(dim._get(10, 74, 0).type.id === "minecraft:oak_planks" && dim._get(0, 70, 0).type.id === "minecraft:oak_planks", "Brücke: Bogen in der Mitte höher");
  check(dim._get(10, 75, 2).type.id === "minecraft:oak_fence", "Brücke: Geländer am Rand");
  await undo();
  ses.pathPoints = [];
}

console.log("Säule & Brückenpfeiler");
{
  dim.blocks.clear();
  ses.s.pattern = parsePattern("quartz_block");
  ses.s.pattern2 = parsePattern("smooth_stone");
  Object.assign(ses.s.shape, { type: "pillar", rx: 1, ry: 3, rz: 1, hollow: false });
  await roundTrip("Säule vom Boden", () => use("axiom:shape", G, { face: "Up" }));
  await use("axiom:shape", G, { face: "Up" });
  check(dim._get(0, 65, 0).type.id === "minecraft:smooth_stone" && dim._get(0, 68, 0).type.id === "minecraft:quartz_block" && dim._get(0, 71, 0).type.id === "minecraft:smooth_stone" && dim._get(2, 65, 0).type.id === "minecraft:smooth_stone", "Säule: Sockel, Schaft, Kapitell");
  await undo();
  // Unter einer Decke: nach unten bis zum Boden
  ses.sel = boxSel(dim.id, { x: -3, y: 75, z: -3 }, { x: 3, y: 75, z: 3 });
  ops.opFill(ses, parsePattern("stone"));
  await drain();
  await use("axiom:shape", { x: 0, y: 75, z: 0 }, { face: "Down" });
  check(dim._get(0, 70, 0).type.id === "minecraft:quartz_block" && dim._get(0, 65, 0).type.id === "minecraft:smooth_stone", "Säule von der Decke bis zum Boden");
  await undo();
  await undo();
  dim.blocks.clear();
  ses.pathPoints = [{ x: 0, y: 72, z: 0 }, { x: 24, y: 72, z: 0 }];
  answers.push({ selectText: "Brücke" }, { set: { "Halbe Breite": 1, Bogenhöhe: 0, Belag: "stone_bricks", Geländer: "", Stützpfeiler: 8 } });
  await roundTrip("Brücke mit Pfeilern", () => use("axiom:path", G, { sneak: true }));
  answers.push({ selectText: "Brücke" }, { set: { "Halbe Breite": 1, Bogenhöhe: 0, Belag: "stone_bricks", Geländer: "", Stützpfeiler: 8 } });
  await use("axiom:path", G, { sneak: true });
  const pillarCols = [...dim.blocks.keys()].filter((k) => k.endsWith(",0") && k.split(",")[1] === "66").length;
  check(pillarCols >= 2, "Brücke: Pfeiler reichen bis zum Boden (" + pillarCols + ")");
  await undo();
  ses.pathPoints = [];
  ses.s.shape.type = "sphere";
}

console.log("Dach & Fenster");
{
  dim.blocks.clear();
  ses.s.pattern = parsePattern("oak_planks");
  ses.sel = boxSel(dim.id, { x: 0, y: 65, z: 0 }, { x: 8, y: 68, z: 4 });
  await roundTrip("Satteldach", () => ops.opRoof(ses, { type: "gable", stairs: "spruce_stairs", overhang: 0 }));
  ops.opRoof(ses, { type: "gable", stairs: "spruce_stairs", overhang: 0 });
  await drain();
  const st = dim._get(3, 69, 0);
  check(st.type.id === "minecraft:spruce_stairs" && st.getAllStates().weirdo_direction === 2, "Satteldach: Traufe Nord steigt nach Süden");
  check(dim._get(3, 71, 2).type.id === "minecraft:spruce_slab", "Satteldach: First als Stufe");
  check(dim._get(0, 69, 2).type.id === "minecraft:oak_planks", "Satteldach: Giebel gefüllt");
  await undo();
  await roundTrip("Walmdach", () => ops.opRoof(ses, { type: "hip", stairs: "spruce_stairs", overhang: 1 }));
  ses.sel = boxSel(dim.id, { x: 0, y: 65, z: 0 }, { x: 9, y: 70, z: 0 });
  await roundTrip("Fenster-Raster", () => ops.opWindows(ses, { w: 2, h: 2, gap: 2, sill: 1, block: "glass_pane" }));
  ops.opWindows(ses, { w: 2, h: 2, gap: 2, sill: 1, block: "glass_pane" });
  await drain();
  check(dim._get(2, 66, 0).type.id === "minecraft:glass_pane" && dim._get(7, 67, 0).type.id === "minecraft:glass_pane" && dim._get(4, 66, 0).type.id !== "minecraft:glass_pane", "Fenster-Raster: Fenster mit Abstand");
  await undo();
}

console.log("Handbuch");
{
  dim.entities = [];
  player.location = { x: 0.5, y: 65, z: 0.5 };
  player.view = { x: 0, y: 0, z: -1 };
  await use("axiom:guide", G, { air: true });
  const book = dim.entities.find((e) => e.typeId === "axiom:guide");
  check(!!book && book.getProperty("axiom:page") === 0, "Handbuch öffnet sich als 3D-Buch");
  check(book && Math.abs(book.location.z - -1.7) < 0.01, "Buch schwebt vor dem Spieler: " + JSON.stringify(book?.location));
  world.afterEvents.entityHitEntity._fire({ hitEntity: book, damagingEntity: player });
  check(book.getProperty("axiom:page") === 1, "Schlagen blättert vor");
  const ev = { target: book, player, cancel: false };
  world.beforeEvents.playerInteractWithEntity._fire(ev);
  await drain();
  check(ev.cancel && book.getProperty("axiom:page") === 2, "Benutzen auf dem Buch blättert vor");
  player.isSneaking = true;
  world.afterEvents.entityHitEntity._fire({ hitEntity: book, damagingEntity: player });
  player.isSneaking = false;
  check(book.getProperty("axiom:page") === 1, "Schleichen + Schlagen blättert zurück");
  await use("axiom:guide", G, { air: true });
  check(!book.isValid && !dim.entities.some((e) => e.typeId === "axiom:guide"), "Buch benutzen schließt es");
  await use("axiom:guide", G, { air: true });
  const book2 = dim.entities.find((e) => e.typeId === "axiom:guide");
  check(book2?.getProperty("axiom:page") === 1, "Buch merkt sich die Seite");
  for (let i = 0; i < 30; i++) world.afterEvents.entityHitEntity._fire({ hitEntity: book2, damagingEntity: player });
  const { PAGE_COUNT } = await import("../packs/AxiomBP/scripts/ui/guide.js");
  check(book2.getProperty("axiom:page") === PAGE_COUNT - 1, "Letzte Seite wird nicht überschritten");
  await use("axiom:guide", G, { air: true });
  answers.push({ selectText: "Hilfe" }, { selectText: "Handbuch lesen" }, { selectText: "Weiter" }, { selectText: "Zurück" }, { selectText: "Schließen" });
  await use("axiom:menu", G);
  check(answers.length === 0, "Handbuch als Text im Hilfe-Menü");
  answers.length = 0;
  dim.entities = [];
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
