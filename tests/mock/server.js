// Stark vereinfachte Nachbildung von @minecraft/server für automatische Tests (läuft in Node).
// Die Welt ist flach: y<60 Stein, y<64 Erde, y=64 Grasblock, darüber Luft.

export const GameMode = { Creative: "Creative", Survival: "Survival", Spectator: "Spectator", Adventure: "Adventure" };
export const StructureSaveMode = { Memory: "Memory", World: "World" };
export const StructureRotation = { None: "None", Rotate90: "Rotate90", Rotate180: "Rotate180", Rotate270: "Rotate270" };
export const StructureMirrorAxis = { None: "None", X: "X", Z: "Z", XZ: "XZ" };
export const EquipmentSlot = { Mainhand: "Mainhand" };
export const PlayerPermissionLevel = { Visitor: 0, Member: 1, Operator: 2, Custom: 3 };
export const CommandPermissionLevel = { Any: 0, GameDirectors: 1, Admin: 2, Host: 3, Owner: 4 };
export const CustomCommandStatus = { Success: 0, Failure: 1 };
export const WeatherType = { Clear: "Clear", Rain: "Rain", Thunder: "Thunder" };

const NOT_BLOCKS = /(sword|pickaxe|^axiom:|apple|stick$|bucket)/;
const STATE_VALUES = {
  pillar_axis: ["y", "x", "z"],
  "minecraft:cardinal_direction": ["south", "west", "north", "east"],
  upside_down_bit: [false, true],
};

const permCache = new Map();
export class BlockPermutation {
  constructor(id, states) {
    this.type = { id };
    this._states = states;
  }
  static resolve(id, states = {}) {
    if (!/^[a-z0-9_]+:[a-z0-9_]+$/.test(id) || NOT_BLOCKS.test(id)) throw new Error("Unbekannter Block: " + id);
    const def = {};
    if (/_log$/.test(id)) def.pillar_axis = "y";
    if (/_stairs$/.test(id)) {
      def["minecraft:cardinal_direction"] = "south";
      def.upside_down_bit = false;
    }
    const all = { ...def, ...states };
    for (const k of Object.keys(states)) if (!(k in def)) throw new Error(`Zustand ${k} passt nicht zu ${id}`);
    const key = id + JSON.stringify(Object.entries(all).sort());
    let p = permCache.get(key);
    if (!p) permCache.set(key, (p = new BlockPermutation(id, all)));
    return p;
  }
  getAllStates() {
    return { ...this._states };
  }
  matches(id, states = {}) {
    if (id !== this.type.id) return false;
    for (const [k, v] of Object.entries(states)) if (this._states[k] !== v) return false;
    return true;
  }
  withState(name, value) {
    if (!(name in this._states)) throw new Error("Kein Zustand " + name);
    return BlockPermutation.resolve(this.type.id, { ...this._states, [name]: value });
  }
}

export class BlockStates {
  static get(name) {
    const vv = STATE_VALUES[name];
    return vv ? { id: name, validValues: vv } : undefined;
  }
  static getAll() {
    return Object.keys(STATE_VALUES).map((n) => BlockStates.get(n));
  }
}

const key = (x, y, z) => `${x},${y},${z}`;

function natural(y) {
  if (y < 60) return "minecraft:stone";
  if (y < 64) return "minecraft:dirt";
  if (y === 64) return "minecraft:grass_block";
  return "minecraft:air";
}

class Block {
  constructor(dim, x, y, z) {
    this.dimension = dim;
    this.location = { x, y, z };
    this.isValid = true;
  }
  get permutation() {
    return this.dimension._get(this.location.x, this.location.y, this.location.z);
  }
  get typeId() {
    return this.permutation.type.id;
  }
  setPermutation(p) {
    this.dimension._set(this.location.x, this.location.y, this.location.z, p);
  }
  setType(id) {
    this.setPermutation(BlockPermutation.resolve(id));
  }
}

export class BlockVolume {
  constructor(from, to) {
    this.from = from;
    this.to = to;
  }
}

let entityCounter = 0;
export class Entity {
  constructor(dim, typeId, loc) {
    this.dimension = dim;
    this.typeId = typeId;
    this.location = { ...loc };
    this.rotation = { x: 0, y: 0 };
    this.nameTag = "";
    this.id = "e" + ++entityCounter;
    this.isValid = true;
  }
  teleport(loc, o = {}) {
    this.location = { ...loc };
    if (o.rotation) this.rotation = o.rotation;
  }
  getRotation() {
    return { ...this.rotation };
  }
  setRotation(r) {
    this.rotation = { ...r };
  }
  remove() {
    this.isValid = false;
    this.dimension.entities = this.dimension.entities.filter((e) => e !== this);
  }
}

class Dimension {
  constructor(id) {
    this.id = id;
    this.entities = [];
    this.heightRange = { min: -64, max: 320 };
    this.blocks = new Map();
    this.writes = 0;
  }
  _get(x, y, z) {
    return this.blocks.get(key(x, y, z)) ?? BlockPermutation.resolve(natural(y));
  }
  _set(x, y, z, p) {
    if (!(p instanceof BlockPermutation)) throw new Error("setPermutation ohne Permutation");
    this.writes++;
    if (p === BlockPermutation.resolve(natural(y))) this.blocks.delete(key(x, y, z));
    else this.blocks.set(key(x, y, z), p);
  }
  getBlock(loc) {
    const x = Math.floor(loc.x);
    const y = Math.floor(loc.y);
    const z = Math.floor(loc.z);
    if (y < this.heightRange.min || y >= this.heightRange.max) throw new Error("LocationOutOfWorldBoundariesError");
    return new Block(this, x, y, z);
  }
  fillBlocks(volume, block, options = {}) {
    const p = typeof block === "string" ? BlockPermutation.resolve(block) : block;
    const a = volume.from;
    const b = volume.to;
    const vol = (Math.abs(b.x - a.x) + 1) * (Math.abs(b.y - a.y) + 1) * (Math.abs(b.z - a.z) + 1);
    if (vol > 32768) throw new Error("fillBlocks: Volumen zu groß " + vol);
    let n = 0;
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++)
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++)
        for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) {
          const f = options.blockFilter;
          if (f?.includeTypes && !f.includeTypes.includes(this._get(x, y, z).type.id)) continue;
          this._set(x, y, z, p);
          n++;
        }
    return { getCapacity: () => n };
  }
  spawnEntity(typeId, loc) {
    const e = new Entity(this, typeId, loc);
    this.entities.push(e);
    return e;
  }
  getEntities(o = {}) {
    return this.entities.filter((e) => {
      const l = e.location;
      if (o.maxDistance !== undefined && o.location && Math.hypot(l.x - o.location.x, l.y - o.location.y, l.z - o.location.z) > o.maxDistance) return false;
      if (o.volume && o.location) {
        if (l.x < o.location.x || l.y < o.location.y || l.z < o.location.z) return false;
        if (l.x > o.location.x + o.volume.x || l.y > o.location.y + o.volume.y || l.z > o.location.z + o.volume.z) return false;
      }
      return true;
    });
  }
  setWeather() {}
  spawnParticle() {}
  /** Vergleichbarer Schnappschuss der veränderten Blöcke */
  snapshot() {
    return new Map([...this.blocks.entries()].map(([k, p]) => [k, p.type.id + JSON.stringify(p._states)]));
  }
}

class Structure {
  constructor(id, size) {
    this.id = id;
    this.size = size;
    this.blocks = new Array(size.x * size.y * size.z).fill(undefined);
    this.isValid = true;
  }
  _i(l) {
    if (l.x < 0 || l.y < 0 || l.z < 0 || l.x >= this.size.x || l.y >= this.size.y || l.z >= this.size.z) throw new Error("Struktur-Index außerhalb");
    return (l.x * this.size.y + l.y) * this.size.z + l.z;
  }
  getBlockPermutation(l) {
    return this.blocks[this._i(l)];
  }
  setBlockPermutation(l, p) {
    this.blocks[this._i(l)] = p;
  }
  getIsWaterlogged() {
    return false;
  }
  saveAs(id, mode) {
    const s = structureManager.createEmpty(id, this.size, mode);
    s.blocks = [...this.blocks];
    return s;
  }
  saveToWorld() {}
}

function transform(x, z, size, rot, mirror) {
  if (mirror === "X" || mirror === "XZ") x = size.x - 1 - x;
  if (mirror === "Z" || mirror === "XZ") z = size.z - 1 - z;
  switch (rot) {
    case "Rotate90":
      return [size.z - 1 - z, x];
    case "Rotate180":
      return [size.x - 1 - x, size.z - 1 - z];
    case "Rotate270":
      return [z, size.x - 1 - x];
    default:
      return [x, z];
  }
}

const structureManager = {
  map: new Map(),
  createEmpty(id, size) {
    if (this.map.has(id)) throw new Error("Struktur existiert bereits: " + id);
    const s = new Structure(id, size);
    this.map.set(id, s);
    return s;
  },
  createFromWorld(id, dim, from, to) {
    const min = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), z: Math.min(from.z, to.z) };
    const size = { x: Math.abs(to.x - from.x) + 1, y: Math.abs(to.y - from.y) + 1, z: Math.abs(to.z - from.z) + 1 };
    if (size.x > 64 || size.z > 64 || size.y > 384) throw new Error("Struktur zu groß");
    const s = this.createEmpty(id, size);
    for (let x = 0; x < size.x; x++)
      for (let y = 0; y < size.y; y++) for (let z = 0; z < size.z; z++) s.setBlockPermutation({ x, y, z }, dim._get(min.x + x, min.y + y, min.z + z));
    return s;
  },
  get(id) {
    return this.map.get(id);
  },
  delete(s) {
    return this.map.delete(typeof s === "string" ? s : s.id);
  },
  getWorldStructureIds() {
    return [...this.map.keys()];
  },
  place(s, dim, loc, o = {}) {
    const st = typeof s === "string" ? this.map.get(s) : s;
    if (!st) throw new Error("Struktur fehlt: " + s);
    for (let x = 0; x < st.size.x; x++)
      for (let y = 0; y < st.size.y; y++)
        for (let z = 0; z < st.size.z; z++) {
          const p = st.getBlockPermutation({ x, y, z });
          if (!p) continue;
          const [tx, tz] = transform(x, z, st.size, o.rotation ?? "None", o.mirror ?? "None");
          dim._set(loc.x + tx, loc.y + y, loc.z + tz, p);
        }
  },
};

export class ItemStack {
  constructor(typeId, amount = 1) {
    this.typeId = typeId;
    this.amount = amount;
  }
}

class Container {
  constructor(size) {
    this.size = size;
    this.items = new Array(size).fill(undefined);
  }
  getItem(i) {
    return this.items[i];
  }
  setItem(i, it) {
    this.items[i] = it;
  }
  addItem(it) {
    const i = this.items.findIndex((x) => !x);
    if (i >= 0) this.items[i] = it;
  }
}

const dynStore = () => {
  const m = new Map();
  return {
    getDynamicProperty: (k) => m.get(k),
    setDynamicProperty: (k, v) => (v === undefined ? m.delete(k) : m.set(k, v)),
    getDynamicPropertyIds: () => [...m.keys()],
  };
};

export class Player {
  constructor(name, dim) {
    Object.assign(this, dynStore());
    this.id = "-" + Math.floor(Math.random() * 1e12);
    this.name = name;
    this.dimension = dim;
    this.location = { x: 0.5, y: 65, z: 0.5 };
    this.isSneaking = false;
    this.isValid = true;
    this.messages = [];
    this.inventory = new Container(36);
    this.selectedSlotIndex = 0;
    this.playerPermissionLevel = 2;
    this.view = { x: 0, y: 0, z: -1 };
    this.rayHit = undefined;
    this.gameMode = GameMode.Creative;
    this.onScreenDisplay = { setActionBar: (t) => (this.actionBar = t) };
  }
  getComponent(id) {
    if (id === "minecraft:inventory") return { container: this.inventory };
    if (id === "minecraft:equippable") return { getEquipment: () => this.inventory.getItem(this.selectedSlotIndex) };
    return undefined;
  }
  getViewDirection() {
    return this.view;
  }
  getRotation() {
    return this.rotation ?? { x: 10, y: 90 };
  }
  teleport(loc, o = {}) {
    this.location = { ...loc };
    if (o.rotation) this.rotation = o.rotation;
  }
  getHeadLocation() {
    return { x: this.location.x, y: this.location.y + 1.6, z: this.location.z };
  }
  getEntitiesFromViewDirection() {
    return (this.entityHits ?? []).filter((e) => e.isValid).map((entity) => ({ entity, distance: 3 }));
  }
  getBlockFromViewDirection() {
    if (!this.rayHit) return undefined;
    return { block: this.dimension.getBlock(this.rayHit.pos), face: this.rayHit.face ?? "Up", faceLocation: { x: 0.5, y: 1, z: 0.5 } };
  }
  sendMessage(m) {
    this.messages.push(String(m));
  }
  spawnParticle() {}
  getGameMode() {
    return this.gameMode;
  }
  setGameMode(g) {
    this.gameMode = g;
  }
  addEffect() {}
  removeEffect() {}
}

function signal() {
  const hs = [];
  return { subscribe: (h) => (hs.push(h), h), unsubscribe: () => {}, _fire: (ev) => hs.forEach((h) => h(ev)), _handlers: hs };
}
const signals = () => new Proxy({}, { get: (t, k) => (t[k] ??= signal()) });

const dims = { "minecraft:overworld": new Dimension("minecraft:overworld") };

export const world = {
  ...dynStore(),
  players: [],
  structureManager,
  gameRules: { doDayLightCycle: true, doWeatherCycle: true, doMobSpawning: true, doFireTick: true, mobGriefing: true, randomTickSpeed: 1, showCoordinates: false },
  afterEvents: signals(),
  beforeEvents: signals(),
  getDimension: (id) => dims[id] ?? dims["minecraft:overworld"],
  getAllPlayers() {
    return this.players;
  },
  setTimeOfDay() {},
};

// ----- system: Jobs laufen erst bei drain() -----
const jobs = [];
const runs = [];
const intervals = [];
const waiters = [];
export const system = {
  currentTick: 0,
  beforeEvents: signals(),
  afterEvents: signals(),
  runJob(gen) {
    jobs.push(gen);
    return jobs.length;
  },
  run(fn) {
    runs.push(fn);
    return runs.length;
  },
  runTimeout(fn) {
    runs.push(fn);
    return runs.length;
  },
  runInterval(fn, ticks = 1) {
    intervals.push({ fn, ticks });
    return intervals.length;
  },
  waitTicks(n) {
    return new Promise((res) => waiters.push(res));
  },
  clearRun() {},
};

/** Alle ausstehenden Jobs/Aufrufe ausführen (inkl. Promise-Ketten). */
export async function drain(maxRounds = 200) {
  for (let r = 0; r < maxRounds; r++) {
    let did = false;
    while (runs.length) {
      runs.shift()();
      did = true;
    }
    while (jobs.length) {
      const g = jobs.shift();
      let steps = 0;
      while (!g.next().done) {
        if (++steps > 5e7) throw new Error("Job hängt");
      }
      did = true;
    }
    while (waiters.length) {
      waiters.shift()();
      did = true;
    }
    system.currentTick += 20;
    await new Promise((res) => setImmediate(res));
    if (!did && !runs.length && !jobs.length && !waiters.length) return;
  }
}

export function tickIntervals(n = 1) {
  for (let i = 0; i < n; i++) {
    system.currentTick++;
    for (const it of intervals) if (system.currentTick % it.ticks === 0) it.fn();
  }
}
