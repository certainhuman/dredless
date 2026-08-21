# Dredless Browser API

This document covers the browser-specific top-level API: ambient browser sessions, browser cookie handling, and browser start/join helpers.

Use this entrypoint in browser contexts:

```js
import Dredless, { BrowserSession } from "dredless/browser";
```

Normal browser usage:

```js
const session = await Dredless.createAnonSession();
const servers = await Dredless.fetchServers();
const ships = await Dredless.fetchShips(servers[0]);
const client = await Dredless.startShip(servers[0], ships[0]);
```

The browser API uses the current browser cookie jar with `credentials: "include"`. Browser JavaScript cannot read `Set-Cookie`, cannot set the `Cookie` header, and cannot set custom WebSocket headers, so browser authentication is ambient rather than multi-session.

Shared input shapes such as `Server`, `ServerRef`, `Ship`, `ShipRef`, and `ShipSpec` are documented in [API_REFERENCE.md](./API_REFERENCE.md#common-input-types). Shared client/world/entity/domain APIs are also documented in [API_REFERENCE.md](./API_REFERENCE.md).

## `DredlessBrowser` Namespace

`dredless/browser` exports a browser-first namespace. It assumes the current browser cookie jar and does not expose `Session` or `AnonSession`.

```ts
interface DredlessBrowserNamespace {
  BrowserSession: typeof BrowserSession;
  Connection: typeof Connection;
  DredlessClient: typeof DredlessClient;
  browserSession: typeof browserSession;
  createBrowserSession: typeof createBrowserSession;
  createSession: typeof createSession;
  createAnonSession: typeof createAnonSession;
  createAnonToken: typeof createAnonToken;
  fetchAnonKey: typeof fetchAnonKey;
  setBrowserSession: typeof setBrowserSession;
  fetchAccountStatus: typeof fetchAccountStatus;
  fetchNoticeVersion: typeof fetchNoticeVersion;
  fetchGameVersion: typeof fetchGameVersion;
  fetchServers: typeof fetchServers;
  fetchServerStatus: typeof fetchServerStatus;
  fetchServerStatuses: typeof fetchServerStatuses;
  fetchShips: typeof fetchShips;
  fetchShipList: typeof fetchShipList;
  joinShip: typeof joinShip;
  startShip: typeof startShip;
  startNewShip: typeof startNewShip;
  joinInvite: typeof joinInvite;
}
```

`createSession(noticeVersion?, baseUrl?)` initializes the ambient browser session, fetches account status, and returns the active `BrowserSession`.

`createAnonSession(anonKey?, noticeVersion?, baseUrl?)` creates or applies an anonymous browser session. If `anonKey` is omitted, it posts to `/account/login/anon`, then reads `anon_key` through `cookieStore` or `document.cookie`. If the key cannot be read, it throws. If `anonKey` is provided, it is written to the ambient cookie jar when possible. The return value is still the active `BrowserSession`, not an isolated cookie jar.

`fetchAnonKey(noticeVersion?, baseUrl?)` / `createAnonToken(noticeVersion?, baseUrl?)` posts to `/account/login/anon` and returns the JS-readable `anon_key`. It throws if the login succeeds but the key is not readable through `cookieStore` or `document.cookie`.

Browser support is tested in page and content-script contexts on `drednot.io`. Background pages, popups, workers, and other non-page contexts are unlikely to expose `drednot.io` cookies to this API.

`fetchShips(server)` and `fetchShipList(server)` use the default ambient `BrowserSession`. Pass an explicit `BrowserSession` as the last argument only when targeting a different `baseUrl`.

`joinShip`, `startShip`, `startNewShip`, and `joinInvite` return ready `DredlessClient` instances just like the Node helpers.

## `BrowserSession`

`BrowserSession` is the browser counterpart to `Session`, but it is ambient-cookie based. It cannot read `Set-Cookie` and cannot set websocket headers, so authentication must be accepted by the browser's cookie jar.

```ts
class BrowserSession {
  constructor(baseUrl?: string);
  baseUrl: string;
  ambientAuth: true;

  readAnonKey(): Promise<string>;
  fetchAnonKey(noticeVersion?: number | null): Promise<string>;
  fetchAccountStatus(): Promise<unknown>;
  fetchShips(server: ServerRef): Promise<Ship[]>;
  fetchShipList(server: ServerRef): Promise<ShipList>;

  joinShipConnection(server: ServerRef, ship?: ShipRef): Promise<Connection>;
  startShipConnection(server: ServerRef, ship?: ShipRef): Promise<Connection>;
  startNewShipConnection(server: ServerRef, name?: string, color?: string): Promise<Connection>;
  joinInviteConnection(server: ServerRef, code: string): Promise<Connection>;

  joinShip(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;
  startShip(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;
  startNewShip(server: ServerRef, name?: string, color?: string): Promise<DredlessClient>;
  joinInvite(server: ServerRef, code: string): Promise<DredlessClient>;
}
```


## Browser Connections

Browser start/join helpers still produce `Connection` objects internally, but a browser `Connection` may have an empty `gameToken` when the token is only available through browser-managed cookies. `DredlessClient` uses the browser `WebSocket` implementation and relies on browser-managed cookies and origin headers.

The shared `DredlessClient` API is documented in [API_REFERENCE.md](./API_REFERENCE.md#dredlessclient).
