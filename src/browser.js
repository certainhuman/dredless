export {Connection} from "./game/connection.js";
export {DredlessClient, WrenchMode, TurretMode} from "./client.js";
export {WorldStore, WorldState} from "./game/world.js";
export {ModelState, decodeModelData} from "./game/model.js";
export {generateGeneratorMaze, solveGeneratorMazeSeed, maybeSolveGeneratorMazeSeed} from "./game/generator-maze.js";
export {buildBlueprintPlacementMessage} from "./protocol/blueprint.js";
export {decodeMsgpack, encodeMsgpack} from "./protocol/msgpack.js";
export {buildCommsMessage, flattenRichText, normalizeCommsEvent} from "./protocol/comms.js";
export {buildSignedCommandPacket} from "./protocol/commands.js";
export {
    buildEquipItemCommand,
    buildInventoryDragCommand,
    buildUnequipItemCommand,
    equipmentSlotName,
    normalizeEquipmentSlot,
    normalizeInventoryEvent,
    EquipmentSlot
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
export {SignDisplayMode, buildSignTextMessage, normalizeSignDisplayMode, signDisplayModeName} from "./protocol/sign.js";
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
} from "./protocol/ui-config.js";
export {decryptPayload} from "./crypto/chacha.js";
export {decompressLz4Frame} from "./compression/lz4.js";
export {fetchNoticeVersion, fetchGameVersion, fetchServers} from "./net/servers.js";
export {fetchShips as fetchShipsWithSession, fetchShipList as fetchShipListWithSession} from "./game/ships.js";
export {
    BrowserSession,
    browserSession,
    createBrowserSession,
    createSession,
    createAnonSession,
    createAnonToken,
    fetchAnonKey,
    setBrowserSession,
    fetchAccountStatus,
    fetchShips,
    fetchShipListForBrowser as fetchShipList,
    joinShip,
    startShip,
    startNewShip,
    joinInvite
} from "./net/browser-session.js";

import {Connection} from "./game/connection.js";
import {DredlessClient} from "./client.js";
import {fetchGameVersion, fetchNoticeVersion, fetchServers} from "./net/servers.js";
import {
    BrowserSession,
    browserSession,
    createAnonSession,
    createAnonToken,
    createBrowserSession,
    createSession,
    fetchAccountStatus,
    fetchAnonKey,
    fetchShipListForBrowser,
    fetchShips,
    joinInvite,
    joinShip,
    setBrowserSession,
    startNewShip,
    startShip
} from "./net/browser-session.js";

export const DredlessBrowser = {
    BrowserSession,
    Connection,
    DredlessClient,
    browserSession,
    createBrowserSession,
    createSession,
    createAnonSession,
    createAnonToken,
    fetchAnonKey,
    setBrowserSession,
    fetchAccountStatus,
    fetchNoticeVersion,
    fetchGameVersion,
    fetchServers,
    fetchShips,
    fetchShipList: fetchShipListForBrowser,
    joinShip,
    startShip,
    startNewShip,
    joinInvite
};

export default DredlessBrowser;
