# Dredless Node API

This document covers the Node-specific top-level API: explicit sessions, anonymous token/session creation, connection descriptors, and convenience start/join helpers.

Use this entrypoint when you want the multi-session cookie-jar API:

```js
import Dredless, {
  Session,
  AnonSession,
  Connection,
  DredlessClient
} from "dredless/node";
```

Normal Node usage:

```js
const session = await Dredless.createAnonSession();
const servers = await Dredless.fetchServers();
const ships = await session.fetchShips(servers[0]);
const client = await session.startShip(servers[0], ships[0]);

await client.whenReady();
```

Shared input shapes such as `Server`, `ServerRef`, `Ship`, `ShipRef`, and `ShipSpec` are documented in [API_REFERENCE.md](./API_REFERENCE.md#common-input-types). Shared client/world/entity/domain APIs are also documented in [API_REFERENCE.md](./API_REFERENCE.md).

## `Dredless` Namespace

The default export is a namespace of constructors and convenience factories.

```ts
interface DredlessNamespace {
  Session: typeof Session;
  AnonSession: typeof AnonSession;
  Connection: typeof Connection;
  DredlessClient: typeof DredlessClient;
  createSession: typeof createSession;
  createAnonSession: typeof createAnonSession;
  createAnonToken: typeof createAnonToken;
  fetchNoticeVersion: typeof fetchNoticeVersion;
  fetchGameVersion: typeof fetchGameVersion;
  fetchServers: typeof fetchServers;
  fetchShips: typeof fetchShips;
  fetchShipList: typeof fetchShipList;
  joinShip: typeof joinShip;
  startShip: typeof startShip;
  startNewShip: typeof startNewShip;
  joinInvite: typeof joinInvite;
}
```

### `Dredless.createSession(noticeVersion?)`

```ts
function createSession(noticeVersion?: number | null): Promise<Session>;
```

Creates a `Session` using the current game version lookup and optional notice
version. It does not create an anonymous account.

### `Dredless.createAnonSession(anonKey?, noticeVersion?, baseUrl?)`

```ts
function createAnonSession(
  anonKey?: string | null,
  noticeVersion?: number | null,
  baseUrl?: string
): Promise<AnonSession>;
```

Creates an anonymous session. If `anonKey` is omitted, the library requests one
from the server.

Returns an `AnonSession`.

### `Dredless.createAnonToken(noticeVersion?, baseUrl?)`

```ts
function createAnonToken(
  noticeVersion?: number | null,
  baseUrl?: string
): Promise<string>;
```

Requests a new anonymous account token.

### `Dredless.fetchNoticeVersion()`

```ts
function fetchNoticeVersion(): Promise<number>;
```

Scrapes the current notice version needed by anon login.

### `Dredless.fetchGameVersion()`

```ts
function fetchGameVersion(): Promise<string>;
```

Scrapes the current game version string from the site.

### `Dredless.fetchServers()`

```ts
function fetchServers(): Promise<Server[]>;
```

Scrapes and returns game servers.
### `Dredless.fetchServerStatus(server)`

```ts
function fetchServerStatus(server: ServerRef): Promise<{ playerCount: number; maxPlayerCount: number; ping: number }>;
```

Pings the server and returns the current player counts and measured response time in milliseconds.

### `Dredless.fetchServerStatuses()`

```ts
function fetchServerStatuses(): Promise<Server[]>;
```

Fetches status for every server and returns server objects with updated `playerCount`, `maxPlayerCount`, and `ping` fields.

### `Dredless.fetchShips(session, server)`

```ts
function fetchShips(session: Session, server: ServerRef): Promise<Ship[]>;
```

Authenticated convenience wrapper around `session.fetchShips(server)`.

### `Dredless.fetchShipList(session, server)`

```ts
function fetchShipList(session: Session, server: ServerRef): Promise<ShipList>;
```

Authenticated convenience wrapper around `session.fetchShipList(server)`.

### `Dredless.joinShip(server, ship?, session?)`

```ts
function joinShip(
  server: ServerRef,
  ship?: ShipRef,
  session?: Session | null
): Promise<DredlessClient>;
```

Starts a websocket client using `never_load: true`. This is useful when you need
to join without loading the full ship world.

If `session` is omitted, an anonymous session is created.

### `Dredless.startShip(server, ship?, session?)`

```ts
function startShip(
  server: ServerRef,
  ship?: ShipRef,
  session?: Session | null
): Promise<DredlessClient>;
```

Starts a websocket client using normal world loading.

If `session` is omitted, an anonymous session is created.

### `Dredless.startNewShip(server, name?, color?, session?)`

```ts
function startNewShip(
  server: ServerRef,
  name?: string,
  color?: string,
  session?: Session | null
): Promise<DredlessClient>;
```

Creates/starts a new ship and returns a live client.

### `Dredless.joinInvite(server, code, session?)`

```ts
function joinInvite(
  server: ServerRef,
  code: string,
  session?: Session | null
): Promise<DredlessClient>;
```

Joins through an invite code and returns a live client.


## `Session`

`Session` represents an authenticated HTTP session and owns cookies, account
status, ship list fetches, and `/join`.

```ts
class Session {
  constructor(gameSession?: string | null, gameVersion?: string | null);

  baseUrl: string;
  cookies: Map<string, string>;
  gameVersion: string | null;
  account: Account | null;
  geoServer: number | null;
  upgraded: boolean;
  isRegistered: boolean;
  showAds: boolean;
  forceTutorial: boolean;
  ban: unknown;

  get gameSession(): string;
  get gameToken(): string;
  get noticeVersion(): number | string | null;
  set noticeVersion(value: number | string | null);

  request(path: string, init?: RequestInit & {
    body?: BodyInit | Record<string, unknown> | null
  }): Promise<Response>;

  fetchAccountStatus(): Promise<unknown>;
  fetchShips(server: ServerRef): Promise<Ship[]>;
  fetchShipList(server: ServerRef): Promise<ShipList>;

  joinShipConnection(server: ServerRef, ship?: ShipRef): Promise<Connection>;
  startShipConnection(server: ServerRef, ship?: ShipRef): Promise<Connection>;
  startNewShipConnection(
    server: ServerRef,
    name?: string,
    color?: string
  ): Promise<Connection>;
  joinInviteConnection(server: ServerRef, code: string): Promise<Connection>;

  joinShip(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;
  startShip(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;
  startNewShip(server: ServerRef, name?: string, color?: string): Promise<DredlessClient>;
  joinInvite(server: ServerRef, code: string): Promise<DredlessClient>;

  toJSON(): SessionSnapshot;
}
```

### `new Session(gameSession?, gameVersion?)`

Constructs an existing session wrapper. Does not perform network I/O.

### `session.request(path, init?)`

Authenticated HTTP helper. The `path` is relative to `session.baseUrl` unless a
full URL is supplied by the implementation path handling.

Input body may be a normal `BodyInit`, an object, or `null`.

Returns the raw `Response`.

### `session.fetchAccountStatus()`

Fetches and applies account status. Returns the decoded server response as
`unknown` because the live shape is not fully stabilized.

### `session.fetchShips(server)`

Returns `Ship[]`.

### `session.fetchShipList(server)`

Returns `ShipList`.

### Connection factories

These return `Connection` objects and do not open the websocket:

```ts
session.joinShipConnection(server, ship?): Promise<Connection>;
session.startShipConnection(server, ship?): Promise<Connection>;
session.startNewShipConnection(server, name?, color?): Promise<Connection>;
session.joinInviteConnection(server, code): Promise<Connection>;
```

Use these when you want to construct `DredlessClient` yourself.

### Client factories

These return live `DredlessClient` objects:

```ts
session.joinShip(server, ship?): Promise<DredlessClient>;
session.startShip(server, ship?): Promise<DredlessClient>;
session.startNewShip(server, name?, color?): Promise<DredlessClient>;
session.joinInvite(server, code): Promise<DredlessClient>;
```

### `session.toJSON()`

```ts
interface SessionSnapshot {
  baseUrl: string;
  gameSession: string;
  gameToken: string;
  gameVersion: string | null;
  noticeVersion: number | string | null;
  cookies: Record<string, string>;
  account: Account | null;
  geoServer: number | null;
  upgraded: boolean;
  isRegistered: boolean;
  showAds: boolean;
  forceTutorial: boolean;
  ban: unknown;
  anonKey?: string;
}
```

## `AnonSession`

```ts
class AnonSession extends Session {
  constructor(
    gameSession?: string | null,
    anonKey?: string | null,
    gameVersion?: string | null
  );

  get anonKey(): string;
}
```

`AnonSession` is a `Session` with anonymous account key handling.

## `Connection`

`Connection` is a no-I/O descriptor for an already joined game session.

```ts
class Connection {
  constructor(
    session: Session,
    gameToken: string,
    netPort: number,
    serverId: number | Server,
    server?: Server | null
  );

  session: Session;
  baseUrl: string;
  gameToken: string;
  netPort: number;
  serverId: number;
  server: Server | null;

  toJSON(): ConnectionSnapshot;
}
```

### `connection.toJSON()`

```ts
interface ConnectionSnapshot {
  baseUrl: string;
  gameToken: string;
  netPort: number;
  serverId: number;
  server: Server | null;
  session: SessionSnapshot;
}
```

