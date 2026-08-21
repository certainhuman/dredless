export {
    Connection,
    DredlessClient,
    WrenchMode,
    TurretMode,
    WorldStore,
    WorldState,
    ModelState,
    FabricatorType,
    decodeModelData,
    generateGeneratorMaze,
    solveGeneratorMazeSeed,
    maybeSolveGeneratorMazeSeed,
    buildBlueprintPlacementMessage,
    decodeMsgpack,
    encodeMsgpack,
    buildCommsMessage,
    flattenRichText,
    normalizeCommsEvent,
    buildSignedCommandPacket,
    buildEquipItemCommand,
    buildInventoryDragCommand,
    buildUnequipItemCommand,
    equipmentSlotName,
    normalizeEquipmentSlot,
    normalizeInventoryEvent,
    EquipmentSlot,
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
    normalizeShipConfig,
    SignDisplayMode,
    buildSignTextMessage,
    normalizeSignDisplayMode,
    signDisplayModeName,
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
    LoaderPriority,
    decryptPayload,
    decompressLz4Frame,
    fetchNoticeVersion,
    fetchGameVersion,
    fetchServerStatus,
    fetchServerStatuses,
    fetchServers
} from "./index.js";

export type {
    Server,
    Ship,
    ShipList,
    ShipRef,
    ShipSpec,
    ServerRef,
    SessionSnapshot,
    Account,
    ConnectionSnapshot,
    BlueprintPlacement,
    BlueprintPlacementMessage,
    Command,
    DredlessClientSnapshot,
    WorldSnapshot,
    EntitySummary,
    EntityDebugSummary,
    InventorySnapshot,
    ReadWorldScope
} from "./index.js";

import type {Connection, DredlessClient, Server, ServerRef, SessionSnapshot, Ship, ShipList, ShipRef} from "./index.js";


export class BrowserSession {
    constructor(baseUrl?: string);

    baseUrl: string;
    gameVersion: string | null;
    ambientAuth: true;
    account: unknown | null;
    geoServer: number | null;
    upgraded: boolean;
    isRegistered: boolean;
    showAds: boolean;
    forceTutorial: boolean;
    ban: unknown;

    get gameSession(): string;

    get gameToken(): string;

    get anonKey(): string;

    get noticeVersion(): number | string | null;
    set noticeVersion(value: number | string | null);

    request(path: string, init?: RequestInit & { body?: BodyInit | Record<string, unknown> | null }): Promise<Response>;

    readAnonKey(): Promise<string>;

    fetchAnonKey(noticeVersion?: number | null): Promise<string>;

    fetchAccountStatus(): Promise<unknown>;

    fetchShips(server: ServerRef): Promise<Ship[]>;

    fetchShipList(server: ServerRef): Promise<ShipList>;

    joinShipConnection(server: ServerRef, ship?: ShipRef): Promise<Connection>;

    startShipConnection(server: ServerRef, ship?: ShipRef): Promise<Connection>;

    startNewShipConnection(server: ServerRef, name?: string, color?: string): Promise<Connection>;

    joinInviteConnection(server: ServerRef, code: string): Promise<Connection>;

    joinShip(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;

    startShip(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;

    startNewShip(server: ServerRef, name?: string, color?: string): Promise<DredlessClient>;

    joinInvite(server: ServerRef, code: string): Promise<DredlessClient>;

    toJSON(): SessionSnapshot & { ambientAuth: true };
}

export function browserSession(baseUrl?: string): BrowserSession;

export function createBrowserSession(baseUrl?: string): BrowserSession;

export function createSession(noticeVersion?: number | null, baseUrl?: string): Promise<BrowserSession>;

export function createAnonSession(anonKey?: string | null, noticeVersion?: number | null, baseUrl?: string): Promise<BrowserSession>;

export function createAnonToken(noticeVersion?: number | null, baseUrl?: string): Promise<string>;

export function fetchAnonKey(noticeVersion?: number | null, baseUrl?: string): Promise<string>;

export function setBrowserSession(session?: BrowserSession | null): BrowserSession | null;

export function fetchAccountStatus(session?: BrowserSession | null): Promise<unknown>;

export function fetchShips(server: ServerRef, session?: BrowserSession | null): Promise<Ship[]>;

export function fetchShipList(server: ServerRef, session?: BrowserSession | null): Promise<ShipList>;

export function joinShip(server: ServerRef, ship?: ShipRef, session?: BrowserSession | null): Promise<DredlessClient>;

export function startShip(server: ServerRef, ship?: ShipRef, session?: BrowserSession | null): Promise<DredlessClient>;

export function startNewShip(server: ServerRef, name?: string, color?: string, session?: BrowserSession | null): Promise<DredlessClient>;

export function joinInvite(server: ServerRef, code: string, session?: BrowserSession | null): Promise<DredlessClient>;

export interface DredlessBrowserNamespace {
    BrowserSession: typeof BrowserSession;
    Connection: typeof import("./index.js").Connection;
    DredlessClient: typeof import("./index.js").DredlessClient;
    browserSession: typeof browserSession;
    createBrowserSession: typeof createBrowserSession;
    createSession: typeof createSession;
    createAnonSession: typeof createAnonSession;
    createAnonToken: typeof createAnonToken;
    fetchAnonKey: typeof fetchAnonKey;
    setBrowserSession: typeof setBrowserSession;
    fetchAccountStatus: typeof fetchAccountStatus;
    fetchNoticeVersion: typeof import("./index.js").fetchNoticeVersion;
    fetchGameVersion: typeof import("./index.js").fetchGameVersion;
    fetchServers: typeof import("./index.js").fetchServers;`r`n    fetchServerStatus: typeof import("./index.js").fetchServerStatus;`r`n    fetchServerStatuses: typeof import("./index.js").fetchServerStatuses;
    fetchShips: typeof fetchShips;
    fetchShipList: typeof fetchShipList;
    joinShip: typeof joinShip;
    startShip: typeof startShip;
    startNewShip: typeof startNewShip;
    joinInvite: typeof joinInvite;
}

export const DredlessBrowser: DredlessBrowserNamespace;
export default DredlessBrowser;
