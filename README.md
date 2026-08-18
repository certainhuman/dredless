# dredless

A headless pure Javascript implementation (with type annotations) of `drednot.io`'s client protocol.

## Quick Start

Node (multi-session) usage:

```js
import Dredless, {EquipmentSlot, SignDisplayMode} from "dredless/node";

const servers = await Dredless.fetchServers();
const client = await Dredless.startNewShip(servers[0], "bot", "#de9797");

client.player.move({ x: 1, y: 0 });
client.inventory.slot(0).equip(EquipmentSlot.Feet);
client.player.placeBlueprint({ x: 28, y: 18, width: 3, height: 3, source: "DSA:..." }, { invSlot: 2 });

const ship = client.currentShip();
const loader = ship?.machines.loaders()[0];
loader?.configure({ cycle: 5, stack: 12 });

const sign = ship?.machines.signs()[0];
sign?.open();
sign?.setText("Dock here", SignDisplayMode.WhenNear);

client.on("inventory", () => console.log(client.inventory.hotbarSlots().map((slot) => slot.snapshot())));
client.on("model", ({ world }) => console.log(world.model.transforms()));
```

Browser (ambient-session) usage:

```js
import Dredless from "dredless/browser";

await Dredless.createAnonSession();
const servers = await Dredless.fetchServers();
const ships = await Dredless.fetchShips(servers[0]);
const client = await Dredless.startShip(servers[0], ships[0]);

// . . . client object can be used the same as in Node
```

## API Docs

- [Node top-level API](docs/NODE_API.md): explicit session/token/start helpers. Use this if you are running in a Node environment.
- [Browser top-level API](docs/BROWSER_API.md): ambient browser-session helpers. Use this if you are running in a browser environment.
- [Shared API reference](docs/API_REFERENCE.md): client, world, entity, machine, inventory, management, and protocol APIs. Used by both runtime environments.
