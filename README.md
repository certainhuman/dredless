# dredless

A headless JavaScript client for [drednot.io](https://drednot.io). Use it to join ships, read world state, send player input, configure machines, and manage ships and accounts.

## Install

```sh
npm install dredless
```

Node examples use ES modules (`.mjs`) and a runtime with built-in `fetch`. Browser code runs with the site's browser cookies; see [browser setup](docs/BROWSER_API.md) for supported contexts.

## First request

Save this as `ships.mjs`, then run `node ships.mjs`:

```js
import Dredless from "dredless/node";

const session = await Dredless.createAnonSession(process.env.DREDNOT_ANON_KEY);
const servers = await Dredless.fetchServers();
const server = servers[0];
if (!server) throw new Error("No servers found");

const ships = await session.fetchShips(server);
console.log(ships.map(({name, hexCode, playerCount}) => ({name, hexCode, playerCount})));
```

This reads the ship list without opening a game connection. Supplying `DREDNOT_ANON_KEY` reuses an anonymous identity; omitting it creates one. [Session setup](docs/NODE_API.md#authentication-and-reuse) explains how to reuse anonymous or registered accounts.

## Documentation

Start with the [documentation index](docs/README.md).

| Task | Guide |
| --- | --- |
| Connect and read a live ship | [Getting started](docs/GETTING_STARTED.md) |
| Authenticate in Node | [Node sessions](docs/NODE_API.md) |
| Use browser cookies or an existing socket | [Browser setup](docs/BROWSER_API.md) |
| Find a method or type | [API reference](docs/API_REFERENCE.md) |
| Understand callbacks and completion | [Lifecycle](docs/CLIENT.md), [events](docs/EVENTS.md) |
| Diagnose missing state or failed actions | [Troubleshooting](docs/TROUBLESHOOTING.md) |

Docs describe this checkout. A published npm version or CDN bundle can have fewer methods; use documentation from the corresponding release when working with an older version.
