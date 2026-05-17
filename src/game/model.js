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
  [3, { name: "gate_width", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40 }) }],
  [4, { name: "motion_aux", packedBits: [{ bit: 8, offset: 33 }], fields: numericFields({ 1: 20, 2: 24, 4: 28 }) }],
  [5, { name: "entity_state", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32 }) }],
  [6, { name: "item_holder", ...TWO_FIELD_SPEC }],
  [11, { name: "numeric_sparse", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36 }) }],
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
  [37, { name: "scaled_flag", packedBits: [{ bit: 2, offset: 29 }], fields: numericFields({ 1: 20, 4: 24 }) }],
  [38, { name: "flag_state", packedBits: [{ bit: 1, offset: 21 }], fields: [] }],
  [41, { name: "blob_state", fields: numericFields({ 2: 20 }), blobs: [{ bit: 1, offset: 24 }] }],
  [42, { name: "numeric_pair", ...TWO_FIELD_SPEC }],
  [43, { name: "numeric_single", fields: numericFields({ 1: 20 }) }],
  [45, { name: "numeric_flag", packedBits: [{ bit: 1, offset: 25 }], fields: numericFields({ 2: 20 }) }],
  [47, { name: "flag_state", packedBits: [{ bit: 1, offset: 21 }], fields: [] }],
  [49, { name: "processor_cycle", packedBits: [{ bit: 2, offset: 33 }], fields: numericFields({ 1: 20, 4: 24, 8: 28 }) }],
  [50, { name: "rare_snapshot", packedBits: [{ bit: 2, offset: 33 }, { bit: 8, offset: 34 }, { bit: 32, offset: 35 }], fields: numericFields({ 1: 20, 4: 24, 16: 28 }) }],
  [53, {
    name: "fabricator",
    packedBits: [{ bit: 2, offset: 61 }],
    fields: numericFields({ 1: 20, 4: 24, 8: 28, 16: 32, 32: 36, 64: 40, 128: 44, 256: 48, 512: 52, 1024: 56 })
  }],
  [54, { name: "starter_cannon", fields: numericFields({ 1: 20, 2: 32, 4: 24, 8: 28, 32: 36, 256: 40 }) }],
  [55, {
    name: "player",
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
  [60, { name: "fluid_tank", packedBits: [{ bit: 4, offset: 29 }], ...TWO_FIELD_SPEC }],
  [61, { name: "shield_charge", ...TWO_FIELD_SPEC }],
  [62, { name: "flag_state", packedBits: [{ bit: 1, offset: 21 }], fields: [] }],
  [69, { name: "rare_snapshot", packedBits: [{ bit: 32, offset: 41 }, { bit: 64, offset: 42 }], fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36 }) }],
  [70, { name: "rare_snapshot", packedBits: [{ bit: 16, offset: 40 }], fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 32: 36 }) }],
  [75, { name: "rare_snapshot", fields: numericFields({ 1: 20, 8: 24, 16: 28 }) }]
]);

const WIRE_TAG_TABLES = new Map([
  [1, 0],
  [4, 3],
  [5, 4],
  [40, 5],
  [47, 11],
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
  [136, 53],
  [137, 54],
  [138, 55],
  [143, 60],
  [144, 61],
  [145, 62],
  [152, 69],
  [153, 70],
  [158, 75]
]);

const MASK_ONLY_TABLES = new Set([13, 21, 22, 23, 27, 30, 36, 40, 46, 52, 58, 65, 66, 68, 73, 74, 77]);

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
    return this.#records(6).map((entry) => ({
      entity: entry.entity,
      itemId: entry.q20 ?? null,
      count: entry.q24 ?? null
    }));
  }

  fabricators() {
    return this.#records(53).map((entry) => ({
      entity: entry.entity,
      state: cloneRecord(entry),
      rows: [
        { itemId: entry.q28 ?? null, count: entry.q40 ?? null },
        { itemId: entry.q32 ?? null, count: entry.q44 ?? null },
        { itemId: entry.q36 ?? null, count: entry.q48 ?? null }
      ],
      progress: entry.q24 ?? null
    }));
  }

  players() {
    return this.#records(55).map((entry) => ({
      entity: entry.entity,
      name: decodeText(entry.blob92),
      state: cloneRecord(entry)
    }));
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
      cannons: this.#records(54).map((entry) => ({ entity: entry.entity, state: cloneRecord(entry) })),
      fluidTanks: this.#records(60).map((entry) => ({ entity: entry.entity, amount: entry.q24 ?? null, state: cloneRecord(entry) })),
      shieldGenerators: this.#records(61).map((entry) => ({ entity: entry.entity, charge: entry.q20 ?? null, state: cloneRecord(entry) }))
    };
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
