import { INITIAL_OUTFIT_MESSAGE, JOIN_USER_AGENT, KEEPALIVE_INTERVAL_MS, KEEPALIVE_MESSAGE } from "./constants.js";
import { getWebSocket, isNode } from "./runtime.js";
import { EventBus } from "./events.js";
import { cookieHeader } from "./net/cookies.js";
import { fetchServers } from "./net/servers.js";
import { Connection } from "./game/connection.js";
import { WorldStore } from "./game/world.js";
import { buildSignedCommandPacket } from "./protocol/commands.js";
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
    this.cpuLoad = null;
    this.inventory = null;
    this.puiPanels = new Map();
    this.warnings = [];
    this.effects = [];
    this.chat = [];
    this.motd = [];
    this.sessionMessages = [];
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

  waitUntilReady() {
    return this.readyPromise;
  }

  send(command) {
    const normalized = cloneCommand(command);
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

  setOutfit(outfit) {
    return this.sendMessage({ type: 7, outfit });
  }

  sendFabricatorMessage(cmd, args = [-1, -1, -1]) {
    return this.sendMessage({ type: 5, cmd, args });
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

  sendUiConfig(data) {
    return this.sendMessage({ type: 8, data });
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

  selectSlot(invSlot = 0, command = {}) {
    return this.send({ ...command, inv_slot: invSlot });
  }

  drag(source, target, split = false, command = {}) {
    return this.send({ ...command, drag: { source, target, split } });
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
      inventory: this.inventory,
      puiPanels: [...this.puiPanels.values()],
      warnings: this.warnings.slice(-50),
      effects: this.effects.slice(-50),
      chat: this.chat.slice(-50),
      motd: this.motd.slice(-20),
      sessionMessages: this.sessionMessages.slice(-50),
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

  world(id, options = {}) {
    return this.worlds.worlds.get(Number(id))?.snapshot(options) || null;
  }

  overworld(options = {}) {
    return this.worlds.overworld()?.snapshot(options) || null;
  }

  shipWorld(options = {}) {
    return this.worlds.shipWorld()?.snapshot(options) || null;
  }

  ship(options = {}) {
    return this.shipWorld(options);
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

  #handleSideEvent(event, world) {
    if (!event || typeof event !== "object") return;
    if (event.type === "inventory") {
      this.inventory = normalizeInventory(event);
      this.emit("inventory", this.inventory, world);
      return;
    }
    if (event.type === "pui") {
      const panel = { ...event, world: world?.id ?? null };
      if (event.ent_id != null) this.puiPanels.set(event.ent_id, panel);
      this.emit("pui", panel, world);
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

function emptyMachineSummary() {
  return {
    itemHolders: [],
    health: [],
    fabricators: [],
    processors: [],
    cannons: [],
    thrusters: [],
    pushers: [],
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

function normalizeInventory(event) {
  const items = Array.isArray(event.items) ? event.items : [];
  const counts = Array.isArray(event.item_counts) ? event.item_counts : [];
  const generalSlots = Number(event.general_slots ?? 0);
  const length = Math.max(items.length, counts.length, generalSlots);
  const slots = [];
  for (let index = 0; index < length; index++) {
    slots.push({
      index,
      itemId: items[index] ?? null,
      count: counts[index] ?? 0,
      kind: index < generalSlots ? "hotbar" : "equipment"
    });
  }
  return {
    ...event,
    general_slots: generalSlots,
    slots,
    hotbar: slots.slice(0, generalSlots),
    equipment: {
      back: slots[19] || null,
      hands: slots[20] || null,
      feet: slots[21] || null
    }
  };
}
