import { DEFAULT_BASE_URL, DEFAULT_NOTICE_VERSION, JOIN_USER_AGENT } from "../constants.js";
import { asNumber, isNode, normalizeBaseUrl } from "../runtime.js";
import { browserCookies, cookieName, cookiePrefix, readSetCookies, setCookieValues } from "./cookies.js";
import { HttpClient } from "./http.js";

export class GameSession {
  constructor({ baseUrl = DEFAULT_BASE_URL, cookies = {}, noticeVersion = DEFAULT_NOTICE_VERSION, raw = null } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.cookies = setCookieValues(this.baseUrl, cookies);
    const noticeCookie = cookieName(this.baseUrl, "notice_version");
    if (noticeVersion != null && !this.cookies.has(noticeCookie)) this.cookies.set(noticeCookie, String(noticeVersion));
    this.noticeVersion = this.cookies.get(noticeCookie) || noticeVersion;
    this.raw = raw;
    this.account = null;
    this.geoServer = null;
    this.upgraded = false;
    this.isRegistered = false;
    this.showAds = false;
    this.forceTutorial = false;
    this.ban = null;
    if (raw) this.#readStatus(raw);
  }

  static async anonymous(baseUrl = DEFAULT_BASE_URL) {
    const session = new GameSession({ baseUrl });
    await session.loginAnon();
    await session.refresh();
    return session;
  }

  static async fromCookies({ baseUrl = DEFAULT_BASE_URL, anonKey = null, gameSession = null, noticeVersion = DEFAULT_NOTICE_VERSION, cookies = null } = {}) {
    const base = normalizeBaseUrl(baseUrl);
    const prefix = cookiePrefix(base);
    const source = cookies ? setCookieValues(base, cookies) : browserCookies();
    if (anonKey) source.set(`${prefix}anon_key`, anonKey);
    if (gameSession) source.set(`${prefix}game_session`, gameSession);
    const session = new GameSession({ baseUrl: base, cookies: source, noticeVersion });
    if (!session.anonKey && !session.gameSession) return GameSession.anonymous(base);
    await session.refresh();
    return session;
  }

  get anonKey() {
    return this.cookies.get(cookieName(this.baseUrl, "anon_key")) || "";
  }

  get gameSession() {
    return this.cookies.get(cookieName(this.baseUrl, "game_session")) || "";
  }

  toJSON() {
    return {
      baseUrl: this.baseUrl,
      anonKey: this.anonKey,
      gameSession: this.gameSession,
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

  request(path, init = {}) {
    return new HttpClient({ baseUrl: this.baseUrl, session: this }).request(path, init);
  }

  async refresh() {
    const response = await this.request("account/status", {
      method: "GET",
      mode: "cors",
      credentials: "include",
      referrer: `${this.baseUrl}/`,
      headers: this.#statusHeaders()
    });
    if (!response.ok) throw new Error(`account/status failed: ${response.status} ${response.statusText}`);
    this.#mergeSetCookies(response);
    this.#readStatus(await response.json());
    return this;
  }

  #statusHeaders() {
    const headers = {
      accept: "*/*"
    };
    if (isNode()) {
      Object.assign(headers, {
        "user-agent": JOIN_USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
        referer: `${this.baseUrl}/`,
        dnt: "1",
        "sec-gpc": "1",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin"
      });
    }
    return headers;
  }

  async loginAnon() {
    // Only use this endpoint when creating a brand-new anonymous identity.
    const headers = { accept: "application/json" };
    if (isNode()) headers["user-agent"] = JOIN_USER_AGENT;
    const response = await this.request("account/login/anon", {
      method: "POST",
      mode: "cors",
      credentials: "include",
      referrer: `${this.baseUrl}/`,
      headers
    });
    if (!response.ok) throw new Error(`account/login/anon failed: ${response.status} ${response.statusText}`);
    this.#mergeSetCookies(response);
    if (!this.anonKey) throw new Error("Unable to obtain anon_key");
    return this;
  }

  #mergeSetCookies(response) {
    const prefix = cookiePrefix(this.baseUrl);
    for (const [name, value] of readSetCookies(response.headers)) {
      this.cookies.set(`${prefix}${name}`, value);
    }
    for (const [name, value] of browserCookies()) {
      if (name === `${prefix}anon_key` || name === `${prefix}game_session`) this.cookies.set(name, value);
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

export const createSession = (options = {}) => GameSession.fromCookies(options);
export const createAnonSession = (baseUrl = DEFAULT_BASE_URL) => GameSession.anonymous(baseUrl);
export const createAnonKey = async (baseUrl = DEFAULT_BASE_URL) => (await GameSession.anonymous(baseUrl)).anonKey;
