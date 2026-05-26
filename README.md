# dredless

Object-oriented headless client primitives for `drednot.io`.

## Quick Start

```js
import Dredless from "dredless";

const servers = await Dredless.fetchServers();
const client = await Dredless.newShip(servers[0], "bot", "#de9797");

client.send({ x: 1, y: 0 });
client.craftAdd(150, 1);

client.on("inventory", (inventory) => console.log(inventory.hotbar));
client.on("model", ({ world }) => console.log(world.model.transforms()));
```

## Core Objects

```js
import Dredless, {
  Session,
  AnonSession,
  Connection,
  DredlessClient
} from "dredless";
```

- `Session` stores `game_session`, notice/version state, and authenticated HTTP helpers.
- `AnonSession` extends `Session` with `anon_key`.
- `Connection` stores the result of `/join`: session, `game_token`, net port, and server id.
- `DredlessClient` is the live WebSocket client that sends commands and processes packets.
- `WorldStore` / `WorldState` keep decoded world metadata, normalized tiles, material counts, the world tileset, model packets, and best-effort ECS model tables, plus derived entity and block occupancy summaries for ship and overworld worlds.
- `Dredless` is the default and named namespace for factories and unauthenticated fetch helpers.

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
Direct `Dredless.fetchNoticeVersion()` throws when scraping fails.

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

`fetchShips()` returns normalized ships only.
`fetchShipList()` returns the full response body with `ships: Ship[]` normalized.

## Connections And Clients

Declare an existing joined connection without network I/O:

```js
const connection = new Connection(session, "game-token", 4003, 0);
const client = new DredlessClient(connection);
await client.waitUntilReady();
```

Start connections from a session:

```js
const joinConnection = await session.startJoinConnection(servers[0], ships[0]);
const startConnection = await session.startConnection(servers[0], ships[0]);
const newShipConnection = await session.startNewShipConnection(servers[0], "myship", "#de9797");
```

Start ready clients from a session:

```js
const joined = await session.join(servers[0], ships[0]);
const started = await session.start(servers[0], ships[0]);
const created = await session.newShip(servers[0], "myship", "#24f320ff");
```

Top-level convenience factories create an anonymous session when none is supplied:

```js
const joined = await Dredless.join(servers[0]);
const started = await Dredless.start(servers[0]);
const created = await Dredless.newShip(servers[0], "myship", "#24f320ff");
```

Server is required. If ship is omitted, a new unnamed ship is created.

## Live Watch Script

```sh
npm run watch
npm run watch:test
```

`watch.js` joins the first owned ship, or creates an unnamed ship when none is
available, and redraws known websocket state until Ctrl+C. Optional environment
variables: `DRED_BASE_URL`, `DRED_TEST_SERVER=1`, `DRED_ANON_KEY`,
`DRED_SERVER`, `DRED_SHIP`, `DRED_REFRESH_MS`, `DRED_LINES`, `DRED_COLUMNS`,
`DRED_ALT_SCREEN=0`, `DRED_LOG_FILE=watch.log`, and `DRED_LOG_PACKETS=1`.
Use `DRED_ALT_SCREEN=0` to draw in the current terminal buffer instead of the
alternate screen. Pass `--test` or run `npm run watch:test` to use
`https://test.drednot.io`. The script writes JSON-lines diagnostics to
`watch.log` by default; set `DRED_LOG_FILE=0` to disable logging or pass
`--log-packets` to include full packet bodies. The dashboard includes initial
model state decoded from the websocket full snapshot, including entity package
ids, fabricator rows, storage holders, loose items, fluid tanks, starter
cannon ammo/charge state, shield projectors, doors, signs, spawn points, and
normalized pusher/loader configuration.

## Replay Benchmarks

Capture a replayable live packet log:

```sh
npm run capture -- --out captures/near-ship.jsonl
```

Stop with Ctrl+C after reproducing the scenario. The capture script logs only
brief progress messages and writes full packet payloads to JSON-lines. Replay it
offline with:

```sh
npm run benchmark -- captures/near-ship.jsonl
```

Inspect overworld mob/projectile behavior from a capture with:

```sh
npm run analyze:entities -- captures/owned-overworld-mobs.jsonl --world 1
```

The analyzer groups health-bearing movers as likely mobs, table-3 health
entities as likely overworld item crates, and fast, short-lived projectile
movers as likely bullets.

Benchmark another implementation by pointing at a module that exports
`WorldStore`:

```sh
npm run benchmark -- captures/near-ship.jsonl --module ./src/game/world.js --module ../other-client/src/game/world.js
```
