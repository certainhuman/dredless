import { INITIAL_OUTFIT_MESSAGE, JOIN_USER_AGENT, KEEPALIVE_INTERVAL_MS, KEEPALIVE_MESSAGE } from "./constants.js";
import { getWebSocket, isNode } from "./runtime.js";
import { EventBus } from "./events.js";
import { cookieHeader } from "./net/cookies.js";
import { fetchServers } from "./net/servers.js";
import { Connection } from "./game/connection.js";
import { WorldStore } from "./game/world.js";
import { buildBlueprintPlacementMessage } from "./protocol/blueprint.js";
import { buildCommsMessage, normalizeCommsEvent } from "./protocol/comms.js";
import { buildSignedCommandPacket } from "./protocol/commands.js";
import {
  buildEquipItemCommand,
  buildInventoryDragCommand,
  buildUnequipItemCommand,
  normalizeInventoryEvent
} from "./protocol/inventory.js";
import {
  buildInviteResetMessage,
  buildPlayerListMessage,
  buildShipManagementMessage,
  buildShipPrivacyMessage,
  buildStarterRecoveryMessage,
  normalizeCaptainSubrankEvent,
  normalizePlayerListEvent,
  normalizeShipConfigEvent
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
  constructor(connection) {
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

    this.#connect().catch((error) => this.#fail(error));
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
      wrenchMode: this.#inputSettings.wrench_mode,
      wrenchModeName: wrenchModeName(this.#inputSettings.wrench_mode),
      turretMode: this.#inputSettings.turret_mode,
      turretModeName: turretModeName(this.#inputSettings.turret_mode),
      viewWidth: this.#inputSettings.vx ?? null,
      viewHeight: this.#inputSettings.vy ?? null,
      screenWidth: this.#inputSettings.scr_w ?? null,
      screenHeight: this.#inputSettings.scr_h ?? null
    };
  }

  setInputSettings(settings = {}, { send = true } = {}) {
    const wrench = settings.wrenchMode ?? settings.wrench_mode;
    const turret = settings.turretMode ?? settings.turret_mode;
    const viewWidth = settings.viewWidth ?? settings.vx;
    const viewHeight = settings.viewHeight ?? settings.vy;
    const screenWidth = settings.screenWidth ?? settings.scr_w;
    const screenHeight = settings.screenHeight ?? settings.scr_h;
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

  selectSlot(invSlot = 0, command = {}) {
    return this.send({ ...command, inv_slot: invSlot });
  }

  drag(source, target, split = false, command = {}) {
    return this.moveInventoryItem(source, target, { split }, command);
  }

  moveInventoryItem(source, target, { split = false } = {}, command = {}) {
    return this.send({ ...command, ...buildInventoryDragCommand(source, target, split) });
  }

  equipItem(source, equipmentSlot, { split = false } = {}, command = {}) {
    return this.send({ ...command, ...buildEquipItemCommand(source, equipmentSlot, split) });
  }

  unequipItem(equipmentSlot, target = 0, { split = false } = {}, command = {}) {
    return this.send({ ...command, ...buildUnequipItemCommand(equipmentSlot, target, split) });
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

  entities(scope = "ship") {
    return this.#readWorld(scope)?.entities() || [];
  }

  entity(entityId, scope = "ship") {
    return this.#readWorld(scope)?.entity(entityId) || null;
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
      this.shipConfig = normalizeShipConfigEvent(submessage);
      this.emit("ship-config", this.shipConfig, packet);
      return;
    }
    if (submessage.type === "captain_subrank") {
      this.captainSubrank = normalizeCaptainSubrankEvent(submessage);
      this.emit("captain-subrank", this.captainSubrank, packet);
      return;
    }
    if (submessage.type === "player_list") {
      this.playerList = normalizePlayerListEvent(submessage);
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
  puiPanels() { return [...this.client.puiPanels.values()]; }
  commsPanels() { return [...this.client.commsPanels.values()]; }
}

class PlayerDomain {
  constructor(client) { this.client = client; }
  move({ x = 0, y = 0 } = {}, command = {}) { return this.client.move(x, y, command); }
  aim({ x = 0, y = 0, mx = x, my = y } = {}, command = {}) { return this.client.aim(mx, my, command); }
  action(flags = {}, command = {}) { return this.client.action(flags, command); }
  useEntity(entity, options = {}, command = {}) { return this.client.useEntity(entityIdOf(entity), options, command); }
  useHeldItem(options = {}, command = {}) { return this.client.useHeldItem(options, command); }
  placeHeldItem(options = {}, command = {}) { return this.client.placeHeldItem(options, command); }
  placeBlueprint(placement, options = {}, command = {}) { return this.client.placeBlueprint(placement, options, command); }
  rotateHeldItem(options = {}, command = {}) { return this.client.rotateHeldItem(options, command); }
  selectSlot(invSlot = 0, command = {}) { return this.client.selectSlot(invSlot, command); }
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
  config() { return this.client.shipConfig; }
  captainSubrank() { return this.client.captainSubrank; }
  playerList() { return this.client.playerList; }
}
class InventoryDomain {
  constructor(client) { this.client = client; }
  current() { return this.client.inventoryState; }
  slots() { return this.current()?.slots || []; }
  hotbar() { return this.current()?.hotbar || []; }
  equipment() { return this.current()?.equipment || { back: null, hands: null, feet: null }; }
  drag(source, target, { split = false } = {}, command = {}) { return this.client.moveInventoryItem(source, target, { split }, command); }
  move(source, target, options = {}, command = {}) { return this.drag(source, target, options, command); }
  equip(source, equipmentSlot, options = {}, command = {}) { return this.client.equipItem(source, equipmentSlot, options, command); }
  unequip(equipmentSlot, target = 0, options = {}, command = {}) { return this.client.unequipItem(equipmentSlot, target, options, command); }
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

class EntityCollection {
  constructor(client, scope) { this.client = client; this.scope = scope; }
  all() { return summariesFor(this.client, this.scope).map((summary) => new EntityHandle(this.client, summary.entity, this.scope)); }
  raw() { return summariesFor(this.client, this.scope); }
  get(entity) { return new EntityHandle(this.client, entityIdOf(entity), this.scope); }
}

class PlayerCollection {
  constructor(client, scope) { this.client = client; this.scope = scope; }
  all() { return worldStateFor(this.client, this.scope)?.model.players() || []; }
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
  summary() { return worldStateFor(this.client, this.scope)?.model.machines() || emptyMachineSummary(); }
  loaders() { return this.summary().loaders.map((item) => new LoaderHandle(this.client, item.entity, this.scope)); }
  loader(entity) { return new LoaderHandle(this.client, entityIdOf(entity), this.scope); }
  pushers() { return this.summary().pushers.map((item) => new PusherHandle(this.client, item.entity, this.scope)); }
  pusher(entity) { return new PusherHandle(this.client, entityIdOf(entity), this.scope); }
  launchers() { return this.summary().launchers.map((item) => new LauncherHandle(this.client, item.entity, this.scope)); }
  launcher(entity) { return new LauncherHandle(this.client, entityIdOf(entity), this.scope); }
  navigationUnits() { return this.summary().navigationUnits.map((item) => new NavigationUnitHandle(this.client, item.entity, this.scope)); }
  navigationUnit(entity = null) { const id = entity == null ? this.summary().navigationUnits[0]?.entity : entityIdOf(entity); return id == null ? null : new NavigationUnitHandle(this.client, id, this.scope); }
  fabricators() { return this.summary().fabricators.map((item) => new FabricatorHandle(this.client, item.entity, this.scope)); }
  fabricator(entity) { return new FabricatorHandle(this.client, entityIdOf(entity), this.scope); }
  commsStations() { return this.summary().commsStations.map((item) => new CommsStationHandle(this.client, item.entity, this.scope)); }
  commsStation(entity = null) { const id = entity == null ? this.summary().commsStations[0]?.entity : entityIdOf(entity); return id == null ? null : new CommsStationHandle(this.client, id, this.scope); }
  signs() { return summariesFor(this.client, this.scope).filter((item) => item.contents?.sign).map((item) => new SignHandle(this.client, item.entity, this.scope)); }
  sign(entity) { return new SignHandle(this.client, entityIdOf(entity), this.scope); }
  generators() { return this.summary().shieldGenerators.map((item) => new GeneratorHandle(this.client, item.entity, this.scope)); }
  generator(entity) { return new GeneratorHandle(this.client, entityIdOf(entity), this.scope); }
  cargoHatches() { return this.summary().cargoHatches.map((item) => new CargoHatchHandle(this.client, item.entity, this.scope)); }
  cargoHatch(entity) { return new CargoHatchHandle(this.client, entityIdOf(entity), this.scope); }
  cargoEjector(entity) { return new CargoEjectorHandle(this.client, entityIdOf(entity), this.scope); }
}

class EntityHandle {
  constructor(client, entity, scope = "ship") { this.client = client; this.entity = Number(entity); this.scope = scope; }
  exists() { return Boolean(this.snapshot()); }
  snapshot() { return worldStateFor(this.client, this.scope)?.entity(this.entity) || null; }
  get id() { return this.entity; }
  get position() { return this.snapshot()?.transform || null; }
  get health() { return this.snapshot()?.contents?.health || null; }
  get contents() { return this.snapshot()?.contents || null; }
  use(options = {}, command = {}) { return this.client.player.useEntity(this.entity, options, command); }
}

class MachineHandle extends EntityHandle {
  open(options = {}, command = {}) { return this.use(options, command); }
}

class LoaderHandle extends MachineHandle {
  summary() { return this.snapshot()?.contents?.loader || null; }
  configure(config = {}) { return this.client.sendLoaderConfig(this.entity, config); }
  configureFull(config = {}) { return this.client.sendLoaderFullConfig(this.entity, config); }
  copy(config = {}) { return this.client.copyLoaderConfig(this.entity, config); }
  setPickPlace(pick, place, config = {}) { return this.client.setLoaderPickPlace(this.entity, pick, place, config); }
  setPriority(priority, config = {}) { return this.client.setLoaderPriority(this.entity, priority, config); }
  setStack(stack, config = {}) { return this.client.setLoaderStack(this.entity, stack, config); }
  setCycle(cycle, config = {}) { return this.client.setLoaderCycle(this.entity, cycle, config); }
  setRequireOutput(requireOutput, config = {}) { return this.client.setLoaderRequireOutput(this.entity, requireOutput, config); }
  setWaitForStack(waitForStack, config = {}) { return this.client.setLoaderWaitForStack(this.entity, waitForStack, config); }
  setFilterMode(filterMode) { return this.client.setLoaderFilterMode(this.entity, filterMode); }
  setFilterItems(filterSlots = []) { return this.client.setLoaderFilterItems(this.entity, filterSlots); }
  get pick() { return this.summary()?.pick; }
  get place() { return this.summary()?.place; }
  get priority() { return this.summary()?.priority; }
  get stack() { return this.summary()?.stack; }
  get cycle() { return this.summary()?.cycle; }
  get requireOutput() { return this.summary()?.requireOutput; }
  get waitForStack() { return this.summary()?.waitForStack; }
  get filterMode() { return this.summary()?.filterMode; }
  get filterSlots() { return this.summary()?.filterSlots || []; }
}

class PusherHandle extends MachineHandle {
  summary() { return this.snapshot()?.contents?.pusher || null; }
  get beam() { return this.snapshot()?.contents?.pusherBeam || null; }
  configure(config = {}) { return this.client.sendPusherConfig(this.entity, config); }
  setAngle(angle, config = {}) { return this.client.setPusherAngle(this.entity, angle, config); }
  setSpeed(speed, config = {}) { return this.client.setPusherSpeed(this.entity, speed, config); }
  setLength(length, config = {}) { return this.client.setPusherLength(this.entity, length, config); }
  setMode(mode, config = {}) { return this.client.setPusherMode(this.entity, mode, config); }
  setFilteredMode(mode, config = {}) { return this.client.setPusherFilteredMode(this.entity, mode, config); }
  setFilterInventory(filterInventory, config = {}) { return this.client.setPusherFilterInventory(this.entity, filterInventory, config); }
  setFilterItems(filterSlots = []) { return this.client.setPusherFilterItems(this.entity, filterSlots); }
  get angle() { return this.summary()?.angle; }
  get speed() { return this.summary()?.speed; }
  get length() { return this.summary()?.length; }
  get mode() { return this.summary()?.mode; }
  get filteredMode() { return this.summary()?.filteredMode; }
}

class LauncherHandle extends MachineHandle {
  summary() { return this.snapshot()?.contents?.launcher || null; }
  setAngle(angle) { return this.client.setLauncherAngle(angle); }
  setPower(power) { return this.client.setLauncherPower(power); }
  get angleDegrees() { return this.summary()?.angleDegrees; }
  get angleRadians() { return this.summary()?.angleRadians; }
  get angleRaw() { return this.summary()?.angleRaw; }
}

class NavigationUnitHandle extends MachineHandle {
  summary() { return this.snapshot()?.contents?.navigationUnit || null; }
  configure(config = {}) { return this.client.sendNavigationUnitConfig(this.entity, config); }
  copy(config = {}) { return this.client.copyNavigationUnitConfig(this.entity, config); }
  paste(config = {}) { return this.client.pasteNavigationUnitConfig(this.entity, config); }
  setDestination(destination, config = {}) { return this.client.setNavigationDestination(this.entity, destination, config); }
  setAutoWarp(config = {}) { return this.client.setNavigationAutoWarp(this.entity, config); }
  startWarp(config = {}) { return this.client.startWarp(this.entity, config); }
  cancelWarp(config = {}) { return this.client.cancelWarp(this.entity, config); }
  get destination() { return this.summary()?.destination; }
  get autoWarpOnShieldFailure() { return this.summary()?.autoWarpOnShieldFailure; }
  get autoWarpOnNoCaptains() { return this.summary()?.autoWarpOnNoCaptains; }
  get warp() { return this.summary()?.warp; }
}

class FabricatorHandle extends MachineHandle {
  panel() { return this.client.puiPanels.get(this.entity) || null; }
  add(itemId, count = 1, index = -1) { return this.client.craftAdd(itemId, count, index); }
  sub(itemId, count = 1, index = 0) { return this.client.craftSub(itemId, count, index); }
  clearQueue() { return this.client.craftClearQueue(); }
  toggleRepeat() { return this.client.craftToggleRepeat(); }
  lockResource(row) { return this.client.fabricatorLockResource(row); }
  unlockResource(row) { return this.client.fabricatorUnlockResource(row); }
  eject(row) { return this.client.fabricatorEject(row); }
}

class CommsStationHandle extends MachineHandle {
  summary() { return this.snapshot()?.contents?.commsStation || null; }
  panel() { return this.client.commsPanels.get(this.entity) || null; }
  sendMessage(message = "") { return this.client.sendCommsMessage(message); }
}
class SignHandle extends MachineHandle {
  summary() { return this.snapshot()?.contents?.sign || null; }
  setText(text = "", mode = 0) { return this.client.setSignText(text, mode); }
  get text() { return this.summary()?.text; }
  get mode() { return this.summary()?.mode; }
}

class GeneratorHandle extends MachineHandle {
  summary() { return this.snapshot()?.contents?.shieldGenerator || null; }
  solvePuzzle(solution) { return this.client.solveGeneratorPuzzle(this.entity, solution); }
}

class CargoHatchHandle extends MachineHandle {
  summary() { return this.snapshot()?.contents?.cargoHatch || null; }
  configure(config = {}) { return this.client.sendCargoHatchFullConfig(this.entity, config); }
  copy(config = {}) { return this.client.copyCargoHatchConfig(this.entity, config); }
  paste(config = {}) { return this.client.pasteCargoHatchConfig(this.entity, config); }
  setFilterMode(filterMode) { return this.client.setCargoHatchFilterMode(this.entity, filterMode); }
  setFilterItems(filterSlots = []) { return this.client.setCargoHatchFilterItems(this.entity, filterSlots); }
}

class CargoEjectorHandle extends MachineHandle {
  setDirection(direction) { return this.client.setCargoEjectorDirection(this.entity, direction); }
  copy(direction = "right") { return this.client.copyCargoEjectorConfig(this.entity, direction); }
  paste(direction = "right") { return this.client.pasteCargoEjectorConfig(this.entity, direction); }
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

function worldStateFor(client, scope = "ship") {
  if (scope == null || scope === "ship" || scope === "current") return client.worlds.shipWorld();
  if (scope === "overworld") return client.worlds.overworld();
  return client.worlds.worlds.get(Number(scope)) || null;
}

function summariesFor(client, scope = "ship") {
  return worldStateFor(client, scope)?.entities() || [];
}

function entityIdOf(value) {
  if (value && typeof value === "object") return Number(value.entity ?? value.id);
  return Number(value);
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
    processors: [],
    cannons: [],
    thrusters: [],
    pushers: [],
    pusherBeams: [],
    launchers: [],
    loaders: [],
    navigationUnits: [],
    commsStations: [],
    fluidTanks: [],
    shieldGenerators: [],
    shieldProjectors: [],
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








