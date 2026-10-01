// Axiom Bedrock – Einstiegspunkt: Ereignisse, Tick-Schleife, Fähigkeiten, Chat-Befehle.
import {
  world,
  system,
  BlockPermutation,
  GameMode,
  ItemStack,
  PlayerPermissionLevel,
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
} from "@minecraft/server";
import { TOOLS, TOOL_LIST } from "./tools/index.js";
import { getSession, flushAll, dropSession, markDirty, worldFlag } from "./core/state.js";
import { entryFromPermutation, formatPattern } from "./core/pattern.js";
import { renderSelection, markBlock } from "./core/selection.js";
import { pushEntry } from "./core/history.js";
import { bar, err, heldItem, msg, pointInFront, target } from "./core/util.js";
import { k3 } from "./core/vec.js";
import { mainMenu } from "./ui/main.js";
import { doUndo, renderSymmetry } from "./tools/misc.js";
import { renderLines } from "./ui/notes.js";

/** Blöcke, die man im Ersetzen-Modus weiterhin normal benutzen kann (Schleichen = trotzdem ersetzen). */
const INTERACTIVE = /(chest|barrel|door|gate|button|lever|crafting|furnace|smoker|anvil|table|shulker|hopper|dispenser|dropper|bed|bell|repeater|comparator|note|jukebox|lectern|loom|stonecutter|grindstone|beacon|brewing|cartography|smithing|campfire|sign)/;

/** @param {import("@minecraft/server").Player} player */
function allowed(player) {
  if (!worldFlag("ops_only")) return true;
  return player.playerPermissionLevel >= PlayerPermissionLevel.Operator;
}

/** @param {import("@minecraft/server").Player} player */
function heldTool(player) {
  const it = heldItem(player);
  if (!it || !it.typeId.startsWith("axiom:")) return undefined;
  return TOOLS.get(it.typeId);
}

// ---------- Benutzen ----------
/** @param {import("@minecraft/server").Player} player @param {boolean} repeat */
function handleUse(player, repeat) {
  const tool = heldTool(player);
  if (!tool) return;
  if (!allowed(player)) return err(player, "Nur Operatoren dürfen Axiom benutzen.");
  const ses = getSession(player);
  const t = system.currentTick;
  const cd = tool.brush ? 3 : 6;
  if (t - ses.lastAction < cd) return;
  if (repeat && !tool.brush) return;
  ses.lastAction = t;
  try {
    if (player.isSneaking && !tool.noSneakMenu) {
      if (repeat) return;
      if (tool.menu) tool.menu(ses);
      else mainMenu(ses);
      return;
    }
    const r = tool.onUse(ses);
    if (r instanceof Promise) r.catch((/** @type {any} */ e) => err(player, String(e)));
  } catch (e) {
    err(player, "Fehler: " + e);
    console.warn("[Axiom] " + (e instanceof Error ? e.stack : e));
  }
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const id = ev.itemStack?.typeId;
  const player = ev.player;
  if (id?.startsWith("axiom:")) {
    ev.cancel = true;
    const repeat = !ev.isFirstEvent;
    system.run(() => handleUse(player, repeat));
    return;
  }
  // Fähigkeit: Ersetzen-Modus für normale Blöcke
  if (id && ev.isFirstEvent) {
    const ses = getSession(player);
    if (!ses.s.caps.replace || player.getGameMode() !== GameMode.Creative) return;
    if (INTERACTIVE.test(ev.block.typeId) && !player.isSneaking) return;
    const loc = ev.block.location;
    let perm;
    try {
      perm = BlockPermutation.resolve(id);
    } catch {
      return;
    }
    ev.cancel = true;
    system.run(() => placeBlock(player, loc, perm, "Ersetzen"));
  }
});

world.afterEvents.itemUse.subscribe((ev) => {
  const player = ev.source;
  const id = ev.itemStack.typeId;
  if (id.startsWith("axiom:")) {
    handleUse(player, false);
    return;
  }
  // Fähigkeiten: Weit platzieren / Engel-Platzierung für normale Blöcke
  const ses = getSession(player);
  const c = ses.s.caps;
  if (!c.farPlace && !c.angel) return;
  if (player.getGameMode() !== GameMode.Creative) return;
  let perm;
  try {
    perm = BlockPermutation.resolve(id);
  } catch {
    return;
  }
  if (c.farPlace) {
    const t = target(player, ses.s);
    if (t) {
      placeBlock(player, t.adjacent, perm, "Weit platzieren");
      return;
    }
  }
  if (c.angel) placeBlock(player, pointInFront(player, ses.s.airDist), perm, "Engel-Platzierung");
});

/**
 * Einzelnen Block setzen (mit Verlauf und Symmetrie).
 * @param {import("@minecraft/server").Player} player
 * @param {{x:number,y:number,z:number}} loc
 * @param {BlockPermutation} perm
 * @param {string} label
 */
function placeBlock(player, loc, perm, label) {
  const ses = getSession(player);
  const sym = ses.s.symmetry;
  const spots = [loc];
  if (sym.center) {
    const mx = 2 * sym.center.x - loc.x;
    const mz = 2 * sym.center.z - loc.z;
    if (sym.x) spots.push({ x: mx, y: loc.y, z: loc.z });
    if (sym.z) spots.push({ x: loc.x, y: loc.y, z: mz });
    if (sym.x && sym.z) spots.push({ x: mx, y: loc.y, z: mz });
  }
  const changes = new Map();
  for (const p of spots) {
    try {
      const b = player.dimension.getBlock(p);
      if (!b) continue;
      changes.set(k3(p.x, p.y, p.z), b.permutation);
      b.setPermutation(perm);
    } catch {}
  }
  if (changes.size) pushEntry(player.id, { kind: "blocks", label, dim: player.dimension.id, changes, time: system.currentTick });
}

// Symmetrie auch für normales Bauen und Abbauen
world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  const ses = getSession(ev.player);
  const sym = ses.s.symmetry;
  if (!sym.center || (!sym.x && !sym.z)) return;
  const loc = ev.block.location;
  const perm = ev.block.permutation;
  const dim = ev.block.dimension;
  const mx = 2 * sym.center.x - loc.x;
  const mz = 2 * sym.center.z - loc.z;
  const spots = [];
  if (sym.x) spots.push({ x: mx, y: loc.y, z: loc.z });
  if (sym.z) spots.push({ x: loc.x, y: loc.y, z: mz });
  if (sym.x && sym.z) spots.push({ x: mx, y: loc.y, z: mz });
  for (const p of spots) {
    try {
      dim.getBlock(p)?.setPermutation(perm);
    } catch {}
  }
});
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const ses = getSession(ev.player);
  const sym = ses.s.symmetry;
  if (!sym.center || (!sym.x && !sym.z)) return;
  const loc = ev.block.location;
  const mx = 2 * sym.center.x - loc.x;
  const mz = 2 * sym.center.z - loc.z;
  const spots = [];
  if (sym.x) spots.push({ x: mx, y: loc.y, z: loc.z });
  if (sym.z) spots.push({ x: loc.x, y: loc.y, z: mz });
  if (sym.x && sym.z) spots.push({ x: mx, y: loc.y, z: mz });
  for (const p of spots) {
    try {
      const b = ev.block.dimension.getBlock(p);
      if (b && b.typeId === ev.brokenBlockPermutation.type.id) b.setType("minecraft:air");
    } catch {}
  }
});

// ---------- Gedrückt halten (Pinsel) ----------
world.afterEvents.itemStartUse.subscribe((ev) => {
  if (!ev.itemStack.typeId.startsWith("axiom:")) return;
  const ses = getSession(ev.source);
  ses.using = true;
});
world.afterEvents.itemStopUse.subscribe((ev) => {
  if (!ev.itemStack?.typeId.startsWith("axiom:")) return;
  getSession(ev.source).using = false;
});
world.afterEvents.itemCompleteUse.subscribe((ev) => {
  if (!ev.itemStack?.typeId.startsWith("axiom:")) return;
  getSession(ev.source).using = false;
});
world.afterEvents.itemReleaseUse.subscribe((ev) => {
  if (!ev.itemStack?.typeId.startsWith("axiom:")) return;
  getSession(ev.source).using = false;
});

// ---------- Schlagen ----------
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (ev.itemStack?.typeId.startsWith("axiom:")) ev.cancel = true;
});

world.afterEvents.entityHitBlock.subscribe((ev) => {
  const player = ev.damagingEntity;
  if (!(player instanceof Player)) return;
  const tool = heldTool(player);
  if (!tool || !allowed(player)) return;
  const ses = getSession(player);
  if (system.currentTick - (ses.lastHit ?? -100) < 4) return;
  ses.lastHit = system.currentTick;
  if (tool.onHit && !player.isSneaking) {
    tool.onHit(ses, ev.hitBlock);
    return;
  }
  // Pipette: Block als aktives Muster übernehmen
  const perm = ev.hitBlockPermutation;
  ses.s.pattern = [entryFromPermutation(perm)];
  markDirty(ses);
  msg(player, `Pipette: §e${formatPattern(ses.s.pattern)}`);
});

// ---------- Tick-Schleife ----------
let tick = 0;
system.runInterval(() => {
  tick++;
  for (const player of world.getAllPlayers()) {
    try {
      tickPlayer(player);
    } catch (e) {
      console.warn("[Axiom] Tick: " + e);
    }
  }
  if (tick % 50 === 0) flushAll();
}, 2);

/** @param {import("@minecraft/server").Player} player */
function tickPlayer(player) {
  const tool = heldTool(player);
  const ses = getSession(player);
  // Pinsel gedrückt halten
  if (ses.using) {
    if (!tool || !tool.brush) ses.using = false;
    else if (!ses.busy) handleUse(player, true);
  }
  if (tick % 5 === 0) {
    if (tool) {
      try {
        bar(player, `§d${tool.name}§r · ${tool.hud ? tool.hud(ses) : ""}`);
      } catch {}
      try {
        tool.preview?.(ses);
      } catch {}
      if (ses.nextCorner === 2 && ses.corner1) markBlock(player, "axiom:pos1", ses.corner1);
    }
    if (ses.sel && (tool || ses.s.showSel)) renderSelection(player, ses.sel);
    if (tool) renderSymmetry(ses);
    if (tool) renderLines(player);
  }
  if (tick % 100 === 0 && ses.s.caps.nightVision) {
    try {
      player.addEffect("night_vision", 20 * 30, { showParticles: false, amplifier: 0 });
    } catch {}
  }
}

// ---------- Beitreten ----------
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const p = ev.player;
  if (p.getDynamicProperty("axiom:welcomed")) return;
  p.setDynamicProperty("axiom:welcomed", true);
  system.runTimeout(() => {
    try {
      p.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack("axiom:menu", 1));
    } catch {}
    msg(p, "Willkommen bei §dAxiom Bedrock§r! Du hast das §eAxiom-Menü§r bekommen – benutze es, um alle Werkzeuge zu holen.");
  }, 40);
});

world.afterEvents.playerLeave.subscribe((ev) => dropSession(ev.playerId));
// ---------- Chat-Befehle ----------
system.beforeEvents.startup.subscribe((ev) => {
  const reg = ev.customCommandRegistry;
  /**
   * @param {string} name @param {string} description
   * @param {(p: import("@minecraft/server").Player) => void} fn
   */
  const cmd = (name, description, fn) =>
    reg.registerCommand({ name, description, permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false }, (origin) => {
      const p = origin.sourceEntity;
      if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Nur für Spieler." };
      system.run(() => {
        if (!allowed(p)) return err(p, "Nur Operatoren dürfen Axiom benutzen.");
        fn(p);
      });
      return { status: CustomCommandStatus.Success };
    });
  cmd("axiom:menu", "Öffnet das Axiom-Menü", (p) => mainMenu(getSession(p)));
  cmd("axiom:undo", "Axiom: Rückgängig", (p) => doUndo(p, false));
  cmd("axiom:redo", "Axiom: Wiederherstellen", (p) => doUndo(p, true));
  cmd("axiom:tools", "Gibt dir alle Axiom-Werkzeuge", (p) => {
    const inv = p.getComponent("minecraft:inventory")?.container;
    if (!inv) return;
    for (const t of TOOL_LIST) {
      let has = false;
      for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === t.id) has = true;
      if (!has) inv.addItem(new ItemStack(t.id, 1));
    }
    msg(p, "Alle Axiom-Werkzeuge ins Inventar gelegt.");
  });
});

console.log("[Axiom Bedrock] geladen – " + TOOL_LIST.length + " Werkzeuge.");
