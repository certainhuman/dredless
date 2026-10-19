# Getting started

[Documentation index](README.md) · [API reference](API_REFERENCE.md)

## Contents

- [Choose a runtime](#choose-a-runtime)
- [Read servers and ships](#read-servers-and-ships)
- [Connect through an invite](#connect-through-an-invite)
- [Read live state](#read-live-state)
- [Send an action](#send-an-action)
- [Next steps](#next-steps)

## Choose a runtime

For Node, install `dredless` and save examples as `.mjs` files. The runtime must provide `fetch`. Import `dredless/node`
for explicit sessions.

For browser integrations, import `dredless/browser` through a bundler or use the global bundle. Run in a
page/content-script context where the Drednot origin and cookies are accessible. An arbitrary website cannot acquire
Drednot authentication by loading this package. Follow [browser setup](BROWSER_API.md).

## Read servers and ships

This standalone Node program makes HTTP requests without joining a ship:

```js
import Dredless from "dredless/node";

const session = await Dredless.createAnonSession(process.env.DREDNOT_ANON_KEY);
const servers = await Dredless.fetchServers();
const server = servers[0];
if (!server) throw new Error("No servers found");

console.log(server.index, server.description);
const list = await session.fetchShipList(server);
for (const ship of list.ships) {
    console.log(ship.name, ship.hexCode, ship.playerCount, ship.saved);
}
```

Choose a server from this list for the next example. Array position and `server.index` are not interchangeable: numeric
`ServerRef` arguments mean the server index.

## Connect through an invite

Obtain an invite code and server index from the ship you intend to join. Supply the code segment from its invite URL,
rather than the entire URL:

```sh
DREDNOT_SERVER_ID=0 DREDNOT_INVITE_CODE=your-code node inspect.mjs
```

Save the following as `inspect.mjs`. It joins once, reads the currently available state, and closes the connection even
if inspection fails:

```js
import Dredless from "dredless/node";

const code = process.env.DREDNOT_INVITE_CODE;
const serverId = Number(process.env.DREDNOT_SERVER_ID);
if (!code || !Number.isInteger(serverId) || serverId < 0) {
    throw new Error("Set DREDNOT_INVITE_CODE and a non-negative DREDNOT_SERVER_ID");
}

const session = await Dredless.createAnonSession(process.env.DREDNOT_ANON_KEY);
const servers = await Dredless.fetchServers();
const server = servers.find((entry) => entry.index === serverId);
if (!server) throw new Error("Requested server was not found");

const client = await session.joinInvite(server, code);
try {
    const ship = client.currentShip();
    if (!ship) throw new Error("Current ship state is not available yet");
    console.log(ship.metadata);
    console.log(ship.machines.loaders().map((loader) => ({id: loader.id, state: loader.state})));
} finally {
    client.close();
}
```

The factory resolves after the ready packet. It does not promise that every optional component or panel is populated.
For ongoing work, react to [events](EVENTS.md), and tolerate missing values.

Use `session.joinShip(server, ship)` for an active ship, or `session.startShip(server, ship)` when it may need loading
from a save. [Connection choices](NODE_API.md#join-start-and-invites) explains the difference.

## Read live state

**Fragment:** attach listeners immediately after obtaining a client. Factory promises can resolve after some initial
packets have arrived, so also read the cached state once:

```js
function reportLoaders() {
    const ship = client.currentShip();
    if (!ship) return;
    console.log(ship.machines.loaders().map((loader) => ({id: loader.id, cycle: loader.cycle})));
}

client.on("model", reportLoaders);
client.on("disconnect", (info) => console.log(info.name, info.code, info.reason));
reportLoaders();
```

For a long-running integration, call `client.close()` when your application finishes. There is no automatic
reconnect. [Lifecycle](CLIENT.md) describes cleanup and retry boundaries.

## Send an action

A client must be writable and ready. The server still enforces permissions, range, inventory, and game rules.

**Fragment:** configure an existing loader you have permission and range to configure:

```js
const loader = client.currentShip()?.machines.loaders()[0];
if (!loader) throw new Error("No loader is currently visible");
loader.configure({
    pick: "middle-left", place: "middle-right", priority: "normal", cycle: 5
}); // cycle is seconds; sends configuration without awaiting confirmation.
```

Configuration enums are explicit here because of the [current numeric-default limitation](MACHINES.md#loaders).

Returning a client means a command was sent or queued. Awaiting such a return value adds no server acknowledgment.
Methods that return promises document their particular confirmation condition; for example, a rename waits for
permission and sends a commit, while ship saving waits for a close code.
See [completion](CLIENT.md#completion-and-readiness).

## Next steps

- [Node sessions](NODE_API.md): reuse identities and select ships.
- [World state](WORLD_STATE.md): entity IDs, handles, and snapshot behavior.
- [Machines](MACHINES.md): configuration, menus, and active interactions.
- [Management](MANAGEMENT.md): confirmed operations and crew control.
- [Account](ACCOUNT.md): clan tags, account details, and perk removal.
