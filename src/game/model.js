import { decoder } from "../constants.js";
import { toUint8Array } from "../protocol/binary.js";

class ModelReader {
  constructor(bytes) {
    this.bytes = toUint8Array(bytes);
    this.offset = 0;
  }

  get remaining() {
    return this.bytes.length - this.offset;
  }

  readByte() {
    if (this.offset >= this.bytes.length) throw new Error("model_data read past end");
    return this.bytes[this.offset++];
  }

  readUnsigned() {
    let result = 0;
    let shift = 0;
    while (true) {
      const byte = this.readByte();
      result += (byte & 0x7f) * (2 ** shift);
      if ((byte & 0x80) === 0) return result;
      shift += 7;
      if (shift > 53) throw new Error("model_data varint too large");
    }
  }

  readStreamInt() {
    const raw = this.readUnsigned();
    return (raw & 1) === 0 ? raw / 2 : -((raw + 1) / 2);
  }

  readFieldDelta() {
    const raw = this.readUnsigned();
    return (raw & 1) === 0 ? raw / 2 : -(raw >> 1);
  }

  readBlob() {
    const length = this.readStreamInt();
    if (length < 0) throw new Error(`negative blob length ${length}`);
    const end = this.offset + length;
    if (end > this.bytes.length) throw new Error("model_data blob read past end");
    const blob = this.bytes.slice(this.offset, end);
    this.offset = end;
    return blob;
  }

  trailingZeroOnly() {
    for (let i = this.offset; i < this.bytes.length; i++) {
      if (this.bytes[i] !== 0) return false;
    }
    return true;
  }
}

function numericFields(bitsToOffsets) {
  return Object.entries(bitsToOffsets)
    .map(([bit, offset]) => ({ bit: Number(bit), offset }))
    .sort((a, b) => a.bit - b.bit);
}

const TWO_FIELD_SPEC = {
  fields: numericFields({ 1: 20, 2: 24 })
};

const MODEL_TABLE_SPECS = new Map([
  [0, {
    name: "transform",
    packedBits: [{ bit: 8, offset: 33 }, { bit: 16, offset: 34 }, { bit: 32, offset: 35 }],
    fields: numericFields({ 1: 20, 2: 24, 4: 28 }),
    scale(record) {
      return {
        x: numberOrNull(record.q20, 40),
        y: numberOrNull(record.q24, 40),
        rot: numberOrNull(record.q28, 127.324)
      };
    }
  }],
  [1, { name: "body_state", fields: numericFields({ 1: 20, 8: 24, 16: 28, 32: 32 }) }],
  [3, { name: "gate_width", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40 }) }],
  [4, { name: "motion_aux", packedBits: [{ bit: 8, offset: 33 }], fields: numericFields({ 1: 20, 2: 24, 4: 28 }) }],
  [5, { name: "entity_health", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32 }) }],
  [6, { name: "item_holder", ...TWO_FIELD_SPEC }],
  [7, { name: "entity_type", ...TWO_FIELD_SPEC }],
  [11, { name: "numeric_sparse", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36 }) }],
  [14, { name: "size_state", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40, 64: 44 }) }],
  [16, { name: "named_state", fields: numericFields({ 1: 20, 2: 24, 8: 28 }), blobs: [{ bit: 16, offset: 32 }] }],
  [19, { name: "motion_state", packedBits: [{ bit: 4, offset: 29 }], ...TWO_FIELD_SPEC }],
  [20, {
    name: "ship_control",
    packedBeforeValues: true,
    orderedValues: true,
    packedBits: [{ bit: 0x1000, offset: 153 }],
    fields: numericFields({
      1: 20, 2: 24, 4: 28, 32: 32, 64: 36, 128: 40, 256: 44, 512: 48,
      1024: 52, 2048: 56, 8192: 60, 16384: 64, 32768: 68, 65536: 72,
      131072: 76, 262144: 80, 524288: 84, 1048576: 88, 2097152: 92,
      4194304: 96, 8388608: 100, 16777216: 104, 67108864: 108, 134217728: 112
    }),
    blobs: [
      { bit: 8, offset: 116 },
      { bit: 16, offset: 128 },
      { bit: 33554432, offset: 140 }
    ],
    scale(record) {
      return {
        thrustX: numberOrNull(record.q24, 20),
        thrustY: numberOrNull(record.q28, 20),
        value52: numberOrNull(record.q52, 20)
      };
    }
  }],
  [37, { name: "loose_item_marker", packedBits: [{ bit: 2, offset: 29 }], fields: numericFields({ 1: 20, 4: 24 }) }],
  [38, { name: "flag_state", packedBits: [{ bit: 1, offset: 21 }], fields: [] }],
  [41, { name: "blob_state", fields: numericFields({ 2: 20 }), blobs: [{ bit: 1, offset: 24 }] }],
  [42, { name: "numeric_pair", ...TWO_FIELD_SPEC }],
  [43, { name: "numeric_single", fields: numericFields({ 1: 20 }) }],
  [45, { name: "numeric_flag", packedBits: [{ bit: 1, offset: 25 }], fields: numericFields({ 2: 20 }) }],
  [47, { name: "flag_state", packedBits: [{ bit: 1, offset: 21 }], fields: [] }],
  [49, { name: "processor_cycle", packedBits: [{ bit: 2, offset: 33 }], fields: numericFields({ 1: 20, 4: 24, 8: 28 }) }],
  [50, { name: "rare_snapshot", packedBits: [{ bit: 2, offset: 33 }, { bit: 8, offset: 34 }, { bit: 32, offset: 35 }], fields: numericFields({ 1: 20, 4: 24, 16: 28 }) }],
  [51, { name: "numeric_pair", ...TWO_FIELD_SPEC }],
  [53, {
    name: "fabricator",
    packedBits: [{ bit: 2, offset: 61 }],
    fields: numericFields({ 1: 20, 4: 24, 8: 28, 16: 32, 32: 36, 64: 40, 128: 44, 256: 48, 512: 52, 1024: 56 })
  }],
  [54, { name: "starter_cannon", fields: numericFields({ 1: 20, 2: 32, 4: 24, 8: 28, 32: 36, 256: 40 }) }],
  [55, {
    name: "player",
    packedBeforeValues: true,
    fields: numericFields({
      256: 20, 512: 24, 1024: 28, 2048: 32, 4096: 36, 8192: 40,
      16384: 44, 32768: 48, 65536: 52, 131072: 56, 262144: 60,
      524288: 64, 1048576: 68, 2097152: 72, 4194304: 76, 8388608: 80,
      33554432: 84, 67108864: 88
    }),
    blobs: [{ bit: 1, offset: 92 }],
    packedBits: [
      { bit: 2, offset: 105 },
      { bit: 4, offset: 106 },
      { bit: 16, offset: 107 },
      { bit: 32, offset: 108 },
      { bit: 64, offset: 109 },
      { bit: 128, offset: 110 },
      { bit: 16777216, offset: 111 },
      { bit: 134217728, offset: 112 }
    ]
  }],
  [56, { name: "numeric_snapshot", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 64: 40, 256: 44, 1024: 48 }) }],
  [60, { name: "fluid_tank", packedBits: [{ bit: 4, offset: 29 }], ...TWO_FIELD_SPEC }],
  [61, { name: "shield_charge", ...TWO_FIELD_SPEC }],
  [62, { name: "flag_state", packedBits: [{ bit: 1, offset: 21 }], fields: [] }],
  [69, { name: "rare_snapshot", packedBits: [{ bit: 32, offset: 41 }, { bit: 64, offset: 42 }], fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36 }) }],
  [70, { name: "rare_snapshot", packedBits: [{ bit: 16, offset: 40 }], fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 32: 36 }) }],
  [73, { name: "expando_box_marker", fields: [] }],
  [74, { name: "processor_marker", fields: [] }],
  [75, { name: "rare_snapshot", fields: numericFields({ 1: 20, 8: 24, 16: 28 }) }]
]);

const WIRE_TAG_TABLES = new Map([
  [1, 0],
  [2, 1],
  [4, 3],
  [5, 4],
  [40, 5],
  [42, 6],
  [43, 7],
  [47, 11],
  [50, 14],
  [52, 16],
  [82, 19],
  [83, 20],
  [84, 21],
  [120, 37],
  [121, 38],
  [124, 41],
  [125, 42],
  [126, 43],
  [128, 45],
  [130, 47],
  [132, 49],
  [133, 50],
  [134, 51],
  [136, 53],
  [137, 54],
  [138, 55],
  [139, 56],
  [143, 60],
  [144, 61],
  [145, 62],
  [148, 65],
  [152, 69],
  [153, 70],
  [158, 75],
  [160, 76],
  [161, 77],
  [164, 73],
  [165, 74],
  [168, 78]
]);

const MASK_ONLY_TABLES = new Set([13, 21, 22, 23, 27, 30, 36, 40, 46, 52, 58, 65, 66, 68, 73, 74, 76, 77, 78]);

const ENTITY_TYPE_NAMES = new Map([
  [1, "Iron"],
  [2, "Explosives"],
  [4, "Hyper Rubber"],
  [5, "Flux Crystals"],
  [6, "Thruster Fuel"],
  [100, "Wrench"],
  [101, "Item Shredder"],
  [103, "Repair Tool"],
  [115, "Manifest Scanner"],
  [116, "BoM Scanner"],
  [117, "Starter Wrench"],
  [118, "Starter Shredder"],
  [119, "Hand Cannon"],
  [120, "Blueprint Scanner"],
  [121, "Sandbox RCD"],
  [122, "Flux RCD"],
  [123, "Shield Core"],
  [150, "Standard Ammo"],
  [151, "ScatterShot Ammo"],
  [152, "Flak Ammo"],
  [153, "Sniper Ammo"],
  [154, "Punch Ammo"],
  [155, "Yank Ammo"],
  [156, "Slug Ammo"],
  [157, "Trash Box"],
  [159, "Booster Fuel (Low Grade)"],
  [160, "Booster Fuel (High Grade)"],
  [166, "Cooling Cell"],
  [168, "Burst Charge"],
  [215, "Helm"],
  [216, "Helm (Starter)"],
  [217, "Comms Station"],
  [218, "Sign"],
  [219, "Spawn Point"],
  [220, "Door"],
  [221, "Cargo Hatch"],
  [222, "Cargo Hatch (Starter)"],
  [223, "Cargo Ejector"],
  [224, "Turret Controller"],
  [226, "Cannon"],
  [227, "Starter Cannon"],
  [228, "Burst Cannon"],
  [229, "Machine Cannon"],
  [230, "Thruster"],
  [231, "Starter Thruster"],
  [232, "Iron Block"],
  [233, "Hyper Rubber Block"],
  [234, "Hyper Ice Block"],
  [235, "Ladder"],
  [236, "Walkway"],
  [237, "Item Net"],
  [239, "Paint"],
  [240, "Expando Box"],
  [241, "Safety Anchor"],
  [242, "Pusher"],
  [243, "Item Launcher"],
  [245, "Recycler"],
  [246, "Fabricator (Legacy)"],
  [247, "Fabricator (Starter)"],
  [248, "Fabricator (Munitions)"],
  [249, "Fabricator (Engineering)"],
  [250, "Fabricator (Deprecated)"],
  [251, "Fabricator (Equipment)"],
  [252, "Loader"],
  [253, "Lockdown Override Unit"],
  [254, "Annihilator Tile"],
  [255, "Fluid Tank"],
  [256, "Shield Generator"],
  [257, "Shield Projector"],
  [258, "Enhanced Turret Controller"],
  [259, "Bulk Ejector"],
  [260, "Bulk Loading Bay Designator"],
  [261, "Navigation Unit"],
  [262, "Logistics Rail"],
  [263, "Acute Cannon"],
  [264, "Munitions Supply Unit"],
  [265, "Obtuse Cannon"]
]);

const ENTITY_FOOTPRINTS = new Map([
  [240, { width: 2, height: 2 }],
  [247, { width: 2, height: 2 }],
  [248, { width: 2, height: 2 }],
  [249, { width: 2, height: 2 }],
  [251, { width: 2, height: 2 }],
  [256, { width: 2, height: 2 }],
  [261, { width: 2, height: 2 }]
]);

const PLACED_ENTITY_TYPE_IDS = new Set([
  215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 226, 227, 228, 229,
  230, 231, 240, 241, 242, 243, 245, 246, 247, 248, 249, 250, 251, 252,
  253, 255, 256, 257, 258, 259, 260, 261, 263, 264, 265
]);

const CANNON_AMMO_COLOR_ITEM_IDS = new Map([
  [0xff9600, 150]
]);

const MARKER_TYPE_IDS = new Map([
  [73, 240]
]);

function numberOrNull(value, divisor = 1) {
  return typeof value === "number" ? value / divisor : null;
}

function qKey(offset) {
  return `q${offset}`;
}

function blobKey(offset) {
  return `blob${offset}`;
}

function cloneRecord(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = value instanceof Uint8Array ? [...value] : value;
  }
  return out;
}

function decodeText(blob) {
  if (!(blob instanceof Uint8Array)) return null;
  try { return decoder.decode(blob); }
  catch (_) { return null; }
}

function entityNameFromType(typeId) {
  return typeId == null ? null : ENTITY_TYPE_NAMES.get(Number(typeId)) || null;
}

function markerTypeIdForTables(tableIds) {
  for (const tableId of tableIds) {
    if (MARKER_TYPE_IDS.has(tableId)) return MARKER_TYPE_IDS.get(tableId);
  }
  return null;
}

function itemSummary(itemId, count = null) {
  const id = itemId == null ? null : Number(itemId);
  const normalizedId = Number.isFinite(id) && id !== 0 ? id : null;
  return {
    itemId: normalizedId,
    itemName: normalizedId == null ? null : entityNameFromType(normalizedId),
    count: count === 0 ? null : count
  };
}

function summarizeItemHolder(entity, record) {
  if (!record) return null;
  return {
    entity,
    ...itemSummary(record.q20, record.q24 ?? null)
  };
}

function summarizeFabricator(entity, record) {
  if (!record) return null;
  return {
    entity,
    state: cloneRecord(record),
    rows: [
      itemSummary(record.q28, record.q40 ?? null),
      itemSummary(record.q32, record.q44 ?? null),
      itemSummary(record.q36, record.q48 ?? null)
    ],
    progress: record.q24 ?? null
  };
}

function summarizeCannon(entity, record) {
  if (!record) return null;
  const ammoItemId = record.q24 == null ? null : CANNON_AMMO_COLOR_ITEM_IDS.get(record.q24) ?? null;
  const charge = record.q40 ?? null;
  return {
    entity,
    ammoItemId,
    ammoName: entityNameFromType(ammoItemId),
    ammoCount: record.q28 ?? 0,
    aim: record.q32 ?? null,
    recoil: record.q36 ?? null,
    charge,
    charged: charge == null ? null : charge >= 50,
    state: cloneRecord(record)
  };
}

function summarizeHealth(entity, record) {
  if (!record) return null;
  const maxHp = record.q20 ?? null;
  const hp = record.q24 ?? null;
  return {
    entity,
    hp,
    maxHp,
    ratio: typeof hp === "number" && typeof maxHp === "number" && maxHp !== 0 ? hp / maxHp : null,
    state: cloneRecord(record)
  };
}

function summarizePlayer(entity, record) {
  if (!record) return null;
  const rawHeldItemId = record.q28 == null ? null : Number(record.q28);
  const heldItemId = Number.isFinite(rawHeldItemId) && rawHeldItemId !== 0 ? rawHeldItemId : null;
  return {
    entity,
    name: decodeText(record.blob92),
    heldItemId,
    heldItemName: entityNameFromType(heldItemId),
    state: cloneRecord(record)
  };
}

function mergeContents(...parts) {
  const out = {};
  for (const part of parts) {
    if (!part) continue;
    for (const [key, value] of Object.entries(part)) {
      if (value == null) continue;
      out[key] = value;
    }
  }
  return Object.keys(out).length ? out : null;
}

function entityFootprint(entity) {
  if (entity?.markerTypeId != null && ENTITY_FOOTPRINTS.has(entity.markerTypeId)) {
    const footprint = ENTITY_FOOTPRINTS.get(entity.markerTypeId);
    return { ...footprint, source: "marker" };
  }
  if (entity?.typeId != null && ENTITY_FOOTPRINTS.has(entity.typeId)) {
    const footprint = ENTITY_FOOTPRINTS.get(entity.typeId);
    return { ...footprint, source: "type" };
  }
  if (entity?.fabricator || entity?.shieldGenerator) return { width: 2, height: 2, source: "heuristic" };
  return { width: 1, height: 1, source: "default" };
}

function entityLabel(entity) {
  if (entity?.category === "metadata" && entity?.typeName) return `Metadata ${entity.typeName}`;
  if (entity?.category === "loose_item" && entity?.itemHolder?.itemName) return `Loose ${entity.itemHolder.itemName}`;
  if (entity?.category === "untyped_holder" && entity?.itemHolder?.itemName) return `Untyped Holder (${entity.itemHolder.itemName})`;
  if (entity?.markerTypeName) return entity.markerTypeName;
  if (entity?.typeName) return entity.typeName;
  if (entity?.fabricator) return "Fabricator";
  if (entity?.shieldGenerator) return "Shield Generator";
  if (entity?.fluidTank) return "Fluid Tank";
  if (entity?.cannon) return "Cannon";
  if (entity?.processor) return "Processor";
  if (entity?.itemHolder && !entity?.processor && !entity?.cannon && !entity?.fluidTank && !entity?.shieldGenerator) {
    return entity.itemHolder.itemName || "Item Holder";
  }
  if (entity?.player) return "Player";
  if (entity?.shipControl) return "Ship Control";
  return entity?.typeId != null ? `Entity ${entity.typeId}` : "Entity";
}

function entityCategory(entity) {
  if (entity?.player) return "player";
  if (entity?.shipControl) return "ship_control";
  const hasMachineComponent = Boolean(entity?.fabricator || entity?.processor || entity?.cannon || entity?.fluidTank || entity?.shieldGenerator);
  const hasValidTransform = Boolean(
    entity?.transform &&
    Number.isFinite(entity.transform.x) &&
    Number.isFinite(entity.transform.y)
  );
  const hasPhysicalComponent = Boolean(hasValidTransform || entity?.itemHolder || hasMachineComponent);
  if (!hasPhysicalComponent) return "metadata";
  if (entity?.transform && !hasValidTransform && !entity?.itemHolder && !hasMachineComponent) return "metadata";
  if (entity?.typeId != null && !hasPhysicalComponent) return "metadata";
  if (entity?.markerTypeId != null) return "placed_entity";
  if (entity?.looseItemMarker && entity?.itemHolder?.itemId != null) return "loose_item";
  if (entity?.itemHolder?.itemId != null && !entity?.processor && !entity?.cannon && !entity?.fluidTank && !entity?.shieldGenerator) {
    if (entity.typeId != null && (!PLACED_ENTITY_TYPE_IDS.has(Number(entity.typeId)) || entity.typeId === entity.itemHolder.itemId)) return "loose_item";
    if (entity.typeId == null) return "untyped_holder";
  }
  if (entity?.fabricator || entity?.cannon || entity?.fluidTank || entity?.shieldGenerator) return "placed_entity";
  if (entity?.typeId != null && PLACED_ENTITY_TYPE_IDS.has(Number(entity.typeId))) return "placed_entity";
  if (entity?.typeId != null && !hasPhysicalComponent) return "metadata";
  if (entity?.itemHolder?.itemId != null && !entity?.processor && !entity?.cannon && !entity?.fluidTank && !entity?.shieldGenerator) return "untyped_holder";
  return "entity";
}

export class ModelState {
  constructor() {
    this.generation = null;
    this.tables = new Map();
    this.removedEntities = [];
    this.lastUpdate = null;
    this.errors = [];
  }

  table(id) {
    return this.tables.get(Number(id)) || new Map();
  }

  record(tableId, entityId) {
    return this.table(tableId).get(Number(entityId)) || null;
  }

  entity(entityId) {
    const id = Number(entityId);
    if (!Number.isFinite(id)) return null;
    return this.#summarizeEntity(id);
  }

  entities() {
    return this.#entityIds().map((entityId) => this.#summarizeEntity(entityId));
  }

  blocks() {
    const blocks = new Map();
    for (const entity of this.entities()) {
      if (!entity.transform) continue;
      const footprint = entity.footprint || { width: 1, height: 1 };
      const startX = Math.floor(entity.transform.x);
      const startY = Math.floor(entity.transform.y);
      for (let dx = 0; dx < footprint.width; dx++) {
        for (let dy = 0; dy < footprint.height; dy++) {
          const x = startX + dx;
          const y = startY + dy;
          const key = `${x},${y}`;
          if (!blocks.has(key)) blocks.set(key, { x, y, entities: [] });
          blocks.get(key).entities.push(entity);
        }
      }
    }
    return [...blocks.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  }

  apply(bytes) {
    const reader = new ModelReader(bytes);
    const update = {
      generation: null,
      sections: [],
      removals: [],
      unknownTags: [],
      error: null
    };

    try {
      update.generation = reader.readStreamInt();
      this.generation = update.generation;

      while (reader.remaining > 0) {
        if (reader.trailingZeroOnly()) break;
        const tag = reader.readStreamInt();
        if (tag === 0) break;
        if (tag === 57005) {
          update.removals.push(...this.#readRemovals(reader));
          continue;
        }

        const tableId = WIRE_TAG_TABLES.get(tag);
        if (tableId == null) {
          update.unknownTags.push({ tag, offset: reader.offset });
          throw new Error(`unsupported model_data section tag ${tag}`);
        }

        const section = this.#readSection(reader, tag, tableId);
        update.sections.push(section);
      }
    } catch (error) {
      update.error = error;
      this.errors.push({ message: error.message, generation: update.generation });
    }

    this.lastUpdate = update;
    return update;
  }

  snapshot({ includeTables = false } = {}) {
    const tables = [...this.tables.entries()].map(([id, records]) => ({
      id,
      name: MODEL_TABLE_SPECS.get(id)?.name || null,
      count: records.size
    }));
    return {
      generation: this.generation,
      tableCount: this.tables.size,
      entityCount: new Set([...this.tables.values()].flatMap((records) => [...records.keys()])).size,
      removedEntities: this.removedEntities.slice(-50),
      lastUpdate: this.lastUpdate ? summarizeUpdate(this.lastUpdate) : null,
      errors: this.errors.slice(-10),
      entities: this.entities(),
      blocks: this.blocks(),
      tables: includeTables ? this.tablesSnapshot() : tables
    };
  }

  tablesSnapshot() {
    return [...this.tables.entries()].map(([id, records]) => ({
      id,
      name: MODEL_TABLE_SPECS.get(id)?.name || null,
      records: [...records.entries()].map(([entity, record]) => ({ entity, ...cloneRecord(record) }))
    }));
  }

  transforms() {
    return this.#records(0).map((entry) => ({
      entity: entry.entity,
      x: numberOrNull(entry.q20, 40),
      y: numberOrNull(entry.q24, 40),
      rot: numberOrNull(entry.q28, 127.324),
      flags: [entry.q33, entry.q34, entry.q35].filter((value) => value != null)
    }));
  }

  itemHolders() {
    return this.#records(6).map((entry) => summarizeItemHolder(entry.entity, entry));
  }

  fabricators() {
    return this.#records(53).map((entry) => summarizeFabricator(entry.entity, entry));
  }

  players() {
    return this.#records(55).map((entry) => summarizePlayer(entry.entity, entry));
  }

  shipControls() {
    return this.#records(20).map((entry) => ({
      entity: entry.entity,
      thrustX: numberOrNull(entry.q24, 20),
      thrustY: numberOrNull(entry.q28, 20),
      state: cloneRecord(entry)
    }));
  }

  machines() {
    return {
      itemHolders: this.itemHolders(),
      fabricators: this.fabricators(),
      processors: this.#records(49).map((entry) => ({ entity: entry.entity, state: cloneRecord(entry) })),
      cannons: this.#records(54).map((entry) => summarizeCannon(entry.entity, entry)),
      health: this.#records(5).map((entry) => summarizeHealth(entry.entity, entry)),
      fluidTanks: this.#records(60).map((entry) => ({ entity: entry.entity, amount: entry.q24 ?? null, state: cloneRecord(entry) })),
      shieldGenerators: this.#records(61).map((entry) => ({ entity: entry.entity, charge: entry.q20 ?? null, state: cloneRecord(entry) }))
    };
  }

  #entityIds() {
    return [...new Set([...this.tables.values()].flatMap((records) => [...records.keys()]))].sort((a, b) => a - b);
  }

  #summarizeEntity(entityId) {
    const transformRecord = this.record(0, entityId);
    const itemHolderRecord = this.record(6, entityId);
    const healthRecord = this.record(5, entityId);
    const fabricatorRecord = this.record(53, entityId);
    const processorRecord = this.record(49, entityId);
    const cannonRecord = this.record(54, entityId);
    const fluidTankRecord = this.record(60, entityId);
    const shieldRecord = this.record(61, entityId);
    const playerRecord = this.record(55, entityId);
    const shipControlRecord = this.record(20, entityId);
    const bodyStateRecord = this.record(1, entityId);
    const typeRecord = this.record(7, entityId);
    const markerTableIds = [73].filter((tableId) => this.record(tableId, entityId));
    const markerTypeId = markerTypeIdForTables(markerTableIds);
    const markerTypeName = entityNameFromType(markerTypeId);
    const looseItemMarker = Boolean(this.record(37, entityId));
    const dynamicBody = bodyStateRecord?.q20 === -4;
    const typeId = typeRecord?.q20 ?? null;
    const itemHolder = summarizeItemHolder(entityId, itemHolderRecord);
    const health = summarizeHealth(entityId, healthRecord);
    const fabricator = summarizeFabricator(entityId, fabricatorRecord);
    const processor = processorRecord ? { entity: entityId, state: cloneRecord(processorRecord) } : null;
    const cannon = summarizeCannon(entityId, cannonRecord);
    const fluidTank = fluidTankRecord ? { entity: entityId, amount: fluidTankRecord.q24 ?? null, state: cloneRecord(fluidTankRecord) } : null;
    const shieldGenerator = shieldRecord ? { entity: entityId, charge: shieldRecord.q20 ?? null, state: cloneRecord(shieldRecord) } : null;
    const player = summarizePlayer(entityId, playerRecord);
    const shipControl = shipControlRecord ? {
      entity: entityId,
      thrustX: numberOrNull(shipControlRecord.q24, 20),
      thrustY: numberOrNull(shipControlRecord.q28, 20),
      state: cloneRecord(shipControlRecord)
    } : null;
    const transform = transformRecord ? {
      entity: entityId,
      x: numberOrNull(transformRecord.q20, 40),
      y: numberOrNull(transformRecord.q24, 40),
      rot: numberOrNull(transformRecord.q28, 127.324),
      flags: [transformRecord.q33, transformRecord.q34, transformRecord.q35].filter((value) => value != null)
    } : null;
    const contents = mergeContents({ itemHolder }, { health }, { fabricator }, { processor }, { cannon }, { fluidTank }, { shieldGenerator }, { player }, { shipControl });
    const footprint = entityFootprint({ entity: entityId, typeId, markerTypeId, itemHolder, fabricator, processor, cannon, fluidTank, shieldGenerator, player, shipControl });
    const typeName = entityNameFromType(typeId);
    const category = entityCategory({ typeId, markerTypeId, looseItemMarker, dynamicBody, transform, itemHolder, fabricator, processor, cannon, fluidTank, shieldGenerator, player, shipControl });
    const summary = {
      entity: entityId,
      category,
      typeId,
      typeName,
      markerTypeId,
      markerTypeName,
      label: entityLabel({ category, typeId, typeName, markerTypeName, itemHolder, fabricator, processor, cannon, fluidTank, shieldGenerator, player, shipControl }),
      kind: [
        transform ? "transform" : null,
        dynamicBody ? "dynamic_body" : null,
        itemHolder ? "item_holder" : null,
        health ? "health" : null,
        markerTableIds.length ? "marker" : null,
        looseItemMarker ? "loose_item_marker" : null,
        fabricator ? "fabricator" : null,
        processor ? "processor" : null,
        cannon ? "cannon" : null,
        fluidTank ? "fluid_tank" : null,
        shieldGenerator ? "shield_generator" : null,
        player ? "player" : null,
        shipControl ? "ship_control" : null
      ].filter(Boolean),
      transform,
      footprint,
      contents,
      tables: [...this.tables.entries()]
        .filter(([, records]) => records.has(entityId))
        .map(([tableId, records]) => ({
          tableId,
          name: MODEL_TABLE_SPECS.get(tableId)?.name || null,
          record: cloneRecord(records.get(entityId))
        }))
    };
    summary.occupies = transform ? this.#occupiedBlocks(transform, footprint) : [];
    return summary;
  }

  #occupiedBlocks(transform, footprint) {
    const startX = Math.floor(transform.x ?? 0);
    const startY = Math.floor(transform.y ?? 0);
    const cells = [];
    for (let dx = 0; dx < footprint.width; dx++) {
      for (let dy = 0; dy < footprint.height; dy++) {
        cells.push({ x: startX + dx, y: startY + dy });
      }
    }
    return cells;
  }

  #records(tableId) {
    return [...this.table(tableId).entries()].map(([entity, record]) => ({ entity, ...record }));
  }

  #readRemovals(reader) {
    const removals = [];
    let entity = 0;
    while (reader.remaining > 0) {
      const delta = reader.readStreamInt();
      if (delta === 0) break;
      entity += delta;
      removals.push(entity);
      for (const records of this.tables.values()) records.delete(entity);
    }
    this.removedEntities.push(...removals);
    return removals;
  }

  #readSection(reader, tag, tableId) {
    const spec = MODEL_TABLE_SPECS.get(tableId);
    const section = { tag, table: tableId, name: spec?.name || null, records: [] };
    let entity = 0;
    while (reader.remaining > 0) {
      const delta = reader.readStreamInt();
      if (delta === 0) break;
      entity += delta;
      const mask = reader.readUnsigned();
      const record = this.#getRecord(tableId, entity);
      record.lastMask = mask;

      if (spec) this.#applyRecordSpec(reader, record, mask, spec);
      else if (!MASK_ONLY_TABLES.has(tableId)) throw new Error(`missing model table spec ${tableId}`);

      section.records.push({ entity, mask });
    }
    return section;
  }

  #getRecord(tableId, entity) {
    if (!this.tables.has(tableId)) this.tables.set(tableId, new Map());
    const records = this.tables.get(tableId);
    if (!records.has(entity)) records.set(entity, {});
    return records.get(entity);
  }

  #applyRecordSpec(reader, record, mask, spec) {
    const hasPacked = Boolean(
      (spec.packedMask && (mask & spec.packedMask)) ||
      spec.packedBits?.some((item) => mask & item.bit)
    );
    let packed = null;
    if (hasPacked && spec.packedBeforeValues) packed = reader.readUnsigned();

    let packedIndex = 0;
    if (spec.orderedValues) {
      const values = [
        ...(spec.blobs || []).map((item) => ({ ...item, kind: "blob" })),
        ...(spec.fields || []).map((item) => ({ ...item, kind: "field" }))
      ].sort((a, b) => a.bit - b.bit);
      for (const item of values) {
        if (!(mask & item.bit)) continue;
        if (item.kind === "blob") record[blobKey(item.offset)] = reader.readBlob();
        else {
          const key = qKey(item.offset);
          record[key] = (record[key] || 0) + reader.readFieldDelta();
        }
      }
    } else {
      for (const blob of spec.blobs || []) {
        if (mask & blob.bit) record[blobKey(blob.offset)] = reader.readBlob();
      }
    }

    if (hasPacked && !spec.packedBeforeValues) packed = reader.readUnsigned();

    for (const item of spec.packedBits || []) {
      if (mask & item.bit) record[qKey(item.offset)] = (packed >> packedIndex++) & 1;
    }

    if (packed != null) {
      for (const offset of spec.packedOffsets || []) {
        record[qKey(offset)] = (packed >> packedIndex++) & 1;
      }
    }

    if (!spec.orderedValues) {
      for (const field of spec.fields || []) {
        if (!(mask & field.bit)) continue;
        const key = qKey(field.offset);
        record[key] = (record[key] || 0) + reader.readFieldDelta();
      }
    }

    if (spec.scale) record.scaled = spec.scale(record);
  }
}

function summarizeUpdate(update) {
  return {
    generation: update.generation,
    sectionCount: update.sections.length,
    removals: update.removals.length,
    unknownTags: update.unknownTags,
    error: update.error?.message || null,
    sections: update.sections.map((section) => ({
      tag: section.tag,
      table: section.table,
      name: section.name,
      records: section.records.length
    }))
  };
}

export function decodeModelData(bytes) {
  const state = new ModelState();
  return state.apply(bytes);
}
