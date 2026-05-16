import { DEFAULT_BASE_URL, DEFAULT_NOTICE_VERSION, JOIN_USER_AGENT } from "../constants.js";
import { asNumber, isNode, normalizeBaseUrl } from "../runtime.js";
import { cookieName, cookiePrefix, readSetCookies, setCookieValues } from "./cookies.js";
import { HttpClient } from "./http.js";
import { fetchGameVersion, resolveServer, serverId } from "./servers.js";
import { createShipSpec, fetchShips, fetchShipList, shipRef } from "../game/ships.js";
import { Connection } from "../game/connection.js";
import { DredlessClient } from "../client.js";

export class Session {
  constructor(gameSession = null, gameVersion = null) {
    this.baseUrl = DEFAULT_BASE_URL;
    this.cookies = setCookieValues(this.baseUrl, {});
    this.gameVersion = gameVersion || null;
    this._noticeVersion = null;
    this.raw = null;
    this.account = null;
    this.geoServer = null;
    this.upgraded = false;
    this.isRegistered = false;
    this.showAds = false;
    this.forceTutorial = false;
    this.ban = null;
    if (gameSession) this.cookies.set(cookieName(this.baseUrl, "game_session"), String(gameSession));
  }

  get gameSession() {
    return this.cookies.get(cookieName(this.baseUrl, "game_session")) || "";
  }

  get gameToken() {
    return this.cookies.get(cookieName(this.baseUrl, "game_token")) || "";
  }

  get noticeVersion() {
    return this._noticeVersion ?? this.cookies.get(cookieName(this.baseUrl, "notice_version")) ?? null;
  }

  set noticeVersion(value) {
    this._noticeVersion = value == null ? null : Number(value);
    const key = cookieName(this.baseUrl, "notice_version");
    if (value == null) this.cookies.delete(key);
    else this.cookies.set(key, String(value));
  }

  request(path, init = {}) {
    return new HttpClient({ baseUrl: this.baseUrl, session: this }).request(path, init);
  }

  async fetchAccountStatus() {
    const response = await this.request("account/status", {
      method: "GET",
      mode: "cors",
      credentials: "include",
      referrer: `${this.baseUrl}/`,
      headers: statusHeaders(this.baseUrl)
    });
    if (!response.ok) throw new Error(`account/status failed: ${response.status} ${response.statusText}`);
    this.mergeSetCookies(response);
    const raw = await response.json();
    this.#readStatus(raw);
    return raw;
  }

  async fetchShips(server) {
    return fetchShips(this, server);
  }

  async fetchShipList(server) {
    return fetchShipList(this, server);
  }

  async startJoinConnection(server, ship = null) {
    return this.#startConnection(server, ship, true);
  }

  async startConnection(server, ship = null) {
    return this.#startConnection(server, ship, false);
  }

  async startNewShipConnection(server, name = "", color = "") {
    return this.#startConnection(server, createShipSpec(name, color), false);
  }

  async join(server, ship = null) {
    return readyClient(await this.startJoinConnection(server, ship));
  }

  async start(server, ship = null) {
    return readyClient(await this.startConnection(server, ship));
  }

  async newShip(server, name = "", color = "") {
    return readyClient(await this.startNewShipConnection(server, name, color));
  }

  toJSON() {
    return {
      baseUrl: this.baseUrl,
      gameSession: this.gameSession,
      gameToken: this.gameToken,
      gameVersion: this.gameVersion,
      noticeVersion: this.noticeVersion,
      cookies: Object.fromEntries(this.cookies),
      account: this.account,
      geoServer: this.geoServer,
      upgraded: this.upgraded,
      isRegistered: this.isRegistered,
      showAds: this.showAds,
      forceTutorial: this.forceTutorial,
      ban: this.ban,
      raw: this.raw
    };
  }

  async #startConnection(server, ship, neverLoad) {
    if (server == null) throw new Error("A server id or server object is required");
    const resolvedServer = await resolveServer(server, this.baseUrl);
    if (!resolvedServer) throw new Error(`Unable to resolve server ${serverId(server)}`);
    if (!this.gameVersion) this.gameVersion = await fetchGameVersion(this.baseUrl);
    if (this.noticeVersion == null) this.noticeVersion = DEFAULT_NOTICE_VERSION;

    const joinShip = ship == null ? createShipSpec("", "") : shipRef(ship);
    const response = await this.request("join", {
      method: "POST",
      mode: "cors",
      credentials: "include",
      referrer: `${this.baseUrl}/`,
      body: {
        join_info: {
          game_version: this.gameVersion,
          hide_badges: false,
          never_load: Boolean(neverLoad),
          server_id: resolvedServer.index,
          ship: joinShip
        }
      },
      headers: joinHeaders(this.baseUrl)
    });
    if (!response.ok) throw new Error(`Join request failed: ${await response.text()}`);
    this.mergeSetCookies(response, ["game_session", "anon_key", "game_token"]);
    const join = await response.json();
    if (join.reject != null) {
      const error = new Error(joinRejectMessage(join.reject, { neverLoad, ship: joinShip, server: resolvedServer }));
      error.code = join.reject;
      error.join = join;
      throw error;
    }
    if (join.okay !== true) throw new Error("Bad join result");

    const token = this.gameToken;
    if (!token) throw new Error("Join did not return a game_token cookie");
    return new Connection(this, token, join.net_port, Number.isInteger(join.server_id) ? join.server_id : resolvedServer.index, resolvedServer);
  }

  mergeSetCookies(response, names = ["game_session", "anon_key"]) {
    const prefix = cookiePrefix(this.baseUrl);
    for (const [name, value] of readSetCookies(response.headers, names)) {
      this.cookies.set(`${prefix}${name}`, value);
    }
  }

  #readStatus(raw) {
    const account = raw?.account && typeof raw.account === "object" ? raw.account : null;
    this.raw = raw;
    this.account = account ? {
      name: account.name || account.username || account.display_name || account.displayName || account.handle || "Unknown",
      color: asNumber(account.color, 0),
      game_rank: asNumber(account.game_rank, 0),
      user_badges: Array.isArray(account.user_badges) ? account.user_badges.filter((item) => typeof item === "string") : [],
      is_registered: Boolean(account.is_registered),
      raw: account
    } : null;
    this.geoServer = asNumber(raw?.geo_server ?? raw?.geoServer, null);
    this.upgraded = Boolean(raw?.upgraded ?? account?.upgraded);
    this.isRegistered = Boolean(account?.is_registered);
    this.showAds = Boolean(raw?.show_ads ?? raw?.showAds);
    this.forceTutorial = Boolean(raw?.force_tutorial ?? raw?.forceTutorial);
    this.ban = raw?.ban || null;
  }
}

export class AnonSession extends Session {
  constructor(gameSession = null, anonKey = null, gameVersion = null) {
    super(gameSession, gameVersion);
    if (anonKey) this.cookies.set(cookieName(this.baseUrl, "anon_key"), String(anonKey));
  }

  get anonKey() {
    return this.cookies.get(cookieName(this.baseUrl, "anon_key")) || "";
  }

  toJSON() {
    return {
      ...super.toJSON(),
      anonKey: this.anonKey
    };
  }
}

export async function createSession(noticeVersion = null) {
  const session = new Session();
  session.noticeVersion = await internalNoticeVersion(noticeVersion);
  await session.fetchAccountStatus();
  return session;
}

export async function createAnonToken(noticeVersion = null) {
  const session = new AnonSession();
  session.noticeVersion = await internalNoticeVersion(noticeVersion);
  const response = await session.request("account/login/anon", {
    method: "POST",
    mode: "cors",
    credentials: "include",
    referrer: `${session.baseUrl}/`,
    headers: anonHeaders()
  });
  if (response.status === 503) throw new Error("Anon token creation is rate limited by the server");
  if (!response.ok) throw new Error(`account/login/anon failed: ${response.status} ${response.statusText}`);
  session.mergeSetCookies(response, ["anon_key", "game_session"]);
  if (!session.anonKey) throw new Error("Unable to obtain anon_key");
  return session.anonKey;
}

export async function createAnonSession(anonKey = null, noticeVersion = null) {
  const resolvedAnonKey = anonKey || await createAnonToken(noticeVersion);
  const session = new AnonSession(null, resolvedAnonKey);
  session.noticeVersion = await internalNoticeVersion(noticeVersion);
  await session.fetchAccountStatus();
  return session;
}

async function readyClient(connection) {
  const client = new DredlessClient(connection);
  await client.waitUntilReady();
  return client;
}

async function internalNoticeVersion(value) {
  if (value != null) return value;
  try {
    const { fetchNoticeVersion } = await import("./servers.js");
    return await fetchNoticeVersion(DEFAULT_BASE_URL);
  } catch (_) {
    return DEFAULT_NOTICE_VERSION;
  }
}

function statusHeaders(baseUrl) {
  const headers = { accept: "*/*" };
  if (isNode()) {
    Object.assign(headers, {
      "user-agent": JOIN_USER_AGENT,
      "accept-language": "en-US,en;q=0.9",
      referer: `${normalizeBaseUrl(baseUrl)}/`,
      dnt: "1",
      "sec-gpc": "1",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin"
    });
  }
  return headers;
}

function anonHeaders() {
  const headers = { accept: "application/json" };
  if (isNode()) headers["user-agent"] = JOIN_USER_AGENT;
  return headers;
}

function joinHeaders(baseUrl) {
  const headers = {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    origin: normalizeBaseUrl(baseUrl),
    referer: `${normalizeBaseUrl(baseUrl)}/`,
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

function joinRejectMessage(code, { neverLoad, ship, server } = {}) {
  if (code === 4007 && neverLoad) {
    const name = ship?.name ? ` "${ship.name}"` : "";
    const id = ship?.id != null ? ` (${ship.id})` : "";
    const serverText = server?.description ? ` on ${server.description}` : "";
    return `join rejected: 4007. ${name}${id}${serverText} could not be joined with never_load=true. Use session.start(server, ship) instead of session.join(server, ship) when loading or starting a saved ship.`;
  }
  return `join rejected: ${code}`;
}
