export const GravityDirection: {
    readonly Down: "down";
    readonly Up: "up";
    readonly Left: "left";
    readonly Right: "right";
};
export type GravityDirection = typeof GravityDirection[keyof typeof GravityDirection];
export type ShipGravityDirection = GravityDirection | 0 | 1 | 2 | 3;

export interface Server {
    index: number;
    domain: string;
    description: string;
}

export interface Ship {
    id: number | null;
    hexCode: string | null;
    name: string;
    iconUrl: string | null;
    playerCount: number;
    owned: boolean;
    saved: boolean;
    color: string;
    time: number | null;
}

export interface ShipList {
    playerCount?: number;
    maxPlayerCount?: number;
    isMuted?: boolean;
    ships: Ship[];
}

export interface InviteMetadata {
    shipId: string | null;
    name: string | null;
    previewImageUrl: string | null;
    hostname: string;
    inviteCode: string;
}
export interface InviteFetchOptions {
    fetchImpl?: typeof fetch;
}
export function fetchInviteMetadata(invite: string | URL, options?: InviteFetchOptions): Promise<InviteMetadata>;
export function parseInviteMetadata(html: string): InviteMetadata;

export type ShipSpec =
    | { type: "join_or_load"; id: number | string }
    | { type: "new"; name?: string | null; color?: string | null }
    | { type: "invite"; code: string };

export interface ServerStatus {
    playerCount: number;
    maxPlayerCount: number;
    ping: number;
}

export type ServerRef = number | Server;
export type ShipRef = number | string | Ship | ShipSpec | null;
export type ShipPrivacy = 0 | 1 | boolean | "public" | "private";
export type ShipPlayerRank = 0 | 1 | 3 | "guest" | "crew" | "captain";

export const DropReason: Readonly<{
    ProtocolError: 4000;
    BadVersion: 4001;
    ConnectLimit: 4002;
    ConnectRate: 4003;
    TeamLimit: 4004;
    FullPlayers: 4005;
    FullTeams: 4006;
    TeamNotAvailable: 4007;
    Kicked: 4008;
    Banned: 4009;
    Idle: 4010;
    ShipDestruct: 4011;
    JoinBlocked: 4012;
    HardBanned: 4013;
    NoLoad: 4014;
    Saved: 4015;
    InvalidInvite: 4016;
    Shutdown: 4017;
    ServerError: 4018;
    GTFO: 4019;
}>;
export type DropReason = typeof DropReason[keyof typeof DropReason];

export interface DisconnectInfo {
    readonly code: number;
    /** Official application reason name; null for standard WebSocket or unknown codes. */
    readonly name: keyof typeof DropReason | null;
    readonly reason: string;
    /** Null when the socket API does not report handshake cleanliness. */
    readonly wasClean: boolean | null;
}

export class DisconnectError extends Error {
    constructor(disconnect: DisconnectInfo, message?: string);
    disconnect: DisconnectInfo;
}

export function normalizeDisconnect(eventOrCode?: unknown, reason?: unknown): DisconnectInfo;

export interface ShipManagementOptions {
    /** Milliseconds to wait for server confirmation; default 10000. */
    timeout?: number;
}

export interface StarterRecoveryOptions {
    /** Milliseconds to wait for the response; default 10000. */
    timeout?: number;
}

export interface StarterRecoveryResult {
    readonly success: boolean;
    readonly failReason: string | null;
}

export interface RenameShipOptions {
    /** #RRGGBB hex string; omitted preserves the color returned by the server. */
    color?: string;
    /** Milliseconds to wait for rename permission; default 10000. */
    timeout?: number;
}

export interface SaveShipOptions {
    /** Milliseconds to wait for the Saved disconnect code; default 10000. */
    timeout?: number;
}
export type PlayerShipRank = "guest" | "crew" | "crew-invite-pending-deprecated" | "captain" | "banned";
export const FabricatorType: {
    readonly Starter: "starter";
    readonly Munitions: "munitions";
    readonly Engineering: "engineering";
    readonly Equipment: "equipment";
};
export type FabricatorType = typeof FabricatorType[keyof typeof FabricatorType];
export const SignDisplayMode: {
    readonly Always: "always";
    readonly WhenNear: "when-near";
    readonly OnHover: "on-hover";
};
export type SignDisplayMode = typeof SignDisplayMode[keyof typeof SignDisplayMode];
export const EquipmentSlot: {
    readonly Head: "head";
    readonly Face: "face";
    readonly Body: "body";
    readonly Back: "back";
    readonly Hands: "hands";
    readonly Feet: "feet";
};
export type EquipmentSlot = typeof EquipmentSlot[keyof typeof EquipmentSlot];
export type InventoryArea = "all" | "hotbar" | "equipment";
export type InventorySlotRef = number | EquipmentSlot | InventorySlotHandle | InventorySlotSnapshot;
export type ReadWorldScope = "ship" | "current" | "overworld" | number;
export type EntityRef = number | EntityHandle | EntitySummary | EntityDebugSummary;

export interface ShipPatronPerk {
    name: string;
    /** Packed RGB color, as sent by the server. */
    color: number;
    /** Official tiers include bronze, silver, gold, plat, and flux. */
    tier: string;
}

export interface PatronPerksResponse {
    readonly failure: boolean;
}

export interface ShipConfig {
    privacy: number | null;
    privacyName: "public" | "private" | null;
    inviteKey: string | null;
    teamId: number | null;
    patronPerks: ShipPatronPerk[];
}

export interface CaptainSubrank {
    subrank: number | null;
    enableCheats: boolean;
}

export interface CurrentPlayerRank {
    shipRank: PlayerShipRank | null;
    subrank: number | null;
    isCaptain: boolean;
    patronTier: "bronze" | "silver" | "gold" | "plat" | "flux" | null;
}

export interface PlayerListEntry {
    refId: number | null;
    discrim: string | null;
    discrimColor: number | null;
    teamRank: number | null;
    captainRank: number | null;
    isCaptain: boolean;
    isShipOwner: boolean;
    canBeManaged: boolean;
    time: number | null;
    items: unknown[];
    aliasDiscrims: unknown[];
    extraAliasCount: number;
    onlineCount: number | null;
}

export interface ShipPlayerList {
    ownerCaptainRank: number | null;
    shipOwners: PlayerListEntry[];
    players: PlayerListEntry[];
    changes: PlayerListEntry[];
    removedPlayers: number[];
}

export interface ShipReadOptions {
    includeWorld?: boolean;
    includeTiles?: boolean;
    /** Include the per-cell block index. Off by default: building and sorting it is the most expensive part of a snapshot. */
    includeBlocks?: boolean;
    includeModel?: boolean;
    sort?: "distance" | null;
}

export interface DragPayload {
    source: number;
    target: number;
    split?: boolean;
}

export interface BlueprintPlacement {
    x: number;
    y: number;
    width?: number;
    height?: number;
    w?: number;
    h?: number;
    source: string;
}

export interface ChatMessage {
    type: 2;
    msg: string;
}

export interface BlueprintPlacementMessage {
    type: 9;
    x: number;
    y: number;
    w: number;
    h: number;
    source: string;
}

export interface Command {
    type?: number;
    n?: number | null;
    x?: number;
    y?: number;
    mx?: number;
    my?: number;
    vx?: number;
    vy?: number;
    jump?: boolean;
    jump_held?: boolean;
    drop?: boolean;
    act1?: boolean;
    act1_held?: boolean;
    exit?: boolean;
    act2?: boolean;
    act_alt?: boolean;
    act_alt_held?: boolean;
    wrench_mode?: number;
    turret_mode?: number;
    scr_w?: number;
    scr_h?: number;
    motion?: number;
    focus_ent?: number | null;
    config_ent?: number | null;
    tip_select?: number | null;
    inv_slot?: number;
    blur?: boolean;
    drag?: DragPayload | null;
}

export interface CrewLogEntry {
    icon: string | null;
    /** Plain text; formatting, images, badges, and date tokens remain in rawText. */
    text: string;
    rawText: unknown;
    count: number;
    refId: number | null;
    secondaryRefId: number | null;
}

export interface CrewLog {
    /** Retained entries in server order, oldest first; at most 500. */
    entries: CrewLogEntry[];
    /** Entries appended by the latest message, including amended replacements. */
    changes: CrewLogEntry[];
    reset: boolean;
    amend: boolean;
}

export interface ShipManagementMessage {
    type: 4;
    act: string;
    arg: unknown;
    arg2?: unknown;
    rank?: unknown;
}

export interface SignTextMessage {
    type: 5;
    cmd: "sign_text";
    args: [string, 0 | 1 | 2];
}

export interface CommsMessage {
    type: 3;
    msg: string;
}

export interface NormalizedCommsMessage {
    raw: unknown;
    text: string;
}

export interface CommsEvent {
    type: "comms";
    filter?: number;
    ent_id: number | null;
    entity: number | null;
    msgs_text: unknown[];
    rawMessages: unknown[];
    messages: NormalizedCommsMessage[];
    update?: boolean;
    world?: number | null;
}

export interface InventoryDragCommand {
    drag: {
        source: number;
        target: number;
        split: boolean;
    };
}

export const PusherMode: {
    readonly Push: "push";
    readonly Pull: "pull";
    readonly DoNothing: "do-nothing";
};
export type PusherMode = typeof PusherMode[keyof typeof PusherMode];
export const LoaderPosition: {
    readonly TopLeft: "top-left";
    readonly TopMiddle: "top-middle";
    readonly TopRight: "top-right";
    readonly MiddleLeft: "middle-left";
    readonly MiddleRight: "middle-right";
    readonly BottomLeft: "bottom-left";
    readonly BottomMiddle: "bottom-middle";
    readonly BottomRight: "bottom-right";
};
export type LoaderPosition = typeof LoaderPosition[keyof typeof LoaderPosition];
export const LoaderFilterMode: {
    readonly AllowAll: "allow-all";
    readonly BlockFilter: "block-filter";
    readonly AllowFilter: "allow-filter";
    readonly BlockAll: "block-all";
};
export type LoaderFilterMode = typeof LoaderFilterMode[keyof typeof LoaderFilterMode];
export const LoaderPriority: {
    readonly Low: "low";
    readonly Normal: "normal";
    readonly High: "high";
};
export type LoaderPriority = typeof LoaderPriority[keyof typeof LoaderPriority];
export type ClipboardTarget =
    number
    | "loader"
    | "loader-config"
    | "loaderConfig"
    | "hatch"
    | "cargo-hatch"
    | "cargoHatch"
    | "ejector"
    | "cargo-ejector"
    | "cargoEjector"
    | "expando"
    | "expando-box"
    | "expandoBox"
    | "generator"
    | "shield-generator"
    | "shieldGenerator"
    | "navigation"
    | "navigation-unit"
    | "navigationUnit"
    | "nav"
    | "nav-unit"
    | "navUnit";
export const FixedAngleDirection: {
    readonly Right: "right";
    readonly Up: "up";
    readonly Left: "left";
    readonly Down: "down";
};
export type FixedAngleDirection = typeof FixedAngleDirection[keyof typeof FixedAngleDirection];

export interface PusherConfig {
    mode?: PusherMode;
    filteredMode?: PusherMode;
    angle?: number;
    speed?: number;
    filterInventory?: boolean;
    length?: number;
}

export interface LoaderConfig {
    pick?: LoaderPosition;
    place?: LoaderPosition;
    priority?: LoaderPriority;
    stack?: number;
    cycle?: number;
    requireOutput?: boolean;
    waitForStack?: boolean;
}

export interface LoaderFullConfig extends LoaderConfig {
    filterMode?: LoaderFilterMode;
    filterSlots?: Array<number | null | undefined>;
}

export interface ClanTagDetails {
    /** Current tag, or null when cleared. */
    tag: string | null;
    /** Number of other users with this tag; null when unavailable. */
    otherUsers: number | null;
}

export interface AccountPerkShip {
    /** Decimal identifier from the removal form; use this for removeShipPerks(). */
    shipId: string;
    name: string;
    /** Identifier displayed in braces; distinct from the removal form's ID. */
    hexCode: string | null;
}

export interface AccountDetails {
    name: string | null;
    /** Packed RGB account color from the name's background, matching account/status. */
    color: number | null;
    email: string | null;
    /** Identity value without the parenthesized service suffix. */
    identity: string | null;
    identityService: string | null;
    clan: ClanTagDetails;
    /** This account's applied ships; null when the section is unavailable. */
    shipsWithPerks: AccountPerkShip[] | null;
}

export class Session {
    constructor(gameSession?: string | null, gameVersion?: string | null);

    baseUrl: string;
    cookies: Map<string, string>;
    gameVersion: string | null;
    account: Account | null;
    geoServer: number | null;
    upgraded: boolean;
    isRegistered: boolean;
    showAds: boolean;
    forceTutorial: boolean;
    ban: unknown;

    get gameSession(): string;

    get gameToken(): string;

    get noticeVersion(): number | string | null;
    set noticeVersion(value: number | string | null);

    request(path: string, init?: RequestInit & { body?: BodyInit | Record<string, unknown> | null }): Promise<Response>;

    fetchAccountStatus(): Promise<unknown>;

    /** Scrape the authenticated account page; does not update account/status or session serialization. */
    fetchAccountDetails(): Promise<AccountDetails>;
    fetchClanTag(): Promise<ClanTagDetails>;
    /** Submit the form and confirm the stored tag on the account page. */
    setClanTag(tag: string): Promise<ClanTagDetails>;
    clearClanTag(): Promise<ClanTagDetails>;
    /** Remove this account's perks and return the confirmed remaining applied ships. */
    removeShipPerks(shipId: string | number): Promise<AccountPerkShip[]>;


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

    toJSON(): SessionSnapshot;
}

export class AnonSession extends Session {
    constructor(gameSession?: string | null, anonKey?: string | null, gameVersion?: string | null);

    get anonKey(): string;
}

export interface Account {
    name: string;
    color: number;
    game_rank: number;
    user_badges: string[];
    is_registered: boolean;
}

export interface SessionSnapshot {
    baseUrl: string;
    gameSession: string;
    gameToken: string;
    gameVersion: string | null;
    noticeVersion: number | string | null;
    cookies: Record<string, string>;
    account: Account | null;
    geoServer: number | null;
    upgraded: boolean;
    isRegistered: boolean;
    showAds: boolean;
    forceTutorial: boolean;
    ban: unknown;
    anonKey?: string;
}

export class Connection {
    constructor(session: Session, gameToken: string, netPort: number, serverId: number | Server, server?: Server | null);

    session: Session;
    baseUrl: string;
    gameToken: string;
    netPort: number;
    serverId: number;
    server: Server | null;

    toJSON(): ConnectionSnapshot;
}

export interface ConnectionSnapshot {
    baseUrl: string;
    gameToken: string;
    netPort: number;
    serverId: number;
    server: Server | null;
    session: SessionSnapshot;
}

export type WebSocketAttachMode = "observe" | "bootstrap" | "readonly";

export interface AttachWebSocketOptions {
    mode?: WebSocketAttachMode;
    connected?: boolean | null;
    ready?: boolean;
    sid?: number | null;
    baseUrl?: string | null;
    session?: Session | null;
    serverId?: number | null;
    server?: Server | null;
    netPort?: number | null;
    gameToken?: string;
}

export interface DredlessClientOptions {
    connect?: boolean;
    /**
     * Retained entries in `packets`. Default 200. Pass 0 to disable the buffer or
     * Infinity for unbounded capture.
     */
    packetHistory?: number;
    /** Retained entries in each `WorldState.events`. Default 200. */
    eventHistory?: number;
    /** Retained entries in each `WorldState.modelPackets`. Default 100. */
    modelPacketHistory?: number;
    /** Retained entries in each `WorldState.chunks`. Default 64. */
    chunkHistory?: number;
}

export class DredlessClient {
    constructor(connection: Connection, options?: DredlessClientOptions);

    static attachWebSocket(websocket: unknown, options?: AttachWebSocketOptions): DredlessClient;

    connection: Connection | null;
    session: Session | null;
    baseUrl: string | null;
    attachMode: WebSocketAttachMode | null;
    attached: boolean;
    serverId: number | null;
    server: Server | null;
    netPort: number | null;
    gameToken: string;
    ws: unknown;
    sid: number | null;
    connected: boolean;
    ready: boolean;
    packetCount: number;
    lastPacket: unknown;
    lastDisconnect: DisconnectInfo | null;
    crewLog: CrewLog | null;
    net: ClientNetDomain;
    debug: ClientDebugDomain;
    player: PlayerDomain;
    inventory: InventoryDomain;
    tips: TipDomain;
    management: ShipManagementDomain;
    readyPromise: Promise<this>;

    whenReady(): Promise<this>;

    close(code?: number, reason?: string): this;

    disconnect(code?: number, reason?: string): this;
    sendChatMessage(message?: string): this;
    sendCommsMessage(message?: string): this;
    /** Whether the connected, ready client's ship has parent-world danger level 0. */
    canSaveShip(): boolean;
    /** Save and await the server's Saved close code; reject on ineligibility, timeout, or any other disconnect. */
    saveShip(options?: SaveShipOptions): Promise<DisconnectInfo>;
    /** Request permission and send the rename commit; does not await confirmation of the new name. */
    renameShip(name: string, options?: RenameShipOptions): Promise<void>;
    unbanPlayer(refId: number): this;
    setShipGravity(direction: ShipGravityDirection): this;
    setShipPatronPerks(enabled: boolean): this;
    resetInvite(options?: ShipManagementOptions): Promise<ShipConfig>;
    demoteSelf(options?: ShipManagementOptions): Promise<void>;
    /** Await recovery success; reject with the server's failure reason. */
    recoverStarterItem(itemId: number, options?: StarterRecoveryOptions): Promise<void>;

    currentShip(): ShipDomain | null;

    ship(): ShipDomain | null;

    currentPlayerEntity(): EntityHandle | null;

    overworld(): OverworldDomain | null;

    world(id: number): WorldDomain | null;

    shipWorld(options?: {
        includeTiles?: boolean;
        includeModel?: boolean;
        includeBlocks?: boolean
    }): WorldSnapshot | null;

    state(options?: { includeTiles?: boolean; includeModel?: boolean; includeBlocks?: boolean }): ClientSnapshot;

    entities(scope?: number | string): EntitySnapshot[];

    entity(entityId: number, scope?: number | string): EntitySnapshot | null;

    on(type: "disconnect", callback: (info: DisconnectInfo) => void): this;
    on(type: "starter-recovery", callback: (result: StarterRecoveryResult, packet: unknown) => void): this;
    on(type: "demote", callback: (packet: unknown) => void): this;
    on(type: "patron-perks-response", callback: (response: PatronPerksResponse, packet: unknown) => void): this;
    on(type: "crew-log", callback: (log: CrewLog | null, packet: unknown) => void): this;
    on(type: "tip-list", callback: (menu: TipList, world: WorldState) => void): this;
    on(type: string, callback: (...args: unknown[]) => void): this;

    off(type: "disconnect", callback: (info: DisconnectInfo) => void): this;
    off(type: "starter-recovery", callback: (result: StarterRecoveryResult, packet: unknown) => void): this;
    off(type: "demote", callback: (packet: unknown) => void): this;
    off(type: "patron-perks-response", callback: (response: PatronPerksResponse, packet: unknown) => void): this;
    off(type: "crew-log", callback: (log: CrewLog | null, packet: unknown) => void): this;
    off(type: "tip-list", callback: (menu: TipList, world: WorldState) => void): this;
    off(type: string, callback: (...args: unknown[]) => void): this;

    once(type: "disconnect", callback: (info: DisconnectInfo) => void): this;
    once(type: "starter-recovery", callback: (result: StarterRecoveryResult, packet: unknown) => void): this;
    once(type: "demote", callback: (packet: unknown) => void): this;
    once(type: "patron-perks-response", callback: (response: PatronPerksResponse, packet: unknown) => void): this;
    once(type: "crew-log", callback: (log: CrewLog | null, packet: unknown) => void): this;
    once(type: "tip-list", callback: (menu: TipList, world: WorldState) => void): this;
    once(type: string, callback: (...args: unknown[]) => void): this;
}

export interface TipList {
    /** Target inferred from tips.open(); null for unsolicited menus. */
    readonly entity: number | null;
    readonly world: number | null;
    readonly filter: number | null;
    readonly x: number;
    readonly y: number;
    readonly options: readonly string[];
}

export interface TipOptions {
    /** Milliseconds to wait per server response; default 5000. */
    timeout?: number;
    command?: Command;
}

export interface TipDomain {
    readonly current: TipList | null;
    open(entity: number | EntityHandle, options?: TipOptions): Promise<TipList>;
    /** Dismiss the menu and wait for the server's empty tip list. */
    close(options?: TipOptions): Promise<DredlessClient>;
    select(option: number | string, command?: Command): DredlessClient;
    choose(entity: number | EntityHandle, option: number | string, options?: TipOptions): Promise<DredlessClient>;
}

export interface ClientNetDomain {
    connected: boolean;
    ready: boolean;
    sid: number | null;
    packetCount: number;
    lastPacket: unknown;
    readonly lastDisconnect: DisconnectInfo | null;

    send(command?: Command): DredlessClient;

    sendMessage(message: unknown, options?: { afterReady?: boolean }): DredlessClient;

    sendRaw(message: unknown, options?: { afterReady?: boolean }): DredlessClient;

    sendEntityCommand(cmd: string, args?: unknown[]): DredlessClient;

    sendUiConfig(data: unknown): DredlessClient;

    sendBlueprintPlacement(placement: BlueprintPlacement): DredlessClient;

    setOutfit(outfit: unknown): DredlessClient;
}

export interface ClientDebugDomain {
    packets(): unknown[];

    decodeErrors(): unknown[];

    worldStore(): WorldStore;

    modelTable(worldId: number, tableId: number): Map<number, ModelRecord>;

    modelRecord(worldId: number, tableId: number, entityId: number): ModelRecord | null;

    entities(scope?: ReadWorldScope): EntityDebugSummary[];

    entity(scope: ReadWorldScope, entity: EntityRef): EntityDebugSummary | null;

    puiPanels(): PuiEvent[];

    commsPanels(): CommsEvent[];
}

export interface PlayerDomain {
    current(): PlayerSummary | null;

    entity(): EntityHandle | null;

    name(): string | null;

    rank(): CurrentPlayerRank;

    move(vector?: { x?: number; y?: number }, command?: Command): DredlessClient;

    aim(point?: { x?: number; y?: number; mx?: number; my?: number }, command?: Command): DredlessClient;

    action(flags?: Command, command?: Command): DredlessClient;

    useEntity(entity: EntityRef, options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;

    useHeldItem(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;

    placeHeldItem(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;

    placeBlueprint(placement: BlueprintPlacement, options?: {
        invSlot?: number;
        hold?: boolean;
        mx?: number;
        my?: number
    }, command?: Command): DredlessClient;

    rotateHeldItem(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;

    selectSlot(invSlot?: number, command?: Command): DredlessClient;

    inputSettings(): CurrentInputSettings;

    setInputSettings(settings?: InputSettings, options?: { send?: boolean }): DredlessClient;

    setView(width: number, height: number, options?: { send?: boolean }): DredlessClient;

    setScreenSize(width: number, height: number, options?: { send?: boolean }): DredlessClient;

    setWrenchMode(mode: WrenchMode, options?: { send?: boolean }): DredlessClient;

    setTurretMode(mode: TurretMode, options?: { send?: boolean }): DredlessClient;
}

export interface ShipManagementDomain {
    /** Checks the current ship's parent-world danger level; server permissions still apply. */
    canSave(): boolean;

    /** Save and await the server's Saved close code; reject on ineligibility, timeout, or any other disconnect. */
    save(options?: SaveShipOptions): Promise<DisconnectInfo>;

    /** Request permission and send the rename commit; does not await confirmation of the new name. */
    rename(name: string, options?: RenameShipOptions): Promise<void>;

    requestPlayerList(): DredlessClient;

    /** Await a server config containing a changed, nonempty invite key. */
    resetInvite(options?: ShipManagementOptions): Promise<ShipConfig>;

    setPrivacy(privacy: ShipPrivacy): DredlessClient;

    /** Set gravity using the official coolsnake303 command. Does not await confirmation. */
    setGravity(direction: ShipGravityDirection): DredlessClient;

    /** Apply or remove the caller's perks; does not await server confirmation. */
    setPatronPerks(enabled: boolean): DredlessClient;
    enablePatronPerks(): DredlessClient;
    disablePatronPerks(): DredlessClient;
    /** Current server-reported patrons; null when config is unavailable. */
    patronPerks(): ShipPatronPerk[] | null;
    /** Any applied patron, or an exact patron name match when supplied. */
    hasPatronPerks(name?: string): boolean;

    /** Await recovery success; reject with the server's failure reason. */
    recoverStarterItem(itemId: number, options?: StarterRecoveryOptions): Promise<void>;

    setPlayerRank(refId: number, rank: ShipPlayerRank): DredlessClient;

    kickPlayer(refId: number): DredlessClient;

    banPlayer(refId: number): DredlessClient;

    /** Remove a ship ban using the player list entry’s refId. */
    unbanPlayer(refId: number): DredlessClient;

    /** Await server demotion; management caches have been cleared when this resolves. */
    demoteSelf(options?: ShipManagementOptions): Promise<void>;

    config(): ShipConfig | null;

    hasCheats(): boolean;

    playerList(): ShipPlayerList | null;

    crewLog(): CrewLog | null;
}

export interface InventoryDomain {
    state(): InventoryState;

    hotbarSize(): number;

    allSlots(): InventorySlotHandle[];

    slot(ref: InventorySlotRef): InventorySlotHandle;

    hotbarSlots(): InventorySlotHandle[];

    equipmentSlots(): {
        head: InventorySlotHandle;
        face: InventorySlotHandle;
        body: InventorySlotHandle;
        back: InventorySlotHandle;
        hands: InventorySlotHandle;
        feet: InventorySlotHandle
    };

    findItem(itemId: number, options?: { area?: InventoryArea }): InventorySlotHandle | null;

    findItems(itemId: number, options?: { area?: InventoryArea }): InventorySlotHandle[];

    firstEmpty(options?: { area?: InventoryArea }): InventorySlotHandle | null;

    move(source: InventorySlotRef, target: InventorySlotRef, options?: {
        split?: boolean
    }, command?: Command): DredlessClient;

    equip(source: InventorySlotRef, equipmentSlot?: EquipmentSlot | { split?: boolean }, options?: {
        split?: boolean
    } | Command, command?: Command): DredlessClient;

    unequip(equipmentSlot: EquipmentSlot, target?: InventorySlotRef, options?: {
        split?: boolean
    }, command?: Command): DredlessClient;

    select(slot: InventorySlotRef, command?: Command): DredlessClient;
}

export interface InventorySlotHandle {
    index: number;
    kind: "hotbar" | "equipment" | null;
    equipmentSlot: "head" | "face" | "body" | "back" | "hands" | "feet" | null;
    itemId: number | null;
    itemName: string | null;
    count: number;
    empty: boolean;

    exists(): boolean;

    snapshot(): InventorySlotSnapshot | null;

    moveTo(target: InventorySlotRef, options?: { split?: boolean }, command?: Command): DredlessClient;

    equip(equipmentSlot?: EquipmentSlot | { split?: boolean }, options?: {
        split?: boolean
    } | Command, command?: Command): DredlessClient;

    unequip(target?: InventorySlotRef, options?: { split?: boolean }, command?: Command): DredlessClient;

    select(command?: Command): DredlessClient;
}

export interface WorldDomain {
    id: number | null;
    entities: EntityCollection;
    machines: MachineCollection;
    players: PlayerCollection;
    projectiles: EntitySummaryCollection<ProjectileSummary>;
    bots: EntitySummaryCollection<BotSummary>;
    rcds: EntitySummaryCollection<RcdSummary>;
    balls: EntitySummaryCollection<BallSummary>;
    recyclers: EntitySummaryCollection<RecyclerSummary>;
    blocks: BlockCollection;
    materials: MaterialCollection;

    exists(): boolean;

    snapshot(options?: {
        includeTiles?: boolean;
        includeModel?: boolean;
        includeBlocks?: boolean
    }): WorldSnapshot | null;
}

export interface ShipDomain extends WorldDomain {
    metadata: ShipWorldMetadataSummary | null;

    entity(): EntityHandle | null;

    overworldEntity: EntityHandle | null;
}

export interface OverworldDomain extends WorldDomain {
    ships(options?: ShipReadOptions): ShipHandle[];

    shipByHex(hexCode: string, options?: ShipReadOptions): ShipHandle | null;

    shipByEntity(entity: EntityRef, options?: ShipReadOptions): ShipHandle | null;
}

export interface EntityCollection {
    all(): EntityHandle[];

    snapshots(): EntitySnapshot[];

    states(): EntitySnapshot[];

    get(entity: EntityRef): EntityHandle;
}

export interface PlayerCollection {
    all(): PlayerSummary[];

    current(): PlayerSummary | null;
}

/** Current component summaries; get() returns null for a missing entity or component. */
export interface EntitySummaryCollection<T> {
    all(): T[];
    get(entity: EntityRef): T | null;
}

export interface BlockCollection {
    all(): BlockSummary[];

    at(x: number, y: number): BlockSummary | null;
}

export interface MaterialCollection {
    all(): MaterialSummary[];
}

export interface MachineCollection {
    state(): MachineSummary;

    raw(): MachineSummary;

    loaders(): LoaderHandle[];

    loader(entity: EntityRef): LoaderHandle;

    pushers(): PusherHandle[];

    pusher(entity: EntityRef): PusherHandle;

    launchers(): LauncherHandle[];

    launcher(entity: EntityRef): LauncherHandle;

    navigationUnits(): NavigationUnitHandle[];

    navigationUnit(entity?: EntityRef | null): NavigationUnitHandle | null;

    fabricators(): FabricatorHandle[];

    fabricator(entity: EntityRef): FabricatorHandle;

    commsStations(): CommsStationHandle[];

    commsStation(entity?: EntityRef | null): CommsStationHandle | null;

    signs(): SignHandle[];

    sign(entity: EntityRef): SignHandle;

    generators(): GeneratorHandle[];

    generator(entity: EntityRef): GeneratorHandle;

    cargoHatches(): CargoHatchHandle[];

    cargoHatch(entity: EntityRef): CargoHatchHandle;

    cargoEjectors(): CargoEjectorHandle[];

    cargoEjector(entity: EntityRef): CargoEjectorHandle;

    cannons(): CannonHandle[];

    cannon(entity: EntityRef): CannonHandle;

    thrusters(): ThrusterHandle[];

    thruster(entity: EntityRef): ThrusterHandle;

    helms(): HelmHandle[];

    helm(entity: EntityRef): HelmHandle;

    doors(): DoorHandle[];

    door(entity: EntityRef): DoorHandle;

    spawnPoints(): SpawnPointHandle[];

    spawnPoint(entity: EntityRef): SpawnPointHandle;

    shieldProjectors(): ShieldProjectorHandle[];

    shieldProjector(entity: EntityRef): ShieldProjectorHandle;

    fluidTanks(): FluidTankHandle[];

    fluidTank(entity: EntityRef): FluidTankHandle;

    expandoBoxes(): ExpandoBoxHandle[];

    expandoBox(entity: EntityRef): ExpandoBoxHandle;
}

export type EntityPublicType =
    | "projectile"
    | "rcd"
    | "ball"
    | "egg"
    | "recycler"
    | "loader"
    | "pusher"
    | "launcher"
    | "navigationUnit"
    | "fabricator"
    | "cargoEjector"
    | "cannon"
    | "thruster"
    | "cargoHatch"
    | "commsStation"
    | "fluidTank"
    | "shieldGenerator"
    | "shieldProjector"
    | "helm"
    | "sign"
    | "spawnPoint"
    | "door"
    | "expandoBox"
    | "player"
    | "ship"
    | "bot"
    | "looseItem"
    | "mapMarker"
    | "dockingSpring"
    | "hugeThruster"
    | "blueprintPreview"
    | "unknown";

export type EntityFeatureName =
    | "health"
    | "position"
    | "outline"
    | "inventory"
    | "item"
    | "filter"
    | "filterMode"
    | "filterSlots"
    | "filterInventory"
    | "beam"
    | "occupied"
    | "loaderConfig"
    | "pusherConfig"
    | "launcherConfig"
    | "navigationConfig"
    | "fabricatorQueue"
    | "progress"
    | string;
export type EntityTypeName = EntityPublicType | string;

export interface EntitySnapshot extends EntitySummary {
    id: number;
    position: TransformSummary | null;
    rotation: number | null;
    type: EntityPublicType | string;
    features: string[];

    is(type: EntityTypeName): boolean;

    has(feature: EntityFeatureName): boolean;

    feature(feature: EntityFeatureName): unknown | null;
}

export interface EntityHandle {
    /** @deprecated Use id. */
    entity: number;
    id: number;
    position: TransformSummary | null;
    health: HealthSummary | null;
    type: EntityPublicType | string;
    features: string[];

    exists(): boolean;

    snapshot(): EntitySnapshot | null;

    is(type: EntityTypeName): boolean;

    has(feature: EntityFeatureName): boolean;

    feature(feature: EntityFeatureName): unknown | null;

    as(type: EntityTypeName): MachineHandle | null;

    asLoader(): LoaderHandle | null;

    asPusher(): PusherHandle | null;

    asLauncher(): LauncherHandle | null;

    asNavigationUnit(): NavigationUnitHandle | null;

    asCommsStation(): CommsStationHandle | null;

    asSign(): SignHandle | null;

    asGenerator(): GeneratorHandle | null;

    asCargoHatch(): CargoHatchHandle | null;

    asCannon(): CannonHandle | null;

    asThruster(): ThrusterHandle | null;

    asHelm(): HelmHandle | null;

    asDoor(): DoorHandle | null;

    asSpawnPoint(): SpawnPointHandle | null;

    asShieldProjector(): ShieldProjectorHandle | null;

    asFluidTank(): FluidTankHandle | null;

    asCargoEjector(): CargoEjectorHandle | null;

    asExpandoBox(): ExpandoBoxHandle | null;

    use(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
    openTips(options?: TipOptions): Promise<TipList>;
}

export interface MachineHandle extends EntityHandle {
    open(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
}

export interface LoaderHandle extends MachineHandle {
    state: LoaderSummary | null;

    configure(config?: LoaderConfig): DredlessClient;

    configureFull(config?: LoaderFullConfig): DredlessClient;

    copy(config?: LoaderFullConfig): DredlessClient;

    setPickPlace(pick: LoaderPosition, place: LoaderPosition, config?: LoaderConfig): DredlessClient;

    setPriority(priority: LoaderPriority, config?: LoaderConfig): DredlessClient;

    setStack(stack: number, config?: LoaderConfig): DredlessClient;

    setCycle(cycle: number, config?: LoaderConfig): DredlessClient;

    setRequireOutput(requireOutput: boolean, config?: LoaderConfig): DredlessClient;

    setWaitForStack(waitForStack: boolean, config?: LoaderConfig): DredlessClient;

    setFilterMode(filterMode: LoaderFilterMode): DredlessClient;

    setFilterItems(filterSlots?: Array<number | null | undefined>): DredlessClient;

    pick: number | undefined;
    place: number | undefined;
    priority: number | undefined;
    stack: number | undefined;
    cycle: number | undefined;
    requireOutput: boolean | undefined;
    waitForStack: boolean | undefined;
    filterMode: number | undefined;
    filterSlots: Array<number | null>;
    active: boolean | undefined;
    heldItem: { itemId: number; itemName: string | null; count: number | null } | null;
    progress: number | null | undefined;
}

export interface PusherHandle extends MachineHandle {
    state: PusherSummary | null;
    beam: PusherBeamSummary | null;

    configure(config?: PusherConfig): DredlessClient;

    setAngle(angle: number, config?: PusherConfig): DredlessClient;

    setSpeed(speed: number, config?: PusherConfig): DredlessClient;

    setLength(length: number, config?: PusherConfig): DredlessClient;

    setMode(mode: PusherMode, config?: PusherConfig): DredlessClient;

    setFilteredMode(mode: PusherMode, config?: PusherConfig): DredlessClient;

    setFilterInventory(filterInventory: boolean, config?: PusherConfig): DredlessClient;

    setFilterItems(filterSlots?: Array<number | null | undefined>): DredlessClient;

    angle: number | undefined;
    speed: number | undefined;
    length: number | undefined;
    mode: number | undefined;
    filteredMode: number | undefined;
}

export interface LauncherHandle extends MachineHandle {
    state: LauncherSummary | null;

    setAngle(angle: number): DredlessClient;

    setPower(power: number): DredlessClient;

    angleDegrees: number | undefined;
    angleRadians: number | undefined;
    angleRaw: number | null | undefined;
}

export interface NavigationUnitHandle extends MachineHandle {
    state: NavigationUnitSummary | null;

    configure(config?: NavigationUnitConfig): DredlessClient;

    copy(config?: NavigationUnitConfig): DredlessClient;

    paste(config?: NavigationUnitConfig): DredlessClient;

    setDestination(destination: number, config?: NavigationUnitConfig): DredlessClient;

    setAutoWarp(config?: NavigationUnitConfig): DredlessClient;

    startWarp(config?: NavigationUnitConfig): DredlessClient;

    cancelWarp(config?: NavigationUnitConfig): DredlessClient;

    destination: number | undefined;
    autoWarpOnShieldFailure: boolean | undefined;
    autoWarpOnNoCaptains: boolean | undefined;
    warp: string | undefined;
}

export interface FabricatorHandle extends MachineHandle {
    state: FabricatorSummary | null;
    progress: number | null | undefined;
    active: boolean | undefined;
    craftingItem: { itemId: number; itemName: string | null; count: number | null } | null;

    panel(): PuiEvent | null;

    add(itemId: number, count?: number, index?: number): DredlessClient;

    sub(itemId: number, count?: number, index?: number): DredlessClient;

    clearQueue(): DredlessClient;

    toggleRepeat(): DredlessClient;

    lockResource(row: number): DredlessClient;

    unlockResource(row: number): DredlessClient;

    eject(row: number): DredlessClient;
}

export interface CommsStationHandle extends MachineHandle {
    state: CommsStationSummary | null;

    panel(): CommsEvent | null;

    sendMessage(message?: string): DredlessClient;
}

export interface SignHandle extends MachineHandle {
    state: SignSummary | null;

    setText(text?: string, mode?: SignDisplayMode): DredlessClient;

    text: string | undefined;
    mode: number | undefined;
}

export interface GeneratorHandle extends MachineHandle {
    state: ShieldGeneratorSummary | null;

    solvePuzzle(solution: string | number): DredlessClient;
}

export interface CargoHatchHandle extends MachineHandle {
    state: CargoHatchSummary | null;
    openFraction: number | null | undefined;

    configure(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): DredlessClient;

    copy(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): DredlessClient;

    paste(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): DredlessClient;

    setFilterMode(filterMode: LoaderFilterMode): DredlessClient;

    setFilterItems(filterSlots?: Array<number | null | undefined>): DredlessClient;
}

export interface CannonHandle extends MachineHandle {
    state: CannonSummary | null;
}

export interface ThrusterHandle extends MachineHandle {
    state: ThrusterSummary | null;
}

export interface HelmHandle extends MachineHandle {
    state: HelmSummary | null;
    occupied: boolean | undefined;
}

export interface DoorHandle extends EntityHandle {
    state: DoorSummary | null;
    rank: number | undefined;
    open: boolean | undefined;
    setRank(rank: ShipPlayerRank, options?: TipOptions): Promise<DredlessClient>;
}

export interface SpawnPointHandle extends MachineHandle {
    state: SpawnPointSummary | null;
    rank: number | undefined;
    setRank(rank: ShipPlayerRank, options?: TipOptions): Promise<DredlessClient>;
}

export interface ShieldProjectorHandle extends MachineHandle {
    state: ShieldProjectorSummary | null;
    active: boolean | undefined;
}

export interface FluidTankHandle extends MachineHandle {
    state: FluidTankSummary | null;
    amount: number | null | undefined;
}

export interface ExpandoBoxHandle extends MachineHandle {
    state: ExpandoBoxSummary | null;
    item: number | null | undefined;
    count: number | null | undefined;
}

export interface CargoEjectorHandle extends MachineHandle {
    state: CargoEjectorSummary | null;
    progress: number | null | undefined;
    active: boolean | null | undefined;

    setDirection(direction: FixedAngleDirection): DredlessClient;

    copy(direction?: FixedAngleDirection): DredlessClient;

    paste(direction?: FixedAngleDirection): DredlessClient;
}

export interface ShipHandle {
    entity: number;
    name: string | null;
    hexCode: string | null;
    distance: number | null;
    worldId: number | null;
    hasWorldData: boolean;

    world(): WorldDomain | null;

    snapshot(): ShipReadSummary;
}

export interface ClientSnapshot {
    baseUrl: string | null;
    session: SessionSnapshot | Session | null;
    connection: ConnectionSnapshot | null;
    attachMode: WebSocketAttachMode | null;
    serverId: number | null;
    server: Server | null;
    netPort: number | null;
    sid: number | null;
    ready: boolean;
    connected: boolean;
    lastDisconnect: DisconnectInfo | null;
    currentWorldId: number | null;
    worlds: WorldSnapshot[];
    cpuLoad: number | null;
    inventory: InventoryState;
    puiPanels: PuiEvent[];
    commsPanels: CommsEvent[];
    currentCommsPanel: CommsEvent | null;
    warnings: unknown[];
    effects: unknown[];
    chat: unknown[];
    motd: unknown[];
    sessionMessages: unknown[];
    scannerResults: ScannerResult[];
    lastScannerResult: ScannerResult | null;
    shipConfig: ShipConfig | null;
    captainSubrank: CaptainSubrank | null;
    playerList: ShipPlayerList | null;
    crewLog: CrewLog | null;
    outfits: { sid: number; outfit: unknown }[];
    commandAcks: CommandAck[];
    lastCommandAck: CommandAck | null;
    decodeErrors: unknown[];
    packetCount: number;
    lastPacket: unknown;
}

export interface CommandAck {
    world: number;
    commandNumber: number;
}

export interface ScannerResult {
    kind: "manifest" | "bom" | "unknown";
    sid: number | null;
    shipHex: string | null;
    shipName: string | null;
    blocks: Record<string, number> | null;
    objects: Record<string, number> | null;
    inventories: Record<string, number> | null;
    materials: Record<string, number> | null;
}

export interface NavigationUnitConfig {
    destination?: number;
    page?: number;
    warp?: boolean | "start" | "idle" | "cancel";
    autoWarpOnShieldFailure?: boolean;
    autoWarpOnNoCaptains?: boolean;
}

export const WrenchMode: {
    readonly DropAllItems: "drop-all-items";
    readonly GrabPrimaryItems: "grab-primary-items";
    readonly GrabAllItems: "grab-all-items";
};
export type WrenchMode = typeof WrenchMode[keyof typeof WrenchMode];
export const TurretMode: {
    readonly ContinuousFire: "continuous-fire";
    readonly VolleyFire: "volley-fire";
};
export type TurretMode = typeof TurretMode[keyof typeof TurretMode];

export interface InputSettings {
    wrenchMode?: WrenchMode;
    turretMode?: TurretMode;
    viewWidth?: number;
    viewHeight?: number;
    screenWidth?: number;
    screenHeight?: number;
}

export interface CurrentInputSettings {
    wrenchMode: WrenchMode | null;
    turretMode: TurretMode | null;
    viewWidth: number | null;
    viewHeight: number | null;
    screenWidth: number | null;
    screenHeight: number | null;
}

export interface InventorySlotSnapshot {
    index: number;
    itemId: number | null;
    itemName: string | null;
    count: number;
    kind: "hotbar" | "equipment";
    equipmentSlot: "head" | "face" | "body" | "back" | "hands" | "feet" | null;
    empty: boolean;
}

export interface InventoryState {
    type: "inventory";
    filter?: number;
    hotbarSize: number;
    slots: InventorySlotSnapshot[];
    hotbar: InventorySlotSnapshot[];
    equipment: {
        head: InventorySlotSnapshot;
        face: InventorySlotSnapshot;
        body: InventorySlotSnapshot;
        back: InventorySlotSnapshot;
        hands: InventorySlotSnapshot;
        feet: InventorySlotSnapshot;
    };
}

export interface PuiEvent {
    type: "pui";
    filter?: number;
    ent_id?: number;
    update?: boolean;
    data?: unknown;
    world?: number | null;
}

export interface CargoEjectorSummary {
    entity: number;
    typeId: number;
    typeName: string | null;
    progress: number | null;
    active: boolean | null;
}

export interface EntityContentsSummary {
    combatBeams?: CombatBeamsSummary;
    projectile?: ProjectileSummary;
    rcd?: RcdSummary;
    ball?: BallSummary;
    recycler?: RecyclerSummary;
    itemHolder?: ItemHolderSummary;
    expandoBox?: ExpandoBoxSummary;
    hoverOutline?: HoverOutlineSummary;
    mapMarker?: MapMarkerSummary;
    dockingSpring?: DockingSpringSummary;
    hugeThruster?: HugeThrusterSummary;
    blueprintPreview?: BlueprintPreviewSummary;
    itemCrate?: ItemCrateSummary;
    health?: HealthSummary;
    bot?: BotSummary;
    fabricator?: FabricatorSummary;
    cargoEjector?: CargoEjectorSummary;
    cannon?: CannonSummary;
    thruster?: ThrusterSummary;
    pusher?: PusherSummary;
    pusherBeam?: PusherBeamSummary;
    launcher?: LauncherSummary;
    loader?: LoaderSummary;
    cargoHatch?: CargoHatchSummary;
    navigationUnit?: NavigationUnitSummary;
    commsStation?: CommsStationSummary;
    fluidTank?: FluidTankSummary;
    shieldGenerator?: ShieldGeneratorSummary;
    shieldProjector?: ShieldProjectorSummary;
    helm?: HelmSummary;
    player?: PlayerSummary;
    shipControl?: ShipControlSummary;
    sign?: SignSummary;
    spawnPoint?: SpawnPointSummary;
    door?: DoorSummary;
    shipSize?: ShipSizeSummary;
}

export interface EntitySummary {
    entity: number;
    category: "placed_entity" | "loose_item" | "untyped_holder" | "metadata" | "player" | "ship_control" | "blueprint_preview" | "projectile" | "ball" | "rcd" | "entity";
    typeId: number | null;
    typeName: string | null;
    markerTypeId: number | null;
    markerTypeName: string | null;
    label: string;
    kind: string[];
    transform: TransformSummary | null;
    footprint: {
        width: number;
        height: number;
        source: "type" | "marker" | "heuristic" | "default" | "crate" | "huge_thruster" | "hover_outline"
    };
    type: EntityPublicType | string;
    features: string[];
    occupies: { x: number; y: number }[];
    tables: { tableId: number; name: string | null; record: ModelRecord }[];
}

export interface EntityDebugSummary extends Omit<EntitySummary, "type" | "features"> {
    contents: EntityContentsSummary | null;
}

export interface BlockSummary {
    x: number;
    y: number;
    entities: EntityDebugSummary[];
}

export interface WorldHistoryLimits {
    /** Retained entries in `WorldState.events`. Default 200. */
    eventHistory?: number;
    /** Retained entries in `WorldState.modelPackets`. Default 100. */
    modelPacketHistory?: number;
    /** Retained entries in `WorldState.chunks`. Default 64. */
    chunkHistory?: number;
}

export class WorldStore {
    constructor(limits?: WorldHistoryLimits);

    currentWorldId: number | null;
    worlds: Map<number, WorldState>;
    historyLimits: Required<WorldHistoryLimits>;

    get(id: number): WorldState;

    apply(packet: unknown): WorldUpdate | null;

    snapshot(options?: { includeTiles?: boolean; includeModel?: boolean; includeBlocks?: boolean }): WorldSnapshot[];

    ids(): number[];

    overworld(): WorldState | null;

    shipWorld(): WorldState | null;

    currentShipEntity(): EntityDebugSummary | null;
}

export class WorldState {
    constructor(id: number, limits?: WorldHistoryLimits);

    historyLimits: Required<WorldHistoryLimits>;
    /** Chunks applied over the connection's lifetime, independent of retention. */
    totalChunkCount: number;
    /** Events recorded over the connection's lifetime, independent of retention. */
    totalEventCount: number;
    id: number;
    seed: number | null;
    isOverworld: boolean | null;
    tileset: Tileset | null;
    blockWidth: number | null;
    blockHeight: number | null;
    parentWorld: number | null;
    parentEntity: number | null;
    tiles: Map<string, Tile>;
    chunks: unknown[];
    events: unknown[];
    modelPackets: unknown[];
    commsBubbles: CommsBubbleSummary[];
    model: ModelState;
    lastChunkPatch: unknown;
    lastPacket: unknown;
    meta: unknown;

    readMeta(packet: unknown): void;

    addCommsBubble(packet: unknown): CommsBubbleSummary;

    decodeEncrypted(data: Uint8Array | ArrayBuffer | number[]): unknown;

    applyTile(value: unknown): Tile | null;

    applyChunk(value: unknown): Tile[] | null;

    setTile(tile: Tile): Tile;

    normalizeTile(tile: Tile): Tile;

    materials(): MaterialSummary[];

    snapshot(options?: { includeTiles?: boolean; includeModel?: boolean; includeBlocks?: boolean }): WorldSnapshot;

    table(id: number): Map<number, ModelRecord>;

    record(tableId: number, entityId: number): ModelRecord | null;

    tileDefinition(material: number): TileDefinition | null;

    entity(entityId: number): EntityDebugSummary | null;

    entities(): EntityDebugSummary[];

    blocks(): BlockSummary[];

    /** O(1) lookup of the block at a coordinate. */
    blockAt(x: number, y: number): BlockSummary | null;
}

export interface Tile {
    x: number;
    y: number;
    material: number;
    materialName?: string | null;
    shape: number;
    shapeName?: string | null;
    hp: number;
    /** @deprecated Use hp. This is the raw 0-255 HP fraction byte, not absolute integrity. */
    integrity: number;
    color: number | null;
    solid?: boolean | null;
    maxHp?: number | null;
    hpRatio?: number | null;
    hpValue?: number | null;
}

export interface MaterialSummary {
    material: number;
    name: string | null;
    count: number;
    solid: boolean | null;
    hp: number | null;
}

export interface TilePhysics {
    filter?: {
        categoryBits: number;
        maskBits: number;
        groupIndex: number;
    };
    transparent?: boolean;
    walkway?: boolean;
    restitution?: number;
    friction?: number;
}

export interface TileDefinition {
    name?: string;
    solid: boolean;
    destruct_item?: number;
    blocks_bullets?: boolean;
    hp?: number;
    no_build_surface?: boolean;
    physics?: TilePhysics;
}

export interface Tileset {
    scale: number;
    atlas: string;
    tile_width: number;
    tiles: TileDefinition[];
}

export interface WorldSnapshot {
    id: number;
    is_overworld: boolean | null;
    overworldZone: OverworldZoneSummary | null;
    shipMetadata: ShipWorldMetadataSummary | null;
    tileset: Tileset | null;
    seed: number | null;
    block_w: number | null;
    block_h: number | null;
    parent_world: number | null;
    parent_ent: number | null;
    tileCount: number;
    chunkCount: number;
    lastChunkPatch: unknown;
    lastPacket: unknown;
    meta: unknown;
    materials: MaterialSummary[];
    model: ModelSnapshot;
    entities: EntityDebugSummary[];
    /** Present only when the snapshot was taken with `includeBlocks`. */
    blocks?: BlockSummary[];
    transforms: TransformSummary[];
    machines: MachineSummary;
    players: PlayerSummary[];
    projectiles: ProjectileSummary[];
    bots: BotSummary[];
    rcds: RcdSummary[];
    balls: BallSummary[];
    recyclers: RecyclerSummary[];
    shipControls: ShipControlSummary[];
    commsBubbles: CommsBubbleSummary[];
    tiles?: Tile[];
}

export interface OverworldZoneSummary {
    id: number;
    baseId: number;
    layer: number;
    key: string;
    name: string;
    tiered: boolean;
    displayName: string;
}

export interface ShipWorldMetadataSummary {
    name: string | null;
    color: number | null;
    colorCss: string | null;
    width: number | null;
    height: number | null;
    lockdownTimerSeconds: number | null;
    lockdownCountdownSeconds: number | null;
    onlineShipOwnerCount: number | null;
    requiredShipOwnerCount: number | null;
    allShipOwnersOnline: boolean | null;
    lockdownEngaged: boolean | null;
    lockdownState: ModelRecord;
    shipState: ModelRecord;
}

export interface WorldUpdate {
    type: string;
    world: WorldState | null;
    packet?: unknown;
    bubble?: CommsBubbleSummary;
    decoded?: unknown;
    updates?: unknown[];
    result?: unknown;
}

export interface CommsBubbleSummary {
    sequence: number;
    worldId: number;
    entity: number | null;
    modelId: number | null;
    message: string;
    color: number | null;
    colorCss: string | null;
    durationSeconds: number | null;
    raw: unknown;
}

export class ModelState {
    /** Local entity identified by the decrypted camera-focus message, when known. */
    readonly localPlayerEntity: number | null;
    setLocalPlayerEntity(entity: number | null): void;
    generation: number | null;
    tables: Map<number, Map<number, ModelRecord>>;
    /** Capped at 500 retained ids; see `totalRemovedCount` for the true total. */
    removedEntities: number[];
    lastUpdate: unknown;
    /** Capped at 100 retained entries; see `totalErrorCount` for the true total. */
    errors: unknown[];
    totalRemovedCount: number;
    totalErrorCount: number;

    table(id: number): Map<number, ModelRecord>;

    record(tableId: number, entityId: number): ModelRecord | null;

    entity(entityId: number): EntityDebugSummary | null;

    entities(): EntityDebugSummary[];

    blocks(): BlockSummary[];

    /** O(1) lookup of the block at a coordinate. */
    blockAt(x: number, y: number): BlockSummary | null;

    apply(bytes: Uint8Array | ArrayBuffer | number[]): unknown;

    snapshot(options?: { includeTables?: boolean; includeBlocks?: boolean }): ModelSnapshot;

    tablesSnapshot(): unknown[];

    transforms(): TransformSummary[];

    itemHolders(): ItemHolderSummary[];

    fabricators(): FabricatorSummary[];

    players(): PlayerSummary[];

    projectiles(): ProjectileSummary[];
    bots(): BotSummary[];
    rcds(): RcdSummary[];
    balls(): BallSummary[];
    recyclers(): RecyclerSummary[];

    shipControls(): ShipControlSummary[];

    shipMetadata(): ShipWorldMetadataSummary | null;

    machines(): MachineSummary;
}

export type ModelRecord = Record<string, unknown>;

export interface ModelSnapshot {
    generation: number | null;
    tableCount: number;
    entityCount: number;
    removedEntities: number[];
    lastUpdate: unknown;
    errors: unknown[];
    entities: EntityDebugSummary[];
    /** Present only when the snapshot was taken with `includeBlocks`. */
    blocks?: BlockSummary[];
    transforms: TransformSummary[];
    players: PlayerSummary[];
    projectiles: ProjectileSummary[];
    bots: BotSummary[];
    rcds: RcdSummary[];
    balls: BallSummary[];
    recyclers: RecyclerSummary[];
    shipControls: ShipControlSummary[];
    machines: MachineSummary;
    tables: unknown[];
}

export interface TransformSummary {
    entity: number;
    x: number | null;
    y: number | null;
    rot: number | null;
    flags: unknown[];
}

export interface ItemHolderSummary {
    entity: number;
    itemId: number | null;
    itemName: string | null;
    count: number | null;
}

export interface ItemCrateSummary {
    entity: number;
    itemId: number | null;
    itemName: string | null;
    count: number | null;
    width: number | null;
    height: number | null;
    itemState: ModelRecord;
    sizeState: ModelRecord;
}

export interface ExpandoBoxSummary {
    entity: number;
    itemId: number | null;
    itemName: string | null;
    count: number | null;
    width: number | null;
    height: number | null;
    rawWidth: number | null;
    rawHeight: number | null;
    itemState: ModelRecord;
    sizeState: ModelRecord;
}

export interface HoverOutlineSummary {
    entity: number;
    width: number | null;
    height: number | null;
    rawWidth: number | null;
    rawHeight: number | null;
    state: ModelRecord;
}

export interface MapMarkerSummary {
    entity: number;
    kind: string;
    title: string | null;
    key: string | null;
    description: string | null;
    color: number | null;
    colorCss: string | null;
    accentColor: number | null;
    accentColorCss: string | null;
    width: number | null;
    height: number | null;
    labelState: ModelRecord;
    zoneState: ModelRecord;
}

export interface DockingSpringSummary {
    entity: number;
    id: number | null;
    width: number;
    height: number;
    state: ModelRecord;
}

export interface HugeThrusterSummary {
    entity: number;
    width: number;
    height: number;
    state: ModelRecord;
}

export interface ShipSizeSummary {
    entity: number;
    width: number | null;
    height: number | null;
    rawWidth: number | null;
    rawHeight: number | null;
    state: ModelRecord;
}

export interface FluidTankSummary {
    entity: number;
    amount: number | null;
    state: ModelRecord;
}

export interface HealthSummary {
    entity: number;
    hp: number | null;
    maxHp: number | null;
    ratio: number | null;
    state: ModelRecord;
}

export interface BotSummary {
    entity: number;
    className: string;
    identifier: string;
    typeA: number | null;
    typeB: number | null;
    classificationSource: "heuristic";
    health: HealthSummary;
    beams: CombatBeamsSummary | null;
    combat: BotCombatSummary | null;
}

export interface CombatBeamsSummary {
    entity: number;
    /** Three replicated beams; angles are radians, lengths are world units. */
    beams: { angle: number; length: number; active: boolean; colorRgba: number }[];
    state: ModelRecord;
}

export interface BotCombatSummary {
    /** Packed RGBA, unlike the RGB projectile and outfit colors. */
    bodyColorRgba: number;
    weaponColorRgba: number;
    /** Radians; the official -7 sentinel becomes null. */
    aimAngle: number | null;
    thrusterMask: number;
    alternateSprite: boolean;
    beamEffectEnabled: boolean;
    state: ModelRecord;
}

export interface ProjectileSummary {
    entity: number;
    /** Packed RGB trail/tint color. */
    color: number;
    colorCss: string;
    /** Selects the official bot-bullet sprite; not an ownership guarantee. */
    botStyle: boolean;
    /** Count of orbiting visual markers. No inferred damage or ammo semantics. */
    indicatorCount: number;
    spriteItemId: number | null;
    spriteItemName: string | null;
    state: ModelRecord;
}

export interface BallSummary {
    entity: number;
    health: HealthSummary | null;
    /** World units, when the size component is available. */
    radius: number | null;
    /** True for rubber, false for rock; independent of health/destructibility. */
    rubber: boolean;
    isEgg: boolean;
    state: ModelRecord;
}

export interface RcdSummary {
    entity: number;
    variant: "sandbox" | "flux";
    /** Official renderer selects sandbox for zero and flux otherwise. */
    variantCode: number;
    itemId: 121 | 122;
    storedItemId: number | null;
    storedItemName: string | null;
    storedItemCount: number | null;
    /** Vector from the RCD in world axes, in world units. */
    beam: { offsetX: number; offsetY: number; active: boolean };
    state: ModelRecord;
}

export interface RecyclerSummary {
    entity: number;
    storedItemId: number | null;
    storedItemName: string | null;
    storedItemCount: number | null;
}

export interface FabricatorSummary {
    entity: number;
    type: FabricatorType | null;
    typeIndex: number | null;
    state: ModelRecord;
    rows: { itemId: number | null; itemName: string | null; count: number | null }[];
    progress: number | null;
    progressRaw: number | null;
    active: boolean;
    craftingItemId: number | null;
    craftingItemName: string | null;
    craftingCount: number | null;
}

export interface CannonSummary {
    entity: number;
    typeId: number;
    typeName: string | null;
    ammoItemId: number | null;
    ammoName: string | null;
    ammoCount: number;
    /** Barrel angle relative to its mount, in radians. */
    relativeAngleRadians: number | null;
    /** Barrel direction in ship coordinates, normalized to [0, 2π); null if aim or mounting rotation is unavailable. */
    absoluteAngleRadians: number | null;
    recoil: number | null;
    recoil2: number | null;
    recoils: [number | null, number | null];
    /** Official indicator scalar (wire value / 50); defaults to 0. Not a resource count or readiness flag. */
    indicatorValue: number;
    indicatorVisible: boolean;
    /** Packed RGB; null when hidden. Red is the first phase of a blinking indicator. */
    indicatorColor: number | null;
    indicatorBlinking: boolean;
    /** Alternate packed RGB color for blinking; otherwise null. */
    indicatorBlinkColor: number | null;
    spin: number | null;
    /** Burst charges on burst cannons, cooling cells on machine cannons; defaults to 0. */
    resourceCount: number;
    state: ModelRecord;
}

export interface ThrusterSummary {
    entity: number;
    typeId: number;
    typeName: string | null;
    facing: number;
    facingName: "bottom" | "top" | "right" | "left" | "bottom-right" | "bottom-left" | "top-right" | "top-left" | null;
    fuel: number | null;
    state: ModelRecord;
}

export interface LoaderSummary {
    entity: number;
    pick: number | null;
    pickName: string | null;
    place: number | null;
    placeName: string | null;
    priority: number | null;
    priorityName: string | null;
    requireOutput: boolean | null;
    waitForStack: boolean | null;
    stack: number | null;
    cycle: number | null;
    filterMode: number | null;
    filterModeName: string | null;
    filterSlots: (number | null)[] | null;
    heldItemId: number | null;
    heldItemName: string | null;
    heldCount: number | null;
    active: boolean;
    progress: number | null;
    state: ModelRecord;
    filterState: ModelRecord;
    filterSlotsState: ModelRecord;
}

export interface CargoHatchSummary {
    entity: number;
    typeId: number;
    typeName: string | null;
    filterMode: number;
    filterModeName: string | null;
    filterSlots: (number | null)[] | null;
    openFraction: number | null;
    filterState: ModelRecord;
    filterSlotsState: ModelRecord;
}

export interface LauncherSummary {
    entity: number;
    angleRaw: number | null;
    angleRadians: number | null;
    angleDegrees: number | null;
    state: ModelRecord;
}

export interface NavigationUnitSummary {
    entity: number;
    destination: number;
    destinationName: string | null;
    autoWarpOnShieldFailure: boolean | null;
    autoWarpOnNoCaptains: boolean | null;
    state: ModelRecord;
}

export interface PusherSummary {
    entity: number;
    mode: number;
    modeName: string | null;
    filteredMode: number;
    filteredModeName: string | null;
    angle: number | null;
    speed: number;
    length: number;
    filterInventory: boolean;
    filterSlots: (number | null)[] | null;
    state: ModelRecord;
    filterSlotsState: ModelRecord;
}

export interface PusherBeamSummary {
    entity: number;
    active: boolean;
    mode: number;
    modeName: string | null;
    lengthRaw: number;
    length: number;
    state: ModelRecord;
}

export interface CommsStationSummary {
    entity: number;
    typeId: number;
    typeName: string | null;
    charges: number | null;
    maxCharges: number;
    chargeRatio: number | null;
    occupied: boolean;
    state: ModelRecord;
}

export interface SignSummary {
    entity: number;
    text: string;
    displayMode: number;
    displayModeName: string | null;
    state: ModelRecord;
}

export interface SpawnPointSummary {
    entity: number;
    rank: number;
    rankName: string | null;
    state: ModelRecord;
}

export interface DoorSummary {
    entity: number;
    rank: number;
    rankName: string | null;
    open: boolean;
    rankState: ModelRecord;
    state: ModelRecord;
}

export interface ShieldProjectorSummary {
    entity: number;
    active: boolean;
    state: ModelRecord;
}

export interface ShieldGeneratorSummary {
    entity: number;
    charge: number;
    maxCharge: number;
    chargeRatio: number | null;
    efficiencyPercent: number | null;
    efficiency: number | null;
    storedItemId: number | null;
    storedItemName: string | null;
    storedItemCount: number | null;
    hasShieldCore: boolean;
    boostState: number;
    boostStateName: string | null;
    boostTimer: number;
    boostActive: boolean;
    puzzleSeed: number | null;
    puzzleSolution: string | null;
    state: ModelRecord;
    itemState: ModelRecord;
    boostStateRaw: ModelRecord;
}

export interface GeneratorMazeCellWalls {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}

export interface GeneratorMazeCell {
    x: number;
    y: number;
    value: number;
    hex: string;
    digit: number;
    walls: GeneratorMazeCellWalls;
    backtrackDirection: number;
    marker: number;
}

export interface GeneratorMaze {
    seed: number;
    width: number;
    height: number;
    cells: GeneratorMazeCell[];
    rows: GeneratorMazeCell[][];
    solution: string;
}

export interface HelmSummary {
    entity: number;
    typeId: number;
    typeName: string | null;
    occupied: boolean;
}

export interface PlayerSummary {
    entity: number;
    name: string | null;
    heldItemId: number | null;
    heldItemName: string | null;
    /** Server-reported item mode code. */
    itemMode: number | null;
    /** Multiplier used by the official client for build reach. */
    buildMultiplier: number | null;
    /** Beam distance shared by repair tools and handheld pushers, in world units. */
    heldItemBeamDistance: number | null;
    /** Held tool angle in radians in the current world's coordinate frame. */
    heldItemAngle: number | null;
    shipRank: PlayerShipRank | null;
    patronTier: "bronze" | "silver" | "gold" | "plat" | "flux" | null;
    isDeveloper: boolean;
    isPatron: boolean;
    isLocal: boolean;
    /** Server-requested camera zoom state; does not identify the operated machine. */
    zoomedOut: boolean;
    muted: boolean;
    invisible: boolean;
    cheats: { noclip: boolean; sandboxBuild: boolean };
    /** Shared item effect flag, including active rocket/hover pack exhaust. */
    itemEffectActive: boolean;
    animation: PlayerAnimationSummary;
    appearance: PlayerAppearanceSummary | null;
    actionPreview: PlayerActionPreviewSummary | null;
    state: ModelRecord;
}

export interface PlayerAnimationSummary {
    /** Horizontal sprite mirror sign, normally -1 or 1. */
    facing: number;
    /** Server orientation code used to align the sprite and limb animation. */
    orientation: number;
    /** Selects speed-based limb swing instead of the hovering pose; not a movement detector. */
    walking: boolean;
}

export interface PlayerAppearanceStyleSummary {
    color: number;
    /** Index into the official client's style catalog; zero means no style. */
    styleId: number;
}

export interface PlayerAppearanceItemSummary {
    itemId: number;
    itemName: string | null;
}

export interface PlayerAppearanceSummary {
    /** Packed RGB colors. */
    bodyColor: number;
    legsColor: number;
    skinColor: number;
    feetColor: number;
    hair: PlayerAppearanceStyleSummary;
    hat: PlayerAppearanceStyleSummary;
    face1: PlayerAppearanceStyleSummary;
    face2: PlayerAppearanceStyleSummary;
    /** Equipped item visuals applied over the base outfit; null means no item override. */
    itemOverrides: {
        back: PlayerAppearanceItemSummary | null;
        hands: PlayerAppearanceItemSummary | null;
        feet: PlayerAppearanceItemSummary | null;
        head1: PlayerAppearanceItemSummary | null;
        head2: PlayerAppearanceItemSummary | null;
    };
    state: ModelRecord;
}

export interface PlayerActionPreviewSummary {
    entity: number;
    active: boolean;
    x: number | null;
    y: number | null;
    width: number | null;
    height: number | null;
    progress: number | null;
    color: number | null;
    colorCss: string | null;
    actionName: "place" | "break" | "blueprint" | null;
    blueprintId: number | null;
    blueprintItems: BlueprintPreviewSummary[];
    state: ModelRecord;
}

export interface BlueprintPreviewSummary {
    entity: number;
    itemId: number;
    itemName: string | null;
    bits: number;
    rawBits: number | null;
    placementOffsets: number[];
    placementCount: number;
    placements: {
        offset: number;
        x: number | null;
        y: number | null;
        itemId: number;
        itemName: string | null;
    }[];
    x: number | null;
    y: number | null;
    rot: number | null;
    state: ModelRecord;
}

export interface ShipControlSummary {
    entity: number;
    name: string | null;
    hexCode: string | null;
    shipWorldId: number | null;
    color: number | null;
    colorCss: string | null;
    thrustX: number | null;
    thrustY: number | null;
    value52: number | null;
    value84: number | null;
    value96: number | null;
    shield: ShipShieldSummary | null;
    warp: ShipWarpSummary | null;
    state: ModelRecord;
}

export interface ShipReadSummary {
    entity: number;
    name: string | null;
    hexCode: string | null;
    color: number | null;
    colorCss: string | null;
    position: { x: number | null; y: number | null; rot: number | null } | null;
    distance: number | null;
    footprint: EntitySummary["footprint"];
    label: string;
    kind: string[];
    thrust: { x: number | null; y: number | null };
    shield: ShipShieldSummary | null;
    warp: ShipWarpSummary | null;
    worldId: number | null;
    hasWorldData: boolean;
    world: WorldSnapshot | null;
    control: ShipControlSummary;
    entitySummary: EntityDebugSummary;
}

export interface ShipShieldSummary {
    maxHp: number | null;
    baseHp: number | null;
    activeTankHp: number | null;
    inactiveTankHp: number | null;
    tankValues: number[];
}

export interface ShipWarpSummary {
    active: boolean;
    ticks: number;
    elapsedSeconds: number;
    durationSeconds: number;
    remainingSeconds: number;
}

export interface MachineSummary {
    itemHolders: ItemHolderSummary[];
    health: HealthSummary[];
    fabricators: FabricatorSummary[];
    cargoEjectors: CargoEjectorSummary[];
    cannons: CannonSummary[];
    thrusters: ThrusterSummary[];
    pushers: PusherSummary[];
    pusherBeams: PusherBeamSummary[];
    launchers: LauncherSummary[];
    loaders: LoaderSummary[];
    cargoHatches: CargoHatchSummary[];
    navigationUnits: NavigationUnitSummary[];
    commsStations: CommsStationSummary[];
    fluidTanks: FluidTankSummary[];
    shieldGenerators: ShieldGeneratorSummary[];
    shieldProjectors: ShieldProjectorSummary[];
    helms: HelmSummary[];
    signs: SignSummary[];
    spawnPoints: SpawnPointSummary[];
    doors: DoorSummary[];
    expandoBoxes: ExpandoBoxSummary[];
}

export function decodeMsgpack(bytes: Uint8Array | ArrayBuffer | number[]): unknown;

export function encodeMsgpack(value: unknown): Uint8Array;

export function buildChatMessage(message?: string): ChatMessage;

export function buildCommsMessage(message?: string): CommsMessage;

export function normalizeCommsEvent(event: unknown): CommsEvent;

export function flattenRichText(value: unknown): string;

export function buildSignedCommandPacket(command: Command, sessionId: number): Uint8Array;

export function buildInventoryDragCommand(source: number, target: number, split?: boolean): InventoryDragCommand;

export function buildEquipItemCommand(source: number, slot: EquipmentSlot, split?: boolean): InventoryDragCommand;

export function buildUnequipItemCommand(slot: EquipmentSlot, target?: number, split?: boolean): InventoryDragCommand;

export function normalizeEquipmentSlot(slot: EquipmentSlot): 16 | 17 | 18 | 19 | 20 | 21;

export function equipmentSlotName(slot: number): "head" | "face" | "body" | "back" | "hands" | "feet" | null;

export function normalizeInventoryEvent(event: unknown): InventoryState;

export function buildShipManagementMessage(act: string, arg?: unknown, extra?: Record<string, unknown> | null): ShipManagementMessage;

export function buildShipPrivacyMessage(privacy: ShipPrivacy): ShipManagementMessage;

export function buildShipGravityMessage(direction: ShipGravityDirection): ShipManagementMessage;

export function buildSetPatronPerksMessage(enabled: boolean): ShipManagementMessage;

export function normalizeGravityDirection(direction: ShipGravityDirection): 0 | 1 | 2 | 3;

export function buildStarterRecoveryMessage(itemId: number): ShipManagementMessage;

export function buildPlayerListMessage(): ShipManagementMessage;

export function buildSaveShipMessage(): ShipManagementMessage;

export function buildShipRenameRequestMessage(): ShipManagementMessage;

export function buildShipRenameCommitMessage(name: string, color: string): ShipManagementMessage;

export function buildInviteResetMessage(): ShipManagementMessage;

export function buildSetPlayerRankMessage(refId: number, rank: ShipPlayerRank): ShipManagementMessage;

export function buildKickPlayerMessage(refId: number): ShipManagementMessage;

export function buildBanPlayerMessage(refId: number): ShipManagementMessage;

export function buildUnbanPlayerMessage(refId: number): ShipManagementMessage;

export function buildDemoteSelfMessage(): ShipManagementMessage;

export function normalizePrivacy(privacy: ShipPrivacy): 0 | 1;

export function normalizePlayerRank(rank: ShipPlayerRank): 0 | 1 | 3;

export function normalizeShipConfig(event: unknown): ShipConfig;

export function normalizeCaptainSubrank(event: unknown): CaptainSubrank;

export function normalizeCrewLog(event: unknown, previous?: CrewLog | null): CrewLog;

export function normalizeShipPlayerList(event: unknown, previous?: ShipPlayerList | null, currentCaptainSubrank?: CaptainSubrank | null): ShipPlayerList;

export function buildSignTextMessage(text?: string, mode?: SignDisplayMode): SignTextMessage;

export function normalizeSignDisplayMode(mode?: SignDisplayMode): 0 | 1 | 2;

export function signDisplayModeName(mode: number): SignDisplayMode | null;

export function buildNavigationUnitConfigData(entity: number, config: NavigationUnitConfig & {
    destination: number
}): Uint8Array;

export function buildNavigationUnitClipboardConfigData(config: NavigationUnitConfig & {
    destination: number
}): Uint8Array;

export function buildNavigationUnitPasteConfigData(entity: number, config: NavigationUnitConfig & {
    destination: number
}): Uint8Array;

export function buildGeneratorMazePuzzleData(entity: number, solution: string | number): Uint8Array;

export function buildCargoHatchFilterConfigData(entity: number, filterMode?: LoaderFilterMode): Uint8Array;

export function buildCargoHatchFilterItemsData(entity: number, filterSlots?: Array<number | null | undefined>): Uint8Array;

export function buildCargoHatchFullConfigData(entity: number, config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): Uint8Array;

export function buildCargoHatchCopyConfigData(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): Uint8Array;

export function buildClipboardConfigData(target: ClipboardTarget, commandName: string, values?: Iterable<number>): Uint8Array;

export function buildClipboardFixedAngleData(target: ClipboardTarget, direction: FixedAngleDirection): Uint8Array;

export function buildGeneratorClipboardDirectionData(direction: FixedAngleDirection): Uint8Array;

export function buildCargoEjectorDirectionData(entity: number, direction: FixedAngleDirection): Uint8Array;

export function buildCargoEjectorPasteConfigData(entity: number, direction: FixedAngleDirection): Uint8Array;

export function buildCargoEjectorCopyConfigData(direction: FixedAngleDirection): Uint8Array;

export function buildCargoEjectorClipboardDirectionData(direction: FixedAngleDirection): Uint8Array;

export function buildExpandoClipboardAngleData(angle: number): Uint8Array;

export function buildLoaderClipboardConfigData(config?: LoaderConfig): Uint8Array;

export function buildLoaderConfigData(entity: number, config?: LoaderConfig): Uint8Array;

export function buildLoaderCopyConfigData(config?: LoaderFullConfig): Uint8Array;

export function buildLoaderFilterConfigData(entity: number, filterMode?: LoaderFilterMode): Uint8Array;

export function buildLoaderFilterItemsData(entity: number, filterSlots?: Array<number | null | undefined>): Uint8Array;

export function buildLoaderFullConfigData(entity: number, config?: LoaderFullConfig): Uint8Array;

export function buildPusherConfigData(entity: number, config?: PusherConfig): Uint8Array;

export function buildPusherFilterItemsData(entity: number, filterSlots?: Array<number | null | undefined>): Uint8Array;

export function generateGeneratorMaze(seed: number): GeneratorMaze;

export function solveGeneratorMazeSeed(seed: number): string;

export function maybeSolveGeneratorMazeSeed(seed: number | null | undefined): string | null;

export function decryptPayload(wireBytes: Uint8Array | ArrayBuffer | number[], worldId: number, seed: number): Uint8Array;

export function decompressLz4Frame(bytes: Uint8Array | ArrayBuffer | number[]): Uint8Array;

export function decodeModelData(bytes: Uint8Array | ArrayBuffer | number[]): unknown;

export function createSession(noticeVersion?: number | null): Promise<Session>;

export function createAnonSession(anonKey?: string | null, noticeVersion?: number | null, baseUrl?: string): Promise<AnonSession>;

export function createAnonToken(noticeVersion?: number | null, baseUrl?: string): Promise<string>;

export function fetchNoticeVersion(): Promise<number>;

export function fetchGameVersion(): Promise<string>;

export function fetchServers(): Promise<Server[]>;

export function fetchServerStatus(server: ServerRef): Promise<ServerStatus>;

export function fetchServerStatuses(): Promise<(Server & ServerStatus)[]>;

export function fetchShips(session: Session, server: ServerRef): Promise<Ship[]>;

export function fetchShipList(session: Session, server: ServerRef): Promise<ShipList>;

export function joinShip(server: ServerRef, ship?: ShipRef, session?: Session | null): Promise<DredlessClient>;

export function startShip(server: ServerRef, ship?: ShipRef, session?: Session | null): Promise<DredlessClient>;

export function startNewShip(server: ServerRef, name?: string, color?: string, session?: Session | null): Promise<DredlessClient>;

export function joinInvite(server: ServerRef, code: string, session?: Session | null): Promise<DredlessClient>;

export function buildBlueprintPlacementMessage(placement: BlueprintPlacement): BlueprintPlacementMessage;

export interface DredlessNamespace {
    Session: typeof Session;
    AnonSession: typeof AnonSession;
    Connection: typeof Connection;
    DredlessClient: typeof DredlessClient;
    createSession: typeof createSession;
    createAnonSession: typeof createAnonSession;
    createAnonToken: typeof createAnonToken;
    fetchNoticeVersion: typeof fetchNoticeVersion;
    fetchGameVersion: typeof fetchGameVersion;
    fetchServers: typeof fetchServers;
    fetchServerStatus: typeof fetchServerStatus;
    fetchServerStatuses: typeof fetchServerStatuses;
    fetchShips: typeof fetchShips;
    fetchShipList: typeof fetchShipList;
    joinShip: typeof joinShip;
    startShip: typeof startShip;
    startNewShip: typeof startNewShip;
    joinInvite: typeof joinInvite;
}
export const Dredless: DredlessNamespace;
export default Dredless;
