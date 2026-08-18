import {decoder} from "../constants.js";
import {toUint8Array} from "../protocol/binary.js";
import {
    LOADER_FILTER_MODE_NAMES,
    LOADER_POSITION_NAMES,
    LOADER_PRIORITY_NAMES,
    LoaderConfigTracker
} from "./loader-config.js";
import {navigationDestinationFromEncodedValue, navigationZoneFromBaseId} from "./overworld.js";
import {maybeSolveGeneratorMazeSeed} from "./generator-maze.js";
import {itemNameFromId} from "./items.js";

export function defineLazyProperty(target, key, compute) {
    let cached = null;
    let resolved = false;
    Object.defineProperty(target, key, {
        enumerable: true,
        configurable: true,
        get() {
            if (!resolved) {
                cached = compute();
                resolved = true;
            }
            return cached;
        },
        set(value) {
            cached = value;
            resolved = true;
        }
    });
    return target;
}

export class ModelReader {
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

    // Called once per section while scanning, so a fresh tail scan each time is
    // O(bytes x sections). The index of the last non-zero byte is fixed for the
    // packet, so compute it once and compare offsets thereafter.
    trailingZeroOnly() {
        if (this._lastNonZero === undefined) {
            let last = -1;
            for (let i = this.bytes.length - 1; i >= 0; i--) {
                if (this.bytes[i] !== 0) {
                    last = i;
                    break;
                }
            }
            this._lastNonZero = last;
        }
        return this.offset > this._lastNonZero;
    }
}

// `key` is precomputed: it is fixed per field but was rebuilt as a template
// string on every field of every record while decoding.
export function numericFields(bitsToOffsets) {
    return Object.entries(bitsToOffsets)
        .map(([bit, offset]) => ({bit: Number(bit), offset, key: qKey(offset)}))
        .sort((a, b) => a.bit - b.bit);
}

export const TWO_FIELD_SPEC = {
    fields: numericFields({1: 20, 2: 24})
};

export const LABEL_STATE_SPEC = {
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

export const SIMPLE_LABEL_STATE_SPEC = {
    name: "label_state",
    read(reader, record, mask) {
        if (mask & 1) record.blob20 = reader.readBlob();
        if (mask & 2) record.q24 = (record.q24 || 0) + reader.readFieldDelta();
        if (mask & 4) record.q28 = (record.q28 || 0) + reader.readFieldDelta();
        if (mask & 8) record.q32 = (record.q32 || 0) + reader.readFieldDelta();
        if (mask & 16) record.q36 = (record.q36 || 0) + reader.readFieldDelta();
    }
};

export function peekStreamInt(reader) {
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

export function nextValueLooksLikeTextBlob(reader) {
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

export const MODEL_TABLE_SPECS = new Map([
    [0, {
        name: "transform",
        packedBits: [{bit: 8, offset: 33}, {bit: 16, offset: 34}, {bit: 32, offset: 35}],
        fields: numericFields({1: 20, 2: 24, 4: 28}),
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
    [2, {name: "numeric_pair", ...TWO_FIELD_SPEC}],
    [3, {name: "gate_width", fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40})}],
    [4, {name: "motion_aux", packedBits: [{bit: 8, offset: 33}], fields: numericFields({1: 20, 2: 24, 4: 28})}],
    [5, {name: "entity_health", fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32})}],
    [6, {name: "item_holder", ...TWO_FIELD_SPEC}],
    [7, {
        name: "entity_type",
        fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40, 64: 44, 128: 48, 256: 52})
    }],
    [8, {name: "numeric_sparse", fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40})}],
    [9, LABEL_STATE_SPEC],
    [10, SIMPLE_LABEL_STATE_SPEC],
    [11, {name: "numeric_sparse", fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36})}],
    [12, {name: "numeric_sparse", fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32})}],
    [14, {name: "size_state", fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40, 64: 44})}],
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
    [17, {name: "numeric_sparse", fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36})}],
    [18, {
        name: "mob_combat_state",
        fields: numericFields({
            2: 20,
            4: 24,
            8: 28,
            16: 32,
            32: 36,
            64: 40,
            128: 44,
            256: 48,
            512: 52,
            1024: 56,
            2048: 60,
            4096: 64,
            8192: 68,
            16384: 72,
            32768: 76,
            65536: 80,
            131072: 84,
            524288: 88,
            4194304: 92
        })
    }],
    [19, {name: "motion_state", packedBits: [{bit: 4, offset: 29}], ...TWO_FIELD_SPEC}],
    [20, {
        name: "ship_control",
        packedBeforeValues: true,
        orderedValues: true,
        packedBits: [{bit: 0x1000, offset: 153}],
        fields: numericFields({
            1: 20, 2: 24, 4: 28, 32: 32, 64: 36, 128: 40, 256: 44, 512: 48,
            1024: 52, 2048: 56, 8192: 60, 16384: 64, 32768: 68, 65536: 72,
            131072: 76, 262144: 80, 524288: 84, 1048576: 88, 2097152: 92,
            4194304: 96, 8388608: 100, 16777216: 104, 67108864: 108, 134217728: 112
        }),
        blobs: [
            {bit: 8, offset: 116},
            {bit: 16, offset: 128},
            {bit: 33554432, offset: 140}
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
        fields: numericFields({1: 20, 2: 24}),
        blobs: [{bit: 4, offset: 28}, {bit: 8, offset: 40}]
    }],
    [24, {name: "projectile_state", packedBits: [{bit: 8, offset: 33}], fields: numericFields({1: 20, 2: 24, 4: 28})}],
    [25, {
        name: "zone_label",
        orderedValues: true,
        fields: numericFields({1: 20, 2: 24}),
        blobs: [{bit: 4, offset: 28}, {bit: 8, offset: 40}]
    }],
    [26, {name: "numeric_single", fields: numericFields({1: 20})}],
    [31, {name: "numeric_single", fields: numericFields({1: 20})}],
    [37, {name: "loose_item_marker", packedBits: [{bit: 2, offset: 29}], fields: numericFields({1: 20, 4: 24})}],
    [38, {name: "flag_state", packedBits: [{bit: 1, offset: 21}], fields: []}],
    [39, {name: "comms_transmit", ...TWO_FIELD_SPEC}],
    [41, {name: "blob_state", fields: numericFields({2: 20}), blobs: [{bit: 1, offset: 24}]}],
    [42, {name: "numeric_pair", ...TWO_FIELD_SPEC}],
    [43, {name: "numeric_single", fields: numericFields({1: 20})}],
    [44, {name: "numeric_sparse", fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32})}],
    [45, {name: "numeric_flag", packedBits: [{bit: 1, offset: 25}], fields: numericFields({2: 20})}],
    [47, {name: "flag_state", packedBits: [{bit: 1, offset: 21}], fields: []}],
    [49, {name: "processor_cycle", packedBits: [{bit: 2, offset: 33}], fields: numericFields({1: 20, 4: 24, 8: 28})}],
    [50, {
        name: "rare_snapshot",
        packedBits: [{bit: 2, offset: 33}, {bit: 8, offset: 34}, {bit: 32, offset: 35}],
        fields: numericFields({1: 20, 4: 24, 16: 28})
    }],
    [51, {
        name: "numeric_sparse",
        fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40, 64: 44, 128: 48, 256: 52})
    }],
    [53, {
        name: "fabricator",
        packedBits: [{bit: 2, offset: 61}],
        fields: numericFields({1: 20, 4: 24, 8: 28, 16: 32, 32: 36, 64: 40, 128: 44, 256: 48, 512: 52, 1024: 56})
    }],
    [54, {
        name: "starter_cannon",
        fields: numericFields({1: 20, 2: 32, 4: 24, 8: 28, 16: 44, 32: 36, 64: 48, 128: 52, 256: 40, 512: 56, 1024: 60})
    }],
    [55, {
        name: "player",
        packedBeforeValues: true,
        fields: numericFields({
            256: 20, 512: 24, 1024: 28, 2048: 32, 4096: 36, 8192: 40,
            16384: 44, 32768: 48, 65536: 52, 131072: 56, 262144: 60,
            524288: 64, 1048576: 68, 2097152: 72, 4194304: 76, 8388608: 80,
            33554432: 84, 67108864: 88
        }),
        blobs: [{bit: 1, offset: 92}],
        packedBits: [
            {bit: 2, offset: 105},
            {bit: 4, offset: 106},
            {bit: 16, offset: 107},
            {bit: 32, offset: 108},
            {bit: 64, offset: 109},
            {bit: 128, offset: 110},
            {bit: 16777216, offset: 111},
            {bit: 134217728, offset: 112}
        ]
    }],
    [56, {
        name: "numeric_snapshot",
        fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 64: 40, 256: 44, 1024: 48})
    }],
    [59, {name: "numeric_sparse", fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36})}],
    [60, {name: "fluid_tank", packedBits: [{bit: 4, offset: 29}], ...TWO_FIELD_SPEC}],
    [61, {name: "shield_charge", ...TWO_FIELD_SPEC}],
    [62, {name: "flag_state", packedBits: [{bit: 1, offset: 21}], fields: []}],
    [63, {name: "numeric_pair", ...TWO_FIELD_SPEC}],
    [67, {name: "numeric_single", fields: numericFields({1: 20})}],
    [69, {
        name: "rare_snapshot",
        packedBits: [{bit: 32, offset: 41}, {bit: 64, offset: 42}],
        fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36})
    }],
    [70, {
        name: "rare_snapshot",
        packedBits: [{bit: 16, offset: 40}],
        fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 32: 36})
    }],
    [72, {
        name: "pusher_config",
        packedBits: [{bit: 16, offset: 36}],
        fields: numericFields({1: 20, 2: 24, 4: 28, 8: 32, 32: 40})
    }],
    [73, {name: "expando_box_marker", fields: []}],
    [74, {name: "processor_marker", fields: []}],
    [75, {name: "rare_snapshot", fields: numericFields({1: 20, 8: 24, 16: 28})}],
    [76, {name: "numeric_single", fields: numericFields({1: 20})}],
    [77, {name: "numeric_sparse", fields: numericFields({1: 20, 2: 24, 4: 28})}],
    [78, {
        name: "local_session_marker",
        read(reader, record, mask) {
            for (const {bit, key} of TABLE_78_NUMERIC_FIELDS) {
                if (!(mask & bit)) continue;
                record[key] = (record[key] || 0) + reader.readFieldDelta();
            }
            if ((mask & 64) && !(mask & 32)) {
                record.q44 = (record.q44 || 0) + reader.readFieldDelta();
            }
        }
    }]
]);

// Precompute everything about a spec that is fixed at module load. Decoding a
// full model packet runs #applyRecordSpec thousands of times, and each run used
// to rebuild record key strings and -- for ordered specs -- an entire merged,
// sorted item array.
for (const spec of MODEL_TABLE_SPECS.values()) {
    for (const blob of spec.blobs || []) blob.key = blobKey(blob.offset);
    for (const item of spec.packedBits || []) item.key = qKey(item.offset);
    if (spec.packedOffsets) spec.packedOffsetKeys = spec.packedOffsets.map(qKey);
    if (spec.orderedValues) {
        spec.orderedItems = [
            ...(spec.blobs || []).map((item) => ({bit: item.bit, offset: item.offset, key: item.key, kind: "blob"})),
            ...(spec.fields || []).map((item) => ({bit: item.bit, offset: item.offset, key: item.key, kind: "field"}))
        ].sort((a, b) => a.bit - b.bit);
    }
}

export const TABLE_78_NUMERIC_FIELDS = numericFields({1: 20, 2: 24, 4: 28, 8: 32, 16: 36, 32: 40});

export const WIRE_TAG_TABLES = new Map([
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
    [91, 28],
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

export const MASK_ONLY_TABLES = new Set([13, 22, 23, 27, 28, 30, 32, 36, 40, 46, 48, 52, 58, 64, 65, 66, 68, 73, 74]);

export const ENTITY_FOOTPRINTS = new Map([
    [240, {width: 2, height: 2}],
    [247, {width: 2, height: 2}],
    [248, {width: 2, height: 2}],
    [249, {width: 2, height: 2}],
    [251, {width: 2, height: 2}],
    [256, {width: 2, height: 2}],
    [261, {width: 2, height: 2}]
]);

export const PLACED_ENTITY_TYPE_IDS = new Set([
    215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 226, 227, 228, 229,
    230, 231, 240, 241, 242, 243, 245, 246, 247, 248, 249, 250, 251, 252,
    253, 255, 256, 257, 258, 259, 260, 261, 263, 264, 265
]);

export const FabricatorType = Object.freeze({
    Starter: "starter",
    Munitions: "munitions",
    Engineering: "engineering",
    Equipment: "equipment"
});

export const FABRICATOR_TYPES = new Map([
    [0, FabricatorType.Starter],
    [1, FabricatorType.Munitions],
    [2, FabricatorType.Engineering],
    [3, FabricatorType.Equipment]
]);

export const HELM_TYPE_IDS = new Set([215, 216]);
export const COMMS_STATION_TYPE_ID = 217;
export const COMMS_STATION_MAX_CHARGES = 5;
export const CARGO_HATCH_TYPE_IDS = new Set([221, 222]);
export const THRUSTER_TYPE_IDS = new Set([230, 231]);
export const EXPANDO_BOX_TYPE_ID = 240;
export const ITEM_LAUNCHER_TYPE_ID = 243;
export const LOADER_TYPE_ID = 252;
export const NAVIGATION_UNIT_TYPE_ID = 261;

export function entityTypeIdFromRecord(record) {
    if (!record) return null;
    const candidates = [
        record.q20,
        record.q24,
        record.q28,
        record.q32,
        record.q36,
        record.q40,
        record.q44,
        record.q48,
        record.q52
    ].filter((value) => Number.isFinite(Number(value)) && Number(value) !== 0).map(Number);
    return candidates.find((value) => PLACED_ENTITY_TYPE_IDS.has(value)) ?? candidates[0] ?? null;
}

export const CANNON_AMMO_COLOR_ITEM_IDS = new Map([
    [0xff9600, 150]
]);

export const CANNON_TYPE_IDS = new Set([226, 227, 228, 229, 263, 265]);

export const THRUSTER_FACING_NAMES = new Map([
    [0, "bottom"],
    [1, "top"],
    [2, "right"],
    [3, "left"],
    [4, "bottom-right"],
    [5, "bottom-left"],
    [6, "top-right"],
    [7, "top-left"]
]);

export const DEFAULT_OVERWORLD_WARP_DURATION_SECONDS = 120;
export const OVERWORLD_WARP_TICKS_PER_SECOND = 20;

export const MARKER_TYPE_IDS = new Map([
    [73, 240]
]);

export const TEAM_RANK_NAMES = new Map([
    [0, "Guest"],
    [1, "Crew"],
    [2, "CrewInvitePending_DEPRECATED"],
    [3, "Captain"],
    [4, "Banned"]
]);

export const PLAYER_SHIP_RANKS = new Map([
    [0, "guest"],
    [1, "crew"],
    [2, "crew-invite-pending-deprecated"],
    [3, "captain"],
    [4, "banned"]
]);

export const PUSHER_MODE_NAMES = new Map([
    [0, "Push"],
    [1, "Pull"],
    [2, "Do Nothing"]
]);

export const SIGN_DISPLAY_MODE_NAMES = new Map([
    [0, "always"],
    [1, "when-near"],
    [2, "on-hover"]
]);

export const SHIELD_GENERATOR_BOOST_STATE_NAMES = new Map([
    [0, "inactive"],
    [1, "boosted"],
    [2, "failed"]
]);

export const NAVIGATION_DEFAULT_DESTINATION = 10;

export function navigationDestinationName(destination) {
    return navigationZoneFromBaseId(destination)?.key ?? null;
}

export function isNavigationDestination(destination) {
    return navigationDestinationName(destination) != null;
}

export function numberOrNull(value, divisor = 1) {
    return typeof value === "number" ? value / divisor : null;
}

export function qKey(offset) {
    return `q${offset}`;
}

export function blobKey(offset) {
    return `blob${offset}`;
}

// Blob fields stay expanded to plain arrays: that shape is part of the public
// record surface. Avoiding the Object.entries pair array is the win available
// without changing what callers see.
export function cloneRecord(record) {
    const out = {};
    for (const key in record) {
        const value = record[key];
        out[key] = value instanceof Uint8Array ? Array.from(value) : value;
    }
    return out;
}

export function firstRecord(records, predicate = null) {
    for (const record of records.values()) {
        if (!predicate || predicate(record)) return record;
    }
    return null;
}

export const TABLE_78_FIELD_BITS = [
    ["q20", 1],
    ["q24", 2],
    ["q28", 4],
    ["q32", 8],
    ["q36", 16],
    ["q40", 32],
    ["q44", 64]
];

export function table78DeltaRecord(changed) {
    const record = {lastMask: changed.mask};
    for (const [field, bit] of TABLE_78_FIELD_BITS) {
        if (!(changed.mask & bit)) continue;
        if (field === "q44" && ((changed.mask & 32) || changed.record?.q44 == null)) continue;
        record[field] = (changed.record?.[field] ?? 0) - (changed.previous?.[field] ?? 0);
    }
    return record;
}

export function isSemanticLoaderDelta(changed, full) {
    return !full &&
        changed.previous != null &&
        (changed.mask & 96) === 96;
}

export function decodeText(blob) {
    if (!(blob instanceof Uint8Array)) return null;
    try {
        return decoder.decode(blob);
    } catch (_) {
        return null;
    }
}

export function entityNameFromType(typeId) {
    return itemNameFromId(typeId);
}

export function markerTypeIdForTables(tableIds) {
    for (const tableId of tableIds) {
        if (MARKER_TYPE_IDS.has(tableId)) return MARKER_TYPE_IDS.get(tableId);
    }
    return null;
}

export function itemSummary(itemId, count = null) {
    const id = itemId == null ? null : Number(itemId);
    const normalizedId = Number.isFinite(id) && id !== 0 ? id : null;
    return {
        itemId: normalizedId,
        itemName: normalizedId == null ? null : entityNameFromType(normalizedId),
        count: count === 0 ? null : count
    };
}

export function summarizeItemHolder(entity, record) {
    if (!record) return null;
    return {
        entity,
        ...itemSummary(record.q20, record.q24 ?? null)
    };
}

export function boundedProgress(value) {
    if (value == null) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(0, Math.min(100, number));
}

export function summarizeFabricator(entity, record, itemHolderRecord = null, typeRecord = null) {
    if (!record) return null;
    const progressRaw = record.q24 ?? null;
    const craftingItem = itemSummary(itemHolderRecord?.q20, itemHolderRecord?.q24 ?? null);
    return {
        entity,
        type: FABRICATOR_TYPES.get(typeRecord?.q32) ?? null,
        typeIndex: typeRecord?.q32 ?? null,
        state: cloneRecord(record),
        rows: [
            itemSummary(record.q28, record.q40 ?? null),
            itemSummary(record.q32, record.q44 ?? null),
            itemSummary(record.q36, record.q48 ?? null)
        ],
        progress: boundedProgress(progressRaw),
        progressRaw,
        active: Boolean(record.q61) || (typeof progressRaw === "number" && progressRaw > 0),
        craftingItemId: craftingItem.itemId,
        craftingItemName: craftingItem.itemName,
        craftingCount: craftingItem.count
    };
}

export function summarizeCargoEjector(entity, typeId, record) {
    if (typeId !== 223) return null;
    return {
        entity,
        typeId,
        typeName: entityNameFromType(typeId),
        progress: boundedProgress(record?.q24 ?? null),
        active: record?.q33 == null ? null : Boolean(record.q33)
    };
}

export function summarizeCannon(entity, record, typeId = null) {
    if (!record || !CANNON_TYPE_IDS.has(typeId)) return null;
    const ammoItemId = record.q24 == null ? null : CANNON_AMMO_COLOR_ITEM_IDS.get(record.q24) ?? null;
    const charge = record.q40 ?? null;
    const recoil = record.q36 ?? null;
    const recoil2 = record.q48 ?? null;
    return {
        entity,
        typeId,
        typeName: entityNameFromType(typeId),
        ammoItemId,
        ammoName: entityNameFromType(ammoItemId),
        ammoCount: record.q28 ?? 0,
        aim: record.q32 ?? null,
        recoil,
        recoil2,
        recoils: [recoil, recoil2],
        charge,
        charged: charge == null ? null : charge >= 50,
        spin: record.q52 ?? null,
        coolingCellCount: record.q56 ?? 0,
        state: cloneRecord(record)
    };
}

export function summarizeThruster(entity, typeId, record) {
    if (!THRUSTER_TYPE_IDS.has(typeId)) return null;
    const facing = Number.isFinite(Number(record?.q20)) ? Number(record.q20) : 0;
    return {
        entity,
        typeId,
        typeName: entityNameFromType(typeId),
        facing,
        facingName: enumValueName(THRUSTER_FACING_NAMES, facing),
        fuel: record?.q24 ?? null,
        state: cloneRecord(record || {})
    };
}

export function summarizeHelm(entity, typeId, occupied = false) {
    if (!HELM_TYPE_IDS.has(typeId)) return null;
    return {
        entity,
        typeId,
        typeName: entityNameFromType(typeId),
        occupied: Boolean(occupied)
    };
}

export function navigationDestinationFromRecord(record, changedMask = record?.lastMask ?? 0) {
    if (!record) return NAVIGATION_DEFAULT_DESTINATION;
    const q32Destination = navigationDestinationFromEncodedValue(record.q32);
    const q36Destination = navigationDestinationFromEncodedValue(record.q36);
    const q24Destination = navigationDestinationFromEncodedValue(record.q24);
    const q20Destination = navigationDestinationFromEncodedValue(record.q20);
    if ((changedMask & 9) === 9 && record.q20 === 0 && record.q24 == null && q32Destination != null) return q32Destination;
    if ((changedMask & 25) === 25 && record.q20 === 0 && record.q24 == null && q32Destination != null) return q32Destination;
    if ((changedMask & 17) === 17 && record.q20 === 0 && record.q24 == null && record.q32 == null && q36Destination != null) return q36Destination;
    if (changedMask === 1 && q20Destination != null) return q20Destination;
    if ((changedMask & 1) && q20Destination != null && record.q20 !== 0) return q20Destination;
    if (record.q20 === 0 && q24Destination != null) return q24Destination;
    return q20Destination ?? NAVIGATION_DEFAULT_DESTINATION;
}

export function summarizeNavigationUnit(entity, typeId, record, trackedState = null) {
    if (typeId !== NAVIGATION_UNIT_TYPE_ID || !record) return null;
    const destination = trackedState?.destination ?? navigationDestinationFromRecord(record);
    return {
        entity,
        destination,
        destinationName: navigationDestinationName(destination),
        autoWarpOnShieldFailure: trackedState?.shieldFailure ?? null,
        autoWarpOnNoCaptains: trackedState?.noCaptains ?? null,
        state: cloneRecord(record)
    };
}

export function summarizeCommsStation(entity, typeId, record, occupied = false) {
    if (typeId !== COMMS_STATION_TYPE_ID) return null;
    const charges = record?.q20 ?? null;
    return {
        entity,
        typeId,
        typeName: entityNameFromType(typeId),
        charges,
        maxCharges: COMMS_STATION_MAX_CHARGES,
        chargeRatio: typeof charges === "number" ? charges / COMMS_STATION_MAX_CHARGES : null,
        occupied: Boolean(occupied),
        state: record ? cloneRecord(record) : {}
    };
}

export function summarizeHealth(entity, record) {
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

export function summarizeBot(entity, {
    health,
    table2Record,
    smallRecord,
    combatRecord,
    motionRecord,
    table10Record,
    table51Record,
    itemCrate,
    player,
    shipControl
}) {
    if (!health || itemCrate || player || shipControl || isBoulderBotExclusion(health, table2Record, combatRecord)) return null;
    const className = botClassFromState({
        health,
        table2Record,
        smallRecord,
        combatRecord,
        table10Record,
        table51Record
    });
    return {
        entity,
        className,
        identifier: botIdentifierFromState({combatRecord, motionRecord, smallRecord}),
        typeA: health.state?.q28 ?? null,
        typeB: health.state?.q32 ?? null
    };
}

export function isBoulderBotExclusion(health, table2Record, combatRecord) {
    return Boolean(
        health?.maxHp === 2000 &&
        health?.state?.q28 === 30 &&
        health?.state?.q32 != null &&
        table2Record?.q20 != null &&
        table2Record?.q24 == null &&
        !combatRecord
    );
}

export function botClassFromState({health, table2Record, smallRecord, combatRecord, table10Record, table51Record}) {
    if (isYellowMineGuardBotState({health, smallRecord, combatRecord, table2Record})) return "yellow-mine-guard";
    if (isShieldHelperBotState({health, table2Record})) return "shield-helper";
    if (isShieldMasterBotState({health, table2Record})) return "shield-master";
    if (isLazerEnthusiastBotState({health, table2Record, table10Record, table51Record})) return "lazer-enthusiast";
    if (isCowardBossState({health})) return "the-coward";
    if (isOrangeFoolBotState({combatRecord})) return "orange-fool";
    if (isZombieBossBotState({health, table2Record, combatRecord})) return "zombie-boss";
    if (combatRecord?.q20 === 762523904) return "zombie";
    if (combatRecord?.q20 === 1967883008) return "zombie-hunter";
    if (combatRecord?.q20 === 945371904) return "zombie-tank";
    if (isRedSentryBotState({health, table2Record, combatRecord})) return "red-sentry";
    if (isRedSniperBotState({health, table2Record})) return "red-sniper";
    if (isBlueRusherBotState({health, table2Record, combatRecord})) return "blue-rusher";
    if (isYellowHunterBotState({health, table2Record, combatRecord})) return "yellow-hunter";
    if (isAquaShielderBotState({health, table2Record, combatRecord})) return "aqua-shielder";
    if (table2Record) return "table2-bot";
    if (combatRecord) return "combat-bot";
    return "bot";
}

export function isCowardBossState({health}) {
    return health?.state?.q28 === 70 && health?.state?.q32 === 78;
}

export function isOrangeFoolBotState({combatRecord}) {
    return combatRecord?.q20 === -427551232 && combatRecord?.q24 === 1 && combatRecord?.q72 === 3;
}

export function isZombieBossBotState({health, table2Record, combatRecord}) {
    return (
        combatRecord?.q20 === -430233088 &&
        health?.state?.q28 === 30 &&
        health?.state?.q32 === 166 &&
        table2Record?.q20 === 320 &&
        table2Record?.q24 === -900
    );
}

export function isRedSentryBotState({health, table2Record, combatRecord}) {
    return (
        combatRecord?.q20 === 508251904 && combatRecord?.q72 === 2 ||
        health?.state?.q28 === 70 && health?.state?.q32 === 166 && table2Record?.q20 === 320 && table2Record?.q24 === -900
    );
}

export function isBlueRusherBotState({health, table2Record, combatRecord}) {
    return (
        combatRecord?.q20 === 1113052928 && combatRecord?.q72 === 2 ||
        health?.state?.q28 === 30 && health?.state?.q32 === 34 && table2Record?.q20 === 80 && table2Record?.q24 === -900
    );
}

export function isRedSniperBotState({health, table2Record}) {
    return health?.state?.q28 === 35 && health?.state?.q32 === 89 && table2Record?.q20 === 180 && table2Record?.q24 === -900;
}

export function isYellowHunterBotState({health, table2Record, combatRecord}) {
    return (
        combatRecord?.q20 === -775665152 && combatRecord?.q72 === 4 && combatRecord?.q44 === -944515328 ||
        health?.state?.q28 === 30 && health?.state?.q32 === 56 && table2Record?.q20 === 120 && table2Record?.q24 === -900
    );
}

export function isAquaShielderBotState({health, table2Record, combatRecord}) {
    return (
        combatRecord?.q20 === 13697024 && combatRecord?.q24 === 1 ||
        health?.state?.q28 === 50 && health?.state?.q32 === 122 && table2Record?.q20 === 240 && table2Record?.q24 === -900
    );
}

export function isLazerEnthusiastBotState({health, table2Record, table10Record, table51Record}) {
    return (
        health?.state?.q28 === 140 &&
        health?.state?.q32 === 155 &&
        table2Record?.q20 === 300 &&
        table2Record?.q24 === -900 &&
        Boolean(table10Record) &&
        Boolean(table51Record)
    );
}

export function isYellowMineGuardBotState({health, smallRecord, combatRecord, table2Record}) {
    return (
        health?.state?.q28 === 30 &&
        health?.state?.q32 === 33 &&
        smallRecord?.q20 === 78 &&
        smallRecord?.q24 === 78 &&
        combatRecord?.q24 === -995542016 &&
        !table2Record
    );
}

export function isShieldHelperBotState({health, table2Record}) {
    return health?.state?.q28 === 30 && health?.state?.q32 === 33 && health?.maxHp === 1000 && !table2Record;
}

export function isShieldMasterBotState({health, table2Record}) {
    return health?.state?.q28 === 190 && health?.state?.q32 === 210 && health?.maxHp === 15000 && Boolean(table2Record);
}

export function botIdentifierFromState({combatRecord, motionRecord, smallRecord}) {
    if (combatRecord) return `t18:${combatRecord.q20 ?? "-"}:${combatRecord.q24 ?? "-"}:${combatRecord.q72 ?? "-"}`;
    if (motionRecord) return `t19:${motionRecord.q20 ?? "-"}:${motionRecord.q24 ?? "-"}`;
    if (smallRecord) return `t3:${smallRecord.q20 ?? "-"}:${smallRecord.q24 ?? "-"}`;
    return "-";
}

export function summarizeShieldGenerator(entity, shieldRecord = null, itemHolderRecord = null, boostRecord = null) {
    const charge = shieldRecord?.q20 ?? 0;
    const maxCharge = 5000;
    const efficiencyPercent = shieldRecord?.q24 ?? null;
    const storedItem = itemSummary(itemHolderRecord?.q20 ?? null, itemHolderRecord?.q24 ?? null);
    const boostState = boostRecord?.q24 ?? 0;
    const boostTimer = boostRecord?.q28 ?? 0;
    const puzzleSeed = boostRecord?.q20 ?? null;
    const summary = {
        entity,
        charge,
        maxCharge,
        chargeRatio: typeof charge === "number" ? charge / maxCharge : null,
        efficiencyPercent,
        efficiency: typeof efficiencyPercent === "number" ? efficiencyPercent / 100 : null,
        storedItemId: storedItem.itemId,
        storedItemName: storedItem.itemName,
        storedItemCount: storedItem.count,
        hasShieldCore: storedItem.itemId === 123,
        boostState,
        boostStateName: enumValueName(SHIELD_GENERATOR_BOOST_STATE_NAMES, boostState),
        boostTimer,
        boostActive: boostState !== 0 || boostTimer > 0,
        puzzleSeed,
        // Replaced in place below by a lazy accessor; declared here so the key keeps
        // its original position in the object.
        puzzleSolution: null,
        state: cloneRecord(shieldRecord || {}),
        itemState: cloneRecord(itemHolderRecord || {}),
        boostStateRaw: cloneRecord(boostRecord || {})
    };
    // Solving the maze costs ~190us and was by far the most expensive step of a
    // model rebuild, run for every shield generator whether or not the caller
    // ever looks at the solution. Defer it to first read.
    return defineLazyProperty(summary, "puzzleSolution", () => maybeSolveGeneratorMazeSeed(puzzleSeed));
}

export function summarizeShipControl(entity, record) {
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

export function summarizeShipSize(entity, record) {
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

export function summarizeShipWorldMetadata(lockdownRecord, shipRecord) {
    if (!lockdownRecord && !shipRecord) return null;
    const color = shipRecord?.q24 == null ? null : Number(shipRecord.q24);
    const lockdownCountdownSeconds = typeof lockdownRecord?.q20 === "number" ? lockdownRecord.q20 : null;
    const onlineShipOwnerCount = typeof lockdownRecord?.q24 === "number" ? lockdownRecord.q24 : null;
    const requiredShipOwnerCount = typeof lockdownRecord?.q28 === "number" ? lockdownRecord.q28 : null;
    return {
        name: decodeText(shipRecord?.blob20),
        color: Number.isFinite(color) ? color : null,
        colorCss: Number.isFinite(color) ? colorToCss(color) : null,
        width: typeof shipRecord?.q32 === "number" ? shipRecord.q32 : null,
        height: typeof shipRecord?.q36 === "number" ? shipRecord.q36 : null,
        lockdownTimerSeconds: lockdownCountdownSeconds,
        lockdownCountdownSeconds,
        onlineShipOwnerCount,
        requiredShipOwnerCount,
        allShipOwnersOnline: onlineShipOwnerCount == null || requiredShipOwnerCount == null ? null : onlineShipOwnerCount >= requiredShipOwnerCount,
        lockdownEngaged: lockdownCountdownSeconds == null ? null : lockdownCountdownSeconds > 0,
        lockdownState: cloneRecord(lockdownRecord || {}),
        shipState: cloneRecord(shipRecord || {})
    };
}

export function summarizeItemCrate(entity, sizeRecord, itemRecord = null, healthRecord = null) {
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

export function scaledSizeSummary(record) {
    if (!record) return null;
    const rawWidth = record.q20 ?? null;
    const rawHeight = record.q24 ?? null;
    return {
        width: rawWidth == null ? null : rawWidth / 10,
        height: rawHeight == null ? null : rawHeight / 10,
        rawWidth,
        rawHeight,
        state: cloneRecord(record)
    };
}

export function summarizeExpandoBox(entity, itemHolderRecord, sizeRecord) {
    if (!itemHolderRecord && !sizeRecord) return null;
    const size = scaledSizeSummary(sizeRecord);
    return {
        entity,
        ...itemSummary(itemHolderRecord?.q20 ?? null, itemHolderRecord?.q24 ?? null),
        width: size?.width ?? null,
        height: size?.height ?? null,
        rawWidth: size?.rawWidth ?? null,
        rawHeight: size?.rawHeight ?? null,
        itemState: cloneRecord(itemHolderRecord || {}),
        sizeState: cloneRecord(sizeRecord || {})
    };
}

export function summarizeHoverOutline(entity, record) {
    const size = scaledSizeSummary(record);
    if (!size) return null;
    return {entity, ...size};
}

export function summarizeMapMarker(entity, labelRecord, zoneRecord = null, sizeRecord = null) {
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

export function summarizeDockingSpring(entity, springRecord, bodyRecord = null, sizeRecord = null) {
    if (!springRecord || bodyRecord?.q32 !== -1 || sizeRecord?.q20 !== 160 || sizeRecord?.q24 !== 160) return null;
    return {
        entity,
        id: springRecord.q20 ?? null,
        width: sizeRecord.q20,
        height: sizeRecord.q24,
        state: cloneRecord(springRecord)
    };
}

export function summarizeHugeThruster(entity, markerRecord, sizeRecord = null) {
    if (!markerRecord || sizeRecord?.q20 !== 320 || sizeRecord?.q24 !== 160) return null;
    return {
        entity,
        width: sizeRecord.q20,
        height: sizeRecord.q24,
        state: cloneRecord(markerRecord)
    };
}

export function summarizeLoader(entity, loaderRecord, loaderFilterRecord = null, filterSlotsRecord = null, tracker = null, includeDefaults = false, itemHolderRecord = null) {
    if (!loaderRecord && !loaderFilterRecord && !includeDefaults) return null;
    const config = tracker?.getConfig(null, entity, loaderRecord, loaderFilterRecord, filterSlotsRecord) ?? {};
    const hasLoaderState = Boolean(loaderRecord);
    const hasPositionConfig = Boolean(tracker?.hasPositionConfig(null, entity));
    const pick = hasLoaderState && hasPositionConfig ? config.pick ?? null : null;
    const place = hasLoaderState && hasPositionConfig ? config.place ?? null : null;
    const priority = config.priority ?? 0;
    const filterMode = config.filterMode ?? null;
    const heldItem = itemSummary(itemHolderRecord?.q20, itemHolderRecord?.q24 ?? null);
    return {
        entity,
        pick,
        pickName: enumValueName(LOADER_POSITION_NAMES, pick),
        place,
        placeName: enumValueName(LOADER_POSITION_NAMES, place),
        priority,
        priorityName: enumValueName(LOADER_PRIORITY_NAMES, priority),
        requireOutput: config.requireOutput ?? false,
        waitForStack: config.waitForStack ?? false,
        stack: config.stack ?? 16,
        cycle: Math.max(1, config.cycle ?? 1),
        filterMode,
        filterModeName: enumValueName(LOADER_FILTER_MODE_NAMES, filterMode),
        filterSlots: config.filterSlots ?? null,
        heldItemId: heldItem.itemId,
        heldItemName: heldItem.itemName,
        heldCount: heldItem.count,
        active: heldItem.itemId != null,
        progress: null,
        state: cloneRecord(loaderRecord || {}),
        filterState: cloneRecord(loaderFilterRecord || {}),
        filterSlotsState: cloneRecord(filterSlotsRecord || {})
    };
}

export function summarizeCargoHatch(entity, typeId, filterRecord = null, filterSlotsRecord = null, animationRecord = null) {
    if (!CARGO_HATCH_TYPE_IDS.has(typeId)) return null;
    const filterMode = filterRecord?.q20 ?? 0;
    return {
        entity,
        typeId,
        typeName: entityNameFromType(typeId),
        filterMode,
        filterModeName: enumValueName(LOADER_FILTER_MODE_NAMES, filterMode),
        filterSlots: filterSlotsRecord ? [filterSlotsRecord.q20 ?? null, filterSlotsRecord.q24 ?? null, filterSlotsRecord.q28 ?? null] : null,
        openFraction: animationRecord?.q20 == null ? null : boundedProgress(animationRecord.q20) / 100,
        filterState: cloneRecord(filterRecord || {}),
        filterSlotsState: cloneRecord(filterSlotsRecord || {})
    };
}

export function summarizePusher(entity, pusherRecord, filterSlotsRecord = null) {
    if (!pusherRecord) return null;
    const mode = pusherRecord.q20 == null ? 2 : pusherRecord.q20 + 2;
    const filteredMode = pusherRecord.q24 ?? 0;
    return {
        entity,
        mode,
        modeName: enumValueName(PUSHER_MODE_NAMES, mode),
        filteredMode,
        filteredModeName: enumValueName(PUSHER_MODE_NAMES, filteredMode),
        angle: numberOrNull(pusherRecord.q28, 10),
        speed: pusherRecord.q32 == null ? 20 : (pusherRecord.q32 / 100) + 20,
        length: pusherRecord.q40 == null ? 1000 : ((pusherRecord.q40 + 50) / 10) + 995,
        filterInventory: pusherRecord.q36 === 1,
        filterSlots: filterSlotsRecord ? [filterSlotsRecord.q20 ?? null, filterSlotsRecord.q24 ?? null, filterSlotsRecord.q28 ?? null] : null,
        state: cloneRecord(pusherRecord),
        filterSlotsState: cloneRecord(filterSlotsRecord || {})
    };
}

export function summarizePusherBeam(entity, beamRecord) {
    if (!beamRecord) return null;
    const lengthRaw = beamRecord.q20 ?? 0;
    const mode = beamRecord.q24 ?? 2;
    return {
        entity,
        active: mode !== 2,
        mode,
        modeName: enumValueName(PUSHER_MODE_NAMES, mode),
        lengthRaw,
        length: lengthRaw / 10,
        state: cloneRecord(beamRecord)
    };
}

export function normalizeDegrees(value) {
    if (!Number.isFinite(Number(value))) return null;
    return ((Number(value) % 360) + 360) % 360;
}

export function summarizeItemLauncher(entity, typeId, launcherRecord) {
    if (typeId !== ITEM_LAUNCHER_TYPE_ID || !launcherRecord) return null;
    const angleRadians = numberOrNull(launcherRecord.q32 ?? 0, 200);
    return {
        entity,
        angleRaw: launcherRecord.q32 ?? null,
        angleRadians,
        angleDegrees: angleRadians == null ? null : normalizeDegrees((angleRadians * 180) / Math.PI),
        state: cloneRecord(launcherRecord)
    };
}

export function summarizeSign(entity, signRecord) {
    if (!signRecord) return null;
    const displayMode = signRecord.q20 ?? 0;
    return {
        entity,
        text: decodeText(signRecord.blob24) ?? "",
        displayMode,
        displayModeName: enumValueName(SIGN_DISPLAY_MODE_NAMES, displayMode),
        state: cloneRecord(signRecord)
    };
}

export function summarizeShieldProjector(entity, projectorRecord) {
    return {
        entity,
        active: projectorRecord?.q21 !== 0,
        state: cloneRecord(projectorRecord || {})
    };
}

export function summarizeSpawnPoint(entity, spawnRecord) {
    const rank = Number.isFinite(Number(spawnRecord?.q20)) ? Number(spawnRecord.q20) : 0;
    return {
        entity,
        rank,
        rankName: enumValueName(TEAM_RANK_NAMES, rank),
        state: cloneRecord(spawnRecord || {})
    };
}

export function summarizeDoor(entity, rankRecord, doorRecord) {
    const rank = Number.isFinite(Number(rankRecord?.q20)) ? Number(rankRecord.q20) : 0;
    return {
        entity,
        rank,
        rankName: enumValueName(TEAM_RANK_NAMES, rank),
        open: doorRecord?.q21 === 1,
        rankState: cloneRecord(rankRecord || {}),
        state: cloneRecord(doorRecord || {})
    };
}

export function enumValueName(map, value) {
    return value == null ? null : map.get(value) ?? null;
}

export function colorToCss(color) {
    return `rgb(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff})`;
}

export function previewActionName(color) {
    if (color === 0x00ff00) return "place";
    if (color === 0xff0000) return "break";
    if (color === 0x0000ff) return "blueprint";
    return null;
}

export function bitOffsets(value) {
    if (!Number.isSafeInteger(value) || value < 1) return [];
    let bits = BigInt(value);
    const offsets = [];
    let offset = 0;
    while (bits > 0n && offset < 64) {
        if (bits & 1n) offsets.push(offset);
        bits >>= 1n;
        offset++;
    }
    return offsets;
}

export function summarizeBlueprintPreview(entity, record, transformRecord = null) {
    if (!record || record.q20 == null) return null;
    const rawBits = Number.isSafeInteger(Number(record.q24)) ? Number(record.q24) : null;
    const bits = rawBits == null ? 1 : rawBits + 1;
    const placementOffsets = bitOffsets(bits);
    const transform = transformRecord ? {
        entity,
        x: numberOrNull(transformRecord.q20, 40),
        y: numberOrNull(transformRecord.q24, 40),
        rot: numberOrNull(transformRecord.q28, 127.324)
    } : null;
    return {
        entity,
        itemId: record.q20,
        itemName: entityNameFromType(record.q20),
        bits,
        rawBits,
        placementOffsets,
        placementCount: placementOffsets.length,
        placements: placementOffsets.map((offset) => ({
            offset,
            x: transform?.x == null ? null : transform.x + offset,
            y: transform?.y ?? null,
            itemId: record.q20,
            itemName: entityNameFromType(record.q20)
        })),
        x: transform?.x ?? null,
        y: transform?.y ?? null,
        rot: transform?.rot ?? null,
        state: cloneRecord(record)
    };
}

export function summarizePlayerPreview(entity, record, blueprintItems = []) {
    if (!record) return null;
    const color = record.q40 == null ? null : Number(record.q40);
    const active = typeof record.q36 === "number" && record.q36 !== 0;
    if (!active && record.q36 == null) return null;
    const actionName = Number.isFinite(color) ? previewActionName(color) : null;
    return {
        entity,
        active,
        x: numberOrNull(record.q20, 10),
        y: numberOrNull(record.q24, 10),
        width: numberOrNull(record.q28, 10),
        height: numberOrNull(record.q32, 10),
        progress: record.q36 ?? null,
        color: Number.isFinite(color) ? color : null,
        colorCss: Number.isFinite(color) ? colorToCss(color) : null,
        actionName,
        blueprintId: record.q44 ?? null,
        blueprintItems: actionName === "blueprint" ? blueprintItems : [],
        state: cloneRecord(record)
    };
}

export function summarizePlayer(entity, record, previewRecord = null, blueprintItems = []) {
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
        shipRank: PLAYER_SHIP_RANKS.get(teamRank) || null,
        patronTier: patronTierName(gameRank),
        isDeveloper: gameRank === 1,
        isPatron: gameRank >= 2 && gameRank <= 6,
        piloting: Boolean(record.q107),
        muted: Boolean(record.q112),
        actionPreview: summarizePlayerPreview(entity, previewRecord, blueprintItems),
        state: cloneRecord(record)
    };
}

export function patronTierName(gameRank) {
    switch (gameRank) {
        case 2:
            return "bronze";
        case 3:
            return "silver";
        case 4:
            return "gold";
        case 5:
            return "plat";
        case 6:
            return "flux";
        default:
            return null;
    }
}

// Called once per entity with a fixed set of named components. Taking (key,
// value) pairs avoids allocating ~32 single-key object literals per entity and
// an Object.entries pair array for each of them.
export function mergeContents(components) {
    const out = {};
    let any = false;
    for (const key in components) {
        const value = components[key];
        if (value == null) continue;
        out[key] = value;
        any = true;
    }
    return any ? out : null;
}

// A hover outline is a highlight rectangle, not a physical footprint. Overworld
// boundary entities report outlines as large as 720x32, and indexing those cell
// by cell produced ~106k block cells for 183 entities -- the dominant cost in
// every derived read. Outlines beyond this budget fall through to the ordinary
// marker/crate/type heuristics.
export const MAX_HOVER_OUTLINE_FOOTPRINT_CELLS = 1024;

export function entityFootprint(entity) {
    if (entity?.hoverOutline && Number.isFinite(Number(entity.hoverOutline.width)) && Number.isFinite(Number(entity.hoverOutline.height))) {
        const width = Math.ceil(Number(entity.hoverOutline.width));
        const height = Math.ceil(Number(entity.hoverOutline.height));
        if (width * height <= MAX_HOVER_OUTLINE_FOOTPRINT_CELLS) {
            return {width, height, source: "hover_outline"};
        }
    }
    if (entity?.markerTypeId != null && ENTITY_FOOTPRINTS.has(entity.markerTypeId)) {
        const footprint = ENTITY_FOOTPRINTS.get(entity.markerTypeId);
        return {...footprint, source: "marker"};
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
        return {...footprint, source: "type"};
    }
    if (entity?.fabricator || entity?.shieldGenerator) return {width: 2, height: 2, source: "heuristic"};
    return {width: 1, height: 1, source: "default"};
}

export function entityLabel(entity) {
    if (entity?.category === "metadata" && entity?.typeName) return `Metadata ${entity.typeName}`;
    if (entity?.blueprintPreview) return `Blueprint Preview (${entity.blueprintPreview.itemName ?? entity.blueprintPreview.itemId ?? "item"})`;
    if (entity?.category === "loose_item" && entity?.itemHolder?.itemName) return `Loose ${entity.itemHolder.itemName}`;
    if (entity?.category === "untyped_holder" && entity?.itemHolder?.itemName) return `Untyped Holder (${entity.itemHolder.itemName})`;
    if (entity?.mapMarker) return `Map Marker (${entity.mapMarker.title ?? entity.mapMarker.key ?? entity.mapMarker.kind ?? "marker"})`;
    if (entity?.dockingSpring) return "Docking Spring";
    if (entity?.hugeThruster) return "Huge Thruster";
    if (entity?.shipControl && entity?.isOverworld) return "Overworld Ship";
    if (entity?.expandoBox) return "Expando Box";
    if (entity?.markerTypeName) return entity.markerTypeName;
    if (entity?.typeName) return entity.typeName;
    if (entity?.fabricator) return "Fabricator";
    if (entity?.itemCrate) return "Item Crate";
    if (entity?.shieldGenerator) return "Shield Generator";
    if (entity?.fluidTank) return "Fluid Tank";
    if (entity?.cannon) return "Cannon";
    if (entity?.pusher) return "Pusher";
    if (entity?.pusherBeam) return "Pusher Beam";
    if (entity?.launcher) return "Item Launcher";
    if (entity?.loader) return "Loader";
    if (entity?.cargoHatch) return entity.cargoHatch.typeName || "Cargo Hatch";
    if (entity?.cargoEjector) return entity.cargoEjector.typeName || "Cargo Ejector";
    if (entity?.itemHolder && !entity?.cargoEjector && !entity?.cannon && !entity?.pusher && !entity?.launcher && !entity?.loader && !entity?.fluidTank && !entity?.shieldGenerator && !entity?.shieldProjector) {
        return entity.itemHolder.itemName || "Item Holder";
    }
    if (entity?.player) return "Player";
    if (entity?.shipControl) return "Ship Control";
    return entity?.typeId != null ? `Entity ${entity.typeId}` : "Entity";
}

export function entityCategory(entity) {
    if (entity?.player) return "player";
    if (entity?.blueprintPreview) return "blueprint_preview";
    if (entity?.shipControl) return "ship_control";
    if (entity?.itemCrate) return "item_crate";
    if (entity?.mapMarker) return "map_marker";
    if (entity?.dockingSpring) return "docking_spring";
    if (entity?.hugeThruster) return "huge_thruster";
    const hasMachineComponent = Boolean(entity?.fabricator || entity?.cargoEjector || entity?.cannon || entity?.pusher || entity?.launcher || entity?.loader || entity?.cargoHatch || entity?.commsStation || entity?.fluidTank || entity?.shieldGenerator || entity?.shieldProjector);
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
    if (entity?.itemHolder?.itemId != null && !entity?.cargoEjector && !entity?.cannon && !entity?.pusher && !entity?.launcher && !entity?.loader && !entity?.cargoHatch && !entity?.commsStation && !entity?.fluidTank && !entity?.shieldGenerator && !entity?.shieldProjector) {
        if (entity.typeId != null && (!PLACED_ENTITY_TYPE_IDS.has(Number(entity.typeId)) || entity.typeId === entity.itemHolder.itemId)) return "loose_item";
        if (entity.typeId == null) return "untyped_holder";
    }
    if (entity?.fabricator || entity?.cannon || entity?.pusher || entity?.launcher || entity?.loader || entity?.cargoHatch || entity?.cargoEjector || entity?.commsStation || entity?.fluidTank || entity?.shieldGenerator || entity?.shieldProjector) return "placed_entity";
    if (entity?.typeId != null && PLACED_ENTITY_TYPE_IDS.has(Number(entity.typeId))) return "placed_entity";
    if (entity?.typeId != null && !hasPhysicalComponent) return "metadata";
    if (entity?.itemHolder?.itemId != null && !entity?.cargoEjector && !entity?.cannon && !entity?.pusher && !entity?.launcher && !entity?.loader && !entity?.cargoHatch && !entity?.commsStation && !entity?.fluidTank && !entity?.shieldGenerator && !entity?.shieldProjector) return "untyped_holder";
    return "entity";
}

// Block coordinates are packed into a single number so the block index avoids a
// template-string key per occupied cell. Covers the coordinate range in use.
export const BLOCK_KEY_OFFSET = 1 << 24;
export const BLOCK_KEY_STRIDE = 1 << 25;

export function blockKey(x, y) {
    return ((y + BLOCK_KEY_OFFSET) * BLOCK_KEY_STRIDE) + (x + BLOCK_KEY_OFFSET);
}

// Returned by ModelState.table() for absent tables. Never mutated.
export const EMPTY_TABLE = new Map();

// snapshot() only ever exposed the last 50 removals and last 10 errors, but both
// arrays grew without bound behind that. Retain a little more than is surfaced.
export const MAX_RETAINED_REMOVALS = 500;
export const MAX_RETAINED_ERRORS = 100;

export function pushCapped(target, value, limit) {
    target.push(value);
    if (target.length > limit) target.splice(0, target.length - limit);
}

