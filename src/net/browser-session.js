import { DEFAULT_BASE_URL, DEFAULT_NOTICE_VERSION } from "../constants.js";
import { normalizeBaseUrl } from "../runtime.js";
import { browserCookies, cookieName, readBrowserCookie } from "./cookies.js";
import { fetchGameVersion, fetchNoticeVersion, resolveServer, serverId } from "./servers.js";
import { createInviteShipSpec, createShipSpec, fetchShips as fetchSessionShips, fetchShipList, shipRef } from "../game/ships.js";
import { Connection } from "../game/connection.js";
import { DredlessClient } from "../client.js";
import { Session } from "./session.js";

export class BrowserSession extends Session {
  constructor(baseUrl = DEFAULT_BASE_URL) {
    super(null, null, baseUrl);
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.ambientAuth = true;
  }

  get gameSession() {
    return browserCookies().get(cookieName(this.baseUrl, "game_session")) || "";
  }

  get gameToken() {
    return browserCookies().get(cookieName(this.baseUrl, "game_token")) || "";
  }

  get anonKey() {
    return this._anonKey || browserCookies().get(cookieName(this.baseUrl, "anon_key")) || "";
  }

  async readAnonKey() {
    const key = await readBrowserCookie(cookieName(this.baseUrl, "anon_key"));
    if (key) this._anonKey = key;
    return key || "";
  }

  async fetchAnonKey(noticeVersion = null) {
    this.noticeVersion = await browserNoticeVersion(noticeVersion, this.baseUrl);
    await createAnonLogin(this);
    const key = await this.readAnonKey();
    if (!key) throw new Error("Unable to read anon_key after anon login. Browser support is tested in page and content-script contexts; background, popup, worker, and other non-page contexts are unlikely to expose drednot.io cookies.");
    return key;
  }

  get noticeVersion() {
    return this._noticeVersion ?? browserCookies().get(cookieName(this.baseUrl, "notice_version")) ?? null;
  }

  set noticeVersion(value) {
    this._noticeVersion = value == null ? null : Number(value);
    if (typeof document === "undefined" || value == null) return;
    document.cookie = `${cookieName(this.baseUrl, "notice_version")}=${encodeURIComponent(String(value))}; path=/; SameSite=Lax`;
  }

  mergeSetCookies() {
    // Browsers own the cookie jar. Set-Cookie is intentionally not readable.
  }

  async joinShipConnection(server, ship = null) {
    return this.#joinBrowserConnection(server, ship, true);
  }

  async startShipConnection(server, ship = null) {
    return this.#joinBrowserConnection(server, ship, false);
  }

  async startNewShipConnection(server, name = "", color = "") {
    return this.#joinBrowserConnection(server, createShipSpec(name, color), false);
  }

  async joinInviteConnection(server, code) {
    return this.#joinBrowserConnection(server, createInviteShipSpec(code), false);
  }

  async joinShip(server, ship = null) {
    return readyBrowserClient(await this.joinShipConnection(server, ship));
  }

  async startShip(server, ship = null) {
    return readyBrowserClient(await this.startShipConnection(server, ship));
  }

  async startNewShip(server, name = "", color = "") {
    return readyBrowserClient(await this.startNewShipConnection(server, name, color));
  }

  async joinInvite(server, code) {
    return readyBrowserClient(await this.joinInviteConnection(server, code));
  }

  async #joinBrowserConnection(server, ship, neverLoad) {
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
      headers: browserJoinHeaders(this.baseUrl)
    });
    if (!response.ok) throw new Error(`Join request failed: ${await response.text()}`);
    const join = await response.json();
    if (join.reject != null) {
      const error = new Error(joinRejectMessage(join.reject, { neverLoad, ship: joinShip, server: resolvedServer }));
      error.code = join.reject;
      error.join = join;
      throw error;
    }
    if (join.okay !== true) throw new Error("Bad join result");

    const token = join.game_token ?? join.gameToken ?? this.gameToken;
    return new Connection(this, token || "", join.net_port, Number.isInteger(join.server_id) ? join.server_id : resolvedServer.index, resolvedServer);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      ambientAuth: true,
      cookies: Object.fromEntries(browserCookies())
    };
  }
}

let defaultBrowserSession = null;

export function browserSession(baseUrl = DEFAULT_BASE_URL) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!defaultBrowserSession || defaultBrowserSession.baseUrl !== normalized) defaultBrowserSession = new BrowserSession(normalized);
  return defaultBrowserSession;
}

export function setBrowserSession(session = null) {
  defaultBrowserSession = session;
  return defaultBrowserSession;
}

export const createBrowserSession = browserSession;

export async function createSession(noticeVersion = null, baseUrl = DEFAULT_BASE_URL) {
  const resolvedBaseUrl = normalizeBaseUrl(arguments.length >= 2 ? arguments[1] : baseUrl);
  const session = browserSession(resolvedBaseUrl);
  session.noticeVersion = await browserNoticeVersion(noticeVersion, resolvedBaseUrl);
  await session.fetchAccountStatus();
  return session;
}

export async function createAnonSession(anonKey = null, noticeVersion = null, baseUrl = DEFAULT_BASE_URL) {
  if (typeof noticeVersion === "string" && noticeVersion.includes("://") && (baseUrl == null || baseUrl === DEFAULT_BASE_URL)) {
    baseUrl = noticeVersion;
    noticeVersion = null;
  }
  const resolvedBaseUrl = normalizeBaseUrl(arguments.length >= 3 ? arguments[2] : baseUrl);
  const session = browserSession(resolvedBaseUrl);
  session.noticeVersion = await browserNoticeVersion(noticeVersion, resolvedBaseUrl);
  if (anonKey) {
    session._anonKey = String(anonKey);
    await setAmbientCookie(resolvedBaseUrl, "anon_key", anonKey);
  } else {
    await session.fetchAnonKey(session.noticeVersion);
  }
  await session.fetchAccountStatus();
  return session;
}

export async function fetchAnonKey(noticeVersion = null, baseUrl = DEFAULT_BASE_URL) {
  const resolvedBaseUrl = normalizeBaseUrl(arguments.length >= 2 ? arguments[1] : baseUrl);
  return browserSession(resolvedBaseUrl).fetchAnonKey(noticeVersion);
}

export const createAnonToken = fetchAnonKey;

export async function fetchAccountStatus(session = null) {
  return (session || browserSession()).fetchAccountStatus();
}

export async function fetchShips(server, session = null) {
  return fetchSessionShips(session || browserSession(), server);
}

export async function fetchShipListForBrowser(server, session = null) {
  return fetchShipList(session || browserSession(), server);
}

export async function joinShip(server, ship = null, session = null) {
  return (session || browserSession()).joinShip(server, ship);
}

export async function startShip(server, ship = null, session = null) {
  return (session || browserSession()).startShip(server, ship);
}

export async function startNewShip(server, name = "", color = "", session = null) {
  return (session || browserSession()).startNewShip(server, name, color);
}

export async function joinInvite(server, code, session = null) {
  return (session || browserSession()).joinInvite(server, code);
}

async function readyBrowserClient(connection) {
  const client = new DredlessClient(connection);
  await client.whenReady();
  return client;
}

async function createAnonLogin(session) {
  const response = await session.request("account/login/anon", {
    method: "POST",
    mode: "cors",
    credentials: "include",
    referrer: `${session.baseUrl}/`,
    headers: browserAnonHeaders(session.baseUrl)
  });
  if (response.status === 503) throw new Error("Anon session creation is rate limited by the server");
  if (!response.ok) throw new Error(`account/login/anon failed: ${response.status} ${response.statusText}`);
  session.mergeSetCookies(response, ["anon_key", "game_session"]);
}

async function browserNoticeVersion(value, baseUrl = DEFAULT_BASE_URL) {
  if (value != null) return value;
  try {
    return await fetchNoticeVersion(baseUrl);
  } catch (_) {
    return DEFAULT_NOTICE_VERSION;
  }
}

async function setAmbientCookie(baseUrl, name, value) {
  const key = cookieName(baseUrl, name);
  if (typeof globalThis.cookieStore !== "undefined" && typeof globalThis.cookieStore.set === "function") {
    try {
      await globalThis.cookieStore.set(key, String(value));
      return;
    } catch (_) {
      // Fall through to document.cookie.
    }
  }
  if (typeof document === "undefined") return;
  document.cookie = `${key}=${encodeURIComponent(String(value))}; path=/; SameSite=Lax`;
}

function browserAnonHeaders(baseUrl) {
  const origin = normalizeBaseUrl(baseUrl);
  return {
    accept: "*/*",
    origin,
    referer: `${origin}/`
  };
}

function browserJoinHeaders(baseUrl) {
  const origin = normalizeBaseUrl(baseUrl);
  return {
    accept: "*/*",
    "content-type": "application/json",
    origin,
    referer: `${origin}/`
  };
}

function joinRejectMessage(code, { neverLoad, ship, server } = {}) {
  if (code === 4007 && neverLoad) {
    const name = ship?.name ? ` "${ship.name}"` : "";
    const id = ship?.id != null ? ` (${ship.id})` : "";
    const serverText = server?.description ? ` on ${server.description}` : "";
    return `join rejected: 4007. ${name}${id}${serverText} could not be joined with never_load=true. Use startShip(server, ship) instead of joinShip(server, ship) when loading or starting a saved ship.`;
  }
  return `join rejected: ${code}`;
}
