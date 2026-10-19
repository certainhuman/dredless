# Node sessions and connections

[Documentation index](README.md) · [Getting started](GETTING_STARTED.md) · [API reference](API_REFERENCE.md)

## Contents

- [Imports and sessions](#imports-and-sessions)
- [Authentication and reuse](#authentication-and-reuse)
- [Servers and ship lists](#servers-and-ship-lists)
- [Join, start, and invites](#join-start-and-invites)
- [Construct a client yourself](#construct-a-client-yourself)
- [HTTP requests](#http-requests)
- [Serialization](#serialization)

## Imports and sessions

```js
import Dredless, {Session, AnonSession, Connection, DredlessClient} from "dredless/node";
```

The default `Dredless` export contains constructors and the HTTP/start/join convenience functions below. Protocol builders and constants are named exports; they are not all properties of the default namespace.

A `Session` owns an HTTP cookie jar. It does not open a WebSocket until you call a client factory. `AnonSession` adds an `anonKey`. Reuse one session for actions that should use the same identity; use separate sessions for separate identities.

```ts
new Session(gameSession?: string | null, gameVersion?: string | null): Session;
new AnonSession(gameSession?: string | null, anonKey?: string | null,
                gameVersion?: string | null): AnonSession;

Dredless.createSession(noticeVersion?: number | null): Promise<Session>;
Dredless.createAnonSession(anonKey?: string | null, noticeVersion?: number | null,
                           baseUrl?: string): Promise<AnonSession>;
Dredless.createAnonToken(noticeVersion?: number | null, baseUrl?: string): Promise<string>;

session.fetchAccountStatus(): Promise<unknown>;
```

Constructors perform no I/O. `createSession()` fetches account status into a fresh session; it does not log in to a registered account. `createAnonToken()` requests a new anonymous key. `createAnonSession()` uses the supplied key, or requests one when omitted, then fetches status.

`noticeVersion` is optional; factories attempt to discover it and have a built-in fallback. Alternate `baseUrl` values are origins such as `https://test.drednot.io`. The implementation also accepts `baseUrl` as the third `Session` constructor argument, fourth `AnonSession` argument, and second `createSession()` argument; these overloads are not currently represented in the root declarations.

## Authentication and reuse

### Existing anonymous identity

```js
import Dredless from "dredless/node";

const key = process.env.DREDNOT_ANON_KEY;
if (!key) throw new Error("Set DREDNOT_ANON_KEY to reuse an existing anonymous account");
const session = await Dredless.createAnonSession(key);
```

For a new anonymous account, call `createAnonSession()` once and retain `session.anonKey` in your own credential storage. Recreating a session without supplying the key creates a different identity.

### Existing registered session

Supply your own authenticated `game_session` cookie value. Dredless does not implement the website's identity-provider login flow:

```js
import {Session} from "dredless/node";

const cookie = process.env.DREDNOT_GAME_SESSION;
if (!cookie) throw new Error("Set DREDNOT_GAME_SESSION");
const session = new Session(cookie);
await session.fetchAccountStatus();
if (!session.account?.is_registered) throw new Error("The session is not a registered account");
```

`session.account` is the normalized cached status: `{name, color, game_rank, user_badges, is_registered}` or `null`. `color` is packed RGB. `fetchAccountStatus()` returns the full decoded JSON and updates this cache, along with `geoServer`, `isRegistered`, `upgraded`, `showAds`, `forceTutorial`, and `ban`.

Email, identity service, clan tags, and applied perk ships use [account-page methods](ACCOUNT.md), not `account/status`.

## Servers and ship lists

```ts
Dredless.fetchServers(): Promise<Server[]>;
Dredless.fetchServerStatus(server: ServerRef): Promise<ServerStatus>;
Dredless.fetchServerStatuses(): Promise<(Server & ServerStatus)[]>;
Dredless.fetchGameVersion(): Promise<string>;
Dredless.fetchNoticeVersion(): Promise<number>;

session.fetchShips(server: ServerRef): Promise<Ship[]>;
session.fetchShipList(server: ServerRef): Promise<ShipList>;

Dredless.fetchShips(session: Session, server: ServerRef): Promise<Ship[]>;
Dredless.fetchShipList(session: Session, server: ServerRef): Promise<ShipList>;
```

| Type           | Meaning                                                                                           |
|----------------|---------------------------------------------------------------------------------------------------|
| `Server`       | `{index, domain, description}`                                                                    |
| `ServerRef`    | A `Server` object or its numeric `index`                                                          |
| `ServerStatus` | `{playerCount, maxPlayerCount, ping}`; ping is milliseconds                                       |
| `Ship`         | Listed ship: `id`, `hexCode`, `name`, `playerCount`, `owned`, `saved`, `color`, `iconUrl`, `time` |
| `ShipList`     | `{ships, playerCount?, maxPlayerCount?, isMuted?}`                                                |

`fetchServers()` discovers servers; it does not populate status/ping fields. Discovery metadata is cached per origin for the process/module lifetime; repeated calls do not necessarily refetch the game version or directory. Discovery/status implementations also accept an optional final `baseUrl` argument, although the root declarations omit it. Ship names preserve leading and trailing spaces. Some ship metadata fields are nullable; inspect [declared shapes](../src/index.d.ts) when persisting results.

## Join, start, and invites

```ts
session.joinShip(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;
session.startShip(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;
session.startNewShip(server: ServerRef, name?: string, color?: string): Promise<DredlessClient>;
session.joinInvite(server: ServerRef, code: string): Promise<DredlessClient>;

Dredless.joinShip(server: ServerRef, ship?: ShipRef, session?: Session | null): Promise<DredlessClient>;
Dredless.startShip(server: ServerRef, ship?: ShipRef, session?: Session | null): Promise<DredlessClient>;
Dredless.startNewShip(server: ServerRef, name?: string, color?: string,
                      session?: Session | null): Promise<DredlessClient>;
Dredless.joinInvite(server: ServerRef, code: string, session?: Session | null): Promise<DredlessClient>;
```

| Method         | Choose it when…                                                               |
|----------------|-------------------------------------------------------------------------------|
| `joinShip`     | The ship is active; joining must not load a saved ship (`never_load: true`)   |
| `startShip`    | Joining may need to load/start the saved ship (`never_load: false`)           |
| `startNewShip` | You intend to create a new ship; accepts a name and color such as `"#de9797"` |
| `joinInvite`   | You have an invite code; accepts the code segment, not the URL                |

The join/start distinction concerns loading a saved ship on the server. It is not a switch for partial versus full client world decoding. A `4007` rejection from `joinShip()` can mean the saved ship needs `startShip()`.

All client factories wait for the ready packet. [Lifecycle](CLIENT.md#completion-and-readiness) explains state availability and cleanup. Top-level factories create an anonymous session when `session` is omitted; pass your session explicitly to retain your identity.

```ts
type ShipRef = number | string | Ship | ShipSpec | null;
type ShipSpec =
  | {type: "join_or_load"; id: number | string}
  | {type: "new"; name?: string | null; color?: string | null}
  | {type: "invite"; code: string};
```

Prefer a `Ship` object obtained from that server's list, or an explicit `ShipSpec`. Strings pass through as server ship selectors; do not assume every ID in every API uses the same format. Omitted/null ships use the method's default selection behavior.

### Read an invite preview

```ts
Dredless.fetchInviteMetadata(invite: string | URL,
  options?: {includeColor?: boolean; fetchImpl?: typeof fetch}): Promise<InviteMetadata>;
```

This reads the public invite page without joining. It returns `{shipId, name, previewImageUrl, hostname, inviteCode}`. `includeColor: true` also returns `color` sampled from the preview's top-left pixel, or `null` if unavailable; otherwise no preview image is fetched. Names preserve spacing. See [protocol tools](PROTOCOL.md#http-and-invite-tools) for the named parser export.

## Construct a client yourself

Use connection factories when you need listeners installed before connection:

```ts
session.joinShipConnection(server: ServerRef, ship?: ShipRef): Promise<Connection>;
session.startShipConnection(server: ServerRef, ship?: ShipRef): Promise<Connection>;
session.startNewShipConnection(server: ServerRef, name?: string, color?: string): Promise<Connection>;
session.joinInviteConnection(server: ServerRef, code: string): Promise<Connection>;

new Connection(session: Session, gameToken: string, netPort: number,
               serverId: number | Server, server?: Server | null): Connection;
```

A connection factory performs the HTTP join, returning a descriptor without opening the WebSocket. Constructing `Connection` itself performs no I/O.

**Fragment:** `session`, `server`, and `code` come from the setup above:

```js
const connection = await session.joinInviteConnection(server, code);
const client = new DredlessClient(connection);
client.on("error", (error) => console.error(error.message));
client.on("model", ({world}) => console.log(world.id));
try {
  await client.whenReady();
  // Keep using the client here, or attach application callbacks.
} catch (error) {
  client.close();
  throw error;
}
```

See [client options](CLIENT.md#construction-and-retention) for history limits and offline construction.

## HTTP requests

```ts
session.request(path: string, init?: RequestInit & {body?: unknown}): Promise<Response>;
```

Paths resolve relative to `session.baseUrl`; an absolute URL is also accepted by the resolver. Requests attach the session cookie jar in Node. Use this authenticated helper for the session's intended origin.

Strings, `ArrayBuffer`, and typed-array views pass through as bodies. Other objects are JSON-stringified; the helper sets JSON content type if none was supplied. It does not implement native Fetch handling for `URLSearchParams`, `FormData`, or `Blob` objects. For a form, pass `new URLSearchParams(fields).toString()` with an explicit form content type.

The raw `Response` is returned. Callers of `request()` must check HTTP status themselves; it does not automatically reject on HTTP error codes or merge response cookies. Higher-level session methods do their own status/cookie handling.

## Serialization

`session.toJSON()` returns a `SessionSnapshot`: base URL, game session/token, cookies, game/notice versions, account status, and status flags. An anonymous session also includes `anonKey`. `connection.toJSON()` includes its session snapshot.

These snapshots contain credentials. Store them as credentials rather than logging them as ordinary state. No automatic persistence/restore helper is provided. When restoring a cookie jar yourself, use the snapshot's origin and cookie names, then refresh account status. [Account detail reads](ACCOUNT.md) do not add email or identity data to these snapshots.
