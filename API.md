# dredless API

## Exports

```js
import Dredless, {
  Dredless as DredlessNamespace,
  Session,
  AnonSession,
  Connection,
  DredlessClient
} from "dredless";
```

`Dredless` is both the default export and a named namespace export.
Low-level world, model, protocol, crypto, and compression helpers are still
available as named imports and subpath exports, but they are not part of the
default convenience namespace.

## `Dredless`

Static namespace methods:

```js
await Dredless.createSession(noticeVersion?);
await Dredless.createAnonSession(anonKey?, noticeVersion?, baseUrl?);
await Dredless.createAnonToken(noticeVersion?, baseUrl?);

await Dredless.fetchNoticeVersion();
await Dredless.fetchGameVersion();
await Dredless.fetchServers();

await Dredless.fetchShips(session, server);
await Dredless.fetchShipList(session, server);

await Dredless.join(server, ship?, session?);
await Dredless.start(server, ship?, session?);
await Dredless.newShip(server, name?, color?, session?);
await Dredless.startInvite(server, code, session?);
await Dredless.invite(server, code, session?);
```

Notes:

- `fetchNoticeVersion()` throws if scraping fails.
- `fetchShips()` resolves to normalized `Ship[]`.
- `fetchShipList()` resolves to `ShipList`, an object with `ships: Ship[]` plus other server fields.
- Session factories fall back to notice version `17` internally when scraping fails.
- `join()` uses `never_load: true`.
- `start()` uses `never_load: false`.
- `newShip()` creates a new ship and returns a ready `DredlessClient`.
- `startInvite()` / `invite()` join by invite code with `never_load: false`.
- Server is required for client factories.
- If ship is omitted for `join()` or `start()`, a new unnamed ship is created.

## `Session`

```js
const session = new Session(gameSession, gameVersion?);
```

Constructor behavior:

- Stores `game_session` when provided.
- Stores optional `gameVersion`.
- Performs no network I/O.

Properties:

```js
session.baseUrl
session.cookies
session.gameSession
session.gameToken
session.gameVersion
session.noticeVersion
session.account
session.geoServer
```

Methods:

```js
session.request(path, init);
await session.fetchAccountStatus();
await session.fetchShips(server);
await session.fetchShipList(server);

await session.startJoinConnection(server, ship?);
await session.startConnection(server, ship?);
await session.startNewShipConnection(server, name?, color?);
await session.startInviteConnection(server, code);

await session.join(server, ship?);
await session.start(server, ship?);
await session.newShip(server, name?, color?);
await session.startInvite(server, code);
await session.invite(server, code);

session.toJSON();
```

`fetchAccountStatus()` calls `/account/status`, returns the response body, updates account fields, and merges relevant `Set-Cookie` headers.
`fetchShips()` resolves to normalized `Ship[]`; `fetchShipList()` resolves to `ShipList`.

## `AnonSession`

```js
const anon = new AnonSession(gameSession, anonKey, gameVersion?, baseUrl?);
```

`AnonSession` extends `Session` and adds:

```js
anon.anonKey
```

## `Connection`

```js
const connection = new Connection(session, gameToken, netPort, serverId);
```

Constructor behavior:

- Stores session, `game_token`, net port, and server id.
- Adds `game_token` to the session cookie store.
- Performs no network I/O.

Properties:

```js
connection.session
connection.gameToken
connection.netPort
connection.serverId
connection.server
connection.baseUrl
```

## `DredlessClient`

```js
const client = new DredlessClient(connection);
await client.waitUntilReady();
```

Constructor behavior:

- Starts the WebSocket connection immediately.
- Resolves `readyPromise` after the server ready packet and bootstrap.

Properties:

```js
client.connection
client.session
client.serverId
client.server
client.netPort
client.sid
client.connected
client.ready
client.readyPromise
client.packetCount
client.lastPacket
client.cpuLoad
client.inventory
client.puiPanels
client.chat
client.motd
client.sessionMessages
client.commandAcks
client.lastCommandAck
client.decodeErrors
```

Methods:

```js
await client.waitUntilReady();
client.send(command);
client.sendMessage(message, { afterReady? });
client.sendRaw(message, { afterReady? });
client.setOutfit(outfit);
client.sendEntityCommand(cmd, args?);
client.sendFabricatorMessage(cmd, args?);
client.sendFabricatorCommand(itemId, count?, index?);
client.craftAdd(itemId, count?, index?);
client.craftSub(itemId, count?, index?);
client.craftClearQueue();
client.craftToggleRepeat();
client.fabricatorLockResource(row);
client.fabricatorUnlockResource(row);
client.fabricatorEject(row);
client.setLauncherAngle(angle);
client.setLauncherPower(power);
client.sendUiConfig(data);
client.solveGeneratorPuzzle(entity, solution);
client.sendPusherConfig(entity, config?);
client.setPusherAngle(entity, angle, config?);
client.setPusherSpeed(entity, speed, config?);
client.setPusherLength(entity, length, config?);
client.setPusherMode(entity, mode, config?);
client.setPusherFilteredMode(entity, filteredMode, config?);
client.setPusherFilterInventory(entity, filterInventory, config?);
client.setPusherFilterItems(entity, filterSlots?);
client.inputSettings();
client.setInputSettings(settings?, options?);
client.setWrenchMode(mode, options?);
client.setWrenchAction(mode, options?);
client.setTurretMode(mode, options?);
client.sendNavigationUnitConfig(entity, config?);
client.setNavigationDestination(entity, destination, config?);
client.setNavigationAutoWarp(entity, config?);
client.startWarp(entity, config?);
client.cancelWarp(entity, config?);
client.move(x?, y?, command?);
client.aim(mx?, my?, command?);
client.action(flags?, command?);
client.useEntity(entity, options?, command?);
client.useHeldItem(options?, command?);
client.placeHeldItem(options?, command?);
client.selectSlot(invSlot?, command?);
client.drag(source, target, split?, command?);
client.close(code?, reason?);
client.disconnect(code?, reason?);
client.state({ includeTiles?, includeModel? });
client.ship({ includeTiles?, includeModel? });
client.shipEntity();
client.entities(scope?);
client.entity(entityId, scope?);
client.machines(scope?);
client.players(scope?);
client.shipControls(scope?);
client.ships(options?);
client.shipByHex(hexCode, options?);
client.shipByEntity(entityId, options?);
client.blocks(scope?);
client.materials(scope?);
```

`send()` builds a signed `type: 0` input command and waits for the server `sid`
before sending. `sendMessage()` sends ordinary MsgPack websocket messages such
as `type: 5` entity/PUI commands, `type: 7` outfits, and `type: 8` UI/config
payloads.

`sendEntityCommand(cmd, args)` sends the observed top-level `type: 5` command
message shape. Fabricator helpers are named wrappers around this generic entity
command channel:

```js
client.craftAdd(248, 8);      // queue 8 Munitions Fabricators
client.craftSub(248, 1, 0);   // remove 1 from queue index 0
client.craftClearQueue();
client.craftToggleRepeat();
client.fabricatorLockResource(1);
client.fabricatorUnlockResource(1);
client.fabricatorEject(0);
```

`sendFabricatorCommand()` is the legacy `craft_add` wrapper. Use
`sendFabricatorMessage(cmd, args)` for raw confirmed fabricator commands.

Item Launcher helpers also use the type `5` entity/PUI command channel. Open
the launcher with a normal entity use first; the server replies with a PUI panel
like `{ type:"launcher", power:30, angle:270 }`.

```js
client.useEntity(launcher.entity);
client.setLauncherAngle(90);
client.setLauncherPower(15);
```

`angle` is degrees and is rounded/wrapped into `0..359`. `power` is the
launcher UI value `0..30`. These commands target the currently open launcher
panel; no entity id is present in the outgoing type `5` message.

Pusher helpers use compact `type: 8` UI/config payloads and include the target
entity id. `sendPusherConfig(entity, config)` sends the full pusher config;
omitted fields default to the currently decoded pusher state, then to the
official defaults: default mode `do-nothing`, filtered mode `push`, angle `0`,
speed `20`, length `1000`, and filter-by-inventory off.

```js
client.sendPusherConfig(pusher.entity, {
  mode: "pull",
  filteredMode: "do-nothing",
  angle: 90,
  speed: 13,
  length: 300,
  filterInventory: true
});

client.setPusherAngle(pusher.entity, 180);
client.setPusherFilterItems(pusher.entity, [100, 0, 0]); // Wrench in slot 0
```

Pusher modes are `0`/`"push"`, `1`/`"pull"`, and
`2`/`"do-nothing"`. `setPusherFilterItems()` accepts three item ids; `0`,
`null`, or omitted slots mean empty.

Shield generator puzzle submissions use a compact `type: 8` UI/config payload:

```js
client.useEntity(generator.entity);
client.solveGeneratorPuzzle(generator.entity, generator.puzzleSolution);
```

`open-generator-puzzle.jsonl` confirms opening the puzzle is a normal entity
use command on the generator; the server responds with a `config_ent_ui` side
event and subsequent input frames keep `config_ent` set while the panel is open.
`join-open-close-generator.jsonl` confirms the generator puzzle seed is already
present in model data as `entity.contents.shieldGenerator.puzzleSeed`
(`table75.q20`) before opening the panel; the open event does not send the
solution. Dredless also exposes `entity.contents.shieldGenerator.puzzleSolution`
and the named helper `solveGeneratorMazeSeed(seed)` so consumers do not need to
implement the maze solver.
If callers need the maze grid, use `generateGeneratorMaze(seed)`:

```js
const maze = generateGeneratorMaze(generator.puzzleSeed);
console.log(maze.solution);
console.log(maze.rows[0][0].walls);
```

The returned maze has `{ seed, width, height, rows, cells, solution }`. Each
cell has `{ x, y, value, hex, digit, walls, backtrackDirection, marker }`.
`solve-generator-puzzle.jsonl` and `fail-generator-puzzle.jsonl` confirm the
submitted solution is encoded as command `maze_puzzle`. `load-core-into-generator.jsonl`
confirms loading a Shield Core into a generator is also just `useEntity()` with
the selected inventory slot.

Input settings are persistent defaults included on every signed `type: 0`
command. The official client does not send a separate settings packet for these
controls; it changes the repeated `wrench_mode` and `turret_mode` fields:

```js
client.setWrenchMode("grab-all-items");
client.setTurretMode("volley-fire");
client.inputSettings();
```

Wrench modes:

```js
0 // drop-all-items
1 // grab-primary-items
2 // grab-all-items
```

Turret modes:

```js
0 // continuous-fire
1 // volley-fire
```

By default `setWrenchMode()`, `setWrenchAction()`, `setTurretMode()`, and
`setInputSettings()` also send one immediate input command carrying the updated
defaults. Pass `{ send:false }` to only update future commands.

Generic entity use sends a normal left-click type `0` command with the entity
in `focus_ent`:

```js
client.useEntity(ejector.entity, { invSlot: 0 });
```

`place-16-standard-ammo-in-ejector.jsonl` confirms this is how the official
client places the active hotbar item into a Cargo Ejector: `focus_ent` is the
ejector entity, `inv_slot=0`, `act1=true`, and `act1_held=true`; the server
then sends an inventory update clearing that slot.

Using or placing the currently held hotbar item sends the same left-click flags
without a focused entity:

```js
client.placeHeldItem({ invSlot: 0 }, { mx: 19.79, my: 4.79 });
```

`place-generator.jsonl` confirms placing a Shield Generator from hotbar slot `0`
uses `focus_ent=null`, `inv_slot=0`, `act1=true`, and `act1_held=true`; the
server log confirms placement and the inventory update clears slot `0`.

Navigation-unit helpers send the observed top-level `type: 8` UI/config
payload for `config_nav_unit`:

```js
const nav = client.machines().navigationUnits[0];

client.setNavigationDestination(nav.entity, 40); // Raven
client.setNavigationAutoWarp(nav.entity, {
  destination: 40,
  page: 1,
  autoWarpOnShieldFailure: true,
  autoWarpOnNoCaptains: false
});
client.startWarp(nav.entity);
client.cancelWarp(nav.entity);
```

When the nav unit is already present in decoded state, omitted destination and
auto-warp flags default from `entity.contents.navigationUnit`. Pass them
explicitly when sending before the entity has been observed. `destination` is
the normalized nav base id: `10` Hummingbird, `20` Finch, `30` Sparrow, `40`
Raven, `50` Falcon, `60` Combat Arena.

## Client Read API

The read API exposes already-decoded client state. Packet parsing, model
decryption, tile decompression, and state application happen as websocket
packets arrive. Read methods do not re-decode raw packets.

The first call to any entity-derived method on a world can build that world's
derived summary cache. That first read scans model tables, summarizes entities,
builds block occupancy, and groups machines/players/ship controls. After the
cache exists, model updates maintain it incrementally and reads are mostly
shallow array/object copies.

Treat returned values as read-only. Arrays are generally copied; nested summary
objects are reused until the next model update rebuilds them.

### Scopes

Collection helpers accept an optional `scope`:

```js
"ship"       // default; current loaded ship world
"current"    // alias for "ship"
"overworld"  // overworld world
12345        // explicit world id
```

Methods that accept a scope:

```js
client.entities(scope);
client.entity(entityId, scope);
client.machines(scope);
client.players(scope);
client.shipControls(scope);
client.blocks(scope);
client.materials(scope);
```

### `client.state(options?)`

Returns a whole-client snapshot.

```js
const state = client.state();
```

Return shape:

```js
{
  baseUrl,
  session,
  connection,
  serverId,
  server,
  netPort,
  sid,
  ready,
  connected,
  currentWorldId,
  worlds,
  cpuLoad,
  inventory,
  puiPanels,
  warnings,
  effects,
  chat,
  motd,
  sessionMessages,
  outfits,
  commandAcks,
  lastCommandAck,
  decodeErrors,
  packetCount,
  lastPacket
}
```

Options:

```js
client.state({
  includeTiles: false,
  includeModel: false
});
```

Cost:

- Snapshots every loaded world.
- Default cost is proportional to loaded worlds, entity summaries, block
  summaries, machine groups, player lists, and material counts.
- `includeTiles: true` copies all known tiles from every loaded world.
- `includeModel: true` includes raw decoded model table records and is
  diagnostic-heavy.

Use when:

- You want a full diagnostic dump.
- You are serializing complete current client state.
- You are not polling at high frequency.

Prefer instead:

- `client.ship()` for only the current ship world.
- `client.entities()`, `client.machines()`, or `client.players()` for
  high-frequency reads.

### `client.ship(options?)`

Returns the current ship-world snapshot, or `null` if no ship world is loaded.

```js
const ship = client.ship();
```

Return shape:

```js
{
  id,
  is_overworld,
  overworldZone,
  tileset,
  seed,
  block_w,
  block_h,
  parent_world,
  parent_ent,
  tileCount,
  chunkCount,
  lastChunkPatch,
  lastPacket,
  meta,
  materials,
  model,
  entities,
  blocks,
  transforms,
  machines,
  players,
  shipControls,
  commsBubbles,
  tiles
}
```

For overworld worlds, `overworldZone` is:

```js
{
  id,          // actual overworld id, including layer offset
  baseId,      // base zone id used by navigation destinations
  layer,       // zero-based layer index
  key,         // "freeport", "hummingbird", ...
  name,        // display base name
  displayName  // base name plus layer, for example "Sparrow II"
}
```

Known base ids are `0` Freeport, `10` Hummingbird, `20` Finch,
`30` Sparrow, `40` Raven, `50` Falcon, and `60` Combat Arena.

`tiles` is present only with `includeTiles: true`.

Options:

```js
client.ship({
  includeTiles: false,
  includeModel: false
});
```

Cost:

- Snapshots one world.
- Default cost includes entity summaries, block summaries, machine groups,
  players, ship controls, and material counts.
- `materials` scans the world's tile map.
- `includeTiles: true` copies all known tiles.
- `includeModel: true` includes raw decoded model tables.

Use when:

- You want a convenient current ship-world object.
- You need several categories at once, such as `entities`, `machines`, and
  `players`.

Prefer instead:

- `client.machines()` if you only need machines.
- `client.entities()` if you only need entity summaries.
- `client.materials()` if you only need material counts.

### `client.shipEntity()`

Returns the overworld entity that represents the currently loaded ship, or
`null` when the link is not known.

```js
const currentShip = client.shipEntity();
```

Return shape is `EntitySummary`:

```js
{
  entity,
  category,
  typeId,
  typeName,
  markerTypeId,
  markerTypeName,
  label,
  kind,
  transform,
  footprint,
  contents,
  occupies,
  tables
}
```

Useful nested field:

```js
currentShip.contents.shipControl
```

Cost:

- Looks up the loaded ship world's `parent_world` / `parent_ent` link.
- After the overworld derived cache exists, cost is effectively a map lookup.
- Can build the overworld derived cache on first use.

Use when:

- You need current ship name, hex code, shield, warp, position, or thrust as
  seen in the overworld.
- You need a distance reference for nearby overworld objects.

Alternative:

- `client.ships().find((ship) => ship.entity === client.shipEntity()?.entity)`
  when you also want the normalized `ShipReadSummary` shape.

### `client.entities(scope?)`

Returns all normalized entity summaries in the selected world.

```js
const entities = client.entities();
const overworldEntities = client.entities("overworld");
```

Return shape:

```js
[
  {
    entity,
    category,
    typeId,
    typeName,
    markerTypeId,
    markerTypeName,
    label,
    kind,
    transform,
    footprint,
    contents,
    occupies,
    tables
  }
]
```

Common `contents` fields:

```js
entity.contents.health
entity.contents.hoverOutline
entity.contents.itemHolder
entity.contents.itemCrate
entity.contents.loader
entity.contents.pusher
entity.contents.navigationUnit
entity.contents.cannon
entity.contents.commsStation
entity.contents.shieldGenerator
entity.contents.shieldProjector
entity.contents.sign
entity.contents.spawnPoint
entity.contents.door
entity.contents.player
entity.contents.shipControl
```

Cost:

- First derived read on a world scans model tables and summarizes all entities.
- After cache exists, returns `entities.slice()`.
- Warm cost is proportional to entity count.

Use when:

- You need to inspect arbitrary entities.
- You need fields that are not grouped under `machines()`, such as map markers,
  item crates, loose items, or custom categories.

Prefer instead:

- `client.entity(id)` for a known id.
- `client.machines()` for known machine categories.
- `client.players()` for player-only reads.

### `client.entity(entityId, scope?)`

Returns one normalized entity summary, or `null`.

```js
const entity = client.entity(14);
const overworldEntity = client.entity(2495754, "overworld");
```

Return shape is one `EntitySummary`, the same as an item from
`client.entities()`.

Cost:

- Can build derived cache on first use.
- After cache exists, map lookup is effectively constant time.

Use when:

- You already have an entity id from a command, PUI panel, event, or previous
  entity list.

Prefer instead:

- `client.entities()` when you need to search or filter by arbitrary fields.

### `client.machines(scope?)`

Returns normalized machine summaries grouped by machine kind.

```js
const machines = client.machines();
const loaders = machines.loaders;
```

Return shape:

```js
{
  itemHolders,
  health,
  fabricators,
  processors,
  cannons,
  thrusters,
  pushers,
  launchers,
  loaders,
  navigationUnits,
  commsStations,
  fluidTanks,
  shieldGenerators,
  shieldProjectors,
  expandoBoxes
}
```

Thruster shape:

```js
{
  entity,
  typeId,
  typeName,
  facing,     // 0 bottom, 1 top, 2 right, 3 left; starter corners use 4..7
  facingName, // bottom, top, right, left, bottom-right, bottom-left, top-right, top-left
  fuel,
  state
}
```

Loader shape:

```js
{
  entity,
  pick,
  pickName,
  place,
  placeName,
  priority,
  priorityName,
  requireOutput,
  waitForStack,
  stack,
  cycle,
  filterMode,
  filterModeName,
  filterSlots,
  state,
  filterState,
  filterSlotsState
}
```

Pusher shape:

```js
{
  entity,
  mode,
  modeName,
  filteredMode,
  filteredModeName,
  angle,
  speed,
  length,
  filterInventory,
  filterSlots,
  state,
  filterSlotsState
}
```

Launcher shape:

```js
{
  entity,
  angleRadians,
  angleDegrees,
  powerRaw,
  state
}
```

`angleDegrees` is decoded from persisted launcher model state. The live launcher
PUI exposes power as a direct `0..30` value, but the persisted model field has
only been identified as `powerRaw`; consumers that need to edit power should use
`client.setLauncherPower(power)`.

Navigation unit shape:

```js
{
  entity,
  destination,     // normalized destination base id, for example 30 for Sparrow
  destinationName, // lowercase destination key
  autoWarpOnShieldFailure,
  autoWarpOnNoCaptains,
  state
}
```

The raw navigation-unit table encodes destinations as `baseId - 1`; Dredless
normalizes that to the real base id before exposing `destination`.

Cannon shape:

```js
{
  entity,
  typeId,
  typeName,
  ammoItemId,
  ammoName,
  ammoCount,
  aim,
  recoil,
  recoil2,
  recoils,
  charge,
  charged,
  spin,
  coolingCellCount,
  state
}
```

Cost:

- Can build derived cache on first use.
- After cache exists, shallow-copies each machine group array.
- Warm cost is proportional to total machine count.

Use when:

- You want loaders, pushers, generators, cannons, etc. without walking
  arbitrary entity summaries.
- You are polling machine config or machine state.

Prefer instead:

- `client.entity(id).contents.loader` for one known machine.
- `client.ship()` if you also need entities, players, blocks, and materials.

### `client.players(scope?)`

Returns normalized player summaries.

```js
const players = client.players();
```

Return shape:

```js
[
  {
    entity,
    name,
    heldItemId,
    heldItemName,
    repairTargetDistance,
    repairTargetAngle,
    teamRank,
    teamRankName,
    gameRank,
    gameRankName,
    patronTier,
    piloting,
    muted,
    actionPreview,
    state
  }
]
```

`actionPreview` shape when a player is placing or breaking:

```js
{
  entity,
  active,
  x,
  y,
  width,
  height,
  progress,
  color,
  colorCss,
  actionName,
  blueprintId,
  blueprintItems,
  state
}
```

Blueprint scanner previews use `actionName: "blueprint"` and include
`blueprintItems`:

```js
[
  {
    entity,
    itemId,
    itemName,
    bits,             // expanded BITS value, defaulting to 1
    rawBits,          // raw table value, equal to bits - 1 when present
    placementOffsets, // X+ offsets selected by bits
    placementCount,
    placements,
    x,
    y,
    rot,
    state
  }
]
```

Blueprint preview rows represent blueprint build commands, not item stacks.
`placements` expands `bits` along the X+ axis from the command base position
`x,y`.

Cost:

- Can build derived cache on first use.
- After cache exists, returns a shallow copy of player summaries.
- Warm cost is proportional to player count.

Use when:

- You need player names, ranks, held items, piloting state, or replicated
  placing/breaking previews.

Alternative:

- `client.entities().filter((entity) => entity.contents?.player)` when you
  need the full entity wrapper around each player.

### `client.shipControls(scope?)`

Returns ship-control summaries from the selected world. The default scope is
`"overworld"`.

```js
const controls = client.shipControls();
```

Return shape:

```js
[
  {
    entity,
    name,
    hexCode,
    shipWorldId,
    color,
    colorCss,
    thrustX,
    thrustY,
    value52,
    value84,
    value96,
    shield,
    warp,
    state
  }
]
```

Shield shape:

```js
{
  maxHp,
  baseHp,
  activeTankHp,
  inactiveTankHp,
  tankValues
}
```

Warp shape:

```js
{
  active,
  ticks,
  elapsedSeconds,
  durationSeconds,
  remainingSeconds
}
```

Cost:

- Can build derived cache on first use.
- After cache exists, returns a shallow copy of ship-control summaries.
- Warm cost is proportional to ship-control count.

Use when:

- You only need raw ship-control summaries.

Prefer instead:

- `client.ships()` for the higher-level ship list that includes position,
  distance, entity wrapper, and attached loaded world data.
- `client.shipEntity()` for only the current loaded ship's overworld entity.

### `client.ships(options?)`

Returns all visible overworld ships in a higher-level shape. Every result has
ship-control data. If the corresponding ship world is loaded, the result also
includes a `world` snapshot.

```js
const ships = client.ships();
const nearby = client.ships({ includeWorld: false, sort: "distance" });
```

Return shape:

```js
[
  {
    entity,
    name,
    hexCode,
    color,
    colorCss,
    position: { x, y, rot },
    distance,
    footprint,
    label,
    kind,
    thrust: { x, y },
    shield,
    warp,
    worldId,
    hasWorldData,
    world,
    control,
    entitySummary
  }
]
```

Options:

```js
client.ships({
  includeWorld: true,
  includeTiles: false,
  includeModel: false,
  sort: "distance"
});
```

Option behavior:

- `includeWorld` defaults to `true`.
- `includeTiles` and `includeModel` apply to attached `world` snapshots.
- `sort: "distance"` sorts ships by distance from the current loaded ship
  entity when distance is known.

Cost:

- Reads overworld entities and filters to ship-control entities.
- With `includeWorld: true`, snapshots each loaded ship world referenced by
  `shipWorldId`.
- `includeWorld: false` is much cheaper when you only need visible ship list
  metadata.
- `sort: "distance"` adds `O(ship count log ship count)` sorting.

Use when:

- You want all nearby/visible ships.
- Some ships may have loaded world data and others may only have ship-control
  data.
- You want one shape that covers both cases.

Examples:

```js
for (const ship of client.ships({ sort: "distance" })) {
  console.log(ship.name, ship.hexCode, ship.hasWorldData);
  if (ship.world) console.log(ship.world.machines.loaders);
}
```

```js
const visibleShips = client.ships({ includeWorld: false });
const detailedLoadedShips = client.ships().filter((ship) => ship.hasWorldData);
```

Prefer instead:

- `client.shipControls()` if you only need ship-control records.
- `client.shipEntity()` for only the current ship.
- `client.ship()` for only the current ship world's detailed contents.

### `client.shipByHex(hexCode, options?)`

Returns one item from `client.ships(options)`, matched case-insensitively by
hex code, or `null`.

```js
const ship = client.shipByHex("56C318");
```

Return shape is one `ShipReadSummary`, the same as an item from
`client.ships()`.

Cost:

- Calls `client.ships(options)` and then searches the result.
- Same cost as `ships()` plus a linear find.

Use when:

- You occasionally need one ship by hex code.

Prefer instead for repeated lookups:

```js
const ships = client.ships({ includeWorld: false });
const byHex = new Map(ships.map((ship) => [ship.hexCode?.toUpperCase(), ship]));
const ship = byHex.get("56C318");
```

### `client.shipByEntity(entityId, options?)`

Returns one item from `client.ships(options)`, matched by overworld ship entity
id, or `null`.

```js
const ship = client.shipByEntity(8056857);
```

Return shape is one `ShipReadSummary`, the same as an item from
`client.ships()`.

Cost:

- Calls `client.ships(options)` and then searches the result.
- Same cost as `ships()` plus a linear find.

Use when:

- You have an overworld ship entity id from another read/event and want the
  higher-level ship shape.

Prefer instead:

- `client.entity(entityId, "overworld")` if you only need the entity summary.

### `client.blocks(scope?)`

Returns block occupancy summaries for the selected world.

```js
const blocks = client.blocks();
```

Return shape:

```js
[
  {
    x,
    y,
    entities
  }
]
```

`entities` contains the `EntitySummary` objects occupying that block cell.

Cost:

- Can build derived cache on first use.
- Block occupancy can be larger than entity count because multi-block machines
  occupy multiple cells.
- After cache exists, returns `blocks.slice()`.

Use when:

- You need to know what machine/entity occupies a given ship grid cell.
- You are building placement, collision, or map overlays.

Prefer instead:

- `client.entities()` when block-level occupancy is not needed.
- `client.entity(id)` for a known entity id.

### `client.materials(scope?)`

Returns tile material counts for the selected world.

```js
const materials = client.materials();
```

Return shape:

```js
[
  {
    material,
    name,
    count,
    solid,
    hp
  }
]
```

Cost:

- Scans the world's tile map every call.
- Cost is proportional to known tile count.
- This does not use the model derived cache.

Use when:

- You need material composition or tile summaries.

Prefer instead:

- `client.ship({ includeTiles: true })` when you need both tile list and
  material summary in one snapshot.
- Cache the result yourself if polling often and tile changes are not relevant.

### Lower-Level Compatibility And Debug Reads

Lower-level compatibility/debug methods remain available:

```js
client.snapshot({ includeTiles?, includeModel? });
client.world(id, { includeTiles?, includeModel? });
client.overworld({ includeTiles?, includeModel? });
client.shipWorld({ includeTiles?, includeModel? });
client.packetsRaw;
client.worlds;
```

`client.snapshot()` is the old name for `client.state()`.
`client.shipWorld()` is the old name for `client.ship()`.
`client.world(id)` / `client.overworld()` return full world snapshots and are
useful for diagnostics, but the scoped helpers are usually clearer.
`client.worlds` exposes the live `WorldStore`; prefer it only for replay tools,
decoder work, or debugging.
`client.packetsRaw` returns a shallow copy of raw decoded websocket packets and
can grow large.

### Cost Guidelines

For frequent polling:

```js
const machines = client.machines();
const players = client.players();
const entities = client.entities();
```

Avoid frequent full snapshots:

```js
client.state();
client.ship({ includeTiles: true });
client.ship({ includeModel: true });
client.ships({ includeWorld: true, includeModel: true });
```

Prefer cheap ship lists when detailed ship contents are not needed:

```js
const ships = client.ships({ includeWorld: false, sort: "distance" });
```

Avoid repeated helper calls inside loops when one call can be reused:

```js
const machines = client.machines();
for (const loader of machines.loaders) {
  // use loader
}
```

Instead of:

```js
for (const entity of client.entities()) {
  const loaders = client.machines().loaders;
}
```

Events:

```js
client.on("open", fn);
client.on("ready", fn);
client.on("packet", fn);
client.on("world", fn);
client.on("world-removed", fn);
client.on("tiles", fn);
client.on("model", fn);
client.on("inventory", fn);
client.on("pui", fn);
client.on("tip_warn", fn);
client.on("sfx", fn);
client.on("chat", fn);
client.on("motd", fn);
client.on("session", fn);
client.on("outfit", fn);
client.on("cpu", fn);
client.on("ack", fn);
client.on("decode-error", fn);
client.on("event", fn);
client.on("command", fn);
client.on("message", fn);
client.on("bootstrap", fn);
client.on("close", fn);
client.on("error", fn);
```

World snapshots include decoded tile counts, material summaries, the world
tileset definition, metadata, entity summaries, block occupancy summaries,
machine/player/control lists, and raw per-entity component records.
`includeTiles` includes tile arrays;
`includeModel` includes decoded model table records.
Tile entries include material names, known shape names, solid/open flags, and
HP fractions when the official tileset defines them. `client.shipEntity()`
resolves the loaded ship world's `parent_world`/`parent_ent` link back to the
corresponding overworld ship entity. Overworld ship-control summaries include
ship `name`, `hexCode`,
linked `shipWorldId`, RGB `color`, shield max/current base HP, active/inactive
tank HP, and `warp` timer state when table `20` carries those fields.
Helm entity summaries include `occupied` when the model stream identifies the
specific helm currently being used.
Comms station summaries include current `charges`, `maxCharges`, `chargeRatio`,
and `occupied` when a player is using the station.
Comms bubble packets are stored on each world as recent `commsBubbles`, with
source entity, message text, color, and display duration.
Player summaries include display `name`, held item, ship `teamRank`, account
`gameRank`, patron tier when present, `piloting` while the player is occupying a
helm, the muted flag when the server sends it, and repair-tool aim as
`repairTargetAngle` plus `repairTargetDistance` when that state is present.
When a player is placing or breaking blocks/entities, `actionPreview` contains
the replicated preview center, outline size, progress, color, and best-effort
`actionName` (`place` for green, `break` for red).
The model decoder is best-effort and currently covers the component
tables documented in
`spec/game-state-transmission-spec.md`, including transforms, item holders,
entity/package item ids, fabricators, players, ship controls, fluid tanks,
shield charge/generator efficiency and boost state, shield projector state,
door rank/open state, cannon ammo/aim/barrel recoil/spin/cooling state, expando box contents, dynamic size, and hover-outline size, sign text/display modes, spawn-point rank, normalized pusher
configuration, and normalized loader configuration (`pick`, `place`,
`priority`, `requireOutput`, `stack`, `cycle`, `waitForStack`, filter mode,
filter slots, and enum display names).
Packets that cannot be fully decoded are recorded in `client.decodeErrors` and
emit `decode-error`; they do not close the websocket.

## Server And Ship Arguments

Server arguments accept either:

```js
0
{ index: 0, domain: "c0.drednot.io", description: "..." }
```

Ship arguments accept either:

```js
123
{ id: 123, name: "Existing ship" }
{ type: "new", name: "myship", color: "#de9797" }
```

Normalized ships returned by fetch helpers include:

```js
{
  id,
  hexCode,
  name,
  iconUrl,
  playerCount,
  owned,
  saved,
  color,
  time
}
```

`ShipList` contains:

```js
{
  playerCount,
  maxPlayerCount,
  isMuted,
  ships
}
```
