// Zwischenablage & Blaupausen auf Basis von Strukturen (Kacheln à 64³).
import { world, system, StructureSaveMode, StructureRotation, StructureMirrorAxis } from "@minecraft/server";
import { TILE, recordRegion } from "./history.js";
import { selContains } from "./selection.js";
import { v } from "./vec.js";

/**
 * @typedef {{id:string, off:{x:number,y:number,z:number}, size:{x:number,y:number,z:number}}} ClipTile
 * @typedef {{size:{x:number,y:number,z:number}, tiles:ClipTile[], shared?:boolean, name?:string}} Clip
 */

const CLIP_KEY = "axiom:clip";
/** @type {Map<string, Clip|null>} */
const clips = new Map();

/** @param {string} id */
const tag = (id) => id.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toLowerCase() || "p";

/** @param {import("@minecraft/server").Player} player @returns {Clip|null} */
export function getClip(player) {
  if (clips.has(player.id)) {
    const c = clips.get(player.id) ?? null;
    if (c && !world.structureManager.get(c.tiles[0]?.id ?? "")) {
      clips.set(player.id, null);
      return null;
    }
    return c;
  }
  let c = null;
  try {
    const raw = player.getDynamicProperty(CLIP_KEY);
    if (typeof raw === "string") {
      c = JSON.parse(raw);
      if (c && c.tiles.some((/** @type {ClipTile} */ t) => !world.structureManager.get(t.id))) c = null;
    }
  } catch {
    c = null;
  }
  clips.set(player.id, c);
  return c;
}

/** @param {import("@minecraft/server").Player} player @param {Clip|null} clip */
function setClip(player, clip) {
  const old = getClip(player);
  if (old && !old.shared && old !== clip) {
    for (const t of old.tiles) {
      if (!clip || !clip.tiles.some((n) => n.id === t.id)) {
        try {
          world.structureManager.delete(t.id);
        } catch {}
      }
    }
  }
  clips.set(player.id, clip);
  try {
    player.setDynamicProperty(CLIP_KEY, clip ? JSON.stringify(clip) : undefined);
  } catch {}
}

/**
 * Auswahl in die Zwischenablage kopieren.
 * @param {import("@minecraft/server").Player} player
 * @param {import("./selection.js").Selection} sel
 * @param {boolean} entities
 * @param {boolean} [temp] nur temporär im Speicher (für Verschieben/Stapeln), nicht als Zwischenablage
 * @returns {Generator<void, Clip, void>}
 */
export function* copySelection(player, sel, entities, temp = false) {
  const dim = world.getDimension(sel.dim);
  const { min, max } = sel;
  const size = v(max.x - min.x + 1, max.y - min.y + 1, max.z - min.z + 1);
  const prefix = temp ? `axiom:tmp${tag(player.id)}_` : `axiom:cb${tag(player.id)}_${system.currentTick % 100000}_`;
  /** @type {ClipTile[]} */
  const tiles = [];
  let i = 0;
  for (let x = min.x; x <= max.x; x += TILE)
    for (let y = min.y; y <= max.y; y += TILE)
      for (let z = min.z; z <= max.z; z += TILE) {
        const to = v(Math.min(x + TILE - 1, max.x), Math.min(y + TILE - 1, max.y), Math.min(z + TILE - 1, max.z));
        const id = prefix + i++;
        try {
          world.structureManager.delete(id);
        } catch {}
        const st = world.structureManager.createFromWorld(id, dim, v(x, y, z), to, {
          includeEntities: entities,
          saveMode: temp ? StructureSaveMode.Memory : StructureSaveMode.World,
        });
        // Freie Auswahl: Blöcke außerhalb der Auswahl zu "Strukturleere" machen
        if (sel.kind === "set") {
          let n = 0;
          for (let dx = 0; dx <= to.x - x; dx++)
            for (let dy = 0; dy <= to.y - y; dy++)
              for (let dz = 0; dz <= to.z - z; dz++) {
                if (!selContains(sel, x + dx, y + dy, z + dz)) st.setBlockPermutation(v(dx, dy, dz), undefined);
                if (++n % 2048 === 0) yield;
              }
          if (!temp) st.saveToWorld();
        }
        tiles.push({ id, off: v(x - min.x, y - min.y, z - min.z), size: v(to.x - x + 1, to.y - y + 1, to.z - z + 1) });
        yield;
      }
  const clip = { size, tiles };
  if (!temp) setClip(player, clip);
  return clip;
}

/** @param {number} rot Grad (0/90/180/270) */
function rotEnum(rot) {
  switch (((rot % 360) + 360) % 360) {
    case 90:
      return StructureRotation.Rotate90;
    case 180:
      return StructureRotation.Rotate180;
    case 270:
      return StructureRotation.Rotate270;
    default:
      return StructureRotation.None;
  }
}
/** @param {string} m */
function mirEnum(m) {
  return m === "X" ? StructureMirrorAxis.X : m === "Z" ? StructureMirrorAxis.Z : m === "XZ" ? StructureMirrorAxis.XZ : StructureMirrorAxis.None;
}

/**
 * Punkt innerhalb der Zwischenablage transformieren (erst spiegeln, dann im Uhrzeigersinn drehen).
 * @param {{x:number,y:number,z:number}} p
 * @param {{x:number,y:number,z:number}} size
 * @param {number} rot
 * @param {string} mirror
 */
export function transformPoint(p, size, rot, mirror) {
  let x = p.x;
  let z = p.z;
  if (mirror === "X" || mirror === "XZ") x = size.x - 1 - x;
  if (mirror === "Z" || mirror === "XZ") z = size.z - 1 - z;
  switch (((rot % 360) + 360) % 360) {
    case 90:
      return v(size.z - 1 - z, p.y, x);
    case 180:
      return v(size.x - 1 - x, p.y, size.z - 1 - z);
    case 270:
      return v(z, p.y, size.x - 1 - x);
    default:
      return v(x, p.y, z);
  }
}

/** Größe nach Drehung. @param {{x:number,y:number,z:number}} size @param {number} rot */
export function rotatedSize(size, rot) {
  return rot % 180 === 0 ? { ...size } : v(size.z, size.y, size.x);
}

/**
 * Zwischenablage an Position einfügen.
 * @param {import("@minecraft/server").Player} player
 * @param {Clip} clip
 * @param {import("@minecraft/server").Dimension} dim
 * @param {{x:number,y:number,z:number}} origin minimale Ecke des Zielbereichs
 * @param {{rotation:number, mirror:string, air:boolean, entities:boolean}} o
 * @param {boolean} [record]
 * @returns {Generator<void, number, void>}
 */
export function* pasteClip(player, clip, dim, origin, o, record = true) {
  const rs = rotatedSize(clip.size, o.rotation);
  const max = v(origin.x + rs.x - 1, origin.y + rs.y - 1, origin.z + rs.z - 1);
  if (origin.y < dim.heightRange.min || max.y > dim.heightRange.max - 1) throw new Error("Einfügen würde über den Rand der Welt (Höhe) hinausragen.");
  for (const t of clip.tiles) if (!world.structureManager.get(t.id)) throw new Error("Zwischenablage ist nicht mehr vorhanden (Blaupause gelöscht?).");
  if (record) yield* recordRegion(player.id, "Einfügen", dim, origin, max);
  let placed = 0;
  for (const t of clip.tiles) {
    let id = t.id;
    let temp = false;
    if (!o.air) {
      // Luft -> Strukturleere, damit bestehende Blöcke erhalten bleiben
      const src = world.structureManager.get(t.id);
      if (!src) continue;
      const tmpId = "axiom:noair_" + tag(player.id);
      try {
        world.structureManager.delete(tmpId);
      } catch {}
      const st = src.saveAs(tmpId, StructureSaveMode.Memory);
      let n = 0;
      for (let x = 0; x < t.size.x; x++)
        for (let y = 0; y < t.size.y; y++)
          for (let z = 0; z < t.size.z; z++) {
            const p = st.getBlockPermutation(v(x, y, z));
            if (p && p.type.id === "minecraft:air") st.setBlockPermutation(v(x, y, z), undefined);
            if (++n % 4096 === 0) yield;
          }
      id = tmpId;
      temp = true;
    }
    // Kachel-Ecken transformieren
    const a = transformPoint(t.off, clip.size, o.rotation, o.mirror);
    const b = transformPoint(v(t.off.x + t.size.x - 1, t.off.y + t.size.y - 1, t.off.z + t.size.z - 1), clip.size, o.rotation, o.mirror);
    const loc = v(origin.x + Math.min(a.x, b.x), origin.y + t.off.y, origin.z + Math.min(a.z, b.z));
    world.structureManager.place(id, dim, loc, {
      rotation: rotEnum(o.rotation),
      mirror: mirEnum(o.mirror),
      includeEntities: o.entities,
    });
    placed += t.size.x * t.size.y * t.size.z;
    if (temp) {
      try {
        world.structureManager.delete(id);
      } catch {}
    }
    yield;
  }
  return placed;
}

// ---------- Blaupausen ----------

const BP_PREFIX = "axiom:bp:";

/** @param {string} name */
export function sanitizeName(name) {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 32);
}

export function listBlueprints() {
  /** @type {{name:string, size:{x:number,y:number,z:number}, author:string}[]} */
  const out = [];
  for (const id of world.getDynamicPropertyIds()) {
    if (!id.startsWith(BP_PREFIX)) continue;
    try {
      const meta = JSON.parse(/** @type {string} */ (world.getDynamicProperty(id)));
      out.push({ name: id.slice(BP_PREFIX.length), size: meta.size, author: meta.author ?? "?" });
    } catch {}
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Zwischenablage als Blaupause speichern.
 * @param {import("@minecraft/server").Player} player
 * @param {string} rawName
 */
export function saveBlueprint(player, rawName) {
  const clip = getClip(player);
  if (!clip) throw new Error("Zwischenablage ist leer.");
  const name = sanitizeName(rawName);
  if (!name) throw new Error("Ungültiger Name.");
  // Erst unter neuen (eindeutigen) IDs kopieren, dann alte Blaupause löschen – so geht beim
  // erneuten Speichern einer geladenen Blaupause nichts verloren.
  const stamp = system.currentTick % 1000000;
  /** @type {ClipTile[]} */
  const tiles = clip.tiles.map((t, i) => {
    const src = world.structureManager.get(t.id);
    if (!src) throw new Error("Zwischenablage beschädigt.");
    const id = `axiom:bp_${name}_${stamp}_${i}`;
    try {
      world.structureManager.delete(id);
    } catch {}
    src.saveAs(id, StructureSaveMode.World);
    return { id, off: t.off, size: t.size };
  });
  const keep = new Set(tiles.map((t) => t.id));
  const oldRaw = world.getDynamicProperty(BP_PREFIX + name);
  if (typeof oldRaw === "string") {
    try {
      for (const t of JSON.parse(oldRaw).tiles) if (!keep.has(t.id)) world.structureManager.delete(t.id);
    } catch {}
  }
  // Die eigene Zwischenablage zeigt ab jetzt auf die neue Kopie
  if (clip.shared && clip.name === name) setClip(player, { size: clip.size, tiles, shared: true, name });
  world.setDynamicProperty(BP_PREFIX + name, JSON.stringify({ size: clip.size, tiles, author: player.name }));
  return name;
}

/** @param {string} name */
export function deleteBlueprint(name) {
  const raw = world.getDynamicProperty(BP_PREFIX + name);
  if (typeof raw !== "string") return false;
  try {
    for (const t of JSON.parse(raw).tiles) world.structureManager.delete(t.id);
  } catch {}
  world.setDynamicProperty(BP_PREFIX + name, undefined);
  return true;
}

/** Blaupause in die Zwischenablage laden. @param {import("@minecraft/server").Player} player @param {string} name */
export function loadBlueprint(player, name) {
  const raw = world.getDynamicProperty(BP_PREFIX + name);
  if (typeof raw !== "string") throw new Error("Blaupause nicht gefunden.");
  const meta = JSON.parse(raw);
  setClip(player, { size: meta.size, tiles: meta.tiles, shared: true, name });
}

/** Temporäre Kacheln wieder freigeben. @param {Clip} clip */
export function freeClip(clip) {
  for (const t of clip.tiles) {
    try {
      world.structureManager.delete(t.id);
    } catch {}
  }
}
