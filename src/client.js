import { INITIAL_OUTFIT_MESSAGE, JOIN_USER_AGENT, KEEPALIVE_INTERVAL_MS, KEEPALIVE_MESSAGE } from "./constants.js";
import { getWebSocket, isNode } from "./runtime.js";
import { EventBus } from "./events.js";
import { cookieHeader } from "./net/cookies.js";
import { fetchServers } from "./net/servers.js";
import { Connection } from "./game/connection.js";
import { itemEquipmentSlotFromId } from "./game/items.js";
import { WorldStore } from "./game/world.js";
import { buildBlueprintPlacementMessage } from "./protocol/blueprint.js";
import { buildCommsMessage, normalizeCommsEvent } from "./protocol/comms.js";
import { buildSignedCommandPacket } from "./protocol/commands.js";
import {
  buildInventoryDragCommand,
  normalizeEquipmentSlot,
  normalizeInventoryEvent
} from "./protocol/inventory.js";
import {
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
  normalizeShipConfig
} from "./protocol/ship-management.js";
import { buildSignTextMessage } from "./protocol/sign.js";
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
} from "./protocol/ui-config.js";
import { decodeMsgpack, encodeMsgpack, cloneCommand } from "./protocol/msgpack.js";
import { toUint8Array } from "./protocol/binary.js";

export class DredlessClient extends EventBus {
  constructor(connection, { connect = true } = {}) {
    super();
    if (!(connection instanceof Connection)) throw new Error("DredlessClient requires a Connection");

    this.connection = connection;
    this.session = connection.session;
    this.baseUrl = connection.baseUrl;
    this.serverId = connection.serverId;
    this.server = connection.server;
    this.netPort = connection.netPort;
    this.gameToken = connection.gameToken;
    this.ws = null;
    this.sid = null;
    this.connected = false;
    this.ready = false;
    this.packetCount = 0;
    this.lastPacket = null;
    this.packets = [];
    this.worlds = new WorldStore();
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

    if (connect) this.#connect().catch((error) => this.#fail(error));
  }

  #commandNumber = 1;
  #queuedCommands = [];
  #queuedMessages = [];
  #keepalive = null;
  #bootstrapped = false;
  #resolveReady = null;
  #rejectReady = null;
  #inputSettings = {
    wrench_mode: 1,
    turret_mode: 0
  };

  waitUntilReady() {
    return this.readyPromise;
  }

  send(command = {}) {
    const normalized = cloneCommand({ ...this.#inputSettings, ...command });
    if (normalized.n == null) normalized.n = this.#commandNumber++;
    if (!this.sid) {
      this.#queuedCommands.push(normalized);
      return this;
    }
    this.ws.send(buildSignedCommandPacket(normalized, this.sid));
    this.emit("command", normalized);
    return this;
  }

  sendMessage(message, { afterReady = true } = {}) {
    if (!this.connected || (afterReady && !this.ready)) {
      this.#queuedMessages.push({ message, afterReady });
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
    return this.sendMessage({ type: 7, outfit });
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
    return this.sendMessage({ type: 5, cmd, args });
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
    return this.sendMessage({ type: 8, data });
  }

  solveGeneratorPuzzle(entity, solution) {
    return this.sendUiConfig(buildGeneratorMazePuzzleData(entity, solution));
  }

  sendPusherConfig(entity, config = {}) {
    return this.sendUiConfig(buildPusherConfigData(entity, this.#pusherConfigDefaults(entity, config)));
  }

  setPusherAngle(entity, angle, config = {}) {
    return this.sendPusherConfig(entity, { ...config, angle });
  }

  setPusherSpeed(entity, speed, config = {}) {
    return this.sendPusherConfig(entity, { ...config, speed });
  }

  setPusherLength(entity, length, config = {}) {
    return this.sendPusherConfig(entity, { ...config, length });
  }

  setPusherMode(entity, mode, config = {}) {
    return this.sendPusherConfig(entity, { ...config, mode });
  }

  setPusherFilteredMode(entity, filteredMode, config = {}) {
    return this.sendPusherConfig(entity, { ...config, filteredMode });
  }

  setPusherFilterInventory(entity, filterInventory, config = {}) {
    return this.sendPusherConfig(entity, { ...config, filterInventory });
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
    return this.sendLoaderConfig(entity, { ...config, pick, place });
  }

  setLoaderPriority(entity, priority, config = {}) {
    return this.sendLoaderConfig(entity, { ...config, priority });
  }

  setLoaderStack(entity, stack, config = {}) {
    return this.sendLoaderConfig(entity, { ...config, stack });
  }

  setLoaderCycle(entity, cycle, config = {}) {
    return this.sendLoaderConfig(entity, { ...config, cycle });
  }

  setLoaderRequireOutput(entity, requireOutput, config = {}) {
    return this.sendLoaderConfig(entity, { ...config, requireOutput });
  }

  setLoaderWaitForStack(entity, waitForStack, config = {}) {
    return this.sendLoaderConfig(entity, { ...config, waitForStack });
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

  setInputSettings(settings = {}, { send = true } = {}) {
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
    return this.setInputSettings({ viewWidth: width, viewHeight: height }, options);
  }

  setScreenSize(width, height, options = {}) {
    return this.setInputSettings({ screenWidth: width, screenHeight: height }, options);
  }

  setWrenchMode(mode, options = {}) {
    return this.setInputSettings({ wrenchMode: mode }, options);
  }

  setWrenchAction(mode, options = {}) {
    return this.setWrenchMode(mode, options);
  }

  setTurretMode(mode, options = {}) {
    return this.setInputSettings({ turretMode: mode }, options);
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
    return this.sendNavigationUnitConfig(entity, { ...config, destination });
  }

  setNavigationAutoWarp(entity, config = {}) {
    return this.sendNavigationUnitConfig(entity, { page: 1, ...config });
  }

  startWarp(entity, config = {}) {
    return this.sendNavigationUnitConfig(entity, { page: 1, ...config, warp: "start" });
  }

  cancelWarp(entity, config = {}) {
    return this.sendNavigationUnitConfig(entity, { page: 1, ...config, warp: "cancel" });
  }

  move(x = 0, y = 0, command = {}) {
    return this.send({ ...command, x, y });
  }

  aim(mx = 0, my = 0, command = {}) {
    return this.send({ ...command, mx, my });
  }

  action(flags = {}, command = {}) {
    return this.send({ ...command, ...flags });
  }

  useEntity(entity, { invSlot = 0, hold = true } = {}, command = {}) {
    return this.send({
      ...command,
      focus_ent: entity,
      inv_slot: invSlot,
      act1: true,
      act1_held: Boolean(hold)
    });
  }

  useHeldItem({ invSlot = 0, hold = true } = {}, command = {}) {
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

  placeBlueprint(placement, { invSlot = 0, hold = true, mx = null, my = null } = {}, command = {}) {
    const message = buildBlueprintPlacementMessage(placement);
    this.sendMessage(message);
    return this.placeHeldItem(
      { invSlot, hold },
      {
        ...command,
        mx: mx ?? message.x,
        my: my ?? message.y
      }
    );
  }

  rotateHeldItem({ invSlot = 0, hold = true } = {}, command = {}) {
    return this.send({
      ...command,
      focus_ent: null,
      inv_slot: invSlot,
      act_alt: true,
      act_alt_held: Boolean(hold)
    });
  }


  close(code = 1000, reason = "client") {
    try { this.ws?.close(code, reason); } catch (_) {}
    return this;
  }

  disconnect(code = 1000, reason = "client") {
    return this.close(code, reason);
  }

  snapshot({ includeTiles = false, includeModel = false } = {}) {
    return {
      baseUrl: this.baseUrl,
      session: this.session?.toJSON?.() || this.session,
      connection: this.connection.toJSON(),
      serverId: this.serverId,
      server: this.server,
      netPort: this.netPort,
      sid: this.sid,
      ready: this.ready,
      connected: this.connected,
      currentWorldId: this.worlds.currentWorldId,
      worlds: this.worlds.snapshot({ includeTiles, includeModel }),
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
      outfits: [...this.outfits.entries()].map(([sid, outfit]) => ({ sid, outfit })),
      commandAcks: [...this.commandAcks.entries()].map(([world, commandNumber]) => ({ world, commandNumber })),
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
    return summariesFor(this, scope).map((summary) => new EntitySnapshot(summary));
  }

  entity(entityId, scope = "ship") {
    const summary = this.#readWorld(scope)?.entity(entityId) || null;
    return summary ? new EntitySnapshot(summary) : null;
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
    const ships = overworld.entities()
      .filter((entity) => entity?.contents?.shipControl)
      .map((entity) => shipReadSummary(entity, normalized, this.worlds));
    if (normalized.sort === "distance") {
      ships.sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY));
    }
    return ships;
  }

  shipByHex(hexCode, options = {}) {
    const normalized = String(hexCode ?? "").toUpperCase();
    return this.ships(options).find((ship) => String(ship.hexCode ?? "").toUpperCase() === normalized) || null;
  }

  shipByEntity(entityId, options = {}) {
    const id = Number(entityId);
    return this.ships(options).find((ship) => ship.entity === id) || null;
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
    this.#bindSocket();
  }

  #bindSocket() {
    this.ws.onopen = () => {
      this.connected = true;
      this.ws.send(encodeMsgpack({ type: 1 }));
      this.emit("open", this);
      this.#flushMessages();
    };

    this.ws.onmessage = (event) => this.#handleMessage(event.data);
    this.ws.onerror = (event) => this.#fail(event?.error || new Error("WebSocket error"));
    this.ws.onclose = (event) => {
      this.connected = false;
      clearInterval(this.#keepalive);
      this.#keepalive = null;
      this.emit("close", event);
    };
  }

  #handleMessage(data) {
    let packet;
    try {
      packet = typeof data === "string" ? JSON.parse(data) : decodeMsgpack(toUint8Array(data));
    } catch (error) {
      this.#fail(error);
      return;
    }
    this.packetCount += 1;
    this.lastPacket = packet;
    this.packets.push(packet);
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
    this.#sendBootstrap();
    this.#startKeepalive();
    this.#flushMessages();
    this.#flushCommands();
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
      else this.sendMessage(item.message, { afterReady: item.afterReady });
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
      const panel = { ...event, world: world?.id ?? null };
      if (event.ent_id != null) this.puiPanels.set(event.ent_id, panel);
      this.emit("pui", panel, world);
      return;
    }
    if (event.type === "comms") {
      const panel = { ...normalizeCommsEvent(event), world: world?.id ?? null };
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
      this.lastCommandAck = { world: Number(worldId), commandNumber };
      this.emit("ack", this.lastCommandAck);
    }
  }

  #pushLimited(target, value, limit = 200) {
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
    try { this.emit("decode-error", entry, error, packet, world); } catch (_) {}
  }

  #wsHeaders() {
    const headers = {
      origin: this.baseUrl,
      cookie: cookieHeader(this.baseUrl, this.session)
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
    try { return new WebSocket(url, { headers }); }
    catch (_) { return new WebSocket(url); }
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
    try { this.emit("error", error); } catch (_) {}
  }
}

class ClientNetDomain {
  constructor(client) { this.client = client; }
  get connected() { return this.client.connected; }
  get ready() { return this.client.ready; }
  get sid() { return this.client.sid; }
  get packetCount() { return this.client.packetCount; }
  get lastPacket() { return this.client.lastPacket; }
  send(command = {}) { return this.client.send(command); }
  sendMessage(message, options = {}) { return this.client.sendMessage(message, options); }
  sendRaw(message, options = {}) { return this.client.sendRaw(message, options); }
  sendEntityCommand(cmd, args = [-1, -1, -1]) { return this.client.sendEntityCommand(cmd, args); }
  sendUiConfig(data) { return this.client.sendUiConfig(data); }
  sendBlueprintPlacement(placement) { return this.client.sendBlueprintPlacement(placement); }
  setOutfit(outfit) { return this.client.setOutfit(outfit); }
}

class ClientDebugDomain {
  constructor(client) { this.client = client; }
  packets() { return this.client.packets.slice(); }
  decodeErrors() { return this.client.decodeErrors.slice(); }
  worldStore() { return this.client.worlds; }
  modelTable(worldId, tableId) { return this.client.worlds.worlds.get(Number(worldId))?.model.table(tableId) || new Map(); }
  modelRecord(worldId, tableId, entityId) { return this.client.worlds.worlds.get(Number(worldId))?.model.record(tableId, entityId) || null; }
  entities(scope = "ship") { return summariesFor(this.client, scope); }
  entity(scope = "ship", entity = null) {
    if (entity == null) return null;
    return summaryForEntity(this.client, scope, entityIdOf(entity));
  }
  puiPanels() { return [...this.client.puiPanels.values()]; }
  commsPanels() { return [...this.client.commsPanels.values()]; }
}

class PlayerDomain {
  constructor(client) { this.client = client; }
  current() { return currentPlayerSummary(this.client); }
  entity() { return this.client.currentPlayerEntity(); }
  name() { return this.current()?.name ?? null; }
  rank() { return currentPlayerRank(this.client); }
  move({ x = 0, y = 0 } = {}, command = {}) { return this.client.move(x, y, command); }
  aim({ x = 0, y = 0, mx = x, my = y } = {}, command = {}) { return this.client.aim(mx, my, command); }
  action(flags = {}, command = {}) { return this.client.action(flags, command); }
  useEntity(entity, options = {}, command = {}) { return this.client.useEntity(entityIdOf(entity), options, command); }
  useHeldItem(options = {}, command = {}) { return this.client.useHeldItem(options, command); }
  placeHeldItem(options = {}, command = {}) { return this.client.placeHeldItem(options, command); }
  placeBlueprint(placement, options = {}, command = {}) { return this.client.placeBlueprint(placement, options, command); }
  rotateHeldItem(options = {}, command = {}) { return this.client.rotateHeldItem(options, command); }
  selectSlot(invSlot = 0, command = {}) { return this.client.send({ ...command, inv_slot: inventorySlotIndexOf(invSlot) }); }
  inputSettings() { return this.client.inputSettings(); }
  setInputSettings(settings = {}, options = {}) { return this.client.setInputSettings(settings, options); }
  setView(width, height, options = {}) { return this.client.setView(width, height, options); }
  setScreenSize(width, height, options = {}) { return this.client.setScreenSize(width, height, options); }
  setWrenchMode(mode, options = {}) { return this.client.setWrenchMode(mode, options); }
  setTurretMode(mode, options = {}) { return this.client.setTurretMode(mode, options); }
}

class ShipManagementDomain {
  constructor(client) { this.client = client; }
  requestPlayerList() { return this.client.requestPlayerList(); }
  resetInvite() { return this.client.resetInvite(); }
  setPrivacy(privacy) { return this.client.setShipPrivacy(privacy); }
  recoverStarterItem(itemId) { return this.client.recoverStarterItem(itemId); }
  setPlayerRank(refId, rank) { return this.client.setPlayerRank(refId, rank); }
  kickPlayer(refId) { return this.client.kickPlayer(refId); }
  banPlayer(refId) { return this.client.banPlayer(refId); }
  demoteSelf() { return this.client.demoteSelf(); }
  config() { return this.client.shipConfig; }
  hasCheats() { return Boolean(this.client.captainSubrank?.enableCheats); }
  playerList() { return this.client.playerList; }
}
class InventoryDomain {
  constructor(client) { this.client = client; }
  state() { return this.client.inventoryState; }
  hotbarSize() { return this.state()?.hotbarSize ?? 0; }
  allSlots() { return (this.state()?.slots || []).map((slot) => this.slot(slot.index)); }
  slot(ref) { return new InventorySlotHandle(this, inventorySlotIndexOf(ref)); }
  hotbarSlots() { return (this.state()?.hotbar || []).map((slot) => this.slot(slot.index)); }
  equipmentSlots() { return { head: this.slot("head"), face: this.slot("face"), body: this.slot("body"), back: this.slot("back"), hands: this.slot("hands"), feet: this.slot("feet") }; }
  findItem(itemId, { area = "all" } = {}) { return this.findItems(itemId, { area })[0] || null; }
  findItems(itemId, { area = "all" } = {}) {
    const normalized = Number(itemId);
    if (!Number.isFinite(normalized)) return [];
    return inventoryHandlesForArea(this, area).filter((slot) => slot.itemId === normalized);
  }
  firstEmpty({ area = "all" } = {}) { return inventoryHandlesForArea(this, area).find((slot) => slot.empty) || null; }
  move(source, target, { split = false } = {}, command = {}) {
    return this.client.send({
      ...command,
      ...buildInventoryDragCommand(inventorySlotIndexOf(source, "source"), inventorySlotIndexOf(target, "target"), split)
    });
  }
  equip(source, equipmentSlot = null, options = {}, command = {}) {
    const args = normalizeEquipArguments(equipmentSlot, options, command);
    const target = args.equipmentSlot == null ? inferEquipmentSlotForInventorySource(this, source) : args.equipmentSlot;
    return this.move(source, normalizeEquipmentSlot(target), { split: args.split }, args.command);
  }
  unequip(equipmentSlot, target = 0, { split = false } = {}, command = {}) {
    return this.move(normalizeEquipmentSlot(equipmentSlot), target, { split }, command);
  }
  select(slot, command = {}) { return this.client.send({ ...command, inv_slot: inventorySlotIndexOf(slot) }); }
}

class InventorySlotHandle {
  constructor(domain, index) {
    this.domain = domain;
    this.client = domain.client;
    this.index = index;
  }
  get state() { return this.domain.state()?.slots?.find((slot) => slot.index === this.index) || null; }
  get kind() { return this.state?.kind ?? null; }
  get equipmentSlot() { return this.state?.equipmentSlot ?? null; }
  get itemId() { return this.state?.itemId ?? null; }
  get itemName() { return this.state?.itemName ?? null; }
  get count() { return this.state?.count ?? 0; }
  get empty() { return this.state?.empty ?? true; }
  exists() { return Boolean(this.state); }
  snapshot() { return this.state ? Object.freeze({ ...this.state }) : null; }
  moveTo(target, options = {}, command = {}) { return this.domain.move(this, target, options, command); }
  equip(equipmentSlot = null, options = {}, command = {}) {
    if (equipmentSlot && typeof equipmentSlot === "object") return this.domain.equip(this, null, equipmentSlot, options);
    return this.domain.equip(this, equipmentSlot, options, command);
  }
  unequip(target = 0, options = {}, command = {}) {
    if (!this.equipmentSlot) throw new RangeError(`inventory slot ${this.index} is not an equipment slot`);
    return this.domain.unequip(this.equipmentSlot, target, options, command);
  }
  select(command = {}) { return this.domain.select(this, command); }
}

class WorldDomain {
  constructor(client, scope) {
    this.client = client;
    this.scope = scope;
    this.entities = new EntityCollection(client, scope);
    this.machines = new MachineCollection(client, scope);
    this.players = new PlayerCollection(client, scope);
    this.blocks = new BlockCollection(client, scope);
    this.materials = new MaterialCollection(client, scope);
  }
  get id() { return worldStateFor(this.client, this.scope)?.id ?? null; }
  exists() { return Boolean(worldStateFor(this.client, this.scope)); }
  snapshot(options = {}) { return worldStateFor(this.client, this.scope)?.snapshot(options) || null; }
}

class ShipDomain extends WorldDomain {
  entity() { const summary = this.client.worlds.currentShipEntity(); return summary ? new EntityHandle(this.client, summary.entity, "overworld") : null; }
  get overworldEntity() { return this.entity(); }
  get metadata() { return worldStateFor(this.client, this.scope)?.model.shipMetadata() || null; }
}

class OverworldDomain extends WorldDomain {
  ships(options = {}) { return this.client.ships(options).map((summary) => new ShipHandle(this.client, summary)); }
  shipByHex(hexCode, options = {}) { const summary = this.client.shipByHex(hexCode, options); return summary ? new ShipHandle(this.client, summary) : null; }
  shipByEntity(entity, options = {}) { const summary = this.client.shipByEntity(entityIdOf(entity), options); return summary ? new ShipHandle(this.client, summary) : null; }
}

class EntitySnapshot {
  #contents;

  constructor(summary) {
    const data = clonePlain(summary || {});
    this.#contents = data.contents || null;
    delete data.contents;
    Object.assign(this, data);
    this.id = Number(data.entity ?? data.id);
    this.entity = this.id;
    this.position = data.transform || null;
    this.rotation = data.transform?.rotation ?? null;
    this.type = entityPublicType(data, this.#contents);
    this.features = Object.freeze(entityFeatures(data, this.#contents));
    deepFreeze(this.#contents);
    deepFreeze(this);
  }

  is(type) {
    const key = normalizeEntityKey(type);
    if (!key) return false;
    const publicType = normalizeEntityKey(this.type);
    if (key === publicType) return true;
    if (key === normalizeEntityKey(this.category)) return true;
    if (key === "placedentity" && this.category === "placed_entity") return true;
    if (key === "looseitem" && this.category === "loose_item") return true;
    if (key === "ship" && (this.category === "ship_control" || this.#contents?.shipControl)) return true;
    if (key === "machine") return Boolean(entityMachineType(this.#contents));
    if (key === "item") return Boolean(this.#contents?.itemHolder || this.#contents?.itemCrate || this.#contents?.expandoBox);
    if (key === "bot") return Boolean(this.#contents?.bot);
    if (key === "player") return Boolean(this.#contents?.player || this.category === "player");
    if (this.kind?.some((kind) => normalizeEntityKey(kind) === key)) return true;
    return Boolean(componentFor(this.#contents, key));
  }

  has(feature) {
    return this.feature(feature) != null;
  }

  feature(feature) {
    return entityFeature(this, this.#contents, feature);
  }
}

class EntityCollection {
  constructor(client, scope) { this.client = client; this.scope = scope; }
  all() { return summariesFor(this.client, this.scope).map((summary) => new EntityHandle(this.client, summary.entity, this.scope)); }
  snapshots() { return summariesFor(this.client, this.scope).map((summary) => new EntitySnapshot(summary)); }
  states() { return this.snapshots(); }
  get(entity) { return new EntityHandle(this.client, entityIdOf(entity), this.scope); }
}

class PlayerCollection {
  constructor(client, scope) { this.client = client; this.scope = scope; }
  all() { return worldStateFor(this.client, this.scope)?.model.players() || []; }
  current() { return currentPlayerSummary(this.client, this.scope); }
}

class BlockCollection {
  constructor(client, scope) { this.client = client; this.scope = scope; }
  all() { return worldStateFor(this.client, this.scope)?.blocks() || []; }
  at(x, y) { return this.all().find((block) => block.x === x && block.y === y) || null; }
}

class MaterialCollection {
  constructor(client, scope) { this.client = client; this.scope = scope; }
  all() { return worldStateFor(this.client, this.scope)?.materials() || []; }
}

class MachineCollection {
  constructor(client, scope) { this.client = client; this.scope = scope; }
  state() { return worldStateFor(this.client, this.scope)?.model.machines() || emptyMachineSummary(); }
  raw() { return this.state(); }
  loaders() { return this.state().loaders.map((item) => new LoaderHandle(this.client, item.entity, this.scope)); }
  loader(entity) { return new LoaderHandle(this.client, entityIdOf(entity), this.scope); }
  pushers() { return this.state().pushers.map((item) => new PusherHandle(this.client, item.entity, this.scope)); }
  pusher(entity) { return new PusherHandle(this.client, entityIdOf(entity), this.scope); }
  launchers() { return this.state().launchers.map((item) => new LauncherHandle(this.client, item.entity, this.scope)); }
  launcher(entity) { return new LauncherHandle(this.client, entityIdOf(entity), this.scope); }
  navigationUnits() { return this.state().navigationUnits.map((item) => new NavigationUnitHandle(this.client, item.entity, this.scope)); }
  navigationUnit(entity = null) { const id = entity == null ? this.state().navigationUnits[0]?.entity : entityIdOf(entity); return id == null ? null : new NavigationUnitHandle(this.client, id, this.scope); }
  fabricators() { return this.state().fabricators.map((item) => new FabricatorHandle(this.client, item.entity, this.scope)); }
  fabricator(entity) { return new FabricatorHandle(this.client, entityIdOf(entity), this.scope); }
  commsStations() { return this.state().commsStations.map((item) => new CommsStationHandle(this.client, item.entity, this.scope)); }
  commsStation(entity = null) { const id = entity == null ? this.state().commsStations[0]?.entity : entityIdOf(entity); return id == null ? null : new CommsStationHandle(this.client, id, this.scope); }
  signs() { return summariesFor(this.client, this.scope).filter((item) => item.contents?.sign).map((item) => new SignHandle(this.client, item.entity, this.scope)); }
  sign(entity) { return new SignHandle(this.client, entityIdOf(entity), this.scope); }
  generators() { return this.state().shieldGenerators.map((item) => new GeneratorHandle(this.client, item.entity, this.scope)); }
  generator(entity) { return new GeneratorHandle(this.client, entityIdOf(entity), this.scope); }
  cargoHatches() { return this.state().cargoHatches.map((item) => new CargoHatchHandle(this.client, item.entity, this.scope)); }
  cargoHatch(entity) { return new CargoHatchHandle(this.client, entityIdOf(entity), this.scope); }
  cargoEjectors() { return this.state().cargoEjectors.map((item) => new CargoEjectorHandle(this.client, item.entity, this.scope)); }
  cargoEjector(entity) { return new CargoEjectorHandle(this.client, entityIdOf(entity), this.scope); }
  cannons() { return this.state().cannons.map((item) => new CannonHandle(this.client, item.entity, this.scope)); }
  cannon(entity) { return new CannonHandle(this.client, entityIdOf(entity), this.scope); }
  thrusters() { return this.state().thrusters.map((item) => new ThrusterHandle(this.client, item.entity, this.scope)); }
  thruster(entity) { return new ThrusterHandle(this.client, entityIdOf(entity), this.scope); }
  helms() { return this.state().helms.map((item) => new HelmHandle(this.client, item.entity, this.scope)); }
  helm(entity) { return new HelmHandle(this.client, entityIdOf(entity), this.scope); }
  doors() { return this.state().doors.map((item) => new DoorHandle(this.client, item.entity, this.scope)); }
  door(entity) { return new DoorHandle(this.client, entityIdOf(entity), this.scope); }
  spawnPoints() { return this.state().spawnPoints.map((item) => new SpawnPointHandle(this.client, item.entity, this.scope)); }
  spawnPoint(entity) { return new SpawnPointHandle(this.client, entityIdOf(entity), this.scope); }
  shieldProjectors() { return this.state().shieldProjectors.map((item) => new ShieldProjectorHandle(this.client, item.entity, this.scope)); }
  shieldProjector(entity) { return new ShieldProjectorHandle(this.client, entityIdOf(entity), this.scope); }
  fluidTanks() { return this.state().fluidTanks.map((item) => new FluidTankHandle(this.client, item.entity, this.scope)); }
  fluidTank(entity) { return new FluidTankHandle(this.client, entityIdOf(entity), this.scope); }
  expandoBoxes() { return this.state().expandoBoxes.map((item) => new ExpandoBoxHandle(this.client, item.entity, this.scope)); }
  expandoBox(entity) { return new ExpandoBoxHandle(this.client, entityIdOf(entity), this.scope); }
}

class EntityHandle {
  constructor(client, entity, scope = "ship") { this.client = client; this.id = Number(entity); this.entity = this.id; this.scope = scope; }
  exists() { return Boolean(this.snapshot()); }
  snapshot() {
    const summary = worldStateFor(this.client, this.scope)?.entity(this.id) || null;
    return summary ? new EntitySnapshot(summary) : null;
  }
  get position() { return summaryForEntity(this.client, this.scope, this.id)?.transform || null; }
  get health() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.health || null; }
  get type() { return this.snapshot()?.type ?? "unknown"; }
  get features() { return this.snapshot()?.features ?? []; }
  is(type) { return this.snapshot()?.is(type) ?? false; }
  has(feature) { return this.snapshot()?.has(feature) ?? false; }
  feature(feature) { return this.snapshot()?.feature(feature) ?? null; }
  as(type) { return entityDomainHandle(this.client, this.id, this.scope, type, this.snapshot()); }
  asLoader() { return this.as("loader"); }
  asPusher() { return this.as("pusher"); }
  asLauncher() { return this.as("launcher"); }
  asNavigationUnit() { return this.as("navigationUnit"); }
  asCommsStation() { return this.as("commsStation"); }
  asSign() { return this.as("sign"); }
  asGenerator() { return this.as("shieldGenerator"); }
  asCargoHatch() { return this.as("cargoHatch"); }
  asCannon() { return this.as("cannon"); }
  asThruster() { return this.as("thruster"); }
  asHelm() { return this.as("helm"); }
  asDoor() { return this.as("door"); }
  asSpawnPoint() { return this.as("spawnPoint"); }
  asShieldProjector() { return this.as("shieldProjector"); }
  asFluidTank() { return this.as("fluidTank"); }
  asCargoEjector() { return this.as("cargoEjector"); }
  asExpandoBox() { return this.as("expandoBox"); }
  use(options = {}, command = {}) { return this.client.player.useEntity(this.id, options, command); }
}

class MachineHandle extends EntityHandle {
  open(options = {}, command = {}) { return this.use(options, command); }
}

class LoaderHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.loader || null; }
  configure(config = {}) { return this.client.sendLoaderConfig(this.id, config); }
  configureFull(config = {}) { return this.client.sendLoaderFullConfig(this.id, config); }
  copy(config = {}) { return this.client.copyLoaderConfig(this.id, config); }
  setPickPlace(pick, place, config = {}) { return this.client.setLoaderPickPlace(this.id, pick, place, config); }
  setPriority(priority, config = {}) { return this.client.setLoaderPriority(this.id, priority, config); }
  setStack(stack, config = {}) { return this.client.setLoaderStack(this.id, stack, config); }
  setCycle(cycle, config = {}) { return this.client.setLoaderCycle(this.id, cycle, config); }
  setRequireOutput(requireOutput, config = {}) { return this.client.setLoaderRequireOutput(this.id, requireOutput, config); }
  setWaitForStack(waitForStack, config = {}) { return this.client.setLoaderWaitForStack(this.id, waitForStack, config); }
  setFilterMode(filterMode) { return this.client.setLoaderFilterMode(this.id, filterMode); }
  setFilterItems(filterSlots = []) { return this.client.setLoaderFilterItems(this.id, filterSlots); }
  get pick() { return this.state?.pick; }
  get place() { return this.state?.place; }
  get priority() { return this.state?.priority; }
  get stack() { return this.state?.stack; }
  get cycle() { return this.state?.cycle; }
  get requireOutput() { return this.state?.requireOutput; }
  get waitForStack() { return this.state?.waitForStack; }
  get filterMode() { return this.state?.filterMode; }
  get filterSlots() { return this.state?.filterSlots || []; }
  get active() { return this.state?.active; }
  get heldItem() {
    const state = this.state;
    if (!state || state.heldItemId == null) return null;
    return { itemId: state.heldItemId, itemName: state.heldItemName, count: state.heldCount };
  }
  get progress() { return this.state?.progress; }
}

class PusherHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.pusher || null; }
  get beam() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.pusherBeam || null; }
  configure(config = {}) { return this.client.sendPusherConfig(this.id, config); }
  setAngle(angle, config = {}) { return this.client.setPusherAngle(this.id, angle, config); }
  setSpeed(speed, config = {}) { return this.client.setPusherSpeed(this.id, speed, config); }
  setLength(length, config = {}) { return this.client.setPusherLength(this.id, length, config); }
  setMode(mode, config = {}) { return this.client.setPusherMode(this.id, mode, config); }
  setFilteredMode(mode, config = {}) { return this.client.setPusherFilteredMode(this.id, mode, config); }
  setFilterInventory(filterInventory, config = {}) { return this.client.setPusherFilterInventory(this.id, filterInventory, config); }
  setFilterItems(filterSlots = []) { return this.client.setPusherFilterItems(this.id, filterSlots); }
  get angle() { return this.state?.angle; }
  get speed() { return this.state?.speed; }
  get length() { return this.state?.length; }
  get mode() { return this.state?.mode; }
  get filteredMode() { return this.state?.filteredMode; }
}

class LauncherHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.launcher || null; }
  setAngle(angle) { return this.client.setLauncherAngle(angle); }
  setPower(power) { return this.client.setLauncherPower(power); }
  get angleDegrees() { return this.state?.angleDegrees; }
  get angleRadians() { return this.state?.angleRadians; }
  get angleRaw() { return this.state?.angleRaw; }
}

class NavigationUnitHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.navigationUnit || null; }
  configure(config = {}) { return this.client.sendNavigationUnitConfig(this.id, config); }
  copy(config = {}) { return this.client.copyNavigationUnitConfig(this.id, config); }
  paste(config = {}) { return this.client.pasteNavigationUnitConfig(this.id, config); }
  setDestination(destination, config = {}) { return this.client.setNavigationDestination(this.id, destination, config); }
  setAutoWarp(config = {}) { return this.client.setNavigationAutoWarp(this.id, config); }
  startWarp(config = {}) { return this.client.startWarp(this.id, config); }
  cancelWarp(config = {}) { return this.client.cancelWarp(this.id, config); }
  get destination() { return this.state?.destination; }
  get autoWarpOnShieldFailure() { return this.state?.autoWarpOnShieldFailure; }
  get autoWarpOnNoCaptains() { return this.state?.autoWarpOnNoCaptains; }
  get warp() { return this.state?.warp; }
}

class FabricatorHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.fabricator || null; }
  get progress() { return this.state?.progress; }
  get active() { return this.state?.active; }
  get craftingItem() {
    const state = this.state;
    if (!state || state.craftingItemId == null) return null;
    return { itemId: state.craftingItemId, itemName: state.craftingItemName, count: state.craftingCount };
  }
  panel() { return this.client.puiPanels.get(this.id) || null; }
  add(itemId, count = 1, index = -1) { return this.client.craftAdd(itemId, count, index); }
  sub(itemId, count = 1, index = 0) { return this.client.craftSub(itemId, count, index); }
  clearQueue() { return this.client.craftClearQueue(); }
  toggleRepeat() { return this.client.craftToggleRepeat(); }
  lockResource(row) { return this.client.fabricatorLockResource(row); }
  unlockResource(row) { return this.client.fabricatorUnlockResource(row); }
  eject(row) { return this.client.fabricatorEject(row); }
}

class CommsStationHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.commsStation || null; }
  panel() { return this.client.commsPanels.get(this.id) || null; }
  sendMessage(message = "") { return this.client.sendCommsMessage(message); }
}
class SignHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.sign || null; }
  setText(text = "", mode = 0) { return this.client.setSignText(text, mode); }
  get text() { return this.state?.text; }
  get mode() { return this.state?.mode; }
}

class GeneratorHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.shieldGenerator || null; }
  solvePuzzle(solution) { return this.client.solveGeneratorPuzzle(this.id, solution); }
}

class CargoHatchHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.cargoHatch || null; }
  get openFraction() { return this.state?.openFraction; }
  configure(config = {}) { return this.client.sendCargoHatchFullConfig(this.id, config); }
  copy(config = {}) { return this.client.copyCargoHatchConfig(this.id, config); }
  paste(config = {}) { return this.client.pasteCargoHatchConfig(this.id, config); }
  setFilterMode(filterMode) { return this.client.setCargoHatchFilterMode(this.id, filterMode); }
  setFilterItems(filterSlots = []) { return this.client.setCargoHatchFilterItems(this.id, filterSlots); }
}

class CannonHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.cannon || null; }
}

class ThrusterHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.thruster || null; }
}

class HelmHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.helm || null; }
  get occupied() { return this.state?.occupied; }
}

class DoorHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.door || null; }
  get rank() { return this.state?.rank; }
  get open() { return this.state?.open; }
}

class SpawnPointHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.spawnPoint || null; }
  get rank() { return this.state?.rank; }
}

class ShieldProjectorHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.shieldProjector || null; }
  get active() { return this.state?.active; }
}

class FluidTankHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.fluidTank || null; }
  get amount() { return this.state?.amount; }
}

class ExpandoBoxHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.expandoBox || null; }
  get item() { return this.state?.itemId; }
  get count() { return this.state?.count; }
}

class CargoEjectorHandle extends MachineHandle {
  get state() { return summaryForEntity(this.client, this.scope, this.id)?.contents?.cargoEjector || null; }
  get progress() { return this.state?.progress; }
  get active() { return this.state?.active; }
  setDirection(direction) { return this.client.setCargoEjectorDirection(this.id, direction); }
  copy(direction = "right") { return this.client.copyCargoEjectorConfig(this.id, direction); }
  paste(direction = "right") { return this.client.pasteCargoEjectorConfig(this.id, direction); }
}
class ShipHandle {
  constructor(client, summary) { this.client = client; this.summary = summary; }
  get entity() { return this.summary.entity; }
  get name() { return this.summary.name; }
  get hexCode() { return this.summary.hexCode; }
  get distance() { return this.summary.distance; }
  get worldId() { return this.summary.worldId; }
  get hasWorldData() { return this.summary.hasWorldData; }
  world() { return this.worldId == null ? null : this.client.world(this.worldId); }
  snapshot() { return this.summary; }
}

const ENTITY_COMPONENT_ALIASES = new Map([
  ["hoveroutline", "hoverOutline"],
  ["outline", "hoverOutline"],
  ["itemholder", "itemHolder"],
  ["itemcrate", "itemCrate"],
  ["expandobox", "expandoBox"],
  ["expando", "expandoBox"],
  ["blueprintpreview", "blueprintPreview"],
  ["blueprint", "blueprintPreview"],
  ["pusherbeam", "pusherBeam"],
  ["beam", "pusherBeam"],
  ["cargohatch", "cargoHatch"],
  ["cargoejector", "cargoEjector"],
  ["ejector", "cargoEjector"],
  ["navigationunit", "navigationUnit"],
  ["nav", "navigationUnit"],
  ["navunit", "navigationUnit"],
  ["commsstation", "commsStation"],
  ["fluidtank", "fluidTank"],
  ["shieldgenerator", "shieldGenerator"],
  ["generator", "shieldGenerator"],
  ["shieldprojector", "shieldProjector"],
  ["shipcontrol", "shipControl"],
  ["spawnpoint", "spawnPoint"],
  ["shipsize", "shipSize"],
  ["mapmarker", "mapMarker"],
  ["marker", "mapMarker"],
  ["dockingspring", "dockingSpring"],
  ["hugethruster", "hugeThruster"]
]);

const MACHINE_COMPONENTS = [
  "loader",
  "pusher",
  "launcher",
  "navigationUnit",
  "fabricator",
  "cargoEjector",
  "cannon",
  "thruster",
  "cargoHatch",
  "commsStation",
  "fluidTank",
  "shieldGenerator",
  "shieldProjector",
  "helm",
  "sign",
  "spawnPoint",
  "door",
  "expandoBox"
];

const ENTITY_FEATURES = [
  "health",
  "position",
  "outline",
  "inventory",
  "item",
  "filter",
  "filterMode",
  "filterSlots",
  "filterInventory",
  "beam",
  "occupied",
  "loaderConfig",
  "pusherConfig",
  "launcherConfig",
  "navigationConfig",
  "fabricatorQueue",
  "progress"
];

function normalizeEntityKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clonePlain(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function componentFor(contents, key) {
  if (!contents) return null;
  const component = ENTITY_COMPONENT_ALIASES.get(key) || key;
  return contents[component] ?? null;
}

function entityMachineType(contents) {
  if (!contents) return null;
  return MACHINE_COMPONENTS.find((component) => contents[component]) || null;
}

function firstFeatureSource(contents, names) {
  if (!contents) return null;
  for (const name of names) {
    const source = contents[name];
    if (source != null) return source;
  }
  return null;
}

function sourceWithProperty(contents, names, property) {
  if (!contents) return null;
  for (const name of names) {
    const source = contents[name];
    if (source && source[property] != null) return source;
  }
  return null;
}

function entityPublicType(summary, contents) {
  const machine = entityMachineType(contents);
  if (machine) return machine;
  if (contents?.player || summary?.category === "player") return "player";
  if (contents?.shipControl || summary?.category === "ship_control") return "ship";
  if (contents?.bot) return "bot";
  if (summary?.category === "loose_item" || contents?.itemCrate || contents?.itemHolder) return "looseItem";
  if (contents?.mapMarker) return "mapMarker";
  if (contents?.dockingSpring) return "dockingSpring";
  if (contents?.hugeThruster) return "hugeThruster";
  if (contents?.blueprintPreview) return "blueprintPreview";
  return "unknown";
}

function entityFeatures(summary, contents) {
  return ENTITY_FEATURES.filter((feature) => entityFeature(summary, contents, feature) != null);
}

function entityFeature(summary, contents, feature) {
  const key = normalizeEntityKey(feature);
  if (!key) return null;
  if (key === "position" || key === "transform") return summary?.position || summary?.transform || null;
  if (!contents) return null;
  const component = componentFor(contents, key);
  if (component != null) return component;
  if (key === "machine") return firstFeatureSource(contents, MACHINE_COMPONENTS);
  if (key === "inventory") return firstFeatureSource(contents, ["itemHolder", "expandoBox"]);
  if (key === "item") return firstFeatureSource(contents, ["itemCrate", "itemHolder", "expandoBox"]);
  if (key === "filter") return firstFeatureSource(contents, ["loader", "pusher", "cargoHatch"]);
  if (key === "filtermode") {
    const filterModeSource = sourceWithProperty(contents, ["loader", "pusher", "cargoHatch"], "filterMode");
    if (filterModeSource) return filterModeSource.filterMode;
    return sourceWithProperty(contents, ["pusher"], "filteredMode")?.filteredMode ?? null;
  }
  if (key === "filterslots") return sourceWithProperty(contents, ["loader", "pusher", "cargoHatch"], "filterSlots")?.filterSlots ?? null;
  if (key === "filterinventory") return contents.pusher?.filterInventory ?? null;
  if (key === "beam") return contents.pusherBeam ?? null;
  if (key === "outline") return contents.hoverOutline ?? null;
  if (key === "occupied") return sourceWithProperty(contents, ["helm", "commsStation"], "occupied")?.occupied ?? null;
  if (key === "health") return contents.health ?? null;
  if (key === "loaderconfig") return contents.loader ?? null;
  if (key === "pusherconfig") return contents.pusher ?? null;
  if (key === "launcherconfig") return contents.launcher ?? null;
  if (key === "navigationconfig") return contents.navigationUnit ?? null;
  if (key === "fabricatorqueue") return contents.fabricator?.rows ?? null;
  if (key === "progress") return contents.fabricator?.progress ?? contents.cargoEjector?.progress ?? contents.loader?.progress ?? contents.cargoHatch?.openFraction ?? null;
  return null;
}

function entityDomainHandle(client, entity, scope, type, snapshot = null) {
  const key = normalizeEntityKey(type);
  const state = snapshot || new EntityHandle(client, entity, scope).snapshot();
  if (!state) return null;
  const constructors = new Map([
    ["loader", LoaderHandle],
    ["pusher", PusherHandle],
    ["launcher", LauncherHandle],
    ["navigationunit", NavigationUnitHandle],
    ["nav", NavigationUnitHandle],
    ["navunit", NavigationUnitHandle],
    ["fabricator", FabricatorHandle],
    ["cargoejector", CargoEjectorHandle],
    ["ejector", CargoEjectorHandle],
    ["cannon", CannonHandle],
    ["thruster", ThrusterHandle],
    ["commsstation", CommsStationHandle],
    ["sign", SignHandle],
    ["shieldgenerator", GeneratorHandle],
    ["generator", GeneratorHandle],
    ["cargohatch", CargoHatchHandle],
    ["shieldprojector", ShieldProjectorHandle],
    ["fluidtank", FluidTankHandle],
    ["helm", HelmHandle],
    ["spawnpoint", SpawnPointHandle],
    ["door", DoorHandle],
    ["expandobox", ExpandoBoxHandle],
    ["expando", ExpandoBoxHandle]
  ]);
  const Handle = constructors.get(key);
  return Handle && state.is(key) ? new Handle(client, entity, scope) : null;
}

function worldStateFor(client, scope = "ship") {
  if (scope == null || scope === "ship" || scope === "current") return client.worlds.shipWorld();
  if (scope === "overworld") return client.worlds.overworld();
  return client.worlds.worlds.get(Number(scope)) || null;
}

function summariesFor(client, scope = "ship") {
  return worldStateFor(client, scope)?.entities() || [];
}

function summaryForEntity(client, scope, entity) {
  return worldStateFor(client, scope)?.entity(entity) || null;
}

function entityIdOf(value) {
  if (value && typeof value === "object") return Number(value.entity ?? value.id);
  return Number(value);
}
function inventorySlotIndexOf(value, name = "slot") {
  if (value && typeof value === "object") {
    if (value.index != null) return normalizeInventorySlotIndex(value.index, name);
    if (value.entity != null || value.id != null) throw new TypeError(`${name} must be an inventory slot, slot snapshot, equipment slot, or index`);
  }
  if (typeof value === "string") return normalizeEquipmentSlot(value);
  return normalizeInventorySlotIndex(value, name);
}

function normalizeInventorySlotIndex(value, name = "slot") {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new RangeError(`${name} must be a non-negative inventory slot index`);
  return number;
}

function currentPlayerSummary(client, scope = "current") {
  const sid = Number(client?.sid);
  if (!Number.isFinite(sid)) return null;
  return worldStateFor(client, scope)?.model.players().find((player) => player.entity === sid) || null;
}

function currentPlayerRank(client) {
  const player = currentPlayerSummary(client);
  const subrank = client?.captainSubrank?.subrank ?? null;
  const shipRank = player?.shipRank ?? null;
  return {
    shipRank,
    subrank: shipRank === "captain" ? subrank : null,
    isCaptain: shipRank === "captain",
    patronTier: player?.patronTier ?? null
  };
}
function normalizeEquipArguments(equipmentSlot, options = {}, command = {}) {
  if (equipmentSlot && typeof equipmentSlot === "object") {
    return { equipmentSlot: null, split: Boolean(equipmentSlot.split), command: options || {} };
  }
  return { equipmentSlot, split: Boolean(options?.split), command };
}

function inferEquipmentSlotForInventorySource(domain, source) {
  const handle = source instanceof InventorySlotHandle ? source : domain.slot(source);
  if (!handle.exists() || handle.itemId == null) throw new RangeError(`inventory slot ${handle.index} is empty; pass equipmentSlot explicitly`);
  const equipmentSlot = itemEquipmentSlotFromId(handle.itemId);
  if (!equipmentSlot) {
    const label = handle.itemName ? ` (${handle.itemName})` : "";
    throw new RangeError(`item ${handle.itemId}${label} does not map to an equipment slot; pass equipmentSlot explicitly`);
  }
  return equipmentSlot;
}

function inventoryHandlesForArea(domain, area = "all") {
  switch (area) {
    case "all": return domain.allSlots();
    case "hotbar": return domain.hotbarSlots();
    case "equipment": return Object.values(domain.equipmentSlots());
    default: throw new RangeError(`Unknown inventory area: ${area}`);
  }
}
const WRENCH_MODES = new Map([
  [0, "drop-all-items"],
  [1, "grab-primary-items"],
  [2, "grab-all-items"]
]);

const WRENCH_MODE_VALUES = new Map([...WRENCH_MODES].map(([value, name]) => [name, value]));

const TURRET_MODES = new Map([
  [0, "continuous-fire"],
  [1, "volley-fire"]
]);

const TURRET_MODE_VALUES = new Map([...TURRET_MODES].map(([value, name]) => [name, value]));

function wrenchModeName(value) {
  return WRENCH_MODES.get(value) ?? null;
}

function turretModeName(value) {
  return TURRET_MODES.get(value) ?? null;
}

function normalizeWrenchMode(value) {
  const normalized = typeof value === "string" ? WRENCH_MODE_VALUES.get(value) : Number(value);
  if (normalized == null || !WRENCH_MODES.has(normalized)) {
    throw new RangeError(`Unknown wrench mode: ${value}`);
  }
  return normalized;
}

function normalizeTurretMode(value) {
  const normalized = typeof value === "string" ? TURRET_MODE_VALUES.get(value) : Number(value);
  if (normalized == null || !TURRET_MODES.has(normalized)) {
    throw new RangeError(`Unknown turret mode: ${value}`);
  }
  return normalized;
}

function normalizePositiveFinite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${name} must be a positive finite number`);
  return number;
}

function normalizePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new RangeError(`${name} must be a positive integer`);
  return number;
}

function normalizeDegrees(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new RangeError(`angle must be a finite number`);
  return ((Math.round(number) % 360) + 360) % 360;
}

function normalizeLauncherPower(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 30) {
    throw new RangeError(`launcher power must be an integer between 0 and 30`);
  }
  return number;
}

function normalizeScannerResultPacket(packet) {
  const manifest = packet?.manifest && typeof packet.manifest === "object" ? packet.manifest : {};
  const hasMaterials = manifest.materials && typeof manifest.materials === "object";
  const hasManifest = (
    (manifest.blocks && typeof manifest.blocks === "object") ||
    (manifest.objects && typeof manifest.objects === "object") ||
    (manifest.inventories && typeof manifest.inventories === "object")
  );
  return {
    kind: hasMaterials ? "bom" : hasManifest ? "manifest" : "unknown",
    sid: packet?.sid ?? null,
    shipHex: typeof manifest.ship_hex === "string" ? manifest.ship_hex : null,
    shipName: typeof manifest.ship_name === "string" ? manifest.ship_name : null,
    blocks: copyCountMap(manifest.blocks),
    objects: copyCountMap(manifest.objects),
    inventories: copyCountMap(manifest.inventories),
    materials: copyCountMap(manifest.materials)
  };
}

function copyCountMap(value) {
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, count]) => typeof count === "number")
      .map(([itemId, count]) => [String(itemId), count])
  );
}

function emptyMachineSummary() {
  return {
    itemHolders: [],
    health: [],
    fabricators: [],
    cargoEjectors: [],
    cannons: [],
    thrusters: [],
    pushers: [],
    pusherBeams: [],
    launchers: [],
    loaders: [],
    cargoHatches: [],
    navigationUnits: [],
    commsStations: [],
    fluidTanks: [],
    shieldGenerators: [],
    shieldProjectors: [],
    helms: [],
    signs: [],
    spawnPoints: [],
    doors: [],
    expandoBoxes: []
  };
}

function normalizeShipReadOptions(options) {
  if (options == null || options === true) options = {};
  return {
    includeWorld: options.includeWorld !== false,
    includeTiles: Boolean(options.includeTiles),
    includeModel: Boolean(options.includeModel),
    sort: options.sort ?? null
  };
}

function shipReadSummary(entity, options, worlds) {
  const control = entity.contents.shipControl;
  const worldState = options.includeWorld && control.shipWorldId != null
    ? worlds.worlds.get(Number(control.shipWorldId)) || null
    : null;
  const world = worldState ? worldState.snapshot({
    includeTiles: options.includeTiles,
    includeModel: options.includeModel
  }) : null;
  const current = worlds.currentShipEntity();
  const distance = distanceBetween(entity.transform, current?.transform);
  return {
    entity: entity.entity,
    name: control.name,
    hexCode: control.hexCode,
    color: control.color,
    colorCss: control.colorCss,
    position: entity.transform ? { x: entity.transform.x, y: entity.transform.y, rot: entity.transform.rot } : null,
    distance,
    footprint: entity.footprint,
    label: entity.label,
    kind: entity.kind,
    thrust: {
      x: control.thrustX,
      y: control.thrustY
    },
    shield: control.shield,
    warp: control.warp,
    worldId: control.shipWorldId,
    hasWorldData: Boolean(world),
    world,
    control,
    entitySummary: entity
  };
}

function distanceBetween(a, b) {
  if (!a || !b || typeof a.x !== "number" || typeof a.y !== "number" || typeof b.x !== "number" || typeof b.y !== "number") return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}
