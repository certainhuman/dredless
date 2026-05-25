import { decoder } from "../constants.js";
import { toUint8Array } from "../protocol/binary.js";
import {
  LOADER_FILTER_MODE_NAMES,
  LOADER_POSITION_NAMES,
  LOADER_PRIORITY_NAMES,
  LoaderConfigTracker
} from "./loader-config.js";
import fs from "node:fs";

const itemSchema = JSON.parse(fs.readFileSync(new URL("../../spec/item_schema.json", import.meta.url), "utf8"));

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
      if (shift > 70) throw new Error("model_data varint too large");
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

const LABEL_STATE_SPEC = {
  name: "label_state",
  read(reader, record, mask) {
    if (mask & 1) record.blob20 = reader.readBlob();
    if (mask & 2) {
      if (mask & 1) record.blob24 = reader.readBlob();
      else record.q20 = (record.q20 || 0) + reader.readFieldDelta();
    }
    if (mask & 4) record.q28 = (record.q28 || 0) + reader.readFieldDelta();
    if (mask & 8) {
      if (mask & 1) record.q32 = (record.q32 || 0) + reader.readFieldDelta();
      else record.blob28 = reader.readBlob();
    }
    if (mask & 16) record.q36 = (record.q36 || 0) + reader.readFieldDelta();
  }
};

const SIMPLE_LABEL_STATE_SPEC = {
  name: "label_state",
  read(reader, record, mask) {
    if (mask & 1) record.blob20 = reader.readBlob();
    if (mask & 2) record.q24 = (record.q24 || 0) + reader.readFieldDelta();
    if (mask & 4) record.q28 = (record.q28 || 0) + reader.readFieldDelta();
    if (mask & 8) record.q32 = (record.q32 || 0) + reader.readFieldDelta();
    if (mask & 16) record.q36 = (record.q36 || 0) + reader.readFieldDelta();
  }
};

function peekStreamInt(reader) {
  let result = 0;
  let shift = 0;
  let offset = reader.offset;
  while (offset < reader.bytes.length) {
    const byte = reader.bytes[offset++];
    result += (byte & 0x7f) * (2 ** shift);
    if ((byte & 0x80) === 0) {
      return {
        value: (result & 1) === 0 ? result / 2 : -((result + 1) / 2),
        offset
      };
    }
    shift += 7;
    if (shift > 53) return null;
  }
  return null;
}

function nextValueLooksLikeTextBlob(reader) {
  const peek = peekStreamInt(reader);
  if (!peek || peek.value <= 0) return false;
  const end = peek.offset + peek.value;
  if (end > reader.bytes.length) return false;
  const blob = reader.bytes.slice(peek.offset, end);
  try {
    const text = decoder.decode(blob);
    return text.length > 0 && !/[\u0000-\u0008\u000e-\u001f]/.test(text);
  } catch (_) {
    return false;
  }
}

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
  [1, {
    name: "body_state",
    fields: numericFields({
      1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40, 64: 44, 128: 48,
      256: 52, 512: 56, 1024: 60, 2048: 64, 4096: 68, 8192: 72,
      16384: 76, 32768: 80, 65536: 84, 131072: 88, 262144: 92,
      524288: 96, 1048576: 100, 2097152: 104
    })
  }],
  [2, { name: "numeric_pair", ...TWO_FIELD_SPEC }],
  [3, { name: "gate_width", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40 }) }],
  [4, { name: "motion_aux", packedBits: [{ bit: 8, offset: 33 }], fields: numericFields({ 1: 20, 2: 24, 4: 28 }) }],
  [5, { name: "entity_health", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32 }) }],
  [6, { name: "item_holder", ...TWO_FIELD_SPEC }],
  [7, {
    name: "entity_type",
    fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40, 64: 44, 128: 48, 256: 52 })
  }],
  [8, { name: "numeric_sparse", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40 }) }],
  [9, LABEL_STATE_SPEC],
  [10, SIMPLE_LABEL_STATE_SPEC],
  [11, { name: "numeric_sparse", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36 }) }],
  [12, { name: "numeric_sparse", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32 }) }],
  [14, { name: "size_state", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40, 64: 44 }) }],
  [16, {
    name: "label_numeric_state",
    read(reader, record, mask) {
      if ((mask & 1) && nextValueLooksLikeTextBlob(reader)) {
        SIMPLE_LABEL_STATE_SPEC.read(reader, record, mask);
        return;
      }
      if (mask & 1) record.q20 = (record.q20 || 0) + reader.readFieldDelta();
      if (mask & 2) {
        if (mask & 1) record.blob24 = reader.readBlob();
        else record.q24 = (record.q24 || 0) + reader.readFieldDelta();
      }
      if (mask & 4) record.q28 = (record.q28 || 0) + reader.readFieldDelta();
      if (mask & 8) record.q32 = (record.q32 || 0) + reader.readFieldDelta();
      if (mask & 16) record.q36 = (record.q36 || 0) + reader.readFieldDelta();
    }
  }],
  [17, { name: "numeric_sparse", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36 }) }],
  [18, { name: "mob_combat_state", fields: numericFields({ 2: 20, 4: 24, 8: 28, 16: 32, 32: 36, 64: 40, 128: 44, 256: 48, 512: 52, 1024: 56, 2048: 60, 4096: 64, 8192: 68, 16384: 72, 32768: 76, 65536: 80, 131072: 84, 524288: 88, 4194304: 92 }) }],
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
  [21, {
    name: "gate_portal",
    orderedValues: true,
    fields: numericFields({ 1: 20, 2: 24 }),
    blobs: [{ bit: 4, offset: 28 }, { bit: 8, offset: 40 }]
  }],
  [24, { name: "projectile_state", packedBits: [{ bit: 8, offset: 33 }], fields: numericFields({ 1: 20, 2: 24, 4: 28 }) }],
  [25, {
    name: "zone_label",
    orderedValues: true,
    fields: numericFields({ 1: 20, 2: 24 }),
    blobs: [{ bit: 4, offset: 28 }, { bit: 8, offset: 40 }]
  }],
  [26, { name: "numeric_single", fields: numericFields({ 1: 20 }) }],
  [31, { name: "numeric_single", fields: numericFields({ 1: 20 }) }],
  [37, { name: "loose_item_marker", packedBits: [{ bit: 2, offset: 29 }], fields: numericFields({ 1: 20, 4: 24 }) }],
  [38, { name: "flag_state", packedBits: [{ bit: 1, offset: 21 }], fields: [] }],
  [39, { name: "comms_transmit", ...TWO_FIELD_SPEC }],
  [41, { name: "blob_state", fields: numericFields({ 2: 20 }), blobs: [{ bit: 1, offset: 24 }] }],
  [42, { name: "numeric_pair", ...TWO_FIELD_SPEC }],
  [43, { name: "numeric_single", fields: numericFields({ 1: 20 }) }],
  [44, { name: "numeric_sparse", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32 }) }],
  [45, { name: "numeric_flag", packedBits: [{ bit: 1, offset: 25 }], fields: numericFields({ 2: 20 }) }],
  [47, { name: "flag_state", packedBits: [{ bit: 1, offset: 21 }], fields: [] }],
  [49, { name: "processor_cycle", packedBits: [{ bit: 2, offset: 33 }], fields: numericFields({ 1: 20, 4: 24, 8: 28 }) }],
  [50, { name: "rare_snapshot", packedBits: [{ bit: 2, offset: 33 }, { bit: 8, offset: 34 }, { bit: 32, offset: 35 }], fields: numericFields({ 1: 20, 4: 24, 16: 28 }) }],
  [51, {
    name: "numeric_sparse",
    fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40, 64: 44, 128: 48, 256: 52 })
  }],
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
  [59, { name: "numeric_sparse", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36 }) }],
  [60, { name: "fluid_tank", packedBits: [{ bit: 4, offset: 29 }], ...TWO_FIELD_SPEC }],
  [61, { name: "shield_charge", ...TWO_FIELD_SPEC }],
  [62, { name: "flag_state", packedBits: [{ bit: 1, offset: 21 }], fields: [] }],
  [63, { name: "numeric_pair", ...TWO_FIELD_SPEC }],
  [67, { name: "numeric_single", fields: numericFields({ 1: 20 }) }],
  [69, { name: "rare_snapshot", packedBits: [{ bit: 32, offset: 41 }, { bit: 64, offset: 42 }], fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36 }) }],
  [70, { name: "rare_snapshot", packedBits: [{ bit: 16, offset: 40 }], fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 32: 36 }) }],
  [72, { name: "numeric_sparse", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40 }) }],
  [73, { name: "expando_box_marker", fields: [] }],
  [74, { name: "processor_marker", fields: [] }],
  [75, { name: "rare_snapshot", fields: numericFields({ 1: 20, 8: 24, 16: 28 }) }],
  [76, { name: "numeric_single", fields: numericFields({ 1: 20 }) }],
  [77, { name: "numeric_sparse", fields: numericFields({ 1: 20, 2: 24, 4: 28 }) }],
  [78, { name: "local_session_marker", fields: numericFields({ 1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40, 64: 44 }) }]
]);

const WIRE_TAG_TABLES = new Map([
  [1, 0],
  [2, 1],
  [3, 2],
  [4, 3],
  [5, 4],
  [26, 9],
  [40, 5],
  [42, 6],
  [43, 7],
  [44, 8],
  [45, 9],
  [46, 10],
  [47, 11],
  [48, 12],
  [49, 13],
  [50, 14],
  [51, 51],
  [52, 16],
  [74, 17],
  [80, 17],
  [81, 18],
  [82, 19],
  [83, 20],
  [84, 21],
  [85, 22],
  [86, 23],
  [87, 24],
  [88, 25],
  [89, 26],
  [90, 27],
  [93, 30],
  [94, 31],
  [95, 32],
  [99, 36],
  [120, 37],
  [121, 38],
  [122, 39],
  [123, 40],
  [124, 41],
  [125, 42],
  [126, 43],
  [127, 44],
  [128, 45],
  [129, 46],
  [130, 47],
  [131, 48],
  [132, 49],
  [133, 50],
  [134, 51],
  [135, 52],
  [136, 53],
  [137, 54],
  [138, 55],
  [139, 56],
  [141, 58],
  [142, 59],
  [143, 60],
  [144, 61],
  [145, 62],
  [146, 63],
  [147, 64],
  [148, 65],
  [149, 66],
  [150, 67],
  [151, 68],
  [152, 69],
  [153, 70],
  [158, 75],
  [160, 76],
  [161, 77],
  [162, 78],
  [163, 72],
  [164, 73],
  [165, 74],
  [166, 75],
  [167, 76],
  [168, 78],
  [169, 77]
]);

const MASK_ONLY_TABLES = new Set([13, 22, 23, 27, 30, 32, 36, 40, 46, 48, 52, 58, 64, 65, 66, 68, 73, 74]);

const ENTITY_TYPE_NAMES = new Map(itemSchema.map((item) => [Number(item.id), item.name]));

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

const DEFAULT_OVERWORLD_WARP_DURATION_SECONDS = 120;
const OVERWORLD_WARP_TICKS_PER_SECOND = 20;

const MARKER_TYPE_IDS = new Map([
  [73, 240]
]);

const TEAM_RANK_NAMES = new Map([
  [0, "Guest"],
  [1, "Crew"],
  [2, "CrewInvitePending_DEPRECATED"],
  [3, "Captain"],
  [4, "Banned"]
]);

const GAME_RANK_NAMES = new Map([
  [0, "Guest"],
  [1, "GameMaster"],
  [2, "PatronBronze"],
  [3, "PatronSilver"],
  [4, "PatronGold"],
  [5, "PatronPlat"],
  [6, "PatronFlux"]
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

function summarizeShipControl(entity, record) {
  if (!record) return null;
  const color = record.q32 == null ? null : Number(record.q32);
  const shieldMaxHpOffset = typeof record.q68 === "number" ? record.q68 : null;
  const shieldMaxHp = shieldMaxHpOffset == null ? null : shieldMaxHpOffset + 2000;
  const shieldBaseHp = typeof record.q72 === "number" ? record.q72 : null;
  const activeTankHp = typeof record.q76 === "number" ? record.q76 : null;
  const inactiveTankHp = typeof record.q80 === "number" ? record.q80 : null;
  const tankValues = [activeTankHp, inactiveTankHp].filter((value) => typeof value === "number");
  const warpTicks = typeof record.q84 === "number" ? record.q84 : null;
  const warpElapsedSeconds = warpTicks == null ? null : warpTicks / OVERWORLD_WARP_TICKS_PER_SECOND;
  const warpDurationSeconds = warpTicks == null ? null : record.q88 ?? DEFAULT_OVERWORLD_WARP_DURATION_SECONDS;
  const warpRemainingSeconds = warpElapsedSeconds == null ? null : Math.max(0, warpDurationSeconds - warpElapsedSeconds);
  return {
    entity,
    name: decodeText(record.blob116),
    hexCode: decodeText(record.blob128),
    shipWorldId: record.q20 ?? null,
    color: Number.isFinite(color) ? color : null,
    colorCss: Number.isFinite(color) ? colorToCss(color) : null,
    thrustX: numberOrNull(record.q24, 20),
    thrustY: numberOrNull(record.q28, 20),
    value52: numberOrNull(record.q52, 20),
    value84: numberOrNull(record.q84, 20),
    value96: numberOrNull(record.q96, 1000),
    shield: shieldMaxHp == null && shieldBaseHp == null && !tankValues.length ? null : {
      maxHp: shieldMaxHp,
      baseHp: shieldBaseHp,
      activeTankHp,
      inactiveTankHp,
      tankValues
    },
    warp: warpTicks == null ? null : {
      active: record.q28 === 3,
      ticks: warpTicks,
      elapsedSeconds: warpElapsedSeconds,
      durationSeconds: warpDurationSeconds,
      remainingSeconds: warpRemainingSeconds
    },
    state: cloneRecord(record)
  };
}

function summarizeShipSize(entity, record) {
  if (!record) return null;
  return {
    entity,
    width: record.q20 == null ? null : Math.round(record.q20 / 10),
    height: record.q24 == null ? null : Math.round(record.q24 / 10),
    rawWidth: record.q20 ?? null,
    rawHeight: record.q24 ?? null,
    state: cloneRecord(record)
  };
}

function summarizeItemCrate(entity, sizeRecord, itemRecord = null, healthRecord = null) {
  if (!sizeRecord) return null;
  const itemId = itemRecord?.q20 ?? null;
  const count = itemRecord?.q24 ?? null;
  return {
    entity,
    ...itemSummary(itemId, count),
    width: sizeRecord.q20 ?? null,
    height: sizeRecord.q24 ?? null,
    itemState: cloneRecord(itemRecord || healthRecord || {}),
    sizeState: cloneRecord(sizeRecord)
  };
}

function summarizeMapMarker(entity, labelRecord, zoneRecord = null, sizeRecord = null) {
  if (!labelRecord && !zoneRecord) return null;
  const title = decodeText(zoneRecord?.blob28) ?? decodeText(labelRecord?.blob20);
  const key = decodeText(labelRecord?.blob24) ?? decodeText(labelRecord?.blob28);
  const description = decodeText(zoneRecord?.blob40);
  const color = zoneRecord?.q20 ?? labelRecord?.q28 ?? null;
  const accentColor = zoneRecord?.q24 ?? labelRecord?.q32 ?? null;
  const kind = key === "mine" ? "mining_zone" : key === "dock" ? "dock" : zoneRecord ? "portal" : "marker";
  return {
    entity,
    kind,
    title,
    key,
    description,
    color,
    colorCss: color != null && Number.isFinite(Number(color)) ? colorToCss(Number(color)) : null,
    accentColor,
    accentColorCss: accentColor != null && Number.isFinite(Number(accentColor)) ? colorToCss(Number(accentColor)) : null,
    width: sizeRecord?.q20 ?? null,
    height: sizeRecord?.q24 ?? null,
    labelState: cloneRecord(labelRecord || {}),
    zoneState: cloneRecord(zoneRecord || {})
  };
}

function summarizeDockingSpring(entity, springRecord, bodyRecord = null, sizeRecord = null) {
  if (!springRecord || bodyRecord?.q32 !== -1 || sizeRecord?.q20 !== 160 || sizeRecord?.q24 !== 160) return null;
  return {
    entity,
    id: springRecord.q20 ?? null,
    width: sizeRecord.q20,
    height: sizeRecord.q24,
    state: cloneRecord(springRecord)
  };
}

function summarizeHugeThruster(entity, markerRecord, sizeRecord = null) {
  if (!markerRecord || sizeRecord?.q20 !== 320 || sizeRecord?.q24 !== 160) return null;
  return {
    entity,
    width: sizeRecord.q20,
    height: sizeRecord.q24,
    state: cloneRecord(markerRecord)
  };
}

function summarizeLoader(entity, loaderRecord, loaderFilterRecord = null, filterSlotsRecord = null, tracker = null) {
  if (!loaderRecord && !loaderFilterRecord && !filterSlotsRecord) return null;
  const config = tracker?.getConfig(null, entity, loaderRecord, loaderFilterRecord, filterSlotsRecord) ?? {};
  const hasLoaderState = Boolean(loaderRecord);
  const hasPositionConfig = Boolean(tracker?.hasPositionConfig(null, entity));
  const pick = hasLoaderState && hasPositionConfig ? config.pick ?? null : null;
  const place = hasLoaderState && hasPositionConfig ? config.place ?? null : null;
  const priority = hasLoaderState ? config.priority ?? null : null;
  const filterMode = config.filterMode ?? null;
  return {
    entity,
    pick,
    pickName: enumValueName(LOADER_POSITION_NAMES, pick),
    place,
    placeName: enumValueName(LOADER_POSITION_NAMES, place),
    priority,
    priorityName: enumValueName(LOADER_PRIORITY_NAMES, priority),
    requireOutput: hasLoaderState ? config.requireOutput ?? null : null,
    waitForStack: hasLoaderState ? config.waitForStack ?? null : null,
    stack: hasLoaderState ? config.stack ?? null : null,
    cycle: hasLoaderState ? config.cycle ?? null : null,
    filterMode,
    filterModeName: enumValueName(LOADER_FILTER_MODE_NAMES, filterMode),
    filterSlots: config.filterSlots ?? null,
    state: cloneRecord(loaderRecord || {}),
    filterState: cloneRecord(loaderFilterRecord || {}),
    filterSlotsState: cloneRecord(filterSlotsRecord || {})
  };
}

function enumValueName(map, value) {
  return value == null ? null : map.get(value) ?? null;
}

function colorToCss(color) {
  return `rgb(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff})`;
}

function summarizePlayer(entity, record) {
  if (!record) return null;
  const rawHeldItemId = record.q28 == null ? null : Number(record.q28);
  const heldItemId = Number.isFinite(rawHeldItemId) && rawHeldItemId !== 0 ? rawHeldItemId : null;
  const teamRank = Number.isFinite(Number(record.q72)) ? Number(record.q72) : 0;
  const gameRank = Number.isFinite(Number(record.q76)) ? Number(record.q76) : 0;
  return {
    entity,
    name: decodeText(record.blob92),
    heldItemId,
    heldItemName: entityNameFromType(heldItemId),
    repairTargetDistance: record.q56 == null ? null : record.q56 / 10,
    repairTargetAngle: record.q80 == null ? null : record.q80 / 100,
    teamRank,
    teamRankName: TEAM_RANK_NAMES.get(teamRank) || null,
    gameRank,
    gameRankName: GAME_RANK_NAMES.get(gameRank) || null,
    patronTier: patronTierName(gameRank),
    muted: Boolean(record.q112),
    state: cloneRecord(record)
  };
}

function patronTierName(gameRank) {
  switch (gameRank) {
    case 2: return "bronze";
    case 3: return "silver";
    case 4: return "gold";
    case 5: return "plat";
    case 6: return "flux";
    default: return null;
  }
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
  if (entity?.hugeThruster) {
    return {
      width: entity.hugeThruster.width,
      height: entity.hugeThruster.height,
      source: "huge_thruster"
    };
  }
  if (entity?.itemCrate && Number.isFinite(Number(entity.itemCrate.width)) && Number.isFinite(Number(entity.itemCrate.height))) {
    return {
      width: Number(entity.itemCrate.width),
      height: Number(entity.itemCrate.height),
      source: "crate"
    };
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
  if (entity?.mapMarker) return `Map Marker (${entity.mapMarker.title ?? entity.mapMarker.key ?? entity.mapMarker.kind ?? "marker"})`;
  if (entity?.dockingSpring) return "Docking Spring";
  if (entity?.hugeThruster) return "Huge Thruster";
  if (entity?.shipControl && entity?.isOverworld) return "Overworld Ship";
  if (entity?.markerTypeName) return entity.markerTypeName;
  if (entity?.typeName) return entity.typeName;
  if (entity?.fabricator) return "Fabricator";
  if (entity?.itemCrate) return "Item Crate";
  if (entity?.shieldGenerator) return "Shield Generator";
  if (entity?.fluidTank) return "Fluid Tank";
  if (entity?.cannon) return "Cannon";
  if (entity?.loader) return "Loader";
  if (entity?.processor) return "Processor";
  if (entity?.itemHolder && !entity?.processor && !entity?.cannon && !entity?.loader && !entity?.fluidTank && !entity?.shieldGenerator) {
    return entity.itemHolder.itemName || "Item Holder";
  }
  if (entity?.player) return "Player";
  if (entity?.shipControl) return "Ship Control";
  return entity?.typeId != null ? `Entity ${entity.typeId}` : "Entity";
}

function entityCategory(entity) {
  if (entity?.player) return "player";
  if (entity?.shipControl) return "ship_control";
  if (entity?.itemCrate) return "item_crate";
  if (entity?.mapMarker) return "map_marker";
  if (entity?.dockingSpring) return "docking_spring";
  if (entity?.hugeThruster) return "huge_thruster";
  const hasMachineComponent = Boolean(entity?.fabricator || entity?.processor || entity?.cannon || entity?.loader || entity?.fluidTank || entity?.shieldGenerator);
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
  if (entity?.itemHolder?.itemId != null && !entity?.processor && !entity?.cannon && !entity?.loader && !entity?.fluidTank && !entity?.shieldGenerator) {
    if (entity.typeId != null && (!PLACED_ENTITY_TYPE_IDS.has(Number(entity.typeId)) || entity.typeId === entity.itemHolder.itemId)) return "loose_item";
    if (entity.typeId == null) return "untyped_holder";
  }
  if (entity?.fabricator || entity?.cannon || entity?.loader || entity?.fluidTank || entity?.shieldGenerator) return "placed_entity";
  if (entity?.typeId != null && PLACED_ENTITY_TYPE_IDS.has(Number(entity.typeId))) return "placed_entity";
  if (entity?.typeId != null && !hasPhysicalComponent) return "metadata";
  if (entity?.itemHolder?.itemId != null && !entity?.processor && !entity?.cannon && !entity?.loader && !entity?.fluidTank && !entity?.shieldGenerator) return "untyped_holder";
  return "entity";
}

export class ModelState {
  #loaderConfig = new LoaderConfigTracker();

  constructor({ isOverworld = null } = {}) {
    this.isOverworld = isOverworld == null ? null : Boolean(isOverworld);
    this.generation = null;
    this.tables = new Map();
    this.removedEntities = [];
    this.lastUpdate = null;
    this.errors = [];
    this._derived = null;
  }

  setWorldKind(isOverworld) {
    const next = isOverworld == null ? null : Boolean(isOverworld);
    if (this.isOverworld === next) return;
    this.isOverworld = next;
    this.#invalidateDerived();
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
    return this.#derivedState().entitiesById.get(id) || null;
  }

  entities() {
    return this.#derivedState().entities.slice();
  }

  blocks() {
    return this.#derivedState().blocks.slice();
  }

  apply(bytes) {
    const reader = new ModelReader(bytes);
    const update = {
      generation: null,
      changedEntities: new Set(),
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
        let tag;
        try {
          tag = reader.readStreamInt();
        } catch (error) {
          throw new Error(`model section tag offset ${reader.offset}: ${error.message}`);
        }
        if (tag === 0) break;
        if (tag === 57005) {
          update.removals.push(...this.#readRemovals(reader));
          continue;
        }

        const tableId = WIRE_TAG_TABLES.get(tag);
        if (tableId == null) {
          update.unknownTags.push({ tag, offset: reader.offset });
          // Some live captures end with a terminal, empty section tag we do not
          // yet have a table mapping for. If the rest of the packet is just
          // zero terminators, keep the decoded sections and stop cleanly rather
          // than turning the whole frame into a decode error.
          if (reader.trailingZeroOnly()) break;
          throw new Error(`unsupported model_data section tag ${tag}`);
        }

        const section = this.#readSection(reader, tag, tableId);
        update.sections.push(section);
        for (const record of section.records) update.changedEntities.add(record.entity);
      }
    } catch (error) {
      update.error = error;
      this.errors.push({ message: error.message, generation: update.generation });
    }

    this.#updateLoaderConfig(update);
    this.lastUpdate = update;
    this.#updateDerived(update);
    return update;
  }

  snapshot({ includeTables = false } = {}) {
    const derived = this.#derivedState();
    return {
      generation: this.generation,
      tableCount: this.tables.size,
      entityCount: derived.entityCount,
      removedEntities: this.removedEntities.slice(-50),
      lastUpdate: this.lastUpdate ? summarizeUpdate(this.lastUpdate) : null,
      errors: this.errors.slice(-10),
      entities: derived.entities.slice(),
      blocks: derived.blocks.slice(),
      tables: includeTables ? this.tablesSnapshot() : derived.tableSummaries.slice()
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
    return this.#derivedState().transforms.slice();
  }

  itemHolders() {
    return this.#records(6).map((entry) => summarizeItemHolder(entry.entity, entry));
  }

  fabricators() {
    return this.#records(53).map((entry) => summarizeFabricator(entry.entity, entry));
  }

  players() {
    return this.#derivedState().players.slice();
  }

  shipControls() {
    return this.#derivedState().shipControls.slice();
  }

  machines() {
    const machines = this.#derivedState().machines;
    return {
      itemHolders: machines.itemHolders.slice(),
      fabricators: machines.fabricators.slice(),
      processors: machines.processors.slice(),
      cannons: machines.cannons.slice(),
      health: machines.health.slice(),
      loaders: machines.loaders.slice(),
      fluidTanks: machines.fluidTanks.slice(),
      shieldGenerators: machines.shieldGenerators.slice()
    };
  }

  #invalidateDerived() {
    this._derived = null;
  }

  #updateDerived(update) {
    if (!this._derived) return;
    if (!update.removals.length && !update.changedEntities.size) return;

    for (const entityId of update.removals) this.#removeDerivedEntity(entityId);
    for (const entityId of update.changedEntities) this.#refreshDerivedEntity(entityId);
    this._derived.tableSummaries = this.#tableSummaries();
    this.#refreshDerivedSummaries();
  }

  #updateLoaderConfig(update) {
    for (const section of update.sections || []) {
      if (section.table !== 78) continue;
      for (const changed of section.records || []) {
        this.#loaderConfig.updateRecord(null, changed.entity, this.record(78, changed.entity), changed.mask);
      }
    }
  }

  #derivedState() {
    if (this._derived) return this._derived;

    const entityIds = [];
    const seenEntities = new Set();
    const tableSummaries = [];

    for (const [tableId, records] of this.tables.entries()) {
      const name = MODEL_TABLE_SPECS.get(tableId)?.name || null;
      tableSummaries.push({ id: tableId, name, count: records.size });
      for (const entity of records.keys()) {
        if (!seenEntities.has(entity)) {
          seenEntities.add(entity);
          entityIds.push(entity);
        }
      }
    }

    entityIds.sort((a, b) => a - b);
    const entities = entityIds.map((entityId) => this.#summarizeEntity(entityId, this.#tableRowsForEntity(entityId)));
    const entitiesById = new Map(entities.map((entity) => [entity.entity, entity]));
    const blocksByKey = this.#blocksByKeyForEntities(entities);

    this._derived = {
      entityCount: entityIds.length,
      entityIds,
      entitiesById,
      blocksByKey,
      tableSummaries
    };
    this.#refreshDerivedSummaries();
    return this._derived;
  }

  #tableRowsForEntity(entityId) {
    const rows = [];
    for (const [tableId, records] of this.tables.entries()) {
      const record = records.get(entityId);
      if (record) rows.push({ tableId, name: MODEL_TABLE_SPECS.get(tableId)?.name || null, record });
    }
    return rows;
  }

  #removeDerivedEntity(entityId) {
    const derived = this._derived;
    const old = derived.entitiesById.get(entityId);
    if (old) this.#removeEntityFromDerivedBlocks(derived, old);
    derived.entitiesById.delete(entityId);
    const index = derived.entityIds.indexOf(entityId);
    if (index >= 0) derived.entityIds.splice(index, 1);
    derived.entityCount = derived.entityIds.length;
  }

  #refreshDerivedEntity(entityId) {
    const rows = this.#tableRowsForEntity(entityId);
    if (!rows.length) {
      this.#removeDerivedEntity(entityId);
      return;
    }

    const derived = this._derived;
    const old = derived.entitiesById.get(entityId);
    if (old) this.#removeEntityFromDerivedBlocks(derived, old);

    const next = this.#summarizeEntity(entityId, rows);
    derived.entitiesById.set(entityId, next);
    if (!derived.entityIds.includes(entityId)) insertSorted(derived.entityIds, entityId);
    this.#addEntityToDerivedBlocks(derived, next);
    derived.entityCount = derived.entityIds.length;
  }

  #tableSummaries() {
    return [...this.tables.entries()].map(([id, records]) => ({
      id,
      name: MODEL_TABLE_SPECS.get(id)?.name || null,
      count: records.size
    }));
  }

  #blocksByKeyForEntities(entities) {
    const blocks = new Map();
    for (const entity of entities) {
      this.#addEntityToBlockMap(blocks, entity);
    }
    return blocks;
  }

  #addEntityToDerivedBlocks(derived, entity) {
    this.#addEntityToBlockMap(derived.blocksByKey, entity);
  }

  #addEntityToBlockMap(blocks, entity) {
    if (!entity.transform || !Number.isFinite(entity.transform.x) || !Number.isFinite(entity.transform.y)) return;
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

  #removeEntityFromDerivedBlocks(derived, entity) {
    for (const cell of entity.occupies || []) {
      const key = `${cell.x},${cell.y}`;
      const block = derived.blocksByKey.get(key);
      if (!block) continue;
      block.entities = block.entities.filter((item) => item.entity !== entity.entity);
      if (!block.entities.length) derived.blocksByKey.delete(key);
    }
  }

  #refreshDerivedSummaries() {
    const derived = this._derived;
    const entities = derived.entityIds.map((entityId) => derived.entitiesById.get(entityId)).filter(Boolean);
    const machines = {
      itemHolders: [],
      fabricators: [],
      processors: [],
      cannons: [],
      health: [],
      loaders: [],
      fluidTanks: [],
      shieldGenerators: []
    };
    const players = [];
    const shipControls = [];
    const transforms = [];

    for (const entity of entities) {
      if (entity.transform) transforms.push(entity.transform);
      const contents = entity.contents;
      if (!contents) continue;
      if (contents.itemHolder) machines.itemHolders.push(contents.itemHolder);
      if (contents.fabricator) machines.fabricators.push(contents.fabricator);
      if (contents.processor) machines.processors.push(contents.processor);
      if (contents.cannon) machines.cannons.push(contents.cannon);
      if (contents.health) machines.health.push(contents.health);
      if (contents.loader) machines.loaders.push(contents.loader);
      if (contents.fluidTank) machines.fluidTanks.push(contents.fluidTank);
      if (contents.shieldGenerator) machines.shieldGenerators.push(contents.shieldGenerator);
      if (contents.player) players.push(contents.player);
      if (contents.shipControl) shipControls.push(contents.shipControl);
    }

    derived.entities = entities;
    derived.blocks = [...derived.blocksByKey.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    derived.transforms = transforms;
    derived.players = players;
    derived.shipControls = shipControls;
    derived.machines = machines;
  }

  #summarizeEntity(entityId, tableRows = []) {
    const transformRecord = this.record(0, entityId);
    const itemHolderRecord = this.record(6, entityId);
    const healthRecord = this.record(5, entityId);
    const fabricatorRecord = this.record(53, entityId);
    const processorRecord = this.record(49, entityId);
    const cannonRecord = this.record(54, entityId);
    const loaderRecord = this.record(78, entityId);
    const loaderFilterRecord = this.record(76, entityId);
    const loaderFilterSlotsRecord = this.record(77, entityId);
    const fluidTankRecord = this.record(60, entityId);
    const shieldRecord = this.record(61, entityId);
    const playerRecord = this.record(55, entityId);
    const shipControlRecord = this.record(20, entityId);
    const labelRecord = this.record(9, entityId);
    const zoneLabelRecord = this.record(25, entityId);
    const dockingSpringRecord = this.record(26, entityId);
    const hugeThrusterRecord = this.record(23, entityId);
    const bodyStateRecord = this.record(1, entityId);
    const typeRecord = this.record(7, entityId);
    const crateSizeRecord = this.record(3, entityId);
    const crateItemRecord = this.record(19, entityId);
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
    const loader = summarizeLoader(entityId, loaderRecord, loaderFilterRecord, loaderFilterSlotsRecord, this.#loaderConfig);
    const fluidTank = fluidTankRecord ? { entity: entityId, amount: fluidTankRecord.q24 ?? null, state: cloneRecord(fluidTankRecord) } : null;
    const shieldGenerator = shieldRecord ? { entity: entityId, charge: shieldRecord.q20 ?? null, state: cloneRecord(shieldRecord) } : null;
    const player = summarizePlayer(entityId, playerRecord);
    const shipControl = summarizeShipControl(entityId, shipControlRecord);
    const shipSize = shipControl && this.isOverworld ? summarizeShipSize(entityId, this.record(3, entityId)) : null;
    const mapMarker = this.isOverworld ? summarizeMapMarker(entityId, labelRecord, zoneLabelRecord, crateSizeRecord) : null;
    const dockingSpring = this.isOverworld
      ? summarizeDockingSpring(entityId, dockingSpringRecord, bodyStateRecord, crateSizeRecord)
      : null;
    const hugeThruster = this.isOverworld
      ? summarizeHugeThruster(entityId, hugeThrusterRecord, crateSizeRecord)
      : null;
    const itemCrate = this.isOverworld && !this.record(2, entityId) && !this.record(18, entityId) && health && crateSizeRecord
      ? summarizeItemCrate(entityId, crateSizeRecord, crateItemRecord, healthRecord)
      : null;
    const transform = transformRecord ? {
      entity: entityId,
      x: numberOrNull(transformRecord.q20, 40),
      y: numberOrNull(transformRecord.q24, 40),
      rot: numberOrNull(transformRecord.q28, 127.324),
      flags: [transformRecord.q33, transformRecord.q34, transformRecord.q35].filter((value) => value != null)
    } : null;
    const contents = mergeContents({ itemHolder }, { itemCrate }, { mapMarker }, { dockingSpring }, { hugeThruster }, { health }, { fabricator }, { processor }, { cannon }, { loader }, { fluidTank }, { shieldGenerator }, { player }, { shipControl }, { shipSize });
    const footprint = entityFootprint({ entity: entityId, typeId, markerTypeId, itemHolder, itemCrate, hugeThruster, fabricator, processor, cannon, loader, fluidTank, shieldGenerator, player, shipControl });
    const typeName = entityNameFromType(typeId);
    const category = entityCategory({ typeId, markerTypeId, looseItemMarker, dynamicBody, transform, itemHolder, itemCrate, mapMarker, dockingSpring, hugeThruster, fabricator, processor, cannon, loader, fluidTank, shieldGenerator, player, shipControl });
    const summary = {
      entity: entityId,
      category,
      typeId,
      typeName,
      markerTypeId,
      markerTypeName,
      label: entityLabel({
        category,
        typeId,
        typeName,
        markerTypeName,
        mapMarker,
        dockingSpring,
        hugeThruster,
        itemHolder,
        itemCrate,
        fabricator,
        processor,
        cannon,
        loader,
        fluidTank,
        shieldGenerator,
        player,
        shipControl,
        isOverworld: this.isOverworld
      }),
      kind: [
        transform ? "transform" : null,
        dynamicBody ? "dynamic_body" : null,
        itemHolder ? "item_holder" : null,
        health ? "health" : null,
        itemCrate ? "item_crate" : null,
        mapMarker ? "map_marker" : null,
        dockingSpring ? "docking_spring" : null,
        hugeThruster ? "huge_thruster" : null,
        markerTableIds.length ? "marker" : null,
        looseItemMarker ? "loose_item_marker" : null,
        fabricator ? "fabricator" : null,
        processor ? "processor" : null,
        cannon ? "cannon" : null,
        loader ? "loader" : null,
        fluidTank ? "fluid_tank" : null,
        shieldGenerator ? "shield_generator" : null,
        player ? "player" : null,
        shipControl ? "ship_control" : null,
        shipControl && this.isOverworld ? "overworld_ship" : null
      ].filter(Boolean),
      transform,
      footprint,
      contents,
      tables: tableRows.map(({ tableId, name, record }) => ({
        tableId,
        name,
        record: cloneRecord(record)
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
      this.#loaderConfig.delete(null, entity);
    }
    this.removedEntities.push(...removals);
    return removals;
  }

  #readSection(reader, tag, tableId) {
    const spec = MODEL_TABLE_SPECS.get(tableId);
    const section = { tag, table: tableId, name: spec?.name || null, records: [] };
    let entity = 0;
    while (reader.remaining > 0) {
      const recordOffset = reader.offset;
      let delta;
      try {
        delta = reader.readStreamInt();
      } catch (error) {
        throw new Error(`model table ${tableId} tag ${tag} record offset ${recordOffset}: ${error.message}`);
      }
      if (delta === 0) break;
      entity += delta;
      let mask;
      try {
        mask = reader.readUnsigned();
      } catch (error) {
        throw new Error(`model table ${tableId} tag ${tag} entity ${entity} mask offset ${reader.offset}: ${error.message}`);
      }
      const record = this.#getRecord(tableId, entity);
      record.lastMask = mask;

      try {
        if (spec) this.#applyRecordSpec(reader, record, mask, spec);
        else if (!MASK_ONLY_TABLES.has(tableId)) throw new Error(`missing model table spec ${tableId}`);
      } catch (error) {
        throw new Error(`model table ${tableId} tag ${tag} entity ${entity} mask ${mask} offset ${reader.offset}: ${error.message}`);
      }

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
    if (typeof spec.read === "function") {
      spec.read(reader, record, mask);
      if (spec.scale) record.scaled = spec.scale(record);
      return;
    }

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

function insertSorted(values, value) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < value) low = mid + 1;
    else high = mid;
  }
  values.splice(low, 0, value);
}

export function decodeModelData(bytes) {
  const state = new ModelState();
  return state.apply(bytes);
}
