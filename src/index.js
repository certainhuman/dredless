export { DrednotClient, createClient } from "./client.js";
export { GameSession, createSession, createAnonSession, createAnonKey } from "./net/session.js";
export { ServerDirectory, listServers, fetchLatestGameVersion } from "./net/servers.js";
export { ShipService, listShips, newShip, createShip, createShipSpec, shipRef } from "./game/ships.js";
export { GameConnection, connect, connectAnon } from "./game/connection.js";
export { WorldStore, WorldState } from "./game/world.js";
export { decodeMsgpack, encodeMsgpack } from "./protocol/msgpack.js";
export { buildSignedCommandPacket } from "./protocol/commands.js";
export { decryptPayload } from "./crypto/chacha.js";
export { decompressLz4Frame } from "./compression/lz4.js";

import { DrednotClient, createClient } from "./client.js";
import { GameSession, createSession, createAnonSession, createAnonKey } from "./net/session.js";
import { ServerDirectory, listServers, fetchLatestGameVersion } from "./net/servers.js";
import { ShipService, listShips, newShip, createShip, createShipSpec, shipRef } from "./game/ships.js";
import { GameConnection, connect, connectAnon } from "./game/connection.js";

export default {
  DrednotClient,
  createClient,
  GameSession,
  createSession,
  createAnonSession,
  createAnonKey,
  ServerDirectory,
  listServers,
  fetchLatestGameVersion,
  ShipService,
  listShips,
  newShip,
  createShip,
  createShipSpec,
  shipRef,
  GameConnection,
  connect,
  connectAnon
};
