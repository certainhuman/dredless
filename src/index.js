export { Session, AnonSession } from "./net/session.js";
export { Connection } from "./game/connection.js";
export { DredlessClient } from "./client.js";
export { WorldStore, WorldState } from "./game/world.js";
export { ModelState, decodeModelData } from "./game/model.js";
export { generateGeneratorMaze, solveGeneratorMazeSeed, maybeSolveGeneratorMazeSeed } from "./game/generator-maze.js";
export { buildBlueprintPlacementMessage } from "./protocol/blueprint.js";
export { decodeMsgpack, encodeMsgpack } from "./protocol/msgpack.js";
export {
  buildCommsMessage,
  flattenRichText,
  normalizeCommsEvent
} from "./protocol/comms.js";
export { buildSignedCommandPacket } from "./protocol/commands.js";
export {
  buildEquipItemCommand,
  buildInventoryDragCommand,
  buildUnequipItemCommand,
  equipmentSlotName,
  normalizeEquipmentSlot,
  normalizeInventoryEvent
} from "./protocol/inventory.js";
export {
  buildInviteResetMessage,
  buildPlayerListMessage,
  buildShipManagementMessage,
  buildShipPrivacyMessage,
  buildStarterRecoveryMessage,
  normalizeCaptainSubrankEvent,
  normalizePlayerListEvent,
  normalizePrivacy,
  normalizeShipConfigEvent
} from "./protocol/ship-management.js";
export {
  buildSignTextMessage,
  normalizeSignDisplayMode,
  signDisplayModeName
} from "./protocol/sign.js";
export {
  buildCargoEjectorClipboardDirectionData,
  buildCargoEjectorCopyConfigData,
  buildCargoEjectorDirectionData,
  buildCargoEjectorPasteConfigData,
  buildCargoHatchCopyConfigData,
  buildCargoHatchFilterConfigData,
  buildCargoHatchFilterItemsData,
  buildCargoHatchFullConfigData,
  buildClipboardConfigData,
  buildClipboardFixedAngleData,
  buildExpandoClipboardAngleData,
  buildGeneratorClipboardDirectionData,
  buildGeneratorMazePuzzleData,
  buildLoaderClipboardConfigData,
  buildLoaderConfigData,
  buildLoaderCopyConfigData,
  buildLoaderFilterConfigData,
  buildLoaderFilterItemsData,
  buildLoaderFullConfigData,
  buildNavigationUnitClipboardConfigData,
  buildNavigationUnitConfigData,
  buildNavigationUnitPasteConfigData,
  buildPusherConfigData,
  buildPusherFilterItemsData
} from "./protocol/ui-config.js";
export { decryptPayload } from "./crypto/chacha.js";
export { decompressLz4Frame } from "./compression/lz4.js";

import { Session, AnonSession, createSession, createAnonSession, createAnonToken } from "./net/session.js";
import { Connection } from "./game/connection.js";
import { DredlessClient } from "./client.js";
import { fetchNoticeVersion, fetchGameVersion, fetchServers } from "./net/servers.js";
import { fetchShips, fetchShipList } from "./game/ships.js";

async function sessionOrAnon(session) {
  return session || createAnonSession();
}

async function join(server, ship = null, session = null) {
  return (await sessionOrAnon(session)).join(server, ship);
}

async function start(server, ship = null, session = null) {
  return (await sessionOrAnon(session)).start(server, ship);
}

async function newShip(server, name = "", color = "", session = null) {
  return (await sessionOrAnon(session)).newShip(server, name, color);
}

async function invite(server, code, session = null) {
  return (await sessionOrAnon(session)).invite(server, code);
}

async function startInvite(server, code, session = null) {
  return (await sessionOrAnon(session)).startInvite(server, code);
}

export const Dredless = {
  Session,
  AnonSession,
  Connection,
  DredlessClient,
  createSession,
  createAnonSession,
  createAnonToken,
  fetchNoticeVersion,
  fetchGameVersion,
  fetchServers,
  fetchShips,
  fetchShipList,
  join,
  start,
  newShip,
  invite,
  startInvite
};

export default Dredless;
