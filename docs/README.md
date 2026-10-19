# Documentation

Dredless separates HTTP account sessions from live game connections. A `Session` authenticates requests; a `DredlessClient` owns a WebSocket and decoded world state. 
In a browser, `BrowserSession` uses the ambient browser cookie jar.

## Start here

1. [Getting started](GETTING_STARTED.md): read servers, join through an invite, inspect state, and close.
2. Choose [Node sessions](NODE_API.md) or [browser setup](BROWSER_API.md).
3. Read [completion and lifecycle](CLIENT.md#completion-and-readiness) before sending actions.

## Choose a task

| I want to…                                                       | Read                                                                                   |
|------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| Reuse an account or anonymous identity                           | [Node authentication](NODE_API.md#authentication-and-reuse)                            |
| Join an active ship or load a saved one                          | [Connection methods](NODE_API.md#join-start-and-invites)                               |
| Observe an official-client socket                                | [Browser attachment](BROWSER_API.md#attach-to-an-existing-socket)                      |
| Handle disconnects and retain useful state                       | [Client lifecycle](CLIENT.md)                                                          |
| Subscribe to model, inventory, or management updates             | [Event catalog](EVENTS.md)                                                             |
| Find an entity, machine, or nearby ship                          | [World and entity reads](WORLD_STATE.md)                                               |
| Move, aim, equip, or place a blueprint                           | [Player and inventory](PLAYER_INVENTORY.md)                                            |
| Use a context menu or set door access                            | [Machines and context menus](MACHINES.md#context-menus-and-access)                     |
| Configure a loader, pusher, launcher, or navigation unit         | [Machine reference](MACHINES.md)                                                       |
| Save, rename, reset invites, or manage crew                      | [Ship management](MANAGEMENT.md)                                                       |
| Read crew logs or apply ship patron perks                        | [Ship management](MANAGEMENT.md#crew-logs), [patron perks](MANAGEMENT.md#patron-perks) |
| Read account details, change a clan tag, or remove account perks | [Account methods](ACCOUNT.md)                                                          |
| Decode captures or build protocol messages                       | [Protocol and debugging](PROTOCOL.md)                                                  |
| Understand an error or missing value                             | [Troubleshooting](TROUBLESHOOTING.md)                                                  |

## Reference conventions

[API_REFERENCE.md](API_REFERENCE.md) indexes the reference pages and defines ID, return-value, and type conventions. Each page includes calling signatures and the behavior needed to use them. The package's [TypeScript declarations](../src/index.d.ts) contain complete state shapes and overloads; the [browser declarations](../src/browser.d.ts) describe browser-specific exports.

Examples marked **fragment** assume a connected `client` or authenticated `session` from the setup guides. They are not standalone programs. Examples that change game/account state describe their prerequisites before the code.

Documentation describes the current checkout. Protocol support and website scraping can change with the upstream game. See [troubleshooting](TROUBLESHOOTING.md) for the specific failure surfaces.

## Contributing to these docs

Put setup in the runtime guides, behavior in the relevant domain page, callbacks in the event catalog, and wire-format details in protocol documentation. 
Add navigation links for new tasks. Include calling signatures, prerequisites, units/ranges, return/completion meaning, errors, and one contextual example where they affect usage. 
Keep complete state shapes in the declarations; avoid copying a second exhaustive type catalog into Markdown. 
Put changes between releases in release notes rather than describing the current API as "now" doing something.
