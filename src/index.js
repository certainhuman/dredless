export {Session, AnonSession} from "./net/session.js";
export {Connection} from "./game/connection.js";
export {DredlessClient} from "./client.js";
export {WorldStore, WorldState} from "./game/world.js";
export {ModelState, decodeModelData} from "./game/model.js";
export {generateGeneratorMaze, solveGeneratorMazeSeed, maybeSolveGeneratorMazeSeed} from "./game/generator-maze.js";
export {buildBlueprintPlacementMessage} from "./protocol/blueprint.js";
export {decodeMsgpack, encodeMsgpack} from "./protocol/msgpack.js";
export {
    buildCommsMessage,
    flattenRichText,
    normalizeCommsEvent
} from "./protocol/comms.js";
export {buildSignedCommandPacket} from "./protocol/commands.js";
export {
    buildEquipItemCommand,
    buildInventoryDragCommand,
    buildUnequipItemCommand,
    equipmentSlotName,
    normalizeEquipmentSlot,
    normalizeInventoryEvent
} from "./protocol/inventory.js";
export {
    buildBanPlayerMessage,
    buildDemoteSelfMessage,
    buildInviteResetMessage,
    buildKickPlayerMessage,
    buildPlayerListMessage,
    buildShipManagementMessage,
    buildSetPlayerRankMessage,
    buildShipPrivacyMessage,
    buildStarterRecoveryMessage,
    normalizeCaptainSubrank,
    normalizeShipPlayerList,
    normalizePlayerRank,
    normalizePrivacy,
    normalizeShipConfig
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
export {decryptPayload} from "./crypto/chacha.js";
export {decompressLz4Frame} from "./compression/lz4.js";

import {AnonSession, createAnonSession, createAnonToken, createSession, Session} from "./net/session.js";
import {Connection} from "./game/connection.js";
import {DredlessClient} from "./client.js";
import {fetchGameVersion, fetchNoticeVersion, fetchServers} from "./net/servers.js";
import {fetchShipList, fetchShips} from "./game/ships.js";

async function sessionOrAnon(session) {
    return session || createAnonSession();
}

export async function joinShip(server, ship = null, session = null) {
    return (await sessionOrAnon(session)).joinShip(server, ship);
}

export async function startShip(server, ship = null, session = null) {
    return (await sessionOrAnon(session)).startShip(server, ship);
}

export async function startNewShip(server, name = "", color = "", session = null) {
    return (await sessionOrAnon(session)).startNewShip(server, name, color);
}

export async function joinInvite(server, code, session = null) {
    return (await sessionOrAnon(session)).joinInvite(server, code);
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
    joinShip,
    startShip,
    startNewShip,
    joinInvite
};

export default Dredless;
