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
    this.readyPromise = new Promise((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });

    this.#connect().catch((error) => this.#fail(error));
  }

  #commandNumber = 1;
  #queuedCommands = [];
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

  close(code = 1000, reason = "client") {
    try { this.ws?.close(code, reason); } catch (_) {}
    return this;
  }

  disconnect(code = 1000, reason = "client") {
    return this.close(code, reason);
  }

  snapshot({ includeTiles = false } = {}) {
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
      worlds: this.worlds.snapshot({ includeTiles }),
      packetCount: this.packetCount,
      lastPacket: this.lastPacket
    };
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
    if (packet.type === 21) return this.#markReady(packet);
    const worldUpdate = this.worlds.apply(packet);
    if (worldUpdate) {
      this.emit(worldUpdate.type, worldUpdate);
      this.emit("world", worldUpdate.world.snapshot());
    } else if (packet.type === 25 || packet.type === 26) {
      this.emit("event", packet);
    }
  }

  #markReady(packet) {
    this.sid = packet.sid >>> 0;
    this.worlds.currentWorldId = packet.world ?? this.worlds.currentWorldId;
    this.ready = true;
    this.#sendBootstrap();
    this.#startKeepalive();
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

  #fail(error) {
    this.#rejectReady?.(error);
    this.#rejectReady = null;
    try { this.emit("error", error); } catch (_) {}
  }
}
