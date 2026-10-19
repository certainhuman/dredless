# Browser setup

[Documentation index](README.md) · [Getting started](GETTING_STARTED.md) · [API reference](API_REFERENCE.md)

## Contents

- [Execution context](#execution-context)
- [Bundled imports](#bundled-imports)
- [Global script](#global-script)
- [Session methods](#session-methods)
- [Connection methods](#connection-methods)
- [Attach to an existing socket](#attach-to-an-existing-socket)

## Execution context

Browser sessions use the browser's ambient cookie jar with `credentials: "include"`. They do not isolate identities like
Node sessions. Changing an anonymous key affects the ambient session.

Use a Drednot page integration or a content-script context with access to the site's cookies and origin. Background
pages, popups, workers, and unrelated origins may lack that access. Importing the package does not bypass browser
cookie, origin, or CORS restrictions.

Browsers manage `Cookie` and `Set-Cookie` themselves. JavaScript cannot install a separate cookie jar or custom
authentication headers on a browser WebSocket.

## Bundled imports

```js
import Dredless, {BrowserSession, DredlessClient} from "dredless/browser";
```

Prefer this explicit entrypoint for browser types. Shared machine constants and protocol tools are named exports; the
default export is the runtime namespace, not the entire module.

**Fragment:** use the site's existing login without creating a new anonymous identity:

```js
const session = await Dredless.createSession();
const servers = await Dredless.fetchServers();
const server = servers[0];
if (!server) throw new Error("No servers found");
console.log(await session.fetchShips(server));
```

## Global script

Run this only in an appropriate browser context. Use a bundle version that matches the API you intend to call; an
unversioned CDN URL follows published releases rather than this repository's current checkout.

```html

<script src="https://cdn.jsdelivr.net/npm/dredless/dist/browser/dredless.global.js"></script>
<script>
    (async () => {
        const session = await Dredless.createSession();
        console.log((await session.fetchAccountStatus()).account);
    })().catch(console.error);
</script>
```

The global is `Dredless`, containing the browser runtime namespace. It does not expose every named ESM export. Use
bundled imports when you need additional named helpers.

## Session methods

```ts
new BrowserSession(baseUrl ? : string)
:
BrowserSession;
Dredless.browserSession(baseUrl ? : string)
:
BrowserSession;
Dredless.createBrowserSession(baseUrl ? : string)
:
BrowserSession;
Dredless.setBrowserSession(session ? : BrowserSession | null)
:
BrowserSession | null;
Dredless.createSession(noticeVersion ? : number | null, baseUrl ? : string)
:
Promise<BrowserSession>;
Dredless.createAnonSession(anonKey ? : string | null, noticeVersion ? : number | null,
    baseUrl ? : string)
:
Promise<BrowserSession>;
Dredless.fetchAnonKey(noticeVersion ? : number | null, baseUrl ? : string)
:
Promise<string>;
Dredless.createAnonToken(noticeVersion ? : number | null, baseUrl ? : string)
:
Promise<string>;

session.fetchAccountStatus()
:
Promise<unknown>;
session.readAnonKey()
:
Promise<string>;
session.fetchAnonKey(noticeVersion ? : number | null)
:
Promise<string>;
```

`createSession()` refreshes status on the ambient session. `createAnonSession()` applies a supplied key or posts an
anonymous login, then refreshes status. `fetchAnonKey()`/`createAnonToken()` request a new key. Key retrieval uses
`cookieStore` or `document.cookie`; it rejects when the key is not readable even if the login request succeeded.

`BrowserSession` inherits [account methods](ACCOUNT.md), HTTP `request()`, ship reads, and client factories from the
session API. It uses browser-owned cookies and does not expose a registered-account login flow. Its JavaScript-readable
`gameSession`/`gameToken` properties may be empty even when browser authentication works.

## Connection methods

Session methods have the same arguments as [Node session methods](NODE_API.md#join-start-and-invites). Top-level browser
helpers take the ambient session as an optional final argument:

```ts
Dredless.fetchShips(server
:
ServerRef, session ? : BrowserSession | null
):
Promise<Ship[]>;
Dredless.fetchShipList(server
:
ServerRef, session ? : BrowserSession | null
):
Promise<ShipList>;
Dredless.fetchAccountStatus(session ? : BrowserSession | null)
:
Promise<unknown>;
Dredless.joinShip(server
:
ServerRef, ship ? : ShipRef, session ? : BrowserSession | null
):
Promise<DredlessClient>;
Dredless.startShip(server
:
ServerRef, ship ? : ShipRef, session ? : BrowserSession | null
):
Promise<DredlessClient>;
Dredless.startNewShip(server
:
ServerRef, name ? : string, color ? : string,
    session ? : BrowserSession | null
):
Promise<DredlessClient>;
Dredless.joinInvite(server
:
ServerRef, code
:
string, session ? : BrowserSession | null
):
Promise<DredlessClient>;
```

The HTTP join/start distinctions and readiness conditions are the same as Node. `fetchServers`, `fetchServerStatus`,
`fetchServerStatuses`, `fetchGameVersion`, and `fetchNoticeVersion` are also on the browser namespace. The browser
namespace does not contain the Node `Session`/`AnonSession` constructors.

## Attach to an existing socket

**Fragment:** `socket` is a WebSocket you already obtained from your integration. Attach early: Dredless cannot
reconstruct frames the socket received before attachment.

```js
const client = DredlessClient.attachWebSocket(socket, {mode: "readonly"});
client.on("model", ({world}) => console.log(world.id, world.model.players()));
```

| Mode                  | Writes   | Automatically sends hello/bootstrap/keepalive | `close()`                     |
|-----------------------|----------|-----------------------------------------------|-------------------------------|
| `"observe"` (default) | Allowed  | No                                            | Can close the attached socket |
| `"bootstrap"`         | Allowed  | Yes                                           | Can close the attached socket |
| `"readonly"`          | Rejected | No                                            | No-op                         |

Use `readonly` for observation. `observe` permits explicit writes despite its name. Avoid two clients independently
sending initialization or input to one socket.

For an already-initialized socket, `ready: true` and `sid` can supply known protocol readiness metadata. They do not
recover missing world state. See [attachment options](CLIENT.md#attach-an-existing-websocket)
and [event timing](EVENTS.md#ordering-and-listeners).
