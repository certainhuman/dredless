# dredless API

## Exports

```js
import Dredless, {
  Dredless as DredlessNamespace,
  Session,
  AnonSession,
  Connection,
  DredlessClient,
  WorldStore,
  WorldState,
  decodeMsgpack,
  encodeMsgpack,
  buildSignedCommandPacket,
  decryptPayload,
  decompressLz4Frame
} from "dredless";
```

`Dredless` is both the default export and a named namespace export.

## `Dredless`

Static namespace methods:

```js
await Dredless.createSession(noticeVersion?);
await Dredless.createAnonSession(anonKey?, noticeVersion?);
await Dredless.createAnonToken(noticeVersion?);

await Dredless.fetchNoticeVersion();
await Dredless.fetchGameVersion();
await Dredless.fetchServers();

await Dredless.fetchShips(session, server);
await Dredless.fetchShipList(session, server);

await Dredless.join(server, ship?, session?);
await Dredless.start(server, ship?, session?);
await Dredless.newShip(server, name?, color?, session?);
```

Notes:

- `fetchNoticeVersion()` throws if scraping fails.
- `fetchShips()` resolves to normalized `Ship[]`.
- `fetchShipList()` resolves to `ShipList`, an object with `ships: Ship[]` plus other server fields.
- Session factories fall back to notice version `17` internally when scraping fails.
- `join()` uses `never_load: true`.
- `start()` uses `never_load: false`.
- `newShip()` creates a new ship and returns a ready `DredlessClient`.
- Server is required for client factories.
- If ship is omitted for `join()` or `start()`, a new unnamed ship is created.

## `Session`

```js
const session = new Session(gameSession, gameVersion?);
```

Constructor behavior:

- Stores `game_session` when provided.
- Stores optional `gameVersion`.
- Performs no network I/O.

Properties:

```js
session.baseUrl
session.cookies
session.gameSession
session.gameToken
session.gameVersion
session.noticeVersion
session.account
session.geoServer
```

Methods:

```js
session.request(path, init);
await session.fetchAccountStatus();
await session.fetchShips(server);
await session.fetchShipList(server);

await session.startJoinConnection(server, ship?);
await session.startConnection(server, ship?);
await session.startNewShipConnection(server, name?, color?);

await session.join(server, ship?);
await session.start(server, ship?);
await session.newShip(server, name?, color?);

session.toJSON();
```

`fetchAccountStatus()` calls `/account/status`, returns the response body, updates account fields, and merges relevant `Set-Cookie` headers.
`fetchShips()` resolves to normalized `Ship[]`; `fetchShipList()` resolves to `ShipList`.

## `AnonSession`

```js
const anon = new AnonSession(gameSession, anonKey, gameVersion?);
```

`AnonSession` extends `Session` and adds:

```js
anon.anonKey
```

## `Connection`

```js
const connection = new Connection(session, gameToken, netPort, serverId);
```

Constructor behavior:

- Stores session, `game_token`, net port, and server id.
- Adds `game_token` to the session cookie store.
- Performs no network I/O.

Properties:

```js
connection.session
connection.gameToken
connection.netPort
connection.serverId
connection.server
connection.baseUrl
```

## `DredlessClient`

```js
const client = new DredlessClient(connection);
await client.waitUntilReady();
```

Constructor behavior:

- Starts the WebSocket connection immediately.
- Resolves `readyPromise` after the server ready packet and bootstrap.

Properties:

```js
client.connection
client.session
client.serverId
client.server
client.netPort
client.sid
client.connected
client.ready
client.readyPromise
client.packetCount
client.lastPacket
client.worlds
client.packetsRaw
```

Methods:

```js
await client.waitUntilReady();
client.send(command);
client.close(code?, reason?);
client.disconnect(code?, reason?);
client.snapshot({ includeTiles? });
client.world(id, { includeTiles? });
client.overworld({ includeTiles? });
client.shipWorld({ includeTiles? });
```

Events:

```js
client.on("open", fn);
client.on("ready", fn);
client.on("packet", fn);
client.on("world", fn);
client.on("tiles", fn);
client.on("model", fn);
client.on("event", fn);
client.on("command", fn);
client.on("bootstrap", fn);
client.on("close", fn);
client.on("error", fn);
```

## Server And Ship Arguments

Server arguments accept either:

```js
0
{ index: 0, domain: "c0.drednot.io", description: "..." }
```

Ship arguments accept either:

```js
123
{ id: 123, name: "Existing ship" }
{ type: "new", name: "myship", color: "#de9797" }
```

Normalized ships returned by fetch helpers include:

```js
{
  id,
  hexCode,
  name,
  iconUrl,
  playerCount,
  owned,
  saved,
  color,
  time
}
```

`ShipList` contains:

```js
{
  playerCount,
  maxPlayerCount,
  isMuted,
  ships
}
```
