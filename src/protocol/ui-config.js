import { encoder } from "../constants.js";

const NAV_UNIT_COMMAND = "config_nav_unit";
const GENERATOR_MAZE_PUZZLE_COMMAND = "maze_puzzle";
const PUSHER_CONFIG_COMMAND = "config_pusher";
const PUSHER_FILTER_ITEMS_COMMAND = "filter_items";
const NAV_UNIT_STRING_TAG = 0x8a;
const NAV_UNIT_HEADER_TAG = 0x90;
const NAV_UNIT_TRUE = 0x8e;
const NAV_UNIT_FALSE = 0x8d;
const NAV_UNIT_TRAILER = [0x91, 0x91];
const PUSHER_FILTER_INVENTORY_ON = 0x8d;
const PUSHER_FILTER_INVENTORY_OFF = 0x8e;

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
  if (number <= 0xff) return [0x84, number];
  if (number <= 0xffff) return [0x85, number & 0xff, (number >> 8) & 0xff];
  throw new RangeError(`${name} must be 65535 or lower`);
}

function encodeUiCommandHeader(entity, commandName) {
  const entityId = requireUint16(entity, "entity");
  const command = encoder.encode(commandName);
  if (command.byteLength > 255) throw new RangeError(`command name is too long`);
  return [
    NAV_UNIT_HEADER_TAG,
    (entityId >> 8) & 0xff,
    entityId & 0xff,
    NAV_UNIT_STRING_TAG,
    command.byteLength,
    ...command,
    0x00
  ];
}

export function buildNavigationUnitConfigData(entity, {
  destination,
  page = 0,
  warp = "idle",
  autoWarpOnShieldFailure = false,
  autoWarpOnNoCaptains = false
} = {}) {
  const destinationId = requireByteInteger(destination, "destination");
  const pageIndex = requireByteInteger(page, "page");

  return Uint8Array.from([
    ...encodeUiCommandHeader(entity, NAV_UNIT_COMMAND),
    NAV_UNIT_HEADER_TAG,
    destinationId,
    pageIndex,
    navWarpByte(warp),
    navConfigBool(autoWarpOnShieldFailure),
    navConfigBool(autoWarpOnNoCaptains),
    ...NAV_UNIT_TRAILER
  ]);
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
    ...slots.flatMap((slot, index) => encodeCompactNumber(slot, `filterSlots[${index}]`)),
    ...NAV_UNIT_TRAILER
  ]);
}

export {
  GENERATOR_MAZE_PUZZLE_COMMAND,
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
