export {Session, AnonSession} from "./network/session.js";
export {Connection} from "./network/connection.js";
export {DredlessClient, WrenchMode, TurretMode} from "./client/index.js";
export {WorldStore, WorldState} from "./state/world/index.js";
export {FabricatorType, ModelState, decodeModelData} from "./state/model/index.js";
export {generateGeneratorMaze, solveGeneratorMazeSeed, maybeSolveGeneratorMazeSeed} from "./state/generator-maze.js";
export {buildBlueprintPlacementMessage} from "./protocol/outbound/blueprint.js";
export {buildChatMessage} from "./protocol/outbound/chat.js";
export {decodeMsgpack, encodeMsgpack} from "./protocol/codec/msgpack.js";
export {
    buildCommsMessage,
    flattenRichText,
    normalizeCommsEvent
} from "./protocol/outbound/comms.js";
export {buildSignedCommandPacket} from "./protocol/outbound/commands.js";
export {
    buildEquipItemCommand,
    buildInventoryDragCommand,
    buildUnequipItemCommand,
    equipmentSlotName,
    normalizeEquipmentSlot,
    normalizeInventoryEvent,
    EquipmentSlot
} from "./protocol/outbound/inventory.js";
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
} from "./protocol/outbound/ship-management.js";
export {
    SignDisplayMode,
    buildSignTextMessage,
    normalizeSignDisplayMode,
    signDisplayModeName
} from "./protocol/outbound/sign.js";
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
    buildPusherFilterItemsData,
    PusherMode,
    LoaderPosition,
    LoaderFilterMode,
    FixedAngleDirection,
    LoaderPriority
} from "./protocol/outbound/ui-config.js";
export {decryptPayload} from "./crypto/chacha.js";
export {decompressLz4Frame} from "./compression/lz4.js";

import {AnonSession, createAnonSession, createAnonToken, createSession, Session} from "./network/session.js";
import {Connection} from "./network/connection.js";
import {DredlessClient} from "./client/index.js";
import {fetchGameVersion, fetchNoticeVersion, fetchServers} from "./network/servers.js";
import {fetchShipList, fetchShips} from "./network/ships.js";

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
