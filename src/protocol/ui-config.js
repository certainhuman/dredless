import {encoder} from "../constants.js";

const NAV_UNIT_COMMAND = "config_nav_unit";
const GENERATOR_MAZE_PUZZLE_COMMAND = "maze_puzzle";
const CLIPBOARD_ANGLE_COMMAND = "angle";
const CLIPBOARD_FIXED_ANGLE_COMMAND = "angle_fixed";
const LOADER_CONFIG_COMMAND = "config_loader";
const LOADER_FILTER_CONFIG_COMMAND = "filter_config";
const LOADER_FILTER_ITEMS_COMMAND = "filter_items";
const PUSHER_CONFIG_COMMAND = "config_pusher";
const PUSHER_FILTER_ITEMS_COMMAND = "filter_items";
const NAV_UNIT_STRING_TAG = 0x8a;
const NAV_UNIT_HEADER_TAG = 0x90;
const NAV_UNIT_TRUE = 0x8e;
const NAV_UNIT_FALSE = 0x8d;
const NAV_UNIT_TRAILER = [0x91, 0x91];
const PUSHER_FILTER_INVENTORY_ON = 0x8d;
const PUSHER_FILTER_INVENTORY_OFF = 0x8e;
const LOADER_TRUE = 0x8d;
const LOADER_FALSE = 0x8e;
const UI_COMMAND_END = 0x91;
const CLIPBOARD_ACTION = 1;

function requireByteInteger(value, name) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 255) {
        throw new RangeError(`${name} must be an integer between 0 and 255`);
    }
    return number;
}

function requireUint16(value, name) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 0xffff) {
        throw new RangeError(`${name} must be an integer between 0 and 65535`);
    }
    return number;
}

function navConfigBool(value) {
    return value ? NAV_UNIT_TRUE : NAV_UNIT_FALSE;
}

function navWarpByte(value) {
    if (value === true || value === "start") return NAV_UNIT_FALSE;
    if (value === false || value == null || value === "idle" || value === "cancel") return NAV_UNIT_TRUE;
    throw new TypeError(`warp must be true, false, "start", "idle", or "cancel"`);
}

function requirePusherMode(value, name) {
    const number = typeof value === "string" ? PUSHER_MODE_VALUES.get(value) : Number(value);
    if (number == null || !Number.isInteger(number) || number < 0 || number > 2) {
        throw new RangeError(`${name} must be 0, 1, 2, "push", "pull", or "do-nothing"`);
    }
    return number;
}

function requireLoaderPosition(value, name) {
    const number = typeof value === "string" ? LOADER_POSITION_VALUES.get(value) : Number(value);
    if (number == null || !Number.isInteger(number) || number < 0 || number > 7) {
        throw new RangeError(`${name} must be a loader position 0..7 or position name`);
    }
    return number;
}

function requireLoaderPriority(value, name) {
    const number = typeof value === "string" ? LOADER_PRIORITY_VALUES.get(value) : Number(value);
    if (number == null || !Number.isInteger(number) || number < -1 || number > 1) {
        throw new RangeError(`${name} must be -1, 0, 1, "low", "normal", or "high"`);
    }
    return number + 1;
}

function requireLoaderFilterMode(value, name) {
    const number = typeof value === "string" ? LOADER_FILTER_MODE_VALUES.get(value) : Number(value);
    if (number == null || !Number.isInteger(number) || number < 0 || number > 3) {
        throw new RangeError(`${name} must be 0..3 or a loader filter mode name`);
    }
    return number;
}

const CLIPBOARD_TARGET_VALUES = new Map([
    ["loader", 1],
    ["loader-config", 1],
    ["loaderConfig", 1],
    ["hatch", 0],
    ["cargo-hatch", 0],
    ["cargoHatch", 0],
    ["ejector", 7],
    ["cargo-ejector", 7],
    ["cargoEjector", 7],
    ["expando", 3],
    ["expando-box", 3],
    ["expandoBox", 3],
    ["generator", 4],
    ["shield-generator", 4],
    ["shieldGenerator", 4],
    ["navigation", 6],
    ["navigation-unit", 6],
    ["navigationUnit", 6],
    ["nav", 6],
    ["nav-unit", 6],
    ["navUnit", 6]
]);

const FIXED_ANGLE_VALUES = new Map([
    ["right", 0],
    ["up", 1],
    ["left", 2],
    ["down", 3]
]);

function requireClipboardTarget(value, name = "target") {
    const number = typeof value === "string" ? CLIPBOARD_TARGET_VALUES.get(value) : Number(value);
    if (number == null || !Number.isInteger(number) || number < 0 || number > 255) {
        throw new RangeError(`${name} must be a clipboard target byte or known target name`);
    }
    return number;
}

function requireFixedAngle(value, name = "direction") {
    const number = typeof value === "string" ? FIXED_ANGLE_VALUES.get(value) : Number(value);
    if (number == null || !Number.isInteger(number) || number < 0 || number > 3) {
        throw new RangeError(`${name} must be 0..3 or "right", "up", "left", or "down"`);
    }
    return number;
}

function requireAngleDegrees(value, name = "angle") {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 359) {
        throw new RangeError(`${name} must be an integer degree value between 0 and 359`);
    }
    return number;
}

function requireFiniteNumber(value, name) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new RangeError(`${name} must be a finite number`);
    return number;
}

function requireNonNegativeInteger(value, name) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) throw new RangeError(`${name} must be a non-negative integer`);
    return number;
}

function encodeCompactNumber(value, name) {
    const number = requireFiniteNumber(value, name);
    if (!Number.isInteger(number)) {
        const out = new Uint8Array(5);
        out[0] = 0x88;
        new DataView(out.buffer).setFloat32(1, number, true);
        return [...out];
    }
    if (number < 0) throw new RangeError(`${name} must be non-negative`);
    if (number <= 0x1f) return [number];
    if (number <= 0x7f) return [0x84, number];
    if (number <= 0xffff) return [0x85, number & 0xff, (number >> 8) & 0xff];
    throw new RangeError(`${name} must be 65535 or lower`);
}

function encodeCompactItemId(value, name) {
    const number = requireNonNegativeInteger(value, name);
    if (number === 0) return [0];
    return encodeCompactNumber(number, name);
}

function encodeLoaderCycle(cycle) {
    const seconds = requireFiniteNumber(cycle, "cycle");
    if (seconds < 1) throw new RangeError(`cycle must be at least 1 second`);
    const ticks = Math.round(seconds * 20);
    if (ticks <= 0x3f) return [ticks];
    if (ticks <= 0xff) return [0x80, ticks];
    if (ticks <= 0xffff) return [0x85, ticks & 0xff, (ticks >> 8) & 0xff];
    throw new RangeError(`cycle is too large`);
}

function encodeUiCommandTarget(entity, action = 0) {
    const entityId = requireUint16(entity, "entity");
    const actionId = requireByteInteger(action, "action");
    if (actionId && entityId > 0xff) {
        throw new RangeError(`copy/paste UI config currently requires an entity id below 256`);
    }
    return [
        NAV_UNIT_HEADER_TAG,
        actionId ? actionId : (entityId >> 8) & 0xff,
        entityId & 0xff
    ];
}

function encodeUiCommandSection(commandName) {
    const command = encoder.encode(commandName);
    if (command.byteLength > 255) throw new RangeError(`command name is too long`);
    return [
        NAV_UNIT_STRING_TAG,
        command.byteLength,
        ...command,
        0x00
    ];
}

function encodeUiCommandHeader(entity, commandName) {
    return [
        ...encodeUiCommandTarget(entity),
        ...encodeUiCommandSection(commandName)
    ];
}

function encodeLoaderConfigPayload({
                                       pick = 0,
                                       place = 2,
                                       priority = 0,
                                       stack = 16,
                                       cycle = 1,
                                       requireOutput = false,
                                       waitForStack = false
                                   } = {}) {
    return [
        NAV_UNIT_HEADER_TAG,
        requireLoaderPosition(pick, "pick"),
        requireLoaderPosition(place, "place"),
        requireLoaderPriority(priority, "priority"),
        requireNonNegativeInteger(stack, "stack"),
        ...encodeLoaderCycle(cycle),
        requireOutput ? LOADER_TRUE : LOADER_FALSE,
        waitForStack ? LOADER_TRUE : LOADER_FALSE
    ];
}

function encodeLoaderFilterConfigPayload(filterMode = 0) {
    return [
        NAV_UNIT_HEADER_TAG,
        requireLoaderFilterMode(filterMode, "filterMode")
    ];
}

function encodeLoaderFilterItemsPayload(filterSlots = []) {
    const slots = [0, 1, 2].map((index) => requireNonNegativeInteger(filterSlots[index] ?? 0, `filterSlots[${index}]`));
    return [
        NAV_UNIT_HEADER_TAG,
        ...slots.flatMap((slot, index) => encodeCompactItemId(slot, `filterSlots[${index}]`))
    ];
}

export function buildNavigationUnitConfigData(entity, {
    destination,
    page = 0,
    warp = "idle",
    autoWarpOnShieldFailure = false,
    autoWarpOnNoCaptains = false
} = {}) {
    return Uint8Array.from([
        ...encodeUiCommandHeader(entity, NAV_UNIT_COMMAND),
        ...encodeNavigationUnitConfigPayload({destination, page, warp, autoWarpOnShieldFailure, autoWarpOnNoCaptains}),
        ...NAV_UNIT_TRAILER
    ]);
}

function encodeNavigationUnitConfigPayload({
                                               destination,
                                               page = 0,
                                               warp = "idle",
                                               autoWarpOnShieldFailure = false,
                                               autoWarpOnNoCaptains = false
                                           } = {}) {
    return [
        NAV_UNIT_HEADER_TAG,
        requireByteInteger(destination, "destination"),
        requireByteInteger(page, "page"),
        navWarpByte(warp),
        navConfigBool(autoWarpOnShieldFailure),
        navConfigBool(autoWarpOnNoCaptains)
    ];
}

export function buildGeneratorMazePuzzleData(entity, solution) {
    const value = String(solution);
    if (!/^\d+$/.test(value)) throw new TypeError(`solution must contain only digits`);
    const encoded = encoder.encode(value);
    if (encoded.byteLength > 255) throw new RangeError(`solution is too long`);

    return Uint8Array.from([
        ...encodeUiCommandHeader(entity, GENERATOR_MAZE_PUZZLE_COMMAND),
        NAV_UNIT_HEADER_TAG,
        NAV_UNIT_STRING_TAG,
        encoded.byteLength,
        ...encoded,
        NAV_UNIT_FALSE,
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildPusherConfigData(entity, {
    mode = 2,
    filteredMode = 0,
    angle = 0,
    speed = 20,
    filterInventory = false,
    length = 1000
} = {}) {
    return Uint8Array.from([
        ...encodeUiCommandHeader(entity, PUSHER_CONFIG_COMMAND),
        NAV_UNIT_HEADER_TAG,
        requirePusherMode(mode, "mode"),
        requirePusherMode(filteredMode, "filteredMode"),
        ...encodeCompactNumber(angle, "angle"),
        ...encodeCompactNumber(speed, "speed"),
        filterInventory ? PUSHER_FILTER_INVENTORY_ON : PUSHER_FILTER_INVENTORY_OFF,
        ...encodeCompactNumber(length, "length"),
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildPusherFilterItemsData(entity, filterSlots = []) {
    const slots = [0, 1, 2].map((index) => requireNonNegativeInteger(filterSlots[index] ?? 0, `filterSlots[${index}]`));
    return Uint8Array.from([
        ...encodeUiCommandHeader(entity, PUSHER_FILTER_ITEMS_COMMAND),
        NAV_UNIT_HEADER_TAG,
        ...slots.flatMap((slot, index) => encodeCompactItemId(slot, `filterSlots[${index}]`)),
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildLoaderConfigData(entity, {
    pick = 0,
    place = 2,
    priority = 0,
    stack = 16,
    cycle = 1,
    requireOutput = false,
    waitForStack = false
} = {}) {
    return Uint8Array.from([
        ...encodeUiCommandHeader(entity, LOADER_CONFIG_COMMAND),
        ...encodeLoaderConfigPayload({pick, place, priority, stack, cycle, requireOutput, waitForStack}),
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildLoaderFilterConfigData(entity, filterMode = 0) {
    return Uint8Array.from([
        ...encodeUiCommandHeader(entity, LOADER_FILTER_CONFIG_COMMAND),
        ...encodeLoaderFilterConfigPayload(filterMode),
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildLoaderFilterItemsData(entity, filterSlots = []) {
    return Uint8Array.from([
        ...encodeUiCommandHeader(entity, LOADER_FILTER_ITEMS_COMMAND),
        ...encodeLoaderFilterItemsPayload(filterSlots),
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildCargoHatchFilterConfigData(entity, filterMode = 0) {
    return buildLoaderFilterConfigData(entity, filterMode);
}

export function buildCargoHatchFilterItemsData(entity, filterSlots = []) {
    return buildLoaderFilterItemsData(entity, filterSlots);
}

function buildLoaderFullConfigPayload(entity, action, {
    filterMode = 0,
    filterSlots = [],
    ...config
} = {}) {
    return Uint8Array.from([
        ...encodeUiCommandTarget(entity, action),
        ...encodeUiCommandSection(LOADER_CONFIG_COMMAND),
        ...encodeLoaderConfigPayload(config),
        UI_COMMAND_END,
        ...encodeUiCommandSection(LOADER_FILTER_CONFIG_COMMAND),
        ...encodeLoaderFilterConfigPayload(filterMode),
        UI_COMMAND_END,
        ...encodeUiCommandSection(LOADER_FILTER_ITEMS_COMMAND),
        ...encodeLoaderFilterItemsPayload(filterSlots),
        UI_COMMAND_END,
        UI_COMMAND_END
    ]);
}

function buildFilterOnlyConfigPayload(entity, action, {
    filterMode = 0,
    filterSlots = []
} = {}) {
    return Uint8Array.from([
        ...encodeUiCommandTarget(entity, action),
        ...encodeUiCommandSection(LOADER_FILTER_CONFIG_COMMAND),
        ...encodeLoaderFilterConfigPayload(filterMode),
        UI_COMMAND_END,
        ...encodeUiCommandSection(LOADER_FILTER_ITEMS_COMMAND),
        ...encodeLoaderFilterItemsPayload(filterSlots),
        UI_COMMAND_END,
        UI_COMMAND_END
    ]);
}

export function buildLoaderFullConfigData(entity, config = {}) {
    return buildLoaderFullConfigPayload(entity, 2, config);
}

export function buildLoaderCopyConfigData(config = {}) {
    return buildLoaderFullConfigPayload(1, 1, config);
}

export function buildCargoHatchFullConfigData(entity, config = {}) {
    return buildFilterOnlyConfigPayload(entity, 2, config);
}

export function buildCargoHatchCopyConfigData(config = {}) {
    return buildFilterOnlyConfigPayload(0, 1, config);
}

export function buildLoaderClipboardConfigData(config = {}) {
    return Uint8Array.from([
        ...encodeUiCommandTarget(1, CLIPBOARD_ACTION),
        ...encodeUiCommandSection(LOADER_CONFIG_COMMAND),
        ...encodeLoaderConfigPayload(config),
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildNavigationUnitClipboardConfigData(config = {}) {
    return Uint8Array.from([
        ...encodeUiCommandTarget(6, CLIPBOARD_ACTION),
        ...encodeUiCommandSection(NAV_UNIT_COMMAND),
        ...encodeNavigationUnitConfigPayload(config),
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildNavigationUnitPasteConfigData(entity, config = {}) {
    return Uint8Array.from([
        ...encodeUiCommandTarget(entity, 2),
        ...encodeUiCommandSection(NAV_UNIT_COMMAND),
        ...encodeNavigationUnitConfigPayload(config),
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildClipboardConfigData(target, commandName, values = []) {
    if (typeof commandName !== "string" || !commandName) throw new TypeError(`commandName must be a non-empty string`);
    return Uint8Array.from([
        ...encodeUiCommandTarget(requireClipboardTarget(target), CLIPBOARD_ACTION),
        ...encodeUiCommandSection(commandName),
        NAV_UNIT_HEADER_TAG,
        ...values,
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildClipboardFixedAngleData(target, direction) {
    return buildClipboardConfigData(target, CLIPBOARD_FIXED_ANGLE_COMMAND, [requireFixedAngle(direction)]);
}

function buildFixedAngleConfigData(entity, action, direction) {
    return Uint8Array.from([
        ...encodeUiCommandTarget(entity, action),
        ...encodeUiCommandSection(CLIPBOARD_FIXED_ANGLE_COMMAND),
        NAV_UNIT_HEADER_TAG,
        requireFixedAngle(direction),
        ...NAV_UNIT_TRAILER
    ]);
}

export function buildGeneratorClipboardDirectionData(direction) {
    return buildClipboardFixedAngleData("generator", direction);
}

export function buildCargoEjectorDirectionData(entity, direction) {
    return buildFixedAngleConfigData(entity, 0, direction);
}

export function buildCargoEjectorPasteConfigData(entity, direction) {
    return buildFixedAngleConfigData(entity, 2, direction);
}

export function buildCargoEjectorCopyConfigData(direction) {
    return buildFixedAngleConfigData(7, CLIPBOARD_ACTION, direction);
}

export function buildCargoEjectorClipboardDirectionData(direction) {
    return buildClipboardFixedAngleData("ejector", direction);
}

export function buildExpandoClipboardAngleData(angle) {
    return buildClipboardConfigData("expando", CLIPBOARD_ANGLE_COMMAND, encodeCompactNumber(requireAngleDegrees(angle), "angle"));
}

export {
    CLIPBOARD_ACTION,
    CLIPBOARD_ANGLE_COMMAND,
    CLIPBOARD_FIXED_ANGLE_COMMAND,
    CLIPBOARD_TARGET_VALUES,
    FIXED_ANGLE_VALUES,
    GENERATOR_MAZE_PUZZLE_COMMAND,
    LOADER_CONFIG_COMMAND,
    LOADER_FALSE,
    LOADER_FILTER_CONFIG_COMMAND,
    LOADER_FILTER_ITEMS_COMMAND,
    LOADER_TRUE,
    NAV_UNIT_COMMAND,
    NAV_UNIT_FALSE,
    NAV_UNIT_TRUE,
    PUSHER_CONFIG_COMMAND,
    PUSHER_FILTER_ITEMS_COMMAND
};

const PUSHER_MODE_VALUES = new Map([
    ["push", 0],
    ["pull", 1],
    ["do-nothing", 2],
    ["doNothing", 2],
    ["none", 2]
]);

const LOADER_POSITION_VALUES = new Map([
    ["top-left", 0],
    ["topLeft", 0],
    ["top-middle", 1],
    ["topMiddle", 1],
    ["top-right", 2],
    ["topRight", 2],
    ["middle-left", 3],
    ["middleLeft", 3],
    ["center-left", 3],
    ["centerLeft", 3],
    ["middle-right", 4],
    ["middleRight", 4],
    ["center-right", 4],
    ["centerRight", 4],
    ["bottom-left", 5],
    ["bottomLeft", 5],
    ["bottom-middle", 6],
    ["bottomMiddle", 6],
    ["bottom-right", 7],
    ["bottomRight", 7]
]);

const LOADER_PRIORITY_VALUES = new Map([
    ["low", -1],
    ["normal", 0],
    ["medium", 0],
    ["high", 1]
]);

const LOADER_FILTER_MODE_VALUES = new Map([
    ["allow-all", 0],
    ["allowAll", 0],
    ["block-filter", 1],
    ["blockFilter", 1],
    ["allow-filter", 2],
    ["allowFilter", 2],
    ["block-all", 3],
    ["blockAll", 3]
]);
