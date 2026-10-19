# API reference

[Documentation index](README.md) · [Getting started](GETTING_STARTED.md)

## Find an API

| Area                                           | Entry points                               | Reference                                   |
|------------------------------------------------|--------------------------------------------|---------------------------------------------|
| Node HTTP sessions and connections             | `Session`, `AnonSession`, `Dredless`       | [Node API](NODE_API.md)                     |
| Browser sessions and socket attachment         | `BrowserSession`, browser `Dredless`       | [Browser API](BROWSER_API.md)               |
| Client readiness, retention, disconnects       | `DredlessClient`, `client.net`             | [Client](CLIENT.md)                         |
| Callbacks and event payloads                   | `on`, `off`, `once`                        | [Events](EVENTS.md)                         |
| World, entity, and nearby ship reads           | `currentShip`, `overworld`, entity handles | [World state](WORLD_STATE.md)               |
| Input, inventory, blueprints, chat             | `client.player`, `client.inventory`        | [Player and inventory](PLAYER_INVENTORY.md) |
| Machine configuration and context menus        | `ship.machines`, `client.tips`             | [Machines](MACHINES.md)                     |
| Crew, logs, ship settings, saving, perks       | `client.management`                        | [Management](MANAGEMENT.md)                 |
| Account details, clan tags, applied perk ships | Session account methods                    | [Account](ACCOUNT.md)                       |
| Builders, decoders, generator mazes, raw state | Protocol subpaths, `client.debug`          | [Protocol and debugging](PROTOCOL.md)       |
| Failures and unsupported assumptions           | -                                          | [Troubleshooting](TROUBLESHOOTING.md)       |

## Imports

Use `dredless/node` for explicit Node sessions and `dredless/browser` for ambient browser authentication. Both provide a
runtime namespace as the default export and shared APIs as named exports. The package root selects a runtime through
package export conditions; explicit imports make that choice clear.

```js
import Dredless, {DredlessClient, LoaderPosition, DropReason} from "dredless/node";
```

Focused imports include `dredless/client`, `dredless/session`, `dredless/network`, `dredless/world`, `dredless/model`,
`dredless/state`, and [protocol subpaths](PROTOCOL.md#import-map). Subpaths do not necessarily re-export everything
available from a runtime entrypoint. `package.json` is the authoritative [export map](../package.json).

## Reading signatures

Signature blocks show how to call the API, using TypeScript notation for optional arguments and return values. They are
reference notation, not JavaScript programs to paste into an application. Examples labeled **fragment** require
variables established in a setup guide.

- `DredlessClient` return: sent or queued, without server confirmation.
- `Promise<T>` return: asynchronous; read the method's documented completion condition. A promise can mean permission
  granted and commit sent, observed state changed, or a server response arrived.
- `null`/`undefined`: state may be unavailable, not loaded, removed, or not applicable. Read the specific method's
  contract before treating absence as an empty list or zero.
- `state` is usually a property on a machine handle; `state()` is a method on domains such as inventory and machine
  collections.
- Large summary interfaces are linked to the declarations instead of duplicated field by field here.

## IDs and scopes

| Value                          | Meaning                                                                            |
|--------------------------------|------------------------------------------------------------------------------------|
| `server.index`                 | Server selector; numeric `ServerRef` means this index, not an array position       |
| World ID                       | Identifies a decoded world in `client.debug.worldStore()`                          |
| Entity `id` / summary `entity` | Entity ID within a world; the same number can mean something else in another world |
| Player `refId`                 | Management player-list reference for rank, kick, ban, and unban operations         |
| `sid`                          | WebSocket protocol session ID; not the player's entity ID                          |
| Ship `hexCode`                 | Human-visible ship code, without braces                                            |
| Account perk ship `shipId`     | Decimal string from the account removal form; use it with `removeShipPerks()`      |

Do not convert account perk ship `shipId` to/from `hexCode`; the form and display identifiers are
distinct. [Account methods](ACCOUNT.md#ships-with-patron-perks) returns both.

`ReadWorldScope` accepts `"ship"`, `"current"`, `"overworld"`, or a numeric world ID. Prefer world-scoped handles for
writes. A handle does not guarantee the entity exists, belongs to the current world, or is in range.

## Types and state shapes

The maintained declaration files are the full field/overload reference:

| Need                                                               | Declaration                                                              |
|--------------------------------------------------------------------|--------------------------------------------------------------------------|
| Shared client, handles, config, summary, snapshot, and event types | [src/index.d.ts](../src/index.d.ts)                                      |
| Browser factories and ambient sessions                             | [src/browser.d.ts](../src/browser.d.ts)                                  |
| Protocol-only helpers and constants                                | [src/protocol/index.d.ts](../src/protocol/index.d.ts) and its re-exports |

Useful type families: `Server`/`ServerStatus`/`Ship`/`ShipList`; `AccountDetails`/`ClanTagDetails`/`AccountPerkShip`;
`ClientSnapshot`/`WorldSnapshot`/`ModelSnapshot`; `EntitySnapshot`/`EntitySummary`/`EntityContentsSummary`;
machine-specific `*Handle`, `*Config`, and `*Summary`; `InventoryState`; `ShipConfig`/`ShipPlayerList`/`CrewLog`; and
`Command`/`TipList`/`DisconnectInfo`.

Some implementation methods and overloads predate the declarations. A reference page calls out known differences where
they affect usage; do not infer runtime support from a signature alone.
