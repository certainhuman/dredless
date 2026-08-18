# dredless

Object-oriented headless client primitives for `drednot.io`.

## Quick Start

Node/multi-session usage:

```js
import Dredless from "dredless/node";

const servers = await Dredless.fetchServers();
const client = await Dredless.startNewShip(servers[0], "bot", "#de9797");

client.player.move({ x: 1, y: 0 });
client.inventory.slot(0).equip("feet");
client.player.placeBlueprint({ x: 28, y: 18, width: 3, height: 3, source: "DSA:..." }, { invSlot: 2 });

const ship = client.currentShip();
const loader = ship?.machines.loaders()[0];
loader?.configure({ cycle: 5, stack: 12 });

const sign = ship?.machines.signs()[0];
sign?.open();
sign?.setText("Dock here", "when-near");

client.on("inventory", () => console.log(client.inventory.hotbarSlots().map((slot) => slot.snapshot())));
client.on("model", ({ world }) => console.log(world.model.transforms()));
```

Browser/ambient-session usage:

```js
import Dredless from "dredless/browser";

await Dredless.createAnonSession();
const servers = await Dredless.fetchServers();
const ships = await Dredless.fetchShips(servers[0]);
const client = await Dredless.startShip(servers[0], ships[0]);
```

The browser entrypoint uses the current browser cookie jar with `credentials: "include"`. It does not expose Node's explicit multi-session cookie API. Browser `createAnonSession()```and `fetchAnonKey()```are tested in page and content-script contexts; background, popup, worker, and other non-page contexts are unlikely to expose `drednot.io```cookies.

## API Docs

- [Node top-level API](docs/NODE_API.md): explicit session/token/start helpers.
- [Browser top-level API](docs/BROWSER_API.md): ambient browser-session helpers.
- [Shared API reference](docs/API_REFERENCE.md): client, world, entity, machine, inventory, management, and protocol APIs.

## Core Objects

```js
import Dredless, {
  Session,
  AnonSession,
  Connection,
  DredlessClient
} from "dredless/node";

import BrowserDredless, { BrowserSession } from "dredless/browser";
```

- `Session```stores `game_session`, notice/version state, and authenticated HTTP helpers.
- `AnonSession```extends `Session```with `anon_key`.
- `Connection```stores the result of `/join`: session, `game_token`, net port, and server id.
- `DredlessClient```is the live WebSocket client that sends commands and processes packets.
- `WorldStore```/ `WorldState```keep decoded world metadata, normalized tiles, material counts, the world tileset, model packets, and best-effort ECS model tables, plus derived entity and block occupancy summaries for ship and overworld worlds.
- `Dredless```from `dredless/node```is the explicit multi-session Node namespace.
- `Dredless```from `dredless/browser```assumes the current browser session/cookies.

## Sessions

Declaring existing sessions does not run network I/O:

```js
const session = new Session("game-session-token", "game-version");
const anon = new AnonSession("game-session-token", "anon-key", "game-version");
```

Creating sessions does run the required HTTP calls:

```js
const emptySession = await Dredless.createSession(17);
const anonSession = await Dredless.createAnonSession("anon-key", 17, "https://test.drednot.io");
const anonToken = await Dredless.createAnonToken(17, "https://test.drednot.io");
```

If notice version is omitted, session factories try to scrape it and internally fall back to `17`.
Direct `Dredless.fetchNoticeVersion()```throws when scraping fails.

## Data Fetching

```js
const noticeVersion = await Dredless.fetchNoticeVersion();
const gameVersion = await Dredless.fetchGameVersion();
const servers = await Dredless.fetchServers();

const status = await session.fetchAccountStatus();
const ships = await Dredless.fetchShips(session, servers[0]);
const shipList = await Dredless.fetchShipList(session, 0);

const ships2 = await session.fetchShips(servers[0]);
const shipList2 = await session.fetchShipList(1);
```

`fetchShips()```returns normalized ships only.
`fetchShipList()```returns the full response body with ```ships: Ship[]```normalized.

## Connections And Clients

Declare an existing joined connection without network I/O:

```js
const connection = new Connection(session, "game-token", 4003, 0);
const client = new DredlessClient(connection);
await client.whenReady();
```

Use `{ connect: false }```only when you want a no-I/O client shell for tests or
offline world-state inspection:

```js
const offlineClient = new DredlessClient(connection, { connect: false });
```

Start connections from a session:

```js
const joinConnection = await session.joinShipConnection(servers[0], ships[0]);
const startShipConnection = await session.startShipConnection(servers[0], ships[0]);
const newShipConnection = await session.startNewShipConnection(servers[0], "myship", "#de9797");
const inviteConnection = await session.joinInviteConnection(servers[0], "2c0YMWSGcR_r4Qzl4RqDoYEI");
```

Start ready clients from a session:

```js
const joined = await session.joinShip(servers[0], ships[0]);
const started = await session.startShip(servers[0], ships[0]);
const created = await session.startNewShip(servers[0], "myship", "#24f320ff");
const invited = await session.joinInvite(servers[0], "2c0YMWSGcR_r4Qzl4RqDoYEI");
```

Top-level convenience factories create an anonymous session when none is supplied:

```js
const joined = await Dredless.joinShip(servers[0]);
const started = await Dredless.startShip(servers[0]);
const created = await Dredless.startNewShip(servers[0], "myship", "#24f320ff");
const invited = await Dredless.joinInvite(servers[0], "2c0YMWSGcR_r4Qzl4RqDoYEI");
```

Server is required. If ship is omitted, a new unnamed ship is created.
Invite helpers join with `never_load: false`.

Ship-management helpers send the same top-level commands as the official client
and store config responses on the client:

```js
client.management.setPrivacy("private");
client.management.resetInvite();
client.management.setPlayerRank(10, "captain");
client.management.kickPlayer(10);
console.log(client.management.config()?.inviteKey);
```

## Live Watch Script

`````sh
npm run watch
npm run watch:test
```

`watch.js```joins the first owned ship, or creates an unnamed ship when none is
available, and redraws known websocket state until Ctrl+C. Optional environment
variables: `DRED_BASE_URL`, `DRED_TEST_SERVER=1`, `DRED_ANON_KEY`,
`DRED_SERVER`, `DRED_SHIP`, `DRED_REFRESH_MS`, `DRED_LINES`, `DRED_COLUMNS`,
`DRED_ALT_SCREEN=0`, `DRED_LOG_FILE=captures/watch.jsonl`, `DRED_LOG_APPEND=1`,
and `DRED_LOG_PACKETS=1`.
Use `DRED_ALT_SCREEN=0```to draw in the current terminal buffer instead of the
alternate screen. Pass `--test```or run `npm run watch:test```to use
`https://test.drednot.io`. The script writes JSON-lines diagnostics to
`captures/watch.jsonl```by default; set `DRED_LOG_FILE=0```to disable logging,
pass `--log FILE```to choose another output path, or pass `--append```to append
instead of overwriting the log at startup. Bare log filenames are written under
`captures/`. Pass `--log-packets```to include full packet bodies. The dashboard includes initial
model state decoded from the websocket full snapshot, including entity package
ids, fabricator rows, storage holders, loose items, fluid tanks, shield
generator charge/efficiency/boost state, cannon ammo/aim/barrel recoil/spin/cooling state, shield projectors, doors, signs, spawn points, and
normalized pusher/loader configuration.

