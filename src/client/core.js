import {INITIAL_OUTFIT_MESSAGE, JOIN_USER_AGENT, KEEPALIVE_INTERVAL_MS, KEEPALIVE_MESSAGE} from "../constants.js";
import {getWebSocket, isNode} from "../runtime.js";
import {EventBus} from "../events.js";
import {cookieHeader} from "../network/cookies.js";
import {fetchServers} from "../network/servers.js";
import {Connection} from "../network/connection.js";
import {itemEquipmentSlotFromId} from "../state/items.js";
import {WorldStore} from "../state/world/index.js";
import {buildBlueprintPlacementMessage} from "../protocol/outbound/blueprint.js";
import {buildChatMessage} from "../protocol/outbound/chat.js";
import {buildCommsMessage, normalizeCommsEvent} from "../protocol/outbound/comms.js";
import {buildSignedCommandPacket} from "../protocol/outbound/commands.js";
import {buildInventoryDragCommand, normalizeEquipmentSlot, normalizeInventoryEvent} from "../protocol/outbound/inventory.js";
import {
    buildBanPlayerMessage,
    buildDemoteSelfMessage,
    buildInviteResetMessage,
    buildKickPlayerMessage,
    buildPlayerListMessage,
    buildSetPlayerRankMessage,
    buildShipManagementMessage,
    buildShipPrivacyMessage,
    buildStarterRecoveryMessage,
    normalizeCaptainSubrank,
    normalizeShipConfig,
    normalizeShipPlayerList
} from "../protocol/outbound/ship-management.js";
import {buildSignTextMessage} from "../protocol/outbound/sign.js";
import {
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
} from "../protocol/outbound/ui-config.js";
import {cloneCommand, encodeMsgpack} from "../protocol/codec/msgpack.js";
import {decodeIncomingFrame} from "../protocol/inbound/frame.js";
import {
    ClientNetDomain,
    ClientDebugDomain,
    PlayerDomain,
    ShipManagementDomain,
    InventoryDomain,
    WorldDomain,
    ShipDomain,
    OverworldDomain,
    EntityHandle,
    WrenchMode,
    TurretMode,
    normalizeAttachMode,
    normalizeScannerResultPacket,
    normalizeShipReadOptions,
    shipReadSummary,
    currentPlayerSummary,
    summariesFor,
    emptyMachineSummary,
    normalizeDegrees,
    normalizeLauncherPower,
    normalizeWrenchMode,
    normalizeTurretMode,
    normalizePositiveFinite,
    normalizePositiveInteger
} from "./domains/index.js";

export {WrenchMode, TurretMode} from "./domains/index.js";

// Defaults for retained history. Every one of these buffers was previously
// unbounded; the surrounding buffers (chat, warnings, scanner results) already
// capped at 200, so these match that convention.
const DEFAULT_PACKET_HISTORY = 200;
const DEFAULT_EVENT_HISTORY = 200;
const DEFAULT_MODEL_PACKET_HISTORY = 100;
const DEFAULT_CHUNK_HISTORY = 64;

function normalizeHistoryLimit(value, fallback) {
    if (value === Infinity) return Infinity;
    const limit = Number(value);
    if (!Number.isFinite(limit) || limit < 0) return fallback;
    return Math.floor(limit);
}

export class DredlessClient extends EventBus {
    constructor(connection, {
        connect = true,
        attach = false,
        mode = null,
        baseUrl = null,
        session = null,
        serverId = null,
        server = null,
        netPort = null,
        gameToken = "",
        packetHistory = DEFAULT_PACKET_HISTORY,
        eventHistory = DEFAULT_EVENT_HISTORY,
        modelPacketHistory = DEFAULT_MODEL_PACKET_HISTORY,
        chunkHistory = DEFAULT_CHUNK_HISTORY
    } = {}) {
        super();
        const attachMode = attach ? normalizeAttachMode(mode) : null;
        if (!(connection instanceof Connection) && !attachMode) throw new Error("DredlessClient requires a Connection");

        this.connection = connection || null;
        this.session = connection?.session ?? session ?? null;
        this.baseUrl = connection?.baseUrl ?? baseUrl ?? this.session?.baseUrl ?? null;
        this.serverId = connection?.serverId ?? serverId ?? server?.index ?? null;
        this.server = connection?.server ?? server ?? null;
        this.netPort = connection?.netPort ?? netPort ?? null;
        this.gameToken = connection?.gameToken ?? gameToken ?? "";
        this.ws = null;
        this.sid = null;
        this.connected = false;
        this.ready = false;
        this.packetCount = 0;
        this.lastPacket = null;
        this.packets = [];
        // Retained history is bounded by default: these arrays previously grew for
        // the lifetime of the client, holding every decoded packet and its binary
        // payloads. Pass 0 to disable a buffer or Infinity to restore unbounded
        // capture behaviour.
        this.packetHistory = normalizeHistoryLimit(packetHistory, DEFAULT_PACKET_HISTORY);
        this.worlds = new WorldStore({eventHistory, modelPacketHistory, chunkHistory});
        this.net = new ClientNetDomain(this);
        this.debug = new ClientDebugDomain(this);
        this.player = new PlayerDomain(this);
        this.inventory = new InventoryDomain(this);
        this.management = new ShipManagementDomain(this);
        this.cpuLoad = null;
        this.inventoryState = null;
        this.puiPanels = new Map();
        this.commsPanels = new Map();
        this.currentCommsPanel = null;
        this.warnings = [];
        this.effects = [];
        this.chat = [];
        this.motd = [];
        this.sessionMessages = [];
        this.scannerResults = [];
        this.lastScannerResult = null;
        this.shipConfig = null;
        this.captainSubrank = null;
        this.playerList = null;
        this.outfits = new Map();
        this.commandAcks = new Map();
        this.lastCommandAck = null;
        this.decodeErrors = [];
        this.readyPromise = new Promise((resolve, reject) => {
            this.#resolveReady = resolve;
            this.#rejectReady = reject;
        });

        this.attachMode = attachMode;
        this.attached = Boolean(attachMode);
        if (connect) this.#connect().catch((error) => this.#fail(error));
    }

    static attachWebSocket(websocket, options = {}) {
        if (!websocket) throw new Error("DredlessClient.attachWebSocket requires a websocket");
        const mode = normalizeAttachMode(options.mode);
        const client = new DredlessClient(null, {...options, attach: true, connect: false, mode});
        client.#attachSocket(websocket, {...options, mode});
        return client;
    }

    #commandNumber = 1;
    #queuedCommands = [];
    #queuedMessages = [];
    #keepalive = null;
    #bootstrapped = false;
    #ownsSocket = true;
    #allowWrites = true;
    #attachedOpened = false;
    #resolveReady = null;
    #rejectReady = null;
    #inputSettings = {
        wrench_mode: 1,
        turret_mode: 0
    };

    whenReady() {
        return this.readyPromise;
    }

    send(command = {}) {
        this.#assertWritable();
        const normalized = cloneCommand({...this.#inputSettings, ...command});
        if (normalized.n == null) normalized.n = this.#commandNumber++;
        if (!this.sid) {
            this.#queuedCommands.push(normalized);
            return this;
        }
        this.ws.send(buildSignedCommandPacket(normalized, this.sid));
        this.emit("command", normalized);
        return this;
    }

    sendMessage(message, {afterReady = true} = {}) {
        this.#assertWritable();
        if (!this.connected || (afterReady && !this.ready)) {
            this.#queuedMessages.push({message, afterReady});
            return this;
        }
        this.ws.send(encodeMsgpack(message));
        this.emit("message", message);
        return this;
    }

    sendRaw(message, options = {}) {
        return this.sendMessage(message, options);
    }

    sendBlueprintPlacement(placement) {
        return this.sendMessage(buildBlueprintPlacementMessage(placement));
    }

    setOutfit(outfit) {
        return this.sendMessage({type: 7, outfit});
    }

    sendShipManagement(act, arg = null) {
        return this.sendMessage(buildShipManagementMessage(act, arg));
    }

    requestPlayerList() {
        return this.sendMessage(buildPlayerListMessage());
    }

    resetInvite() {
        return this.sendMessage(buildInviteResetMessage());
    }

    setShipPrivacy(privacy) {
        return this.sendMessage(buildShipPrivacyMessage(privacy));
    }

    recoverStarterItem(itemId) {
        return this.sendMessage(buildStarterRecoveryMessage(itemId));
    }

    setPlayerRank(refId, rank) {
        return this.sendMessage(buildSetPlayerRankMessage(refId, rank));
    }

    promotePlayerToCaptain(refId) {
        return this.setPlayerRank(refId, "captain");
    }

    demotePlayerToCrew(refId) {
        return this.setPlayerRank(refId, "crew");
    }

    demotePlayerToGuest(refId) {
        return this.setPlayerRank(refId, "guest");
    }

    kickPlayer(refId) {
        return this.sendMessage(buildKickPlayerMessage(refId));
    }

    banPlayer(refId) {
        return this.sendMessage(buildBanPlayerMessage(refId));
    }

    demoteSelf() {
        return this.sendMessage(buildDemoteSelfMessage());
    }

    sendEntityCommand(cmd, args = [-1, -1, -1]) {
        return this.sendMessage({type: 5, cmd, args});
    }

    sendChatMessage(message = "") {
        return this.sendMessage(buildChatMessage(message));
    }

    sendCommsMessage(message = "") {
        return this.sendMessage(buildCommsMessage(message));
    }

    sendFabricatorMessage(cmd, args = [-1, -1, -1]) {
        return this.sendEntityCommand(cmd, args);
    }

    sendFabricatorCommand(itemId, count = 1, index = -1) {
        return this.craftAdd(itemId, count, index);
    }

    craftAdd(itemId, count = 1, index = -1) {
        return this.sendFabricatorMessage("craft_add", [itemId, count, index]);
    }

    craftSub(itemId, count = 1, index = 0) {
        return this.sendFabricatorMessage("craft_sub", [itemId, count, index]);
    }

    craftClearQueue() {
        return this.sendFabricatorMessage("clear_queue");
    }

    craftToggleRepeat() {
        return this.sendFabricatorMessage("toggle_repeat");
    }

    fabricatorLockResource(row) {
        return this.sendFabricatorMessage("lock", [row, -1, -1]);
    }

    fabricatorUnlockResource(row) {
        return this.sendFabricatorMessage("unlock", [row, -1, -1]);
    }

    fabricatorEject(row) {
        return this.sendFabricatorMessage("eject", [row, -1, -1]);
    }

    setLauncherAngle(angle) {
        return this.sendEntityCommand("angle", [normalizeDegrees(angle)]);
    }

    setLauncherPower(power) {
        return this.sendEntityCommand("power", [normalizeLauncherPower(power)]);
    }

    setSignText(text = "", mode = 0) {
        return this.sendMessage(buildSignTextMessage(text, mode));
    }

    sendUiConfig(data) {
        return this.sendMessage({type: 8, data});
    }

    solveGeneratorPuzzle(entity, solution) {
        return this.sendUiConfig(buildGeneratorMazePuzzleData(entity, solution));
    }

    sendPusherConfig(entity, config = {}) {
        return this.sendUiConfig(buildPusherConfigData(entity, this.#pusherConfigDefaults(entity, config)));
    }

    setPusherAngle(entity, angle, config = {}) {
        return this.sendPusherConfig(entity, {...config, angle});
    }

    setPusherSpeed(entity, speed, config = {}) {
        return this.sendPusherConfig(entity, {...config, speed});
    }

    setPusherLength(entity, length, config = {}) {
        return this.sendPusherConfig(entity, {...config, length});
    }

    setPusherMode(entity, mode, config = {}) {
        return this.sendPusherConfig(entity, {...config, mode});
    }

    setPusherFilteredMode(entity, filteredMode, config = {}) {
        return this.sendPusherConfig(entity, {...config, filteredMode});
    }

    setPusherFilterInventory(entity, filterInventory, config = {}) {
        return this.sendPusherConfig(entity, {...config, filterInventory});
    }

    setPusherFilterItems(entity, filterSlots = []) {
        return this.sendUiConfig(buildPusherFilterItemsData(entity, filterSlots));
    }

    sendLoaderConfig(entity, config = {}) {
        return this.sendUiConfig(buildLoaderConfigData(entity, this.#loaderConfigDefaults(entity, config)));
    }

    sendLoaderFullConfig(entity, config = {}) {
        return this.sendUiConfig(buildLoaderFullConfigData(entity, this.#loaderFullConfigDefaults(entity, config)));
    }

    copyLoaderConfig(entity, config = {}) {
        return this.sendUiConfig(buildLoaderCopyConfigData(this.#loaderFullConfigDefaults(entity, config)));
    }

    sendLoaderClipboardConfig(config = {}) {
        return this.sendUiConfig(buildLoaderClipboardConfigData(config));
    }

    sendClipboardConfig(target, commandName, values = []) {
        return this.sendUiConfig(buildClipboardConfigData(target, commandName, values));
    }

    setClipboardFixedAngle(target, direction) {
        return this.sendUiConfig(buildClipboardFixedAngleData(target, direction));
    }

    setGeneratorClipboardDirection(direction) {
        return this.sendUiConfig(buildGeneratorClipboardDirectionData(direction));
    }

    setExpandoClipboardAngle(angle) {
        return this.sendUiConfig(buildExpandoClipboardAngleData(angle));
    }

    setCargoEjectorDirection(entity, direction) {
        return this.sendUiConfig(buildCargoEjectorDirectionData(entity, direction));
    }

    pasteCargoEjectorConfig(entity, direction = "right") {
        return this.sendUiConfig(buildCargoEjectorPasteConfigData(entity, direction));
    }

    copyCargoEjectorConfig(entity, direction = "right") {
        return this.sendUiConfig(buildCargoEjectorCopyConfigData(direction));
    }

    setCargoEjectorClipboardDirection(direction) {
        return this.sendUiConfig(buildCargoEjectorClipboardDirectionData(direction));
    }

    setLoaderPickPlace(entity, pick, place, config = {}) {
        return this.sendLoaderConfig(entity, {...config, pick, place});
    }

    setLoaderPriority(entity, priority, config = {}) {
        return this.sendLoaderConfig(entity, {...config, priority});
    }

    setLoaderStack(entity, stack, config = {}) {
        return this.sendLoaderConfig(entity, {...config, stack});
    }

    setLoaderCycle(entity, cycle, config = {}) {
        return this.sendLoaderConfig(entity, {...config, cycle});
    }

    setLoaderRequireOutput(entity, requireOutput, config = {}) {
        return this.sendLoaderConfig(entity, {...config, requireOutput});
    }

    setLoaderWaitForStack(entity, waitForStack, config = {}) {
        return this.sendLoaderConfig(entity, {...config, waitForStack});
    }

    setLoaderFilterMode(entity, filterMode) {
        return this.sendUiConfig(buildLoaderFilterConfigData(entity, filterMode));
    }

    setLoaderFilterItems(entity, filterSlots = []) {
        return this.sendUiConfig(buildLoaderFilterItemsData(entity, filterSlots));
    }

    setCargoHatchFilterMode(entity, filterMode) {
        return this.sendUiConfig(buildCargoHatchFilterConfigData(entity, filterMode));
    }

    setCargoHatchFilterItems(entity, filterSlots = []) {
        return this.sendUiConfig(buildCargoHatchFilterItemsData(entity, filterSlots));
    }

    sendCargoHatchFullConfig(entity, config = {}) {
        return this.sendUiConfig(buildCargoHatchFullConfigData(entity, this.#cargoHatchConfigDefaults(entity, config)));
    }

    pasteCargoHatchConfig(entity, config = {}) {
        return this.sendCargoHatchFullConfig(entity, config);
    }

    copyCargoHatchConfig(entity, config = {}) {
        return this.sendUiConfig(buildCargoHatchCopyConfigData(this.#cargoHatchConfigDefaults(entity, config)));
    }

    inputSettings() {
        return {
            wrenchMode: wrenchModeName(this.#inputSettings.wrench_mode),
            turretMode: turretModeName(this.#inputSettings.turret_mode),
            viewWidth: this.#inputSettings.vx ?? null,
            viewHeight: this.#inputSettings.vy ?? null,
            screenWidth: this.#inputSettings.scr_w ?? null,
            screenHeight: this.#inputSettings.scr_h ?? null
        };
    }

    setInputSettings(settings = {}, {send = true} = {}) {
        const wrench = settings.wrenchMode;
        const turret = settings.turretMode;
        const viewWidth = settings.viewWidth;
        const viewHeight = settings.viewHeight;
        const screenWidth = settings.screenWidth;
        const screenHeight = settings.screenHeight;
        if (wrench != null) this.#inputSettings.wrench_mode = normalizeWrenchMode(wrench);
        if (turret != null) this.#inputSettings.turret_mode = normalizeTurretMode(turret);
        if (viewWidth != null) this.#inputSettings.vx = normalizePositiveFinite(viewWidth, "viewWidth");
        if (viewHeight != null) this.#inputSettings.vy = normalizePositiveFinite(viewHeight, "viewHeight");
        if (screenWidth != null) this.#inputSettings.scr_w = normalizePositiveInteger(screenWidth, "screenWidth");
        if (screenHeight != null) this.#inputSettings.scr_h = normalizePositiveInteger(screenHeight, "screenHeight");
        return send ? this.send({}) : this;
    }

    setView(width, height, options = {}) {
        return this.setInputSettings({viewWidth: width, viewHeight: height}, options);
    }

    setScreenSize(width, height, options = {}) {
        return this.setInputSettings({screenWidth: width, screenHeight: height}, options);
    }

    setWrenchMode(mode, options = {}) {
        return this.setInputSettings({wrenchMode: mode}, options);
    }

    setWrenchAction(mode, options = {}) {
        return this.setWrenchMode(mode, options);
    }

    setTurretMode(mode, options = {}) {
        return this.setInputSettings({turretMode: mode}, options);
    }

    sendNavigationUnitConfig(entity, config = {}) {
        return this.sendUiConfig(buildNavigationUnitConfigData(entity, this.#navigationUnitConfigDefaults(entity, config)));
    }

    copyNavigationUnitConfig(entity, config = {}) {
        return this.sendUiConfig(buildNavigationUnitClipboardConfigData(this.#navigationUnitConfigDefaults(entity, config)));
    }

    pasteNavigationUnitConfig(entity, config = {}) {
        return this.sendUiConfig(buildNavigationUnitPasteConfigData(entity, this.#navigationUnitConfigDefaults(entity, config)));
    }

    setNavigationDestination(entity, destination, config = {}) {
        return this.sendNavigationUnitConfig(entity, {...config, destination});
    }

    setNavigationAutoWarp(entity, config = {}) {
        return this.sendNavigationUnitConfig(entity, {page: 1, ...config});
    }

    startWarp(entity, config = {}) {
        return this.sendNavigationUnitConfig(entity, {page: 1, ...config, warp: "start"});
    }

    cancelWarp(entity, config = {}) {
        return this.sendNavigationUnitConfig(entity, {page: 1, ...config, warp: "cancel"});
    }

    move(x = 0, y = 0, command = {}) {
        return this.send({...command, x, y});
    }

    aim(mx = 0, my = 0, command = {}) {
        return this.send({...command, mx, my});
    }

    action(flags = {}, command = {}) {
        return this.send({...command, ...flags});
    }

    useEntity(entity, {invSlot = 0, hold = true} = {}, command = {}) {
        return this.send({
            ...command,
            focus_ent: entity,
            inv_slot: invSlot,
            act1: true,
            act1_held: Boolean(hold)
        });
    }

    useHeldItem({invSlot = 0, hold = true} = {}, command = {}) {
        return this.send({
            ...command,
            focus_ent: null,
            inv_slot: invSlot,
            act1: true,
            act1_held: Boolean(hold)
        });
    }

    placeHeldItem(options = {}, command = {}) {
        return this.useHeldItem(options, command);
    }

    placeBlueprint(placement, {invSlot = 0, hold = true, mx = null, my = null} = {}, command = {}) {
        const message = buildBlueprintPlacementMessage(placement);
        this.sendMessage(message);
        return this.placeHeldItem(
            {invSlot, hold},
            {
                ...command,
                mx: mx ?? message.x,
                my: my ?? message.y
            }
        );
    }

    rotateHeldItem({invSlot = 0, hold = true} = {}, command = {}) {
        return this.send({
            ...command,
            focus_ent: null,
            inv_slot: invSlot,
            act_alt: true,
            act_alt_held: Boolean(hold)
        });
    }


    close(code = 1000, reason = "client") {
        if (!this.#allowWrites) return this;
        try {
            this.ws?.close(code, reason);
        } catch (_) {
        }
        return this;
    }

    disconnect(code = 1000, reason = "client") {
        return this.close(code, reason);
    }

    snapshot({includeTiles = false, includeModel = false} = {}) {
        return {
            baseUrl: this.baseUrl,
            session: this.session?.toJSON?.() || this.session,
            connection: this.connection?.toJSON?.() || null,
            attachMode: this.attachMode,
            serverId: this.serverId,
            server: this.server,
            netPort: this.netPort,
            sid: this.sid,
            ready: this.ready,
            connected: this.connected,
            currentWorldId: this.worlds.currentWorldId,
            worlds: this.worlds.snapshot({includeTiles, includeModel}),
            cpuLoad: this.cpuLoad,
            inventory: this.inventoryState,
            puiPanels: [...this.puiPanels.values()],
            commsPanels: [...this.commsPanels.values()],
            currentCommsPanel: this.currentCommsPanel,
            warnings: this.warnings.slice(-50),
            effects: this.effects.slice(-50),
            chat: this.chat.slice(-50),
            motd: this.motd.slice(-20),
            sessionMessages: this.sessionMessages.slice(-50),
            scannerResults: this.scannerResults.slice(-20),
            lastScannerResult: this.lastScannerResult,
            shipConfig: this.shipConfig,
            captainSubrank: this.captainSubrank,
            playerList: this.playerList,
            outfits: [...this.outfits.entries()].map(([sid, outfit]) => ({sid, outfit})),
            commandAcks: [...this.commandAcks.entries()].map(([world, commandNumber]) => ({world, commandNumber})),
            lastCommandAck: this.lastCommandAck,
            decodeErrors: this.decodeErrors.slice(-50),
            packetCount: this.packetCount,
            lastPacket: this.lastPacket
        };
    }

    state(options = {}) {
        return this.snapshot(options);
    }

    world(id) {
        const world = this.worlds.worlds.get(Number(id)) || null;
        return world ? new WorldDomain(this, world.id) : null;
    }

    overworld() {
        const world = this.worlds.overworld();
        return world ? new OverworldDomain(this, world.id) : null;
    }

    currentShip() {
        const world = this.worlds.shipWorld();
        return world ? new ShipDomain(this, world.id) : null;
    }

    shipWorld(options = {}) {
        return this.worlds.shipWorld()?.snapshot(options) || null;
    }

    ship() {
        return this.currentShip();
    }

    shipEntity() {
        return this.worlds.currentShipEntity();
    }

    currentPlayerEntity() {
        const player = currentPlayerSummary(this);
        return player ? new EntityHandle(this, player.entity, "current") : null;
    }

    entities(scope = "ship") {
        return summariesFor(this, scope).map(entitySnapshotFor);
    }

    entity(entityId, scope = "ship") {
        const summary = this.#readWorld(scope)?.entity(entityId) || null;
        return entitySnapshotFor(summary);
    }

    blocks(scope = "ship") {
        return this.#readWorld(scope)?.blocks() || [];
    }

    materials(scope = "ship") {
        return this.#readWorld(scope)?.materials() || [];
    }

    machines(scope = "ship") {
        return this.#readWorld(scope)?.model.machines() || emptyMachineSummary();
    }

    players(scope = "ship") {
        return this.#readWorld(scope)?.model.players() || [];
    }

    shipControls(scope = "overworld") {
        return this.#readWorld(scope)?.model.shipControls() || [];
    }

    ships(options = {}) {
        const normalized = normalizeShipReadOptions(options);
        const overworld = this.worlds.overworld();
        if (!overworld) return [];
        // Resolve the reference entity once rather than per ship.
        const current = this.worlds.currentShipEntity();
        const ships = overworld.entities()
            .filter((entity) => entity?.contents?.shipControl)
            .map((entity) => shipReadSummary(entity, normalized, this.worlds, current));
        if (normalized.sort === "distance") {
            ships.sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY));
        }
        return ships;
    }

    shipByHex(hexCode, options = {}) {
        const normalized = String(hexCode ?? "").toUpperCase();
        return this.#findShip(options, (control) => String(control.hexCode ?? "").toUpperCase() === normalized);
    }

    shipByEntity(entityId, options = {}) {
        const id = Number(entityId);
        return this.#findShip(options, (control, entity) => entity.entity === id);
    }

    // Match against the ship control record and summarise only the hit. These
    // lookups used to build a full summary -- including a world snapshot -- for
    // every ship in the overworld before discarding all but one.
    #findShip(options, predicate) {
        const overworld = this.worlds.overworld();
        if (!overworld) return null;
        for (const entity of overworld.entities()) {
            const control = entity?.contents?.shipControl;
            if (!control || !predicate(control, entity)) continue;
            return shipReadSummary(entity, normalizeShipReadOptions(options), this.worlds);
        }
        return null;
    }

    get packetsRaw() {
        return this.packets.slice();
    }

    async #connect() {
        if (!this.server) {
            const servers = await fetchServers(this.baseUrl);
            this.server = servers.find((server) => server.index === this.serverId) || null;
        }
        if (!this.server?.domain) throw new Error(`Unable to resolve game server ${this.serverId}`);

        const WebSocket = await getWebSocket();
        const wsUrl = `wss://${this.server.domain}:${this.netPort}`;
        this.ws = this.#openSocket(WebSocket, wsUrl, this.#wsHeaders());
        this.ws.binaryType = "arraybuffer";
        this.#ownsSocket = true;
        this.#allowWrites = true;
        this.#bindSocket();
    }

    #attachSocket(websocket, {connected = null, ready = false, sid = null, mode = "observe"} = {}) {
        this.ws = websocket;
        this.attachMode = normalizeAttachMode(mode);
        this.#ownsSocket = this.attachMode === "bootstrap";
        this.#allowWrites = this.attachMode !== "readonly";
        try {
            this.ws.binaryType = "arraybuffer";
        } catch (_) {
        }
        if (sid != null) this.sid = sid >>> 0;
        this.connected = connected ?? this.#socketLooksOpen(websocket);
        if (ready) {
            this.ready = true;
            if (this.#ownsSocket) {
                this.#sendBootstrap();
                this.#startKeepalive();
            }
            if (this.#allowWrites) {
                this.#flushMessages();
                this.#flushCommands();
            }
            this.#resolveReady?.(this);
            this.#resolveReady = null;
        }
        this.#bindAttachedSocket();
        if (this.connected && this.#ownsSocket) this.#attachedOpen();
        this.emit("attach", this);
    }

    #bindSocket() {
        this.ws.onopen = () => {
            this.connected = true;
            this.ws.send(encodeMsgpack({type: 1}));
            this.emit("open", this);
            this.#flushMessages();
        };

        this.ws.onmessage = (event) => this.#handleSocketMessage(event.data);
        this.ws.onerror = (event) => this.#fail(event?.error || new Error("WebSocket error"));
        this.ws.onclose = (event) => this.#handleSocketClose(event);
    }

    #bindAttachedSocket() {
        const open = () => this.#attachedOpen();
        const message = (event) => this.#handleSocketMessage(event?.data ?? event);
        const error = (event) => this.#fail(event?.error || new Error("WebSocket error"));
        const close = (event) => this.#handleSocketClose(event);

        if (typeof this.ws.addEventListener === "function") {
            this.ws.addEventListener("open", open);
            this.ws.addEventListener("message", message);
            this.ws.addEventListener("error", error);
            this.ws.addEventListener("close", close);
            return;
        }
        if (typeof this.ws.on === "function") {
            this.ws.on("open", open);
            this.ws.on("message", (data) => this.#handleMessage(data));
            this.ws.on("error", error);
            this.ws.on("close", close);
            return;
        }
        const previousMessage = this.ws.onmessage;
        this.ws.onmessage = (event) => {
            if (typeof previousMessage === "function") previousMessage.call(this.ws, event);
            message(event);
        };
    }

    #attachedOpen() {
        this.connected = true;
        if (this.#attachedOpened) return;
        this.#attachedOpened = true;
        if (this.#ownsSocket) this.ws.send(encodeMsgpack({type: 1}));
        this.emit("open", this);
        if (this.#allowWrites) this.#flushMessages();
    }

    #handleSocketClose(event) {
        this.connected = false;
        clearInterval(this.#keepalive);
        this.#keepalive = null;
        this.emit("close", event);
    }

    #socketLooksOpen(websocket) {
        return websocket?.readyState == null || websocket.readyState === 1 || websocket.readyState === websocket.OPEN;
    }

    #assertWritable() {
        if (!this.#allowWrites) throw new Error("DredlessClient is attached in readonly mode");
    }

    #handleSocketMessage(data) {
        if (data && typeof data.arrayBuffer === "function") {
            data.arrayBuffer()
                .then((buffer) => this.#handleMessage(buffer))
                .catch((error) => this.#fail(error));
            return;
        }
        this.#handleMessage(data);
    }

    #handleMessage(data) {
        let packet;
        try {
            packet = decodeIncomingFrame(data);
        } catch (error) {
            this.#fail(error);
            return;
        }
        this.packetCount += 1;
        this.lastPacket = packet;
        this.#pushLimited(this.packets, packet, this.packetHistory);
        this.emit("packet", packet);

        if (!packet || typeof packet !== "object") return;
        try {
            if (packet.type === 21) return this.#markReady(packet);
            const worldUpdate = this.worlds.apply(packet);
            if (worldUpdate) {
                this.#handleWorldUpdate(worldUpdate);
            } else {
                this.#handlePacketEvent(packet);
            }
        } catch (error) {
            this.#recordDecodeError(error, packet);
        }
    }

    #markReady(packet) {
        this.sid = packet.sid >>> 0;
        this.worlds.currentWorldId = packet.world ?? this.worlds.currentWorldId;
        this.ready = true;
        if (this.#ownsSocket) {
            this.#sendBootstrap();
            this.#startKeepalive();
        }
        if (this.#allowWrites) {
            this.#flushMessages();
            this.#flushCommands();
        }
        this.#resolveReady?.(this);
        this.#resolveReady = null;
        this.emit("ready", this);
    }

    #sendBootstrap() {
        if (this.#bootstrapped || !this.connected || !this.sid) return;
        this.#bootstrapped = true;
        this.ws.send(encodeMsgpack(INITIAL_OUTFIT_MESSAGE));
        this.emit("bootstrap", INITIAL_OUTFIT_MESSAGE);
    }

    #startKeepalive() {
        if (this.#keepalive) return;
        const payload = encodeMsgpack(KEEPALIVE_MESSAGE);
        this.#keepalive = setInterval(() => {
            if (this.connected) this.ws.send(payload);
        }, KEEPALIVE_INTERVAL_MS);
    }

    #flushCommands() {
        while (this.#queuedCommands.length) this.send(this.#queuedCommands.shift());
    }

    #flushMessages() {
        if (!this.connected) return;
        const pending = [];
        for (const item of this.#queuedMessages) {
            if (item.afterReady && !this.ready) pending.push(item);
            else this.sendMessage(item.message, {afterReady: item.afterReady});
        }
        this.#queuedMessages = pending;
    }

    #handleWorldUpdate(worldUpdate) {
        this.emit(worldUpdate.type, worldUpdate);
        if (worldUpdate.type === "world-removed") {
            this.emit("world-removed", worldUpdate.packet);
            return;
        }
        for (const error of worldUpdate.errors || []) this.#recordDecodeError(error, worldUpdate.packet, worldUpdate.world);

        const result = worldUpdate.result;
        if (result?.error) this.#recordDecodeError(result.error, worldUpdate.packet, worldUpdate.world);
        if (result?.model?.error) this.#recordDecodeError(result.model.error, worldUpdate.packet, worldUpdate.world);
        if (result?.timing?.cpuLoad != null) this.cpuLoad = result.timing.cpuLoad;
        if (result?.commandNumber != null) this.#ackCommand(result.worldId, result.commandNumber);
        for (const event of result?.events || []) this.#handleSideEvent(event, worldUpdate.world);
    }

    #handlePacketEvent(packet) {
        switch (packet.type) {
            case 14:
                if (packet.sid != null) this.outfits.set(packet.sid, packet.outfit);
                this.emit("outfit", packet);
                break;
            case 15:
                this.lastScannerResult = normalizeScannerResultPacket(packet);
                this.#pushLimited(this.scannerResults, this.lastScannerResult);
                this.emit("scanner-result", this.lastScannerResult, packet);
                break;
            case 18:
                this.cpuLoad = packet.cpu_load ?? null;
                this.emit("cpu", packet);
                break;
            case 24:
                this.#pushLimited(this.chat, packet);
                this.emit("chat", packet);
                break;
            case 25:
                this.#pushLimited(this.sessionMessages, packet);
                this.#handleSessionSubmessage(packet);
                this.emit("session", packet);
                break;
            case 26:
                this.#pushLimited(this.motd, packet);
                this.emit("motd", packet);
                break;
            default:
                this.emit("event", packet);
                break;
        }
    }

    #handleSessionSubmessage(packet) {
        const submessage = packet?.submessage;
        if (!submessage || typeof submessage !== "object") return;
        if (submessage.type === "config") {
            this.shipConfig = normalizeShipConfig(submessage);
            this.emit("ship-config", this.shipConfig, packet);
            return;
        }
        if (submessage.type === "captain_subrank") {
            this.captainSubrank = normalizeCaptainSubrank(submessage);
            if (this.playerList) this.playerList = normalizeShipPlayerList({}, this.playerList, this.captainSubrank);
            this.emit("captain-subrank", this.captainSubrank, packet);
            return;
        }
        if (submessage.type === "player_list") {
            this.playerList = normalizeShipPlayerList(submessage, this.playerList, this.captainSubrank);
            this.emit("player-list", this.playerList, packet);
        }
    }

    #handleSideEvent(event, world) {
        if (!event || typeof event !== "object") return;
        if (event.type === "inventory") {
            this.inventoryState = normalizeInventoryEvent(event);
            this.emit("inventory", this.inventoryState, world);
            return;
        }
        if (event.type === "pui") {
            const panel = {...event, world: world?.id ?? null};
            if (event.ent_id != null) this.puiPanels.set(event.ent_id, panel);
            this.emit("pui", panel, world);
            return;
        }
        if (event.type === "comms") {
            const panel = {...normalizeCommsEvent(event), world: world?.id ?? null};
            if (panel.entity == null) {
                this.currentCommsPanel = null;
                this.commsPanels.clear();
            } else {
                this.currentCommsPanel = panel;
                this.commsPanels.set(panel.entity, panel);
            }
            this.emit("comms", panel, world);
            return;
        }
        if (event.type === "tip_warn") {
            this.#pushLimited(this.warnings, event);
            this.emit("tip_warn", event, world);
            return;
        }
        if (event.type === "sfx") {
            this.#pushLimited(this.effects, event);
            this.emit("sfx", event, world);
            return;
        }
        this.emit("side-event", event, world);
    }

    #ackCommand(worldId, commandNumber) {
        this.commandAcks.set(Number(worldId), commandNumber);
        if (commandNumber >= 0 && (this.lastCommandAck == null || commandNumber > this.lastCommandAck.commandNumber)) {
            this.lastCommandAck = {world: Number(worldId), commandNumber};
            this.emit("ack", this.lastCommandAck);
        }
    }

    #pushLimited(target, value, limit = 200) {
        if (limit === 0) return;
        target.push(value);
        if (target.length > limit) target.splice(0, target.length - limit);
    }

    #recordDecodeError(error, packet = null, world = null) {
        const entry = {
            time: Date.now(),
            message: error?.message || String(error),
            packetType: packet && typeof packet === "object" ? packet.type ?? null : null,
            world: world?.id ?? (packet && typeof packet === "object" ? packet.world ?? null : null)
        };
        this.#pushLimited(this.decodeErrors, entry);
        try {
            this.emit("decode-error", entry, error, packet, world);
        } catch (_) {
        }
    }

    #wsHeaders() {
        const headers = {
            origin: this.baseUrl,
            cookie: this.session ? cookieHeader(this.baseUrl, this.session) : ""
        };
        if (isNode()) {
            Object.assign(headers, {
                "user-agent": JOIN_USER_AGENT,
                accept: "*/*",
                "accept-language": "en-US,en;q=0.9",
                dnt: "1",
                "sec-gpc": "1",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "websocket",
                "sec-fetch-site": "same-site",
                pragma: "no-cache",
                "cache-control": "no-cache"
            });
        }
        return headers;
    }

    #navigationUnitConfigDefaults(entity, config = {}) {
        const summary = this.entity(entity)?.contents?.navigationUnit || null;
        return {
            destination: config.destination ?? summary?.destination,
            page: config.page ?? 0,
            warp: config.warp ?? "idle",
            autoWarpOnShieldFailure: config.autoWarpOnShieldFailure ?? summary?.autoWarpOnShieldFailure ?? false,
            autoWarpOnNoCaptains: config.autoWarpOnNoCaptains ?? summary?.autoWarpOnNoCaptains ?? false
        };
    }

    #pusherConfigDefaults(entity, config = {}) {
        const summary = this.entity(entity)?.contents?.pusher || null;
        return {
            mode: config.mode ?? summary?.mode ?? 2,
            filteredMode: config.filteredMode ?? summary?.filteredMode ?? 0,
            angle: config.angle ?? summary?.angle ?? 0,
            speed: config.speed ?? summary?.speed ?? 20,
            filterInventory: config.filterInventory ?? summary?.filterInventory ?? false,
            length: config.length ?? summary?.length ?? 1000
        };
    }

    #loaderConfigDefaults(entity, config = {}) {
        const summary = this.entity(entity)?.contents?.loader || null;
        return {
            pick: config.pick ?? summary?.pick ?? 0,
            place: config.place ?? summary?.place ?? 2,
            priority: config.priority ?? summary?.priority ?? 0,
            stack: config.stack ?? summary?.stack ?? 16,
            cycle: config.cycle ?? summary?.cycle ?? 1,
            requireOutput: config.requireOutput ?? summary?.requireOutput ?? false,
            waitForStack: config.waitForStack ?? summary?.waitForStack ?? false
        };
    }

    #loaderFullConfigDefaults(entity, config = {}) {
        const summary = this.entity(entity)?.contents?.loader || null;
        return {
            ...this.#loaderConfigDefaults(entity, config),
            filterMode: config.filterMode ?? summary?.filterMode ?? 0,
            filterSlots: config.filterSlots ?? summary?.filterSlots ?? []
        };
    }

    #cargoHatchConfigDefaults(entity, config = {}) {
        const summary = this.entity(entity)?.contents?.cargoHatch || null;
        return {
            filterMode: config.filterMode ?? summary?.filterMode ?? 0,
            filterSlots: config.filterSlots ?? summary?.filterSlots ?? []
        };
    }

    #openSocket(WebSocket, url, headers) {
        if (!isNode()) return new WebSocket(url);
        try {
            return new WebSocket(url, {headers});
        } catch (_) {
            return new WebSocket(url);
        }
    }

    #readWorld(scope) {
        if (scope == null || scope === "ship" || scope === "current") return this.worlds.shipWorld();
        if (scope === "overworld") return this.worlds.overworld();
        if (typeof scope === "number" || typeof scope === "string") return this.worlds.worlds.get(Number(scope)) || null;
        return null;
    }

    #fail(error) {
        this.#rejectReady?.(error);
        this.#rejectReady = null;
        try {
            this.emit("error", error);
        } catch (_) {
        }
    }
}
