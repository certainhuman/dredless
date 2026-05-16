import { DEFAULT_BASE_URL } from "../constants.js";
import { normalizeBaseUrl } from "../runtime.js";
import { cookieName } from "../net/cookies.js";

export class Connection {
  constructor(session, gameToken, netPort, serverId, server = null) {
    if (!session) throw new Error("Connection requires a session");
    if (!gameToken) throw new Error("Connection requires a game token");
    if (netPort == null) throw new Error("Connection requires a net port");

    this.session = session;
    this.baseUrl = normalizeBaseUrl(session.baseUrl || DEFAULT_BASE_URL);
    this.gameToken = String(gameToken);
    this.netPort = Number(netPort);
    this.server = serverId && typeof serverId === "object" ? serverId : server;
    this.serverId = Number(serverId && typeof serverId === "object" ? serverId.index ?? serverId.id : serverId);

    this.session.cookies?.set(cookieName(this.baseUrl, "game_token"), this.gameToken);
  }

  toJSON() {
    return {
      baseUrl: this.baseUrl,
      gameToken: this.gameToken,
      netPort: this.netPort,
      serverId: this.serverId,
      server: this.server,
      session: this.session?.toJSON?.() || this.session
    };
  }
}
