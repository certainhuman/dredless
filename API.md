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

Primary domains:

```js
client.player       // movement, aim, held item use, placement, input settings
client.inventory    // current inventory state plus drag/equip/unequip actions
client.management   // ship privacy, invite reset, player list, starter recovery
client.net          // low-level websocket/send primitives
client.debug        // raw packets, model tables, decode errors, PUI panels

client.currentShip() // loaded ship-world live handle
client.overworld()   // overworld live handle
client.world(id)     // explicit world live handle
```

Domain-object examples:

```js
client.player.move({ x: 1, y: 0 });
client.player.aim({ x: 300, y: 200 });
client.inventory.equip(0, "feet");

const ship = client.currentShip();
const loader = ship?.machines.loaders()[0];
loader?.configure({ cycle: 5, stack: 12 });
loader?.setFilterItems([255, 0, 0]);

const pusher = ship?.machines.pushers()[0];
pusher?.configure({ angle: 180, mode: "push", filteredMode: "pull" });
console.log(pusher?.beam?.length, pusher?.beam?.modeName);

const launcher = ship?.machines.launchers()[0];
launcher?.open();
launcher?.setAngle(90);
launcher?.setPower(15);

const overworld = client.overworld();
const nearbyShips = overworld?.ships({ sort: "distance" });
```

Live handles are intentionally lightweight. A generic `EntityHandle` stores the
client, world scope, and entity id. Use `snapshot()` when you want a frozen
`EntitySnapshot`; use `contents`, `has(feature)`, `feature(name)`, and `is(type)`
for quick inspection. Typed machine handles expose their decoded component as
`state` and keep behavior/configuration methods on the domain object.

```js
const entity = ship?.entities.get(119);
const snapshot = entity?.snapshot();

snapshot?.is("placed_entity");
snapshot?.is("loader");
snapshot?.has("filterSlots");
snapshot?.feature("inventory");

const loader = entity?.as("loader");
loader?.state;
loader?.setCycle(8);
```

Low-level sends remain available under `client.net`:

```js
client.net.send(command);
client.net.sendMessage(message, { afterReady: true });
client.net.sendRaw(message);
client.net.sendEntityCommand(cmd, args);
client.net.sendUiConfig(data);
```

Debug/raw access is explicit:

```js
client.debug.packets();
client.debug.decodeErrors();
client.debug.modelTable(worldId, tableId);
client.debug.modelRecord(worldId, tableId, entityId);
```
`client.net.send()` builds a signed `type: 0` input command and waits for the server `sid`
before sending. `client.net.sendMessage()` sends ordinary MsgPack websocket messages such
as `type: 5` entity/PUI commands, `type: 7` outfits, and `type: 8` UI/config
payloads.

`sendEntityCommand(cmd, args)` sends the observed top-level `type: 5` command
message shape. Fabricator helpers are named wrappers around this generic entity
command channel:

```js
fabricator.add(248, 8);      // queue 8 Munitions Fabricators
fabricator.sub(248, 1, 0);   // remove 1 from queue index 0
fabricator.clearQueue();
fabricator.toggleRepeat();
fabricator.lockResource(1);
fabricator.unlockResource(1);
fabricator.eject(0);
```

`sendFabricatorCommand()` is the legacy `craft_add` wrapper. Use
`sendFabricatorMessage(cmd, args)` for raw confirmed fabricator commands.

Comms station messages use their own top-level message shape:

```js
comms.open();
comms.sendMessage("my message");
client.player.action({ exit: true });
```

Opening a comms station is a normal signed entity-use input command. The server
responds with a side event `{ type:"comms", ent_id, msgs_text }`, not a `pui`
event. Sending a message emits `{ type:3, msg }`; the server then sends a type
`13` comms bubble packet and a `comms` side-event update. Closing uses the
normal signed `exit=true` input command and a `{ type:"comms", ent_id:null }`
side event. Dredless stores normalized open comms panels in
`client.debug.commsPanels()`, the active panel in the latest current comms panel, and emits
`client.on("comms", fn)` with flattened message text. When the comms history has
multiple rows, each `msgs_text` row becomes one `messages[]` entry.

Ship-management helpers send observed top-level `type: 4` messages. These are
not signed input commands and do not use the entity/PUI command channel:

```js
client.management.setPrivacy("public");
client.management.setPrivacy("private");
client.management.recoverStarterItem(216); // Helm (Starter, Packaged)
client.management.requestPlayerList();
client.management.resetInvite();
client.management.promotePlayerToCaptain(10);
client.management.demotePlayerToCrew(10);
client.management.demotePlayerToGuest(10);
client.management.kickPlayer(10);
client.management.banPlayer(10);
client.management.demoteSelf();
client.net.sendMessage({ type: 4, act: "set_privacy", arg: 1 });
```

Privacy values accept `0`/`"public"`/`false` and `1`/`"private"`/`true`.
Player rank helpers use observed official rank codes: `0`/`"guest"`, `1`/`"crew"`,
and `3`/`"captain"`. They send `{ type:4, act:"set_rank", arg:refId, rank }`.
Kicking and banning send `{ type:4, act:"kick", arg:refId }` and
`{ type:4, act:"ban", arg:refId }`; self-demotion sends
`{ type:4, act:"demote_self", arg:null }`. The server responds with world text,
ship log entries, and usually a refreshed `player_list` session submessage.
Starter recovery responses arrive as session packets:
`{ type:"starter_recovery_response", fail_reason }`. Privacy changes produce a
session `config` packet containing the new `config.privacy` and `invite_key`.
`client.management.config()` stores the latest normalized config as
`{ privacy, privacyName, inviteKey, teamId, patronPerks }`.
Regenerating the ship invite sends `{ type:4, act:"invite_reset", arg:null }`
as observed in `reset-invite.jsonl`; the server responds with the same `config`
session submessage shape and a new `invite_key`, so `client.management.config()?.inviteKey`
updates through the existing `"ship-config"` event.

Opening or refreshing the official ship-management player-list page sends
`{ type:4, act:"player_list", arg:null }`; it does not fetch the invite key.
Dredless exposes that as
`client.management.requestPlayerList()`. The server responds with a type `25` session packet whose
submessage is `type:"player_list"`. Dredless normalizes and stores it in
`client.management.playerList()` and emits `client.on("player-list", fn)`. Later
`player_list` responses can be sparse deltas: included rows are merged by
`refId`, `_removed:true` rows remove existing players, and omitted players are
retained. The normalized event exposes the merged visible `players` plus the raw
normalized packet `changes` and `removedPlayers`. Player rows include
`captainRank` when the player is a captain. Lower numeric captain ranks have higher authority:
`captainRank:1` is the original creator rank, captains promoted by them are
rank `2`, and so on. The normalized player list derives
`ownerCaptainRank` as the lowest current captain rank and marks every current
captain at that rank with `isShipOwner:true`; those are the ship owners whose
presence is required before the lockdown-release countdown can begin.

The official privacy/invite-code page did not send a websocket command in
`change-management-menu-to-page-with-ship-privacy-and-invite-code.jsonl`; it
appears to render from the latest `config` session submessage. Guest and crew
joins do not receive `config.invite_key`; when a guest/crew is promoted to
captain, the server sends `type:"config"` with `invite_key` before the
`captain_subrank` update. Captain subrank
session packets are normalized into `client.management.captainSubrank()` and emitted as
`"captain-subrank"`. `captainSubrank.subrank` uses the same lower-is-stronger
rank scale as player-list `captainRank`.

Item Launcher helpers also use the type `5` entity/PUI command channel. Open
the launcher with a normal entity use first; the server replies with a PUI panel
like `{ type:"launcher", power:30, angle:270 }`.

```js
launcher.open();
launcher.setAngle(90);
launcher.setPower(15);
```

`angle` is degrees and is rounded/wrapped into `0..359`. `power` is the
launcher UI value `0..30`. These commands target the currently open launcher
panel; no entity id is present in the outgoing type `5` message.

Sign helpers also use the type `5` entity/PUI command channel. Open an existing
sign with normal entity use, or place a held Sign item to create and
auto-open the sign editor. Saving changed text sends `cmd:"sign_text"` with
`args:[text, mode]`; closing without changes only sends the normal signed
`exit` input command.

```js
sign.open();
sign.setText("Dock here", "when-near");
sign.setText("Cargo", "always");
sign.setText("Inspect me", "on-hover");
```

Sign display modes are `0`/`"always"`, `1`/`"when-near"`, and
`2`/`"on-hover"`. The command targets the currently open sign panel; no entity
id is present in the outgoing type `5` message.

Pusher helpers use compact `type: 8` UI/config payloads and include the target
entity id. `sendPusherConfig(entity, config)` sends the full pusher config;
omitted fields default to the currently decoded pusher state, then to the
official defaults: default mode `do-nothing`, filtered mode `push`, angle `0`,
speed `20`, length `1000`, and filter-by-inventory off.

```js
pusher.configure({
  mode: "pull",
  filteredMode: "do-nothing",
  angle: 90,
  speed: 13,
  length: 300,
  filterInventory: true
});

pusher.setAngle(180);
pusher.setFilterItems([100, 0, 0]); // Wrench in slot 0
```

Pusher modes are `0`/`"push"`, `1`/`"pull"`, and
`2`/`"do-nothing"`. `setPusherFilterItems()` accepts three item ids; `0`,
`null`, or omitted slots mean empty.

Loader helpers use compact `type: 8` UI/config payloads and include the target
entity id. `sendLoaderConfig(entity, config)` sends the full loader config;
omitted fields default to the currently decoded loader state, then to official
defaults: pick `top-left`, place `top-right`, priority `normal`, stack `16`,
cycle `1`, require-output off, and wait-for-stack off.

```js
loader.configure({
  pick: "top-left",
  place: "top-right",
  priority: "high",
  stack: 16,
  cycle: 4,
  requireOutput: true,
  waitForStack: false
});

loader.setCycle(4);
loader.setFilterMode("allow-filter");
loader.setFilterItems([255, 0, 0]); // Fluid Tank in slot 0

loader.configureFull({
  pick: "bottom-right",
  place: "bottom-middle",
  priority: "low",
  stack: 11,
  cycle: 8,
  requireOutput: false,
  waitForStack: false,
  filterMode: "allow-filter",
  filterSlots: [255, 0, 0]
});

loader.copy();
client.net.sendUiConfig(buildLoaderClipboardConfigData({
  pick: "bottom-left",
  place: "top-right",
  priority: "normal",
  stack: 14,
  cycle: 11,
  requireOutput: false,
  waitForStack: false
}));
```

Loader priority uses Dredless normalized values (`-1=low`, `0=normal`,
`1=high`) or names. Loader cycle is in seconds; the outbound protocol encodes it
as 20 Hz ticks. Loader filter modes are `0=allow-all`, `1=block-filter`,
`2=allow-filter`, and `3=block-all`.
`sendLoaderFullConfig()` matches the official client's config paste behavior:
it sends `config_loader`, `filter_config`, and `filter_items` in one `type: 8`
payload. Omitted fields default to the decoded loader state, then to the same
official defaults as the single-section helpers.
`copyLoaderConfig()` matches the official client's copy behavior: it sends the
same full loader config sections with the copy action byte, but the wire target
is the server-side loader clipboard rather than the source loader entity. It is
useful when a consumer wants to drive the official server-side config clipboard
flow; pass a config object to copy supplied values over the decoded source state.
`sendLoaderClipboardConfig()` sends the single `config_loader` clipboard-edit
packet observed when editing pick/place and other base loader settings in the
clipboard UI.

Cargo Hatch config uses the same `filter_config` and `filter_items` sections as
loader filtering, but has no base `config_loader` section:

```js
hatch.setFilterMode("allow-filter");
hatch.setFilterItems([0, 0, 152]); // Flak Ammo in slot 2
hatch.paste({
  filterMode: "allow-filter",
  filterSlots: [0, 0, 152]
});
hatch.copy();
```

`pasteCargoHatchConfig()` sends both filter sections with paste action `2`.
`copyCargoHatchConfig()` writes the server-side cargo-hatch clipboard target
(`0`) with copy action `1`.

Cargo Ejector config uses the fixed-direction `angle_fixed` section:

```js
ejector.setDirection("left");
ejector.paste("right");
ejector.copy("right");
client.net.sendUiConfig(buildCargoEjectorClipboardDirectionData("left"));
```

`copyCargoEjectorConfig()` writes the server-side cargo-ejector clipboard target
(`7`) with copy action `1`. Direction values are the same fixed-angle values as
generator direction: `0=right`, `1=up`, `2=left`, `3=down`.

Other copied-config clipboard edits use the same shared action `1` header:
`90 01 TARGET`. Observed targets are `0=cargo-hatch`, `1=loader`,
`3=expando`, `4=generator/shield-generator`, `6=navigation-unit`, and
`7=cargo-ejector`.

```js
client.setGeneratorClipboardDirection("right");
client.setGeneratorClipboardDirection("up");
client.setGeneratorClipboardDirection("left");
client.setGeneratorClipboardDirection("down");
client.setExpandoClipboardAngle(115);
client.net.sendUiConfig(buildClipboardConfigData("expando", "angle", [115]));
```

Generator clipboard direction uses command `angle_fixed` with values
`0=right`, `1=up`, `2=left`, `3=down`. Expando clipboard angle uses command
`angle` and compact degree encoding.

Shield generator puzzle submissions use a compact `type: 8` UI/config payload:

```js
generator.open();
generator.solvePuzzle(generator.puzzleSolution);
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
controls; it changes repeated fields on normal input commands:

```js
client.player.setWrenchMode("grab-all-items");
client.player.setTurretMode("volley-fire");
client.player.setScreenSize(2840, 1634);
client.player.setView(1282.395, 737.829);
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

View/zoom settings:

```js
client.player.setView(width, height);          // sends vx/vy in ship-tile units
client.player.setScreenSize(width, height);    // sends scr_w/scr_h in pixels
client.player.setInputSettings({
  viewWidth: 17.75,
  viewHeight: 10.2125,
  screenWidth: 2840,
  screenHeight: 1634
});
```

`starting-zoomed-in-and-zooming-out.jsonl` confirms zooming out only changes
the repeated signed command view fields: `vx/vy` grow from `17.75/10.2125` to
`1282.395/737.829`, while `scr_w/scr_h` remain `2840/1634`. No separate zoom
message is sent. `shrinking-window.jsonl`, `moving-window-to-1080p-monitor.jsonl`,
and `making-browser-window-fill-screen-on-1080p-monitor.jsonl` confirm browser
resizes are also ordinary input commands: `scr_w/scr_h` update to the new pixel
size, and `vx/vy` then settle to the same zoom scale for the new aspect/size.

By default `setWrenchMode()`, `setWrenchAction()`, `setTurretMode()`,
`setView()`, `setScreenSize()`, and `setInputSettings()` also send one
immediate input command carrying the updated defaults. Pass `{ send:false }` to
only update future commands.

Generic entity use sends a normal left-click type `0` command with the entity
in `focus_ent`:

```js
ejector.use({ invSlot: 0 });
```

`place-16-standard-ammo-in-ejector.jsonl` confirms this is how the official
client places the active hotbar item into a Cargo Ejector: `focus_ent` is the
ejector entity, `inv_slot=0`, `act1=true`, and `act1_held=true`; the server
then sends an inventory update clearing that slot.

Using or placing the currently held hotbar item sends the same left-click flags
without a focused entity:

```js
client.player.placeHeldItem({ invSlot: 0 }, { mx: 19.79, my: 4.79 });
```

`place-generator.jsonl` confirms placing a Shield Generator from hotbar slot `0`
uses `focus_ent=null`, `inv_slot=0`, `act1=true`, and `act1_held=true`; the
server log confirms placement and the inventory update clears slot `0`.

Rotating the held placement preview, such as rotating a Door (Packaged) before
placing it, sends the alternate action flags:

```js
client.rotateHeldItem({ invSlot: 2 }, { mx: 28.77, my: 5.82 });
client.player.placeHeldItem({ invSlot: 2 }, { mx: 28.26, my: 5.26 });
```

`rotate-door-placement-to-horizontal.jsonl` confirms rotation is `type:0` with
`focus_ent=null`, `inv_slot=2`, `act_alt=true`, and `act_alt_held=true`.
`place-vertical-door.jsonl` and `place-horizontal-door.jsonl` confirm final door
placement uses the same held-item placement command as other package items.

Blueprint placement sends one ordinary MsgPack message before the signed
held-item click:

```js
client.net.sendBlueprintPlacement({
  x: 28,
  y: 18,
  width: 3,
  height: 3,
  source: "DSA:m8DAzDxhAgMDU8NL9olAmhFKM4DoiRMB"
});
client.player.placeHeldItem({ invSlot: 2 }, { mx: 28.71, my: 18.36 });
```

Use `placeBlueprint()` to send both packets in the same order:

```js
client.player.placeBlueprint(
  {
    x: 29,
    y: 17,
    width: 3,
    height: 2,
    source: "DSA:m8DAzDRhAgMDY8ML5olAmgFET5wIAA=="
  },
  { invSlot: 2, mx: 29.36, my: 17.61 }
);
```

The official client uses top-level message `type:9` with `{ x, y, w, h,
source }`, then sends the normal signed left-click command with `focus_ent=null`
and the active hotbar slot in `inv_slot`.

Ship scanner items are activated with the same normal signed held-item click:

```js
client.player.useHeldItem({ invSlot: 1 }, { mx: 30.5, my: 5.5 });
```

Observed scanner item ids are Manifest Scanner `115`, BoM Scanner `116`, and
Blueprint Scanner `120`. Manifest and BoM scanner clicks send no special
outgoing command beyond the `type:0` click; the server replies with packet
`type:15` carrying a `manifest` payload. Dredless normalizes those responses in
`client.scannerResults`, stores the latest as `client.lastScannerResult`, and
emits `client.on("scanner-result", (result, packet) => {})`.

Result shape:

```js
{
  kind: "manifest" | "bom" | "unknown",
  sid,
  shipHex,
  shipName,
  blocks,      // Manifest Scanner item-id/count map, or null
  objects,     // Manifest Scanner item-id/count map, or null
  inventories, // Manifest Scanner item-id/count map, or null
  materials    // BoM Scanner item-id/count map, or null
}
```

In `blueprint-scan-3x3-iron-block.jsonl`, Blueprint Scanner use did not produce
a scanner-specific websocket response; it only sent normal signed input frames.
That suggests the official client can produce the blueprint scan output locally
from already-loaded ship state, at least for this sample.

Inventory movement uses the signed type `0` `drag` field. `drag()` is the
low-level wrapper; `moveInventoryItem()` is the same operation with an options
object. Equipment slots are absolute inventory slots in the official protocol:
`19`/`"back"`, `20`/`"hands"`, and `21`/`"feet"`.

```js
client.inventory.move(0, 4);
client.inventory.move(1, 2, { split: true });
client.inventory.equip(0, "back");
client.inventory.equip(0, "hands");
client.inventory.equip(0, "feet");
client.unequipItem("hands", 0);
```

Official-client equipment captures confirm double-click equip emits the same
drag command as manual drag. Backpack and Hover Pack equip to slot `19`,
Construction Gauntlets equip to slot `20`, Speed Skates equip to slot `21`, and
unequipping gauntlets sends `drag={ source:20, target:0, split:false }`.

Navigation-unit helpers send the observed top-level `type: 8` UI/config
payload for `config_nav_unit`:

```js
const nav = client.currentShip()?.machines.state().navigationUnits[0];

nav.setDestination(40); // Raven
nav.setAutoWarp({
  destination: 40,
  page: 1,
  autoWarpOnShieldFailure: true,
  autoWarpOnNoCaptains: false
});
client.copyNavigationUnitConfig(nav.entity);
client.pasteNavigationUnitConfig(nav.entity);
client.startWarp(nav.entity);
client.cancelWarp(nav.entity);
```

When the nav unit is already present in decoded state, omitted destination and
auto-warp flags default from `entity.contents.navigationUnit`. Pass them
explicitly when sending before the entity has been observed. `destination` is
the normalized nav base id: `10` Hummingbird, `20` Finch, `30` Sparrow, `40`
Raven, `50` Falcon, `60` Combat Arena.

`copyNavigationUnitConfig()` writes the server-side nav clipboard target (`6`)
using UI/config action `1`. `pasteNavigationUnitConfig()` applies copied nav
config to the target nav unit with UI/config action `2`.

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
client.world(scope)?.entities.raw();
client.entity(entityId, scope);
client.world(scope)?.machines.state();
client.world(scope)?.players.all();
client.shipControls(scope);
client.world(scope)?.blocks.all();
client.world(scope)?.materials.all();
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
  scannerResults,
  lastScannerResult,
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

- `client.currentShip()?.snapshot()` for only the current ship world.
- `client.currentShip()?.entities.raw()`, `client.currentShip()?.machines.state()`, or `client.currentShip()?.players.all()` for
  high-frequency reads.

### `client.currentShip()`

Returns the current ship-world snapshot, or `null` if no ship world is loaded.

```js
const ship = client.currentShip()?.snapshot();
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
  tiered,      // true when layer ids are valid for this base zone
  displayName  // tiered name plus layer, for example "Sparrow II"; otherwise name
}
```

Known base ids are `0` Freeport, `10` Hummingbird, `20` Finch,
`30` Sparrow, `40` Raven, `50` Falcon, `60` Combat Arena, and `66` Mosaic.
Currently only Finch and Sparrow are tiered, so ids such as `21` and `31`
resolve as Finch II and Sparrow II. Non-tiered zones require exact ids; for
example `66` resolves to Mosaic, not Combat Arena VII.

`tiles` is present only with `includeTiles: true`.

Options:

```js
client.currentShip()?.snapshot({
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

- `client.currentShip()?.machines.state()` if you only need machines.
- `client.currentShip()?.entities.raw()` if you only need entity summaries.
- `client.materials()` if you only need material counts.

### `client.currentShip()?.entity()?.snapshot()`

Returns the overworld entity that represents the currently loaded ship, or
`null` when the link is not known.

```js
const currentShip = client.currentShip()?.entity()?.snapshot();
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

- `client.overworld()?.ships().find((ship) => ship.entity === client.currentShip()?.entity()?.snapshot()?.entity)`
  when you also want the normalized `ShipReadSummary` shape.

### World entity collections

Entity collections have two read styles:

```js
const handles = client.currentShip()?.entities.all();        // live EntityHandle[]
const snapshots = client.currentShip()?.entities.snapshots(); // frozen EntitySnapshot[]
const states = client.currentShip()?.entities.states();       // alias for snapshots()
```

`entities.raw()` remains the cheap existing read and returns the current normalized
entity objects without cloning/freezing. Use `snapshots()` when you need immutable
point-in-time objects.

A handle is the interaction-oriented object:

```js
const entity = client.currentShip()?.entities.get(119);

entity.id;
entity.exists();
entity.use();
entity.is("machine");
entity.has("inventory");
entity.feature("filterMode");
entity.feature("outline");
entity.feature("beam");
entity.as("pusher")?.setMode("pull");
```

Entity ids are scoped to a world. Ship-world entities and overworld entities are
separate pools, so always get handles through the intended world/domain:

```js
client.currentShip()?.entities.get(id); // ship-world entity
client.overworld()?.entities.get(id);   // overworld entity
```

Generic features currently include direct component names plus common aliases:

```js
health
machine
inventory
item
filter
filterMode
filterSlots
filterInventory
outline       // hoverOutline
beam          // pusherBeam
occupied      // helm/commsStation occupancy
```

Typed conversion helpers return `null` when the scoped entity is not that type:

```js
entity.as("loader");
entity.as("pusher");
entity.as("launcher");
entity.as("navigationUnit");
entity.as("fabricator");
entity.as("commsStation");
entity.as("sign");
entity.as("shieldGenerator");
entity.as("cargoHatch");
entity.as("cannon");
entity.as("thruster");
entity.as("helm");
entity.as("door");
entity.as("spawnPoint");
entity.as("shieldProjector");
entity.as("fluidTank");
entity.as("processor");
entity.as("expandoBox");
```

A snapshot is the frozen decoded read model for one point in time:

```js
{
  id,
  entity, // deprecated alias for id
  category,
  typeId,
  typeName,
  markerTypeId,
  markerTypeName,
  label,
  kind,
  transform,
  position, // alias for transform
  rotation,
  type: {
    category,
    machine,    // e.g. "loader", "pusher", or null
    item,       // item name when known
    components  // keys present in contents
  },
  footprint,
  contents,
  occupies,
  tables,
  is(type),
  has(feature),
  feature(name)
}
```
Common `contents` fields:

```js
entity.contents.health
entity.contents.bot
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

`entity.contents.bot` is present for overworld health-bearing bot entities and
contains normalized classification data:

```js
{
  entity,
  className,  // e.g. "zombie-boss", "red-sentry", "table2-bot"
  identifier, // stable debug identifier such as "t18:..."; useful in captures
  typeA,
  typeB
}
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
- `client.currentShip()?.machines.state()` for known machine categories.
- `client.currentShip()?.players.all()` for player-only reads.

### `client.entity(entityId, scope?)`

Returns one frozen `EntitySnapshot`, or `null`.

```js
const entity = client.entity(14);
const overworldEntity = client.entity(2495754, "overworld");
```

Return shape is one `EntitySnapshot`, the same immutable read model returned by
`client.currentShip()?.entities.get(id).snapshot()`.

Cost:

- Can build derived cache on first use.
- After cache exists, map lookup is effectively constant time.

Use when:

- You already have an entity id from a command, PUI panel, event, or previous
  entity list.

Prefer instead:

- `client.currentShip()?.entities.raw()` when you need to search or filter by arbitrary fields.

### Machine collections

Returns normalized machine state grouped by machine kind.

```js
const machines = client.currentShip()?.machines.state();
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
  pusherBeams,
  launchers,
  loaders,
  cargoHatches,
  navigationUnits,
  commsStations,
  fluidTanks,
  shieldGenerators,
  shieldProjectors,
  helms,
  signs,
  spawnPoints,
  doors,
  expandoBoxes
}
```

Cargo hatch shape:

```js
{
  entity,
  typeId,
  typeName,
  filterMode,      // 0 allow-all, 1 block-filter, 2 allow-filter, 3 block-all
  filterModeName,
  filterSlots,     // [slot0, slot1, slot2], null means not observed
  filterState,
  filterSlotsState
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

Pusher beam runtime shape:

```js
{
  entity,
  active,
  mode,
  modeName,
  lengthRaw,
  length,
  state
}
```

`pusherBeam` is decoded from the accumulated runtime beam table. `lengthRaw` is
the wire value, and `length` is the current beam reach in blocks (`lengthRaw /
10`). `mode` uses the same pusher mode enum as pusher config: `0 = Push`,
`1 = Pull`, and `2 = Do Nothing`. `active` is false only when mode is
`Do Nothing`.

Launcher shape:

```js
{
  entity,
  angleRaw,
  angleRadians,
  angleDegrees,
  state
}
```

`angleRaw` is the table value before scaling, using radians scaled by `200`.
`angleRadians` is the direct decoded transport value, and `angleDegrees` is the
same value converted to normalized degrees. If the raw angle field is omitted,
the launcher defaults to `0deg`. The decoded degree value may be slightly
fractional because the persisted value is quantized. Launcher power is not
exposed by persisted model state; it is only present in the live launcher PUI
after opening the launcher. Consumers that need to edit power should open the launcher first, then use
`launcher.setPower(power)`.

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
- `client.currentShip()?.snapshot()` if you also need entities, players, blocks, and materials.

### Player collections

Returns normalized player summaries.

```js
const players = client.currentShip()?.players.all();
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

- `client.currentShip()?.entities.raw().filter((entity) => entity.contents?.player)` when you
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

- `client.overworld()?.ships()` for the higher-level ship list that includes position,
  distance, entity wrapper, and attached loaded world data.
- `client.currentShip()?.entity()?.snapshot()` for only the current loaded ship's overworld entity.

### `client.overworld()?.ships(options?)`

Returns all visible overworld ships in a higher-level shape. Every result has
ship-control data. If the corresponding ship world is loaded, the result also
includes a `world` snapshot.

```js
const ships = client.overworld()?.ships();
const nearby = client.overworld()?.ships({ includeWorld: false, sort: "distance" });
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
client.overworld()?.ships({
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
for (const ship of client.overworld()?.ships({ sort: "distance" })) {
  console.log(ship.name, ship.hexCode, ship.hasWorldData);
  if (ship.world) console.log(ship.world.machines.loaders);
}
```

```js
const visibleShips = client.overworld()?.ships({ includeWorld: false });
const detailedLoadedShips = client.overworld()?.ships().filter((ship) => ship.hasWorldData);
```

Prefer instead:

- `client.shipControls()` if you only need ship-control records.
- `client.currentShip()?.entity()?.snapshot()` for only the current ship.
- `client.currentShip()?.snapshot()` for only the current ship world's detailed contents.

### `client.shipByHex(hexCode, options?)`

Returns one item from `client.overworld()?.ships(options)`, matched case-insensitively by
hex code, or `null`.

```js
const ship = client.shipByHex("56C318");
```

Return shape is one `ShipReadSummary`, the same as an item from
`client.overworld()?.ships()`.

Cost:

- Calls `client.overworld()?.ships(options)` and then searches the result.
- Same cost as `ships()` plus a linear find.

Use when:

- You occasionally need one ship by hex code.

Prefer instead for repeated lookups:

```js
const ships = client.overworld()?.ships({ includeWorld: false });
const byHex = new Map(ships.map((ship) => [ship.hexCode?.toUpperCase(), ship]));
const ship = byHex.get("56C318");
```

### `client.shipByEntity(entityId, options?)`

Returns one item from `client.overworld()?.ships(options)`, matched by overworld ship entity
id, or `null`.

```js
const ship = client.shipByEntity(8056857);
```

Return shape is one `ShipReadSummary`, the same as an item from
`client.overworld()?.ships()`.

Cost:

- Calls `client.overworld()?.ships(options)` and then searches the result.
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

- `client.currentShip()?.entities.raw()` when block-level occupancy is not needed.
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

- `client.currentShip()?.snapshot({ includeTiles: true })` when you need both tile list and
  material summary in one snapshot.
- Cache the result yourself if polling often and tile changes are not relevant.

### Lower-Level Compatibility And Debug Reads

Lower-level compatibility/debug methods remain available:

```js
client.snapshot({ includeTiles?, includeModel? });
client.world(id)?.snapshot({ includeTiles?, includeModel? });
client.overworld()?.snapshot({ includeTiles?, includeModel? });
client.shipWorld({ includeTiles?, includeModel? });
client.debug.packets();
client.worlds;
```

`client.snapshot()` is the old name for `client.state()`.
`client.shipWorld()` is the old name for `client.currentShip()?.snapshot()`.
`client.world(id)` / `client.overworld()` return full world snapshots and are
useful for diagnostics, but the scoped helpers are usually clearer.
`client.worlds` exposes the live `WorldStore`; prefer it only for replay tools,
decoder work, or debugging.
`client.debug.packets()` returns a shallow copy of raw decoded websocket packets and
can grow large.

### Cost Guidelines

For frequent polling:

```js
const machines = client.currentShip()?.machines.state();
const players = client.currentShip()?.players.all();
const entities = client.currentShip()?.entities.raw();
```

Avoid frequent full snapshots:

```js
client.state();
client.currentShip()?.snapshot({ includeTiles: true });
client.currentShip()?.snapshot({ includeModel: true });
client.overworld()?.ships({ includeWorld: true, includeModel: true });
```

Prefer cheap ship lists when detailed ship contents are not needed:

```js
const ships = client.overworld()?.ships({ includeWorld: false, sort: "distance" });
```

Avoid repeated helper calls inside loops when one call can be reused:

```js
const machines = client.currentShip()?.machines.state();
for (const loader of machines.loaders) {
  // use loader
}
```

Instead of:

```js
for (const entity of client.currentShip()?.entities.raw()) {
  const loaders = client.currentShip()?.machines.state().loaders;
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
client.on("comms", fn);
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
Loaded ship-world snapshots also include `shipMetadata` when the ship metadata
records have arrived. In `lockdown-counting-down-to-25.jsonl`, the official
client's lockdown status line near the server/zone readout is backed by this
model metadata: `lockdownCountdownSeconds` starts at `30` and counts down once
per second to `25` over the captured interval. `shipMetadata` also includes the
ship name, RGB color, ship dimensions, `onlineShipOwnerCount`, and
`requiredShipOwnerCount`. Captures where an owner is offline keep the timer at
`30` with only the required owner count present; captures with one of two owners
online show `onlineShipOwnerCount:1` and `requiredShipOwnerCount:2`.
Tile entries include material names, known shape names, solid/open flags, and
HP fractions when the official tileset defines them. `client.currentShip()?.entity()?.snapshot()`
resolves the loaded ship world's `parent_world`/`parent_ent` link back to the
corresponding overworld ship entity. Overworld ship-control summaries include
ship `name`, `hexCode`,
linked `shipWorldId`, RGB `color`, shield max/current base HP, active/inactive
tank HP, and `warp` timer state when table `20` carries those fields.
Helm entity summaries include `occupied` when the model stream identifies the
specific helm currently being used.
Comms station summaries include current `charges`, `maxCharges`, `chargeRatio`,
and `occupied` when a player is using the station.
Open comms UI state is exposed separately as the latest current comms panel and
`client.debug.commsPanels()`; message rows include both `raw` rich text and flattened
plain `text`.
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
Packets that cannot be fully decoded are recorded in `client.debug.decodeErrors()` and
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





