import { DEFAULT_BASE_URL } from "./constants.js";
import { GameSession } from "./net/session.js";
import { ServerDirectory } from "./net/servers.js";
import { ShipService, newShip } from "./game/ships.js";
import { GameConnection } from "./game/connection.js";

export class DrednotClient {
  constructor({ baseUrl = DEFAULT_BASE_URL, session = null } = {}) {
    this.baseUrl = baseUrl;
    this.session = session;
    this.servers = new ServerDirectory(baseUrl);
  }

  async login(options = {}) {
    this.session = await GameSession.fromCookies({ baseUrl: this.baseUrl, ...options });
    return this;
  }

  async loginAnon() {
    this.session = await GameSession.anonymous(this.baseUrl);
    return this;
  }

  ships() {
    if (!this.session) throw new Error("Call login() or loginAnon() before using ships()");
    return new ShipService(this.session, { baseUrl: this.baseUrl });
  }

  async connect(options = {}) {
    if (!this.session) await this.loginAnon();
    return GameConnection.connect({ baseUrl: this.baseUrl, session: this.session, ...options });
  }

  newShip(name = "", color = "") {
    return newShip(name, color);
  }
}

export async function createClient(options = {}) {
  const client = new DrednotClient(options);
  if (options.login === "anon") await client.loginAnon();
  else if (options.login) await client.login(options.login === true ? {} : options.login);
  return client;
}
