import { encoder } from "../constants.js";

const NAV_UNIT_COMMAND = "config_nav_unit";
const GENERATOR_MAZE_PUZZLE_COMMAND = "maze_puzzle";
const NAV_UNIT_STRING_TAG = 0x8a;
const NAV_UNIT_HEADER_TAG = 0x90;
const NAV_UNIT_TRUE = 0x8e;
const NAV_UNIT_FALSE = 0x8d;
const NAV_UNIT_TRAILER = [0x91, 0x91];

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

export {
  GENERATOR_MAZE_PUZZLE_COMMAND,
  NAV_UNIT_COMMAND,
  NAV_UNIT_FALSE,
  NAV_UNIT_TRUE
};
