import { DEFAULT_BASE_URL, DEFAULT_GAME_VERSION, DEFAULT_NOTICE_VERSION, INITIAL_OUTFIT_MESSAGE, JOIN_USER_AGENT, KEEPALIVE_INTERVAL_MS, KEEPALIVE_MESSAGE } from "../constants.js";
import { getWebSocket, isNode, normalizeBaseUrl } from "../runtime.js";
import { EventBus } from "../events.js";
import { cookieHeader, cookieName, cookiePrefix, readSetCookies } from "../net/cookies.js";
import { HttpClient } from "../net/http.js";
import { GameSession } from "../net/session.js";
import { ServerDirectory } from "../net/servers.js";
import { shipRef } from "./ships.js";
import { WorldStore } from "./world.js";
import { buildSignedCommandPacket } from "../protocol/commands.js";
import { decodeMsgpack, encodeMsgpack, cloneCommand } from "../protocol/msgpack.js";
import { toUint8Array } from "../protocol/binary.js";

export class GameConnection extends EventBus {
  constructor({ baseUrl = DEFAULT_BASE_URL, session = null, serverId = null, ship = null, gameVersion = DEFAULT_GAME_VERSION, hideBadges = false, neverLoad = false } = {}) {
    super();
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.session = session;
    this.serverId = serverId;
    this.server = null;
    this.ship = shipRef(ship);
    this.gameVersion = gameVersion;
    this.hideBadges = Boolean(hideBadges);
    this.neverLoad = Boolean(neverLoad);
    this.ws = null;
    this.join = null;
    this.sid = null;
    this.connected = false;
    this.ready = false;
    this.packetCount = 0;
    this.lastPacket = null;
    this.packets = [];
    this.worlds = new WorldStore();
    this.#readyPromise = new Promise((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
  }

  #commandNumber = 1;
  #queuedCommands = [];
  #keepalive = null;
  #bootstrapped = false;
  #resolveReady = null;
  #rejectReady = null;
  #readyPromise;

  static async connect(options = {}) {
    const connection = new GameConnection(options);
    await connection.connect();
    return connection;
  }

  static async anonymous(options = {}) {
    const session = await GameSession.anonymous(options.baseUrl || DEFAULT_BASE_URL);
    return GameConnection.connect({ ...options, session });
  }

  waitUntilReady() {
    return this.#readyPromise;
  }

  async connect() {
    if (!this.session) this.session = await GameSession.anonymous(this.baseUrl);
    if (!(this.session instanceof GameSession)) this.session = await GameSession.fromCookies({ baseUrl: this.baseUrl, ...this.session });
    if (!this.session.gameSession) await this.session.refresh();

    const directory = new ServerDirectory(this.baseUrl);
    this.gameVersion ||= await directory.version();
    const wantedServerId = Number(this.serverId ?? this.session.geoServer ?? 0);
    this.server = await directory.pick(wantedServerId);
    if (!this.server) throw new Error("Unable to resolve a game server");

    this.join = await this.#join(wantedServerId);
    this.serverId = Number.isInteger(this.join.server_id) ? this.join.server_id : wantedServerId;
    this.server = await directory.pick(this.serverId) || this.server;

    const WebSocket = await getWebSocket();
    const wsUrl = `wss://${this.server.domain}:${this.join.net_port}`;
    const headers = this.#wsHeaders();
    this.ws = this.#openSocket(WebSocket, wsUrl, headers);
    this.ws.binaryType = "arraybuffer";
    this.#bindSocket();
    return this;
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

  snapshot({ includeTiles = false } = {}) {
    return {
      baseUrl: this.baseUrl,
      session: this.session?.toJSON?.() || this.session,
      serverId: this.serverId,
      server: this.server,
      gameVersion: this.gameVersion,
      ship: this.ship,
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

  async #join(serverId) {
    const body = { join_info: {
      game_version: this.gameVersion,
      hide_badges: this.hideBadges,
      never_load: this.neverLoad,
      server_id: serverId,
      ship: this.ship
    }};
    this.#ensureJoinCookies();
    const headers = this.#joinHeaders();
    const response = await new HttpClient({ baseUrl: this.baseUrl, session: this.session }).request("join", {
      method: "POST",
      mode: "cors",
      credentials: "include",
      referrer: `${this.baseUrl}/`,
      body,
      headers
    });
    if (!response.ok) throw new Error(`Join request failed: ${await response.text()}`);
    this.#mergeSessionCookies(response);
    const join = await response.json();
    if (join.reject != null) {
      const error = new Error(`join rejected: ${join.reject}`);
      error.code = join.reject;
      error.join = join;
      throw error;
    }
    if (join.okay !== true) throw new Error("Bad join result");
    return join;
  }

  #bindSocket() {
    this.ws.onopen = () => {
      this.connected = true;
      this.ws.send(encodeMsgpack({ type: 1 }));
      this.emit("open", this);
    };

    this.ws.onmessage = (event) => this.#handleMessage(event.data);
    this.ws.onerror = (event) => {
      const error = event?.error || new Error("WebSocket error");
      this.emit("error", error);
      this.#rejectReady?.(error);
      this.#rejectReady = null;
    };
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
      this.emit("error", error);
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

  #joinHeaders() {
    const headers = {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      origin: this.baseUrl,
      referer: `${this.baseUrl}/`,
      pragma: "no-cache",
      "cache-control": "no-cache",
      dnt: "1",
      "sec-gpc": "1",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      priority: "u=0"
    };
    if (isNode()) headers["user-agent"] = JOIN_USER_AGENT;
    return headers;
  }

  #ensureJoinCookies() {
    if (!this.session?.cookies) return;
    const noticeKey = cookieName(this.baseUrl, "notice_version");
    if (!this.session.cookies.has(noticeKey)) this.session.cookies.set(noticeKey, String(DEFAULT_NOTICE_VERSION));
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

  #mergeSessionCookies(response) {
    const prefix = cookiePrefix(this.baseUrl);
    for (const [name, value] of readSetCookies(response.headers, ["game_session", "anon_key", "game_token"])) {
      this.session.cookies.set(`${prefix}${name}`, value);
    }
  }
}

export const connect = (options = {}) => GameConnection.connect(options);
export const connectAnon = (options = {}) => GameConnection.anonymous(options);
