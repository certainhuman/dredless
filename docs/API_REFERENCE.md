# Dredless API Reference

This document describes the public JavaScript API exposed by the package.
Here, "endpoint" means a public method, constructor, domain method, or exported
helper function. The actual browser/game wire protocol remains an implementation
detail unless a helper explicitly builds or decodes protocol payloads.

Use the runtime-specific top-level API references for session, token, and start/join helpers:

- [NODE_API.md](./NODE_API.md): explicit multi-session `Session` / `AnonSession` API for Node.
- [BROWSER_API.md](./BROWSER_API.md): ambient browser-session API for browser contexts.

This shared reference covers common input/output shapes, `DredlessClient`, world/entity/domain APIs, protocol helpers, and other runtime-neutral APIs.

Subpath imports are available for focused low-level helpers:

```js
import { DredlessClient } from "dredless/client";
import { WorldStore, WorldState } from "dredless/world";
import { generateGeneratorMaze } from "dredless/game/generator-maze";
import { encodeMsgpack, decodeMsgpack, decodeIncomingFrame } from "dredless/protocol";
```

## Public Package Exports

`package.json` currently exposes these module specifiers:

```txt
dredless
dredless/browser
dredless/node
dredless/client
dredless/network
dredless/state
dredless/session
dredless/servers
dredless/ships
dredless/connection
dredless/world
dredless/model
dredless/game/generator-maze
dredless/game/model
dredless/protocol
dredless/protocol/blueprint
dredless/protocol/comms
dredless/protocol/commands
dredless/protocol/inventory
dredless/protocol/ship-management
dredless/protocol/sign
dredless/protocol/ui-config
dredless/crypto/chacha
dredless/compression/lz4
```

The root module defaults to the Node API for types and direct Node imports. Browser bundlers may use the root `browser` condition for JavaScript, but `dredless/browser` is the reliable import for browser IntelliSense.

Both runtime entrypoints re-export world/model classes, protocol builders, config builders, codec helpers, and common type shapes.

## Common Input Types

### `Server`

Returned by `fetchServers()`. Player counts and ping are returned separately by `fetchServerStatus()` or `fetchServerStatuses()`.

```ts
interface Server {
  index: number;
  domain: string;
  description: string;
}
```

### `ServerRef`

Accepted anywhere a server is required.

```ts
type ServerRef = number | Server;
```

Passing a number selects a server index. Passing a `Server` object uses its
domain and index directly.

### `Ship`

Returned by ship list reads.

```ts
interface Ship {
  id: number | null;
  hexCode: string | null;
  name: string;
  iconUrl: string | null;
  playerCount: number;
  owned: boolean;
  saved: boolean;
  color: string;
  time: number | null;
}
```

Ship names are returned exactly as provided by the Drednot server. In
particular, `fetchShips()` and `fetchShipList()` preserve leading and trailing
spaces; it is up to callers to optionally trim those spaces from `name`.

### `InviteMetadata`

Returned by `fetchInviteMetadata()`.

```ts
interface InviteMetadata {
  shipId: string | null;
  name: string | null;
  previewImageUrl: string | null;
  hostname: string;
  inviteCode: string;
  color?: string | null;
}
```

Invite metadata also preserves leading and trailing spaces in the
ship name returned by the invite page. The optional `color` field is included
only when `includeColor: true` is passed and is sampled from the preview image.

### `ShipList`

Returned by `fetchShipList()`.

```ts
interface ShipList {
  playerCount?: number;
  maxPlayerCount?: number;
  isMuted?: boolean;
  ships: Ship[];
}
```

### `ShipSpec`, `ShipRef`

Accepted by join/start methods.

```ts
type ShipSpec =
  | { type: "join_or_load"; id: number | string }
  | { type: "new"; name?: string | null; color?: string | null }
  | { type: "invite"; code: string };

type ShipRef = number | string | Ship | ShipSpec | null;
```

Useful interpretations:

```txt
number                 -> ship id
string                 -> ship id/hex-like selector, depending on server API
Ship                   -> ship from fetchShips/fetchShipList
{ type: "new" }        -> create or start a new ship
{ type: "invite" }     -> join by invite code
null or undefined      -> default behavior for the method
```

## Runtime Top-Level APIs

Top-level runtime APIs are split by environment:

- Node explicit session/token/start helpers: [NODE_API.md](./NODE_API.md)
- Browser ambient session/start helpers: [BROWSER_API.md](./BROWSER_API.md)

`Connection`, `Session`, `AnonSession`, `BrowserSession`, `Dredless`, and `DredlessBrowser` are documented in those runtime-specific files.

## `DredlessClient`

`DredlessClient` owns the websocket, outgoing commands, incoming packets, and
decoded state domains.

```ts
class DredlessClient {
  constructor(connection: Connection, options?: { connect?: boolean });
  static attachWebSocket(websocket: unknown, options?: AttachWebSocketOptions): DredlessClient;

  connection: Connection | null;
  session: Session | null;
  baseUrl: string | null;
  attachMode: "observe" | "bootstrap" | "readonly" | null;
  attached: boolean;
  serverId: number | null;
  server: Server | null;
  netPort: number | null;
  gameToken: string;
  ws: unknown;
  sid: number | null;
  connected: boolean;
  ready: boolean;
  packetCount: number;
  lastPacket: unknown;

  net: ClientNetDomain;
  debug: ClientDebugDomain;
  player: PlayerDomain;
  inventory: InventoryDomain;
  management: ShipManagementDomain;
  readyPromise: Promise<this>;

  whenReady(): Promise<this>;
  close(code?: number, reason?: string): this;
  disconnect(code?: number, reason?: string): this;

  currentShip(): ShipDomain | null;
  ship(): ShipDomain | null;
  overworld(): OverworldDomain | null;
  world(id: number): WorldDomain | null;
  shipWorld(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot | null;
  state(options?: { includeTiles?: boolean; includeModel?: boolean }): ClientSnapshot;
  entities(scope?: number | string): EntitySummary[];
  entity(entityId: number, scope?: number | string): EntitySnapshot | null;
  currentPlayerEntity(): EntityHandle | null;

  on(type: string, callback: (...args: unknown[]) => void): this;
  off(type: string, callback: (...args: unknown[]) => void): this;
  once(type: string, callback: (...args: unknown[]) => void): this;
}
```

### Constructor

```js
const client = new DredlessClient(connection);
```

By default the constructor opens the websocket. For tests or offline state
inspection, pass `{ connect: false }`:

```js
const client = new DredlessClient(connection, { connect: false });
```

### `DredlessClient.attachWebSocket(websocket, options?)`

```ts
type WebSocketAttachMode = "observe" | "bootstrap" | "readonly";

interface AttachWebSocketOptions {
  mode?: WebSocketAttachMode;
  connected?: boolean | null;
  ready?: boolean;
  sid?: number | null;
  baseUrl?: string | null;
  session?: Session | null;
  serverId?: number | null;
  server?: Server | null;
  netPort?: number | null;
  gameToken?: string;
}
```

Attaches Dredless to an existing websocket without requiring a `Connection`.
This is intended for observing or integrating with an already-open browser/game websocket.

Modes:

- `"observe"` default: decodes incoming packets and allows explicit writes through normal handle/client methods, but does not send hello, bootstrap, or keepalive automatically.
- `"bootstrap"`: treats the websocket like a normally owned Dredless socket; sends hello on open and runs bootstrap, keepalive, and queued-message flushing on ready.
- `"readonly"`: decodes incoming packets only and rejects all write methods. `close()` is a no-op in this mode.

Optional metadata such as `server`, `serverId`, and `netPort` is only used for snapshots/logging; it is not required to attach.

```js
const client = DredlessClient.attachWebSocket(window.tpgaClient.repsocket.websocket);
client.on("packet", (packet) => console.log(packet.type));
```

### Lifecycle endpoints

```ts
whenReady(): Promise<this>;
close(code?: number, reason?: string): this;
disconnect(code?: number, reason?: string): this;
```

`whenReady()` resolves once the ready packet is received, or rejects with
`DisconnectError` if the socket closes first. For normally-owned clients and
`attachWebSocket(..., { mode: "bootstrap" })`, bootstrap commands have also been sent.

### Disconnect reasons

`DropReason`, `DisconnectError`, and `normalizeDisconnect()` are exported from
the Node, browser, root, and `dredless/network` entrypoints. `DropReason` contains
the official application's close codes, including `Kicked` (4008), `Banned`
(4009), `Saved` (4015), `Shutdown` (4017), and `ServerError` (4018).

```ts
interface DisconnectInfo {
  readonly code: number;
  readonly name: keyof typeof DropReason | null;
  readonly reason: string;
  readonly wasClean: boolean | null;
}
```

Listen to `client.on("disconnect", info => ...)` for normalized details.
`client.lastDisconnect`, `client.net.lastDisconnect`, and
`client.state().lastDisconnect` retain the latest details (initially `null`).
Names are `null` for standard WebSocket and unknown codes. `wasClean` is `null`
when the socket API does not report it, such as Node EventEmitter callbacks.
Byte-buffer reasons are decoded as UTF-8. Missing codes default to `1006`.

The existing `close` event still receives the original browser close event or
Node `(code, reason)` arguments. State is cleaned before either event: the client
sets `connected` and `ready` to `false`, clears the session ID, pending writes,
keepalive, active management/panel state, and command acknowledgements. World
snapshots and historical packet data remain available. Further writes reject
with `DisconnectError`. Dredless does not automatically reconnect.

```js
client.on("disconnect", info => {
  console.log(info.name, info.code, info.reason);
});
```

### World/domain endpoints

```ts
currentShip(): ShipDomain | null;
ship(): ShipDomain | null;
currentPlayerEntity(): EntityHandle | null;
overworld(): OverworldDomain | null;
world(id: number): WorldDomain | null;
shipWorld(options?): WorldSnapshot | null;
```

Use `currentShip()` for the currently loaded ship world. Use `overworld()` for
zone-level objects such as nearby ships and overworld entities.

`currentPlayerEntity()` returns the current player entity handle in the loaded
ship world, or `null` before the player entity is known.

### Compatibility entity endpoints

```ts
entities(scope?: number | string): EntitySummary[];
entity(entityId: number, scope?: number | string): EntitySnapshot | null;
```

Prefer `client.currentShip()?.entities` and `client.overworld()?.entities` for
new code. These compatibility methods use `"ship"` by default.

Valid common scopes are:

```txt
"ship"
"current"
"overworld"
number world id
```

### Events

```ts
on(type: string, callback: (...args: unknown[]) => void): this;
off(type: string, callback: (...args: unknown[]) => void): this;
once(type: string, callback: (...args: unknown[]) => void): this;
```

Events are implementation-defined strings emitted by the client event bus.

### Context menus: `client.tips`

```js
const door = client.currentShip().machines.doors()[0];
const menu = await door.openTips();
console.log(menu.options);
client.tips.select("Restrict to Crew"); // Also accepts a zero-based option index.

// Open and select in one operation:
await client.tips.choose(door, "Restrict to Captains");

// Dismiss without selecting an option:
await door.openTips();
await client.tips.close();

// Set access and wait for the server's model update:
await door.setRank("guest");
await client.currentShip().machines.spawnPoints()[0].setRank("crew");
```

`client.tips.open(entity, options?)` accepts an entity handle or an entity id in
the current world and resolves to a frozen `TipList` with
`{ entity, world, filter, x, y, options }`. Every entity handle also exposes
`openTips(options?)`. `client.tips.current` is the latest menu, or `null` after
selection, an empty menu, or disconnect. The `tip-list` event receives
`(menu, world)` including empty menus; the existing raw `side-event` is preserved.
The server does not send an entity id in a tip list: `entity` is inferred from
the API's requested target and is `null` for unsolicited menus. Avoid mixing raw
context-menu commands with an API operation in progress.

`select(option, command?)` sends the selected index and returns the client.
`choose(entity, option, options?)` opens a fresh menu and selects by exact text
or index, resolving to the client once selection is sent. Neither method waits
for the resulting action to complete.

`close(options?)` sends the captured left-click dismissal input with no focused
entity or selected option, then resolves to the client after the server sends an
empty tip list for the menu's world. It skips sending when no menu is open and
uses the same timeout and overlap rules as `open()`. Optional `command` fields
can supply click coordinates or inventory/view settings.

Door and spawn-point `setRank(rank, options?)` accept `"guest"`, `"crew"`,
`"captain"`, or `0`, `1`, `3`. They resolve to the client after the model confirms
the requested rank, and skip sending when the rank already matches. These are
access restrictions; they do not change a player's ship rank.

Options are `{ timeout?: number, command?: Command }`. The timeout defaults to
5000 milliseconds per response (menu and, for `setRank`, rank confirmation).
Calls reject on timeout, disconnect, unknown options, invalid ranks, or a target
outside the current world. Only one asynchronous tip operation may run per
client; overlapping calls reject. The server still enforces permissions and
interaction range; these helpers do not move the player or grant access.

## `client.state()` Output

```ts
interface ClientSnapshot {
  baseUrl: string;
  session: SessionSnapshot;
  connection: ConnectionSnapshot | null;
  attachMode: "observe" | "bootstrap" | "readonly" | null;
  serverId: number | null;
  server: Server | null;
  netPort: number | null;
  sid: number | null;
  ready: boolean;
  connected: boolean;
  lastDisconnect: DisconnectInfo | null;
  currentWorldId: number | null;
  worlds: WorldSnapshot[];
  cpuLoad: number | null;
  inventory: InventoryState;
  puiPanels: PuiEvent[];
  commsPanels: CommsEvent[];
  currentCommsPanel: CommsEvent | null;
  warnings: unknown[];
  effects: unknown[];
  chat: unknown[];
  motd: unknown[];
  sessionMessages: unknown[];
  scannerResults: ScannerResult[];
  lastScannerResult: ScannerResult | null;
  shipConfig: ShipConfig | null;
  captainSubrank: CaptainSubrank | null;
  playerList: ShipPlayerList | null;
  outfits: { sid: number; outfit: unknown }[];
  commandAcks: CommandAck[];
  lastCommandAck: CommandAck | null;
  decodeErrors: unknown[];
  packetCount: number;
  lastPacket: unknown;
}
```

## Client Domain APIs

### `client.net`

Low-level outgoing network domain.

```ts
interface ClientNetDomain {
  connected: boolean;
  ready: boolean;
  sid: number | null;
  packetCount: number;
  lastPacket: unknown;
  send(command?: Command): DredlessClient;
  sendMessage(message: unknown, options?: { afterReady?: boolean }): DredlessClient;
  sendRaw(message: unknown, options?: { afterReady?: boolean }): DredlessClient;
  sendEntityCommand(cmd: string, args?: unknown[]): DredlessClient;
  sendUiConfig(data: unknown): DredlessClient;
  sendBlueprintPlacement(placement: BlueprintPlacement): DredlessClient;
  setOutfit(outfit: unknown): DredlessClient;
}
```

`send()` signs and sends a command-like packet. `sendMessage()` sends a decoded
protocol message. `sendRaw()` sends already-built/raw content. The specialized
helpers build the corresponding protocol command and return the client for
chaining.

### `Command`

General command shape for movement, actions, UI focus, and drag operations.

```ts
interface Command {
  type?: number;
  n?: number | null;
  x?: number;
  y?: number;
  mx?: number;
  my?: number;
  vx?: number;
  vy?: number;
  jump?: boolean;
  jump_held?: boolean;
  drop?: boolean;
  act1?: boolean;
  act1_held?: boolean;
  exit?: boolean;
  act2?: boolean;
  act_alt?: boolean;
  act_alt_held?: boolean;
  wrench_mode?: number;
  turret_mode?: number;
  scr_w?: number;
  scr_h?: number;
  motion?: number;
  focus_ent?: number | null;
  config_ent?: number | null;
  tip_select?: number | null;
  inv_slot?: number;
  blur?: boolean;
  drag?: DragPayload | null;
}
```

### `client.debug`

Read-only debugging and raw-state access.

```ts
interface ClientDebugDomain {
  packets(): unknown[];
  decodeErrors(): unknown[];
  worldStore(): WorldStore;
  modelTable(worldId: number, tableId: number): Map<number, ModelRecord>;
  modelRecord(worldId: number, tableId: number, entityId: number): ModelRecord | null;
  puiPanels(): PuiEvent[];
  commsPanels(): CommsEvent[];
}
```

### `client.player`

Player input and action domain.

```ts
interface PlayerDomain {
  current(): PlayerSummary | null;
  entity(): EntityHandle | null;
  name(): string | null;
  rank(): CurrentPlayerRank;
  move(vector?: { x?: number; y?: number }, command?: Command): DredlessClient;
  aim(point?: { x?: number; y?: number; mx?: number; my?: number }, command?: Command): DredlessClient;
  action(flags?: Command, command?: Command): DredlessClient;
  useEntity(entity: number | EntityHandle | EntitySummary, options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
  useHeldItem(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
  placeHeldItem(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
  placeBlueprint(placement: BlueprintPlacement, options?: { invSlot?: number; hold?: boolean; mx?: number; my?: number }, command?: Command): DredlessClient;
  rotateHeldItem(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
  selectSlot(invSlot?: number, command?: Command): DredlessClient;
  inputSettings(): CurrentInputSettings;
  setInputSettings(settings?: InputSettings, options?: { send?: boolean }): DredlessClient;
  setView(width: number, height: number, options?: { send?: boolean }): DredlessClient;
  setScreenSize(width: number, height: number, options?: { send?: boolean }): DredlessClient;
  setWrenchMode(mode: WrenchMode, options?: { send?: boolean }): DredlessClient;
  setTurretMode(mode: TurretMode, options?: { send?: boolean }): DredlessClient;
}
```

### Input setting shapes

```ts
const WrenchMode = { DropAllItems: "drop-all-items", GrabPrimaryItems: "grab-primary-items", GrabAllItems: "grab-all-items" } as const;
type WrenchMode = typeof WrenchMode[keyof typeof WrenchMode];

const TurretMode = { ContinuousFire: "continuous-fire", VolleyFire: "volley-fire" } as const;
type TurretMode = typeof TurretMode[keyof typeof TurretMode];

interface InputSettings {
  wrenchMode?: WrenchMode;
  turretMode?: TurretMode;
  viewWidth?: number;
  viewHeight?: number;
  screenWidth?: number;
  screenHeight?: number;
}

interface CurrentInputSettings {
  wrenchMode: "drop-all-items" | "grab-primary-items" | "grab-all-items" | null;
  turretMode: "continuous-fire" | "volley-fire" | null;
  viewWidth: number | null;
  viewHeight: number | null;
  screenWidth: number | null;
  screenHeight: number | null;
}
```

### `client.inventory`

Inventory read and slot movement domain.

```ts
type InventoryArea = "all" | "hotbar" | "equipment";
type InventorySlotRef = number | EquipmentSlot | InventorySlotHandle | InventorySlotSnapshot;
const EquipmentSlot = { Head: "head", Face: "face", Body: "body", Back: "back", Hands: "hands", Feet: "feet" } as const;
type EquipmentSlot = typeof EquipmentSlot[keyof typeof EquipmentSlot];

interface InventoryDomain {
  state(): InventoryState;
  hotbarSize(): number;
  allSlots(): InventorySlotHandle[];
  slot(ref: InventorySlotRef): InventorySlotHandle;
  hotbarSlots(): InventorySlotHandle[];
  equipmentSlots(): { head: InventorySlotHandle; face: InventorySlotHandle; body: InventorySlotHandle; back: InventorySlotHandle; hands: InventorySlotHandle; feet: InventorySlotHandle };
  findItem(itemId: number, options?: { area?: InventoryArea }): InventorySlotHandle | null;
  findItems(itemId: number, options?: { area?: InventoryArea }): InventorySlotHandle[];
  firstEmpty(options?: { area?: InventoryArea }): InventorySlotHandle | null;
  move(source: InventorySlotRef, target: InventorySlotRef, options?: { split?: boolean }, command?: Command): DredlessClient;
  equip(source: InventorySlotRef, equipmentSlot?: EquipmentSlot | { split?: boolean }, options?: { split?: boolean } | Command, command?: Command): DredlessClient;
  unequip(equipmentSlot: EquipmentSlot, target?: InventorySlotRef, options?: { split?: boolean }, command?: Command): DredlessClient;
  select(slot: InventorySlotRef, command?: Command): DredlessClient;
}
```

Slot handles expose live slot reads and convenience actions:

```ts
interface InventorySlotHandle {
  index: number;
  kind: "hotbar" | "equipment" | null;
  equipmentSlot: "head" | "face" | "body" | "back" | "hands" | "feet" | null;
  itemId: number | null;
  itemName: string | null;
  count: number;
  empty: boolean;
  exists(): boolean;
  snapshot(): InventorySlotSnapshot | null;
  moveTo(target: InventorySlotRef, options?: { split?: boolean }, command?: Command): DredlessClient;
  equip(equipmentSlot?: EquipmentSlot | { split?: boolean }, options?: { split?: boolean } | Command, command?: Command): DredlessClient;
  unequip(target?: InventorySlotRef, options?: { split?: boolean }, command?: Command): DredlessClient;
  select(command?: Command): DredlessClient;
}
```

Inventory state is normalized and does not expose raw `items`, `item_counts`, or `general_slots` arrays. `hotbarSize` is the protocol-provided hotbar slot count from `general_slots`; equipment slots are separate fixed absolute indexes (`16`, `17`, `18`, `19`, `20`, `21`). `equip()` may omit the equipment slot; in that case it infers the target from the item schema and throws if the source slot is empty or the item is not equipment.

```ts
interface InventorySlotSnapshot {
  index: number;
  itemId: number | null;
  itemName: string | null;
  count: number;
  kind: "hotbar" | "equipment";
  equipmentSlot: "head" | "face" | "body" | "back" | "hands" | "feet" | null;
  empty: boolean;
}

interface InventoryState {
  type: "inventory";
  filter?: number;
  hotbarSize: number;
  slots: InventorySlotSnapshot[];
  hotbar: InventorySlotSnapshot[];
  equipment: {
    head: InventorySlotSnapshot;
    face: InventorySlotSnapshot;
    body: InventorySlotSnapshot;
    back: InventorySlotSnapshot;
    hands: InventorySlotSnapshot;
    feet: InventorySlotSnapshot;
  };
}
```
### `client.management`

Ship-management command and state domain.

```ts
interface ShipManagementDomain {
  canSave(): boolean;
  save(options?: SaveShipOptions): Promise<DisconnectInfo>;
  rename(name: string, options?: RenameShipOptions): Promise<void>;
  requestPlayerList(): DredlessClient;
  resetInvite(): DredlessClient;
  setPrivacy(privacy: ShipPrivacy): DredlessClient;
  setGravity(direction: ShipGravityDirection): DredlessClient;
  setPatronPerks(enabled: boolean): DredlessClient;
  enablePatronPerks(): DredlessClient;
  disablePatronPerks(): DredlessClient;
  patronPerks(): ShipPatronPerk[] | null;
  hasPatronPerks(name?: string): boolean;
  recoverStarterItem(itemId: number, options?: StarterRecoveryOptions): Promise<void>;
  setPlayerRank(refId: number, rank: ShipPlayerRank): DredlessClient;
  kickPlayer(refId: number): DredlessClient;
  banPlayer(refId: number): DredlessClient;
  unbanPlayer(refId: number): DredlessClient;
  demoteSelf(): DredlessClient;
  config(): ShipConfig | null;
  hasCheats(): boolean;
  playerList(): ShipPlayerList | null;
  crewLog(): CrewLog | null;
}

interface StarterRecoveryOptions {
  timeout?: number; // Response timeout in milliseconds; default 10000.
}

interface StarterRecoveryResult {
  readonly success: boolean;
  readonly failReason: string | null;
}

interface RenameShipOptions {
  color?: string; // #RRGGBB; omitted preserves the current color.
  timeout?: number; // Permission response timeout in milliseconds; default 10000.
}

interface SaveShipOptions {
  timeout?: number; // Milliseconds; default 10000.
}
```

`canSave()` returns `true` when the client is connected and ready, the current
ship's parent world is known, and that parent's `danger_level` is `0` (Safe Zone).
It returns `false` for missing metadata or an unsafe parent world. The server
still checks the player's permission to save.

`save({timeout = 10000} = {})` sends `{type: 4, act: "save_team", arg: null}`
and resolves with `DisconnectInfo` when the server closes the connection with
`DropReason.Saved` (4015). Saving ejects all players so captains can reload the ship.
It rejects if `canSave()` is false, the socket closes with a different code, a
save is already pending, sending fails, or the timeout expires. Disconnect
failures use `DisconnectError`, whose `disconnect` property contains the details.
The timeout must be positive milliseconds, at most `2147483647`. A timeout stops
waiting; it does not cancel a save already requested from the server.
The client also exposes `canSaveShip()` and `saveShip(options?)` directly.

```js
if (client.management.canSave()) {
  const saved = await client.management.save({timeout: 10000});
  console.log(saved.name); // "Saved"
}
```

`await client.management.rename("New Name", {color: "#3a8bce"})` follows the
official client's permission flow: send `rename_request`, wait for an allowed
`rename_response`, then send `rename_commit` with the name in `arg` and the color
in `arg2`. Omit `color` to preserve `initial_color` from the permission response.
Names must be strings of at most 32 UTF-16 code units (the official input limit);
colors must be six-digit hex strings with a leading `#`.

The promise resolves when the commit is sent, without waiting for server
confirmation of the resulting name or color. Ship metadata updates through the
normal world data stream. The operation rejects on denial (with the server's
message), timeout, disconnect, a world change before permission arrives, sending
failure, demotion, or an overlapping rename. It requires a connected, ready, writable
client. The timeout must be positive and no greater than `2147483647` milliseconds.
A timeout stops waiting. Later permission responses are ignored unless another
rename is pending; the protocol has no request identifier to distinguish replies.
The client also exposes `renameShip(name, options?)` directly.

`client.management.unbanPlayer(refId)` removes a player's ban from the current
ship using the `refId` from `client.management.playerList().players`. It sends
`{type: 4, act: "unban", arg: refId}` and returns the client without waiting for
acknowledgment. The server checks permission; player-list updates arrive normally.
`client.unbanPlayer(refId)` is also available directly.

`await client.management.recoverStarterItem(itemId, {timeout: 10000})` sends the
starter recovery command and waits for `starter_recovery_response`. It resolves
when `fail_reason` is null or absent, and rejects with the server's message
otherwise. **This method now returns `Promise<void>` instead of the client.**
It requires a connected, ready, writable client and rejects overlapping recovery
requests, disconnects (`DisconnectError`), demotion, sending failures, a world
change before the response, and timeouts. The timeout must be positive and at most
`2147483647` milliseconds. Timing out stops waiting but does not cancel recovery
on the server. Responses have no request identifier, so a delayed response can be
mistaken for a subsequent request's response. The direct
`client.recoverStarterItem(itemId, options?)` method has the same behavior.

Every recovery response also emits `"starter-recovery"` with
`{success: boolean, failReason: string | null}` and the original session packet,
including responses to commands sent through the low-level API.

On the server's `demote` message, Dredless clears `shipConfig`, `captainSubrank`,
`playerList`, and `crewLog` before notifying listeners. `management.config()` and
`management.playerList()` then return `null`, and `management.hasCheats()` returns
`false`. Pending renames and starter recoveries reject. The client emits
`"demote"` with the original session packet, followed by `"ship-config"`,
`"captain-subrank"`, `"player-list"`, and `"crew-log"` with `null` state and the original packet.
Fresh server messages can populate management state again. These responses
continue to be available through the raw `"session"` event.

Crew logs arrive automatically through captain session messages with
`submessage.type === "log"`; the official client has no separate log request.
`client.management.crewLog()` (also `client.crewLog` and `client.state().crewLog`)
returns `null` before the first log message, otherwise a `CrewLog`:

```ts
interface CrewLogEntry {
  icon: string | null;
  text: string;
  rawText: unknown;
  count: number;
  refId: number | null;
  secondaryRefId: number | null;
}

interface CrewLog {
  entries: CrewLogEntry[];
  changes: CrewLogEntry[];
  reset: boolean;
  amend: boolean;
}
```

Messages apply in official client order: `reset` clears existing entries,
`amend` removes the last remaining entry, then `changes` are appended. `entries`
contains the resulting log, oldest first, retaining the newest 500 entries.
`changes` contains only entries supplied by the latest message, including any
replacement for an amended entry. Empty reset or amend messages still update
state. Missing counts default to `1`; entries are not expanded by count.

`text` flattens strings and styled text using `flattenRichText`; date, image, and
badge tokens are preserved in `rawText` for custom rendering. `refId` and
`secondaryRefId` preserve the official entry's `ref` and `ref2`, which the official
UI uses to filter the player list. Icon paths are preserved without URL conversion.

```js
client.on("crew-log", (log) => {
  if (log) console.log(log.entries);
});
```

The event receives the updated log and original session packet. Demotion clears
the log and emits `"crew-log"` with `null`; disconnect clears the cached log
before emitting `"disconnect"`. Raw messages remain available through `"session"`.

`client.management.setGravity(direction)` sends the official `coolsnake303`
gravity command. It returns the client without waiting for confirmation; server
permissions still apply. The direct method is `client.setShipGravity(direction)`.
The official UI reveals these controls when its crew search is `coolsnake303`;
no search or unlock command is needed to send the gravity action.

```js
import {GravityDirection} from "dredless/node";

client.management.setGravity(GravityDirection.Up);
client.management.setGravity("down");
```

| Direction | Wire value |
| --- | --- |
| `"down"` / `GravityDirection.Down` | `0` |
| `"up"` / `GravityDirection.Up` | `1` |
| `"left"` / `GravityDirection.Left` | `2` |
| `"right"` / `GravityDirection.Right` | `3` |

The helper accepts these lowercase names or numeric wire values and rejects other
inputs. `buildShipGravityMessage(direction)` produces
`{type: 4, act: "gravity", arg: normalizedDirection}`. This numbering is the
official `OrdinalDirection` mapping and differs from fixed-angle machine controls.

Ship patron helpers apply or remove the caller's patron perks for the current
ship:

```js
client.management.enablePatronPerks(); // setPatronPerks(true)
client.management.disablePatronPerks(); // setPatronPerks(false)

const patrons = client.management.patronPerks();
const anyPatrons = client.management.hasPatronPerks();
const appliedByName = client.management.hasPatronPerks("PatronName");

client.on("patron-perks-response", ({failure}) => {
  if (failure) console.log("Failed to change ship patron perks");
});
```

`setPatronPerks(enabled)` requires a boolean and sends
`{type: 4, act: "set_patron_perks", arg: enabled}`. It returns the client without
waiting for server confirmation. `client.setShipPatronPerks(enabled)` and
`buildSetPatronPerksMessage(enabled)` expose the same command. The server enforces
account eligibility, ship permissions, and perk limits. Disabling removes the
caller's contribution, not other patrons' contributions. The official client notes
that patron items despawn after a short time when perks are disabled.

`patronPerks()` reads `config().patronPerks`: `null` when config is unavailable,
otherwise an array (possibly empty) of `{name, color, tier}`. `color` is a packed
RGB number; known tier strings are `bronze`, `silver`, `gold`, `plat`, and `flux`.
`hasPatronPerks()` checks for any contributor; supplying a name checks an exact,
case-sensitive match, as in the official UI. It returns `false` when config is
unavailable. These methods use server config updates and do not change the cached
list when a command is sent. Demotion and disconnect clear config as usual.

Every `perk_response` emits `"patron-perks-response"` with
`{failure: boolean}` and the original session packet. A true `failure` corresponds
to the official client's failure prompt (which suggests the patron may have used
all available perks). A false value alone does not establish which patrons are
currently applied; observe `"ship-config"` and `patronPerks()` for that state.
Raw responses remain available through `"session"`.

Input aliases:

```ts
type GravityDirection = "down" | "up" | "left" | "right";
type ShipGravityDirection = GravityDirection | 0 | 1 | 2 | 3;
type ShipPrivacy = 0 | 1 | boolean | "public" | "private";
type ShipPlayerRank = 0 | 1 | 3 | "guest" | "crew" | "captain";
type PlayerShipRank = "guest" | "crew" | "crew-invite-pending-deprecated" | "captain" | "banned";
```

Output shapes:

```ts
interface ShipPatronPerk {
  name: string;
  color: number;
  tier: string;
}

interface PatronPerksResponse {
  readonly failure: boolean;
}

interface ShipConfig {
  privacy: number | null;
  privacyName: "public" | "private" | null;
  inviteKey: string | null;
  teamId: number | null;
  patronPerks: ShipPatronPerk[];
}

interface CaptainSubrank {
  subrank: number | null;
  enableCheats: boolean;
}

interface CurrentPlayerRank {
  shipRank: PlayerShipRank | null;
  subrank: number | null;
  isCaptain: boolean;
  patronTier: "bronze" | "silver" | "gold" | "plat" | "flux" | null;
}

interface PlayerListEntry {
  refId: number | null;
  discrim: string | null;
  discrimColor: number | null;
  teamRank: number | null;
  captainRank: number | null;
  isCaptain: boolean;
  isShipOwner: boolean;
  canBeManaged: boolean;
  time: number | null;
  items: unknown[];
  aliasDiscrims: unknown[];
  extraAliasCount: number;
  onlineCount: number | null;
}

interface ShipPlayerList {
  ownerCaptainRank: number | null;
  shipOwners: PlayerListEntry[];
  players: PlayerListEntry[];
  changes: PlayerListEntry[];
  removedPlayers: number[];
}
```

## World Domains

### `WorldDomain`

Available from `client.currentShip()`, `client.overworld()`, and
`client.world(id)`.

```ts
interface WorldDomain {
  id: number | null;
  entities: EntityCollection;
  machines: MachineCollection;
  players: PlayerCollection;
  blocks: BlockCollection;
  materials: MaterialCollection;
  exists(): boolean;
  snapshot(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot | null;
}
```

### `ShipDomain`

```ts
interface ShipDomain extends WorldDomain {
  metadata: ShipWorldMetadataSummary | null;
  entity(): EntityHandle | null;
  overworldEntity: EntityHandle | null;
}
```

`entity()` returns the current ship's overworld entity handle, not a ship-world
placed entity.

### `OverworldDomain`

```ts
interface OverworldDomain extends WorldDomain {
  ships(options?: ShipReadOptions): ShipHandle[];
  shipByHex(hexCode: string, options?: ShipReadOptions): ShipHandle | null;
  shipByEntity(entity: number | EntityHandle | EntitySummary, options?: ShipReadOptions): ShipHandle | null;
}
```

Ship read options:

```ts
interface ShipReadOptions {
  includeWorld?: boolean;
  includeTiles?: boolean;
  includeModel?: boolean;
  sort?: "distance" | null;
}
```

## Entity API

Entity ids are scoped to their world. Overworld entities and ship-world entities
do not share one global id pool.

### `EntityCollection`

```ts
interface EntityCollection {
  all(): EntityHandle[];
  snapshots(): EntitySnapshot[];
  states(): EntitySnapshot[];
  raw(): EntitySummary[];
  get(entity: number | EntityHandle | EntitySummary): EntityHandle;
}
```

Use:

```js
const shipEntity = client.currentShip().entities.get(14);
const overworldEntity = client.overworld().entities.get(2495754);
```

Costs:

```txt
all()       -> creates lightweight handles
raw()       -> returns current summary objects
snapshots() -> clones and freezes summaries
states()    -> alias of snapshots()
get(id)     -> creates one lightweight handle
```

### `EntityHandle`

```ts
interface EntityHandle {
  /** @deprecated Use id. */
  entity: number;
  id: number;
  position: TransformSummary | null;
  health: HealthSummary | null;
  contents: EntityContentsSummary | null;
  exists(): boolean;
  snapshot(): EntitySnapshot | null;
  is(type: EntityTypeName): boolean;
  has(feature: EntityFeatureName): boolean;
  feature(feature: EntityFeatureName): unknown | null;
  as(type: EntityTypeName): MachineHandle | null;
  asLoader(): LoaderHandle | null;
  asPusher(): PusherHandle | null;
  asLauncher(): LauncherHandle | null;
  asNavigationUnit(): NavigationUnitHandle | null;
  asCommsStation(): CommsStationHandle | null;
  asSign(): SignHandle | null;
  asGenerator(): GeneratorHandle | null;
  asCargoHatch(): CargoHatchHandle | null;
  asCannon(): CannonHandle | null;
  asThruster(): ThrusterHandle | null;
  asHelm(): HelmHandle | null;
  asDoor(): DoorHandle | null;
  asSpawnPoint(): SpawnPointHandle | null;
  asShieldProjector(): ShieldProjectorHandle | null;
  asFluidTank(): FluidTankHandle | null;
  asCargoEjector(): CargoEjectorHandle | null;
  asExpandoBox(): ExpandoBoxHandle | null;
  use(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
}
```

### `EntitySnapshot`

Frozen point-in-time entity read.

```ts
interface EntitySnapshot extends EntitySummary {
  id: number;
  position: TransformSummary | null;
  rotation: number | null;
  type: EntitySnapshotType;
  is(type: EntityTypeName): boolean;
  has(feature: EntityFeatureName): boolean;
  feature(feature: EntityFeatureName): unknown | null;
}

interface EntitySnapshotType {
  category: EntitySummary["category"] | null;
  machine: string | null;
  item: string | null;
  components: string[];
}
```

### `EntitySummary`

Raw normalized entity shape.

```ts
interface EntitySummary {
  entity: number;
  category:
    | "placed_entity"
    | "loose_item"
    | "untyped_holder"
    | "metadata"
    | "player"
    | "ship_control"
    | "blueprint_preview"
    | "entity";
  typeId: number | null;
  typeName: string | null;
  markerTypeId: number | null;
  markerTypeName: string | null;
  label: string;
  kind: string[];
  transform: TransformSummary | null;
  footprint: {
    width: number;
    height: number;
    source:
      | "type"
      | "marker"
      | "heuristic"
      | "default"
      | "crate"
      | "huge_thruster"
      | "hover_outline";
  };
  contents: EntityContentsSummary | null;
  occupies: { x: number; y: number }[];
  tables: { tableId: number; name: string | null; record: ModelRecord }[];
}
```

### `EntityContentsSummary`

Feature/component container for an entity.

```ts
interface EntityContentsSummary {
  itemHolder?: ItemHolderSummary;
  expandoBox?: ExpandoBoxSummary;
  hoverOutline?: HoverOutlineSummary;
  mapMarker?: MapMarkerSummary;
  dockingSpring?: DockingSpringSummary;
  hugeThruster?: HugeThrusterSummary;
  blueprintPreview?: BlueprintPreviewSummary;
  itemCrate?: ItemCrateSummary;
  health?: HealthSummary;
  bot?: BotSummary;
  fabricator?: FabricatorSummary;
  cargoEjector?: CargoEjectorSummary;
  cannon?: CannonSummary;
  thruster?: ThrusterSummary;
  pusher?: PusherSummary;
  pusherBeam?: PusherBeamSummary;
  launcher?: LauncherSummary;
  loader?: LoaderSummary;
  cargoHatch?: CargoHatchSummary;
  navigationUnit?: NavigationUnitSummary;
  commsStation?: CommsStationSummary;
  fluidTank?: FluidTankSummary;
  shieldGenerator?: ShieldGeneratorSummary;
  shieldProjector?: ShieldProjectorSummary;
  helm?: HelmSummary;
  player?: PlayerSummary;
  shipControl?: ShipControlSummary;
  sign?: SignSummary;
  spawnPoint?: SpawnPointSummary;
  door?: DoorSummary;
  shipSize?: ShipSizeSummary;
}
```

Feature lookup accepts the canonical component names above and selected aliases
such as `outline`, `beam`, `inventory`, `filter`, `filterMode`, `filterSlots`,
`occupied`, `mapMarker`, and `blueprint`.

## Machine API

### `MachineCollection`

```ts
interface MachineCollection {
  state(): MachineSummary;
  raw(): MachineSummary;
  loaders(): LoaderHandle[];
  loader(entity: number | EntityHandle | EntitySummary): LoaderHandle;
  pushers(): PusherHandle[];
  pusher(entity: number | EntityHandle | EntitySummary): PusherHandle;
  launchers(): LauncherHandle[];
  launcher(entity: number | EntityHandle | EntitySummary): LauncherHandle;
  navigationUnits(): NavigationUnitHandle[];
  navigationUnit(entity?: number | EntityHandle | EntitySummary | null): NavigationUnitHandle | null;
  fabricators(): FabricatorHandle[];
  fabricator(entity: number | EntityHandle | EntitySummary): FabricatorHandle;
  commsStations(): CommsStationHandle[];
  commsStation(entity?: number | EntityHandle | EntitySummary | null): CommsStationHandle | null;
  signs(): SignHandle[];
  sign(entity: number | EntityHandle | EntitySummary): SignHandle;
  generators(): GeneratorHandle[];
  generator(entity: number | EntityHandle | EntitySummary): GeneratorHandle;
  cargoHatches(): CargoHatchHandle[];
  cargoHatch(entity: number | EntityHandle | EntitySummary): CargoHatchHandle;
  cargoEjectors(): CargoEjectorHandle[];
  cargoEjector(entity: number | EntityHandle | EntitySummary): CargoEjectorHandle;
  cannons(): CannonHandle[];
  cannon(entity: number | EntityHandle | EntitySummary): CannonHandle;
  thrusters(): ThrusterHandle[];
  thruster(entity: number | EntityHandle | EntitySummary): ThrusterHandle;
  helms(): HelmHandle[];
  helm(entity: number | EntityHandle | EntitySummary): HelmHandle;
  doors(): DoorHandle[];
  door(entity: number | EntityHandle | EntitySummary): DoorHandle;
  spawnPoints(): SpawnPointHandle[];
  spawnPoint(entity: number | EntityHandle | EntitySummary): SpawnPointHandle;
  shieldProjectors(): ShieldProjectorHandle[];
  shieldProjector(entity: number | EntityHandle | EntitySummary): ShieldProjectorHandle;
  fluidTanks(): FluidTankHandle[];
  fluidTank(entity: number | EntityHandle | EntitySummary): FluidTankHandle;
  expandoBoxes(): ExpandoBoxHandle[];
  expandoBox(entity: number | EntityHandle | EntitySummary): ExpandoBoxHandle;
}
```

### `MachineSummary`

Grouped machine/component state.

```ts
interface MachineSummary {
  itemHolders: ItemHolderSummary[];
  health: HealthSummary[];
  fabricators: FabricatorSummary[];
  cargoEjectors: CargoEjectorSummary[];
  cannons: CannonSummary[];
  thrusters: ThrusterSummary[];
  pushers: PusherSummary[];
  pusherBeams: PusherBeamSummary[];
  launchers: LauncherSummary[];
  loaders: LoaderSummary[];
  cargoHatches: CargoHatchSummary[];
  navigationUnits: NavigationUnitSummary[];
  commsStations: CommsStationSummary[];
  fluidTanks: FluidTankSummary[];
  shieldGenerators: ShieldGeneratorSummary[];
  shieldProjectors: ShieldProjectorSummary[];
  helms: HelmSummary[];
  signs: SignSummary[];
  spawnPoints: SpawnPointSummary[];
  doors: DoorSummary[];
  expandoBoxes: ExpandoBoxSummary[];
}
```

### Common machine handle

```ts
interface MachineHandle extends EntityHandle {
  open(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
}
```

`open()` focuses/uses the entity through the player command path.

### `LoaderHandle`

```ts
interface LoaderHandle extends MachineHandle {
  state: LoaderSummary | null;
  configure(config?: LoaderConfig): DredlessClient;
  configureFull(config?: LoaderFullConfig): DredlessClient;
  copy(config?: LoaderFullConfig): DredlessClient;
  setPickPlace(pick: LoaderPosition, place: LoaderPosition, config?: LoaderConfig): DredlessClient;
  setPriority(priority: LoaderPriority, config?: LoaderConfig): DredlessClient;
  setStack(stack: number, config?: LoaderConfig): DredlessClient;
  setCycle(cycle: number, config?: LoaderConfig): DredlessClient;
  setRequireOutput(requireOutput: boolean, config?: LoaderConfig): DredlessClient;
  setWaitForStack(waitForStack: boolean, config?: LoaderConfig): DredlessClient;
  setFilterMode(filterMode: LoaderFilterMode): DredlessClient;
  setFilterItems(filterSlots?: Array<number | null | undefined>): DredlessClient;
  pick: number | undefined;
  place: number | undefined;
  priority: number | undefined;
  stack: number | undefined;
  cycle: number | undefined;
  requireOutput: boolean | undefined;
  waitForStack: boolean | undefined;
  filterMode: number | undefined;
  filterSlots: Array<number | null>;
}
```

Config inputs:

```ts
const LoaderPosition = { TopLeft: "top-left", TopMiddle: "top-middle", TopRight: "top-right", MiddleLeft: "middle-left", MiddleRight: "middle-right", BottomLeft: "bottom-left", BottomMiddle: "bottom-middle", BottomRight: "bottom-right" } as const;
type LoaderPosition = typeof LoaderPosition[keyof typeof LoaderPosition];

const LoaderPriority = { Low: "low", Normal: "normal", High: "high" } as const;
type LoaderPriority = typeof LoaderPriority[keyof typeof LoaderPriority];

const LoaderFilterMode = { AllowAll: "allow-all", BlockFilter: "block-filter", AllowFilter: "allow-filter", BlockAll: "block-all" } as const;
type LoaderFilterMode = typeof LoaderFilterMode[keyof typeof LoaderFilterMode];

interface LoaderConfig {
  pick?: LoaderPosition;
  place?: LoaderPosition;
  priority?: LoaderPriority;
  stack?: number;
  cycle?: number;
  requireOutput?: boolean;
  waitForStack?: boolean;
}

interface LoaderFullConfig extends LoaderConfig {
  filterMode?: LoaderFilterMode;
  filterSlots?: Array<number | null | undefined>;
}
```

State output:

Loader state uses the official component defaults when configuration fields
are omitted: pick `3` (middle-left), place `4` (middle-right), normal priority,
stack `16`, cycle `1` second, and both flags disabled. Cycle times are converted
from ticks at 20 ticks per second. Flag updates set their absolute boolean
values; repeated updates do not toggle them. Raw loader configuration is stored
in model table `69` (wire section `162`), separately from navigation state.

```ts
interface LoaderSummary {
  entity: number;
  pick: number | null;
  pickName: string | null;
  place: number | null;
  placeName: string | null;
  priority: number | null;
  priorityName: string | null;
  requireOutput: boolean | null;
  waitForStack: boolean | null;
  stack: number | null;
  cycle: number | null;
  filterMode: number | null;
  filterModeName: string | null;
  filterSlots: (number | null)[] | null;
  heldItemId: number | null;
  heldItemName: string | null;
  heldCount: number | null;
  active: boolean;
  progress: number | null;
  state: ModelRecord;
  filterState: ModelRecord;
  filterSlotsState: ModelRecord;
}
```

### `PusherHandle`

```ts
interface PusherHandle extends MachineHandle {
  state: PusherSummary | null;
  beam: PusherBeamSummary | null;
  configure(config?: PusherConfig): DredlessClient;
  setAngle(angle: number, config?: PusherConfig): DredlessClient;
  setSpeed(speed: number, config?: PusherConfig): DredlessClient;
  setLength(length: number, config?: PusherConfig): DredlessClient;
  setMode(mode: PusherMode, config?: PusherConfig): DredlessClient;
  setFilteredMode(mode: PusherMode, config?: PusherConfig): DredlessClient;
  setFilterInventory(filterInventory: boolean, config?: PusherConfig): DredlessClient;
  setFilterItems(filterSlots?: Array<number | null | undefined>): DredlessClient;
  angle: number | undefined;
  speed: number | undefined;
  length: number | undefined;
  mode: number | undefined;
  filteredMode: number | undefined;
}
```

Config input:

```ts
const PusherMode = { Push: "push", Pull: "pull", DoNothing: "do-nothing" } as const;
type PusherMode = typeof PusherMode[keyof typeof PusherMode];

interface PusherConfig {
  mode?: PusherMode;
  filteredMode?: PusherMode;
  angle?: number;
  speed?: number;
  filterInventory?: boolean;
  length?: number;
}
```

State output:

```ts
interface PusherSummary {
  entity: number;
  mode: number;
  modeName: string | null;
  filteredMode: number;
  filteredModeName: string | null;
  angle: number | null;
  speed: number;
  length: number;
  filterInventory: boolean;
  filterSlots: (number | null)[] | null;
  state: ModelRecord;
  filterSlotsState: ModelRecord;
}

interface PusherBeamSummary {
  entity: number;
  active: boolean;
  mode: number;
  modeName: string | null;
  lengthRaw: number;
  length: number;
  state: ModelRecord;
}
```

Pusher beams are associated with the same entity as their parent pusher, exposed
as `pusher.beam`, `entity.feature("beam")`, and `machines.state().pusherBeams`.

### `LauncherHandle`

```ts
interface LauncherHandle extends MachineHandle {
  state: LauncherSummary | null;
  setAngle(angle: number): DredlessClient;
  setPower(power: number): DredlessClient;
  angleDegrees: number | undefined;
  angleRadians: number | undefined;
  angleRaw: number | null | undefined;
}

interface LauncherSummary {
  entity: number;
  angleRaw: number | null;
  angleRadians: number | null;
  angleDegrees: number | null;
  state: ModelRecord;
}
```

Launcher power may not be present until the relevant UI has exposed it.

### `NavigationUnitHandle`

```ts
interface NavigationUnitHandle extends MachineHandle {
  state: NavigationUnitSummary | null;
  configure(config?: NavigationUnitConfig): DredlessClient;
  copy(config?: NavigationUnitConfig): DredlessClient;
  paste(config?: NavigationUnitConfig): DredlessClient;
  setDestination(destination: number, config?: NavigationUnitConfig): DredlessClient;
  setAutoWarp(config?: NavigationUnitConfig): DredlessClient;
  startWarp(config?: NavigationUnitConfig): DredlessClient;
  cancelWarp(config?: NavigationUnitConfig): DredlessClient;
  destination: number | undefined;
  autoWarpOnShieldFailure: boolean | undefined;
  autoWarpOnNoCaptains: boolean | undefined;
  warp: string | undefined;
}
```

Config and state:

```ts
interface NavigationUnitConfig {
  destination?: number;
  page?: number;
  warp?: boolean | "start" | "idle" | "cancel";
  autoWarpOnShieldFailure?: boolean;
  autoWarpOnNoCaptains?: boolean;
}

interface NavigationUnitSummary {
  entity: number;
  destination: number;
  destinationName: string | null;
  autoWarpOnShieldFailure: boolean | null;
  autoWarpOnNoCaptains: boolean | null;
  state: ModelRecord;
}
```

### `FabricatorHandle`

```ts
interface FabricatorHandle extends MachineHandle {
  state: FabricatorSummary | null;
  panel(): PuiEvent | null;
  add(itemId: number, count?: number, index?: number): DredlessClient;
  sub(itemId: number, count?: number, index?: number): DredlessClient;
  clearQueue(): DredlessClient;
  toggleRepeat(): DredlessClient;
  lockResource(row: number): DredlessClient;
  unlockResource(row: number): DredlessClient;
  eject(row: number): DredlessClient;
}

const FabricatorType = { Starter: "starter", Munitions: "munitions", Engineering: "engineering", Equipment: "equipment" } as const;
type FabricatorType = typeof FabricatorType[keyof typeof FabricatorType];

interface FabricatorSummary {
  entity: number;
  type: FabricatorType | null;
  typeIndex: number | null;
  state: ModelRecord;
  rows: { itemId: number | null; itemName: string | null; count: number | null }[];
  progress: number | null;
  progressRaw: number | null;
  active: boolean;
  craftingItemId: number | null;
  craftingItemName: string | null;
  craftingCount: number | null;
}
```

### `CommsStationHandle`

```ts
interface CommsStationHandle extends MachineHandle {
  state: CommsStationSummary | null;
  panel(): CommsEvent | null;
  sendMessage(message?: string): DredlessClient;
}

interface CommsStationSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  charges: number | null;
  maxCharges: number;
  chargeRatio: number | null;
  occupied: boolean;
  state: ModelRecord;
}
```

### `SignHandle`

```ts
interface SignHandle extends MachineHandle {
  state: SignSummary | null;
  setText(text?: string, mode?: SignDisplayMode): DredlessClient;
  text: string | undefined;
  mode: number | undefined;
}

const SignDisplayMode = { Always: "always", WhenNear: "when-near", OnHover: "on-hover" } as const;
type SignDisplayMode = typeof SignDisplayMode[keyof typeof SignDisplayMode];

interface SignSummary {
  entity: number;
  text: string;
  displayMode: number;
  displayModeName: string | null;
  state: ModelRecord;
}
```

### `GeneratorHandle`

```ts
interface GeneratorHandle extends MachineHandle {
  state: ShieldGeneratorSummary | null;
  solvePuzzle(solution: string | number): DredlessClient;
}

interface ShieldGeneratorSummary {
  entity: number;
  charge: number;
  maxCharge: number;
  chargeRatio: number | null;
  efficiencyPercent: number | null;
  efficiency: number | null;
  storedItemId: number | null;
  storedItemName: string | null;
  storedItemCount: number | null;
  hasShieldCore: boolean;
  boostState: number;
  boostStateName: string | null;
  boostTimer: number;
  boostActive: boolean;
  puzzleSeed: number | null;
  puzzleSolution: string | null;
  state: ModelRecord;
  itemState: ModelRecord;
  boostStateRaw: ModelRecord;
}
```

### `CargoHatchHandle`

```ts
interface CargoHatchHandle extends MachineHandle {
  state: CargoHatchSummary | null;
  configure(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): DredlessClient;
  copy(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): DredlessClient;
  paste(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): DredlessClient;
  setFilterMode(filterMode: LoaderFilterMode): DredlessClient;
  setFilterItems(filterSlots?: Array<number | null | undefined>): DredlessClient;
}

interface CargoHatchSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  filterMode: number;
  filterModeName: string | null;
  filterSlots: (number | null)[] | null;
  openFraction: number | null;
  filterState: ModelRecord;
  filterSlotsState: ModelRecord;
}
```

### Other machine handles

```ts
interface CannonHandle extends MachineHandle {
  state: CannonSummary | null;
}

interface ThrusterHandle extends MachineHandle {
  state: ThrusterSummary | null;
}

interface HelmHandle extends MachineHandle {
  state: HelmSummary | null;
  occupied: boolean | undefined;
}

interface DoorHandle extends EntityHandle {
  state: DoorSummary | null;
  rank: number | undefined;
  open: boolean | undefined;
}

interface SpawnPointHandle extends MachineHandle {
  state: SpawnPointSummary | null;
  rank: number | undefined;
}

interface ShieldProjectorHandle extends MachineHandle {
  state: ShieldProjectorSummary | null;
  active: boolean | undefined;
}

interface FluidTankHandle extends MachineHandle {
  state: FluidTankSummary | null;
  amount: number | null | undefined;
}

interface ExpandoBoxHandle extends MachineHandle {
  state: ExpandoBoxSummary | null;
  item: number | null | undefined;
  count: number | null | undefined;
}

interface CargoEjectorSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  progress: number | null;
  active: boolean | null;
}

interface CargoEjectorHandle extends MachineHandle {
  state: CargoEjectorSummary | null;
  progress: number | null | undefined;
  active: boolean | null | undefined;
  setDirection(direction: FixedAngleDirection): DredlessClient;
  copy(direction?: FixedAngleDirection): DredlessClient;
  paste(direction?: FixedAngleDirection): DredlessClient;
}
```

Associated summary shapes:

Cannon summaries expose `relativeAngleRadians` relative to the mount and
`absoluteAngleRadians` in ship coordinates, normalized to `[0, 2π)`, replacing
the raw `aim` field. The relative angle is `null` when aim is unavailable; the
absolute angle is `null` when either aim or mounting rotation is unavailable.

```ts
interface CannonSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  ammoItemId: number | null;
  ammoName: string | null;
  ammoCount: number;
  relativeAngleRadians: number | null; // Barrel angle relative to its mount.
  absoluteAngleRadians: number | null; // Ship coordinates, normalized to [0, 2π).
  recoil: number | null;
  recoil2: number | null;
  recoils: [number | null, number | null];
  charge: number | null;
  charged: boolean | null;
  spin: number | null;
  coolingCellCount: number;
  state: ModelRecord;
}

interface ThrusterSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  facing: number;
  facingName:
    | "bottom"
    | "top"
    | "right"
    | "left"
    | "bottom-right"
    | "bottom-left"
    | "top-right"
    | "top-left"
    | null;
  fuel: number | null;
  state: ModelRecord;
}

interface HelmSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  occupied: boolean;
}

interface DoorSummary {
  entity: number;
  rank: number;
  rankName: string | null;
  open: boolean;
  rankState: ModelRecord;
  state: ModelRecord;
}

interface SpawnPointSummary {
  entity: number;
  rank: number;
  rankName: string | null;
  state: ModelRecord;
}

interface ShieldProjectorSummary {
  entity: number;
  active: boolean;
  state: ModelRecord;
}

interface FluidTankSummary {
  entity: number;
  amount: number | null;
  state: ModelRecord;
}

interface ExpandoBoxSummary {
  entity: number;
  itemId: number | null;
  itemName: string | null;
  count: number | null;
  width: number | null;
  height: number | null;
  rawWidth: number | null;
  rawHeight: number | null;
  itemState: ModelRecord;
  sizeState: ModelRecord;
}
```

## Ship Reads

### `ShipHandle`

Returned by `client.overworld()?.ships()`.

```ts
interface ShipHandle {
  entity: number;
  name: string | null;
  hexCode: string | null;
  distance: number | null;
  worldId: number | null;
  hasWorldData: boolean;
  world(): WorldDomain | null;
  snapshot(): ShipReadSummary;
}
```

### `ShipReadSummary`

```ts
interface ShipReadSummary {
  entity: number;
  name: string | null;
  hexCode: string | null;
  color: number | null;
  colorCss: string | null;
  position: { x: number | null; y: number | null; rot: number | null } | null;
  distance: number | null;
  footprint: EntitySummary["footprint"];
  label: string;
  kind: string[];
  thrust: { x: number | null; y: number | null };
  shield: ShipShieldSummary | null;
  warp: ShipWarpSummary | null;
  worldId: number | null;
  hasWorldData: boolean;
  world: WorldSnapshot | null;
  control: ShipControlSummary;
  entitySummary: EntitySummary;
}
```

### `ShipControlSummary`

```ts
interface ShipControlSummary {
  entity: number;
  name: string | null;
  hexCode: string | null;
  shipWorldId: number | null;
  color: number | null;
  colorCss: string | null;
  thrustX: number | null;
  thrustY: number | null;
  value52: number | null;
  value84: number | null;
  value96: number | null;
  shield: ShipShieldSummary | null;
  warp: ShipWarpSummary | null;
  state: ModelRecord;
}
```

### Ship shield and warp summaries

```ts
interface ShipShieldSummary {
  maxHp: number | null;
  baseHp: number | null;
  activeTankHp: number | null;
  inactiveTankHp: number | null;
  tankValues: number[];
}

interface ShipWarpSummary {
  active: boolean;
  ticks: number;
  elapsedSeconds: number;
  durationSeconds: number;
  remainingSeconds: number;
}
```

## Player, Blocks, Materials

```ts
interface PlayerCollection {
  all(): PlayerSummary[];
  current(): PlayerSummary | null;
}

interface BlockCollection {
  all(): BlockSummary[];
  at(x: number, y: number): BlockSummary | null;
}

interface MaterialCollection {
  all(): MaterialSummary[];
}
```

### `PlayerSummary`

```ts
interface PlayerSummary {
  entity: number;
  name: string | null;
  heldItemId: number | null;
  heldItemName: string | null;
  repairTargetDistance: number | null;
  repairTargetAngle: number | null;
  shipRank: PlayerShipRank | null;
  patronTier: "bronze" | "silver" | "gold" | "plat" | "flux" | null;
  isDeveloper: boolean;
  isPatron: boolean;
  piloting: boolean;
  muted: boolean;
  actionPreview: PlayerActionPreviewSummary | null;
  state: ModelRecord;
}
```

### `PlayerActionPreviewSummary`

```ts
interface PlayerActionPreviewSummary {
  entity: number;
  active: boolean;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  progress: number | null;
  color: number | null;
  colorCss: string | null;
  actionName: "place" | "break" | "blueprint" | null;
  blueprintId: number | null;
  blueprintItems: BlueprintPreviewSummary[];
  state: ModelRecord;
}
```

### `BlockSummary`

```ts
interface BlockSummary {
  x: number;
  y: number;
  entities: EntitySummary[];
}
```

### `MaterialSummary`

```ts
interface MaterialSummary {
  material: number;
  name: string | null;
  count: number;
  solid: boolean | null;
  hp: number | null;
}
```

## World State Classes

These classes are public mostly for inspection, replay, testing, and lower-level
tooling.

### `WorldStore`

```ts
class WorldStore {
  currentWorldId: number | null;
  worlds: Map<number, WorldState>;

  get(id: number): WorldState;
  apply(packet: unknown): WorldUpdate | null;
  snapshot(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot[];
  ids(): number[];
  overworld(): WorldState | null;
  shipWorld(): WorldState | null;
  currentShipEntity(): EntitySummary | null;
}
```

### `WorldState`

```ts
class WorldState {
  constructor(id: number);

  id: number;
  seed: number | null;
  isOverworld: boolean | null;
  tileset: Tileset | null;
  blockWidth: number | null;
  blockHeight: number | null;
  parentWorld: number | null;
  parentEntity: number | null;
  tiles: Map<string, Tile>;
  chunks: unknown[];
  events: unknown[];
  modelPackets: unknown[];
  commsBubbles: CommsBubbleSummary[];
  model: ModelState;
  lastChunkPatch: unknown;
  lastPacket: unknown;
  meta: unknown;

  readMeta(packet: unknown): void;
  addCommsBubble(packet: unknown): CommsBubbleSummary;
  decodeEncrypted(data: Uint8Array | ArrayBuffer | number[]): unknown;
  applyTile(value: unknown): Tile | null;
  applyChunk(value: unknown): Tile[] | null;
  setTile(tile: Tile): Tile;
  normalizeTile(tile: Tile): Tile;
  materials(): MaterialSummary[];
  snapshot(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot;
  table(id: number): Map<number, ModelRecord>;
  record(tableId: number, entityId: number): ModelRecord | null;
  tileDefinition(material: number): TileDefinition | null;
  entity(entityId: number): EntitySummary | null;
  entities(): EntitySummary[];
  blocks(): BlockSummary[];
}
```

### `ModelState`

```ts
class ModelState {
  generation: number | null;
  tables: Map<number, Map<number, ModelRecord>>;
  removedEntities: number[];
  lastUpdate: unknown;
  errors: unknown[];

  table(id: number): Map<number, ModelRecord>;
  record(tableId: number, entityId: number): ModelRecord | null;
  entity(entityId: number): EntitySummary | null;
  entities(): EntitySummary[];
  blocks(): BlockSummary[];
  apply(bytes: Uint8Array | ArrayBuffer | number[]): unknown;
  snapshot(options?: { includeTables?: boolean }): ModelSnapshot;
  tablesSnapshot(): unknown[];
  transforms(): TransformSummary[];
  itemHolders(): ItemHolderSummary[];
  fabricators(): FabricatorSummary[];
  players(): PlayerSummary[];
  shipControls(): ShipControlSummary[];
  shipMetadata(): ShipWorldMetadataSummary | null;
  machines(): MachineSummary;
}

type ModelRecord = Record<string, unknown>;
```

### `WorldSnapshot`

```ts
interface WorldSnapshot {
  id: number;
  is_overworld: boolean | null;
  overworldZone: OverworldZoneSummary | null;
  shipMetadata: ShipWorldMetadataSummary | null;
  tileset: Tileset | null;
  seed: number | null;
  block_w: number | null;
  block_h: number | null;
  parent_world: number | null;
  parent_ent: number | null;
  tileCount: number;
  chunkCount: number;
  lastChunkPatch: unknown;
  lastPacket: unknown;
  meta: unknown;
  materials: MaterialSummary[];
  model: ModelSnapshot;
  entities: EntitySummary[];
  blocks: BlockSummary[];
  transforms: TransformSummary[];
  machines: MachineSummary;
  players: PlayerSummary[];
  shipControls: ShipControlSummary[];
  commsBubbles: CommsBubbleSummary[];
  tiles?: Tile[];
}
```

### World metadata

```ts
interface OverworldZoneSummary {
  id: number;
  baseId: number;
  layer: number;
  key: string;
  name: string;
  tiered: boolean;
  displayName: string;
}

interface ShipWorldMetadataSummary {
  name: string | null;
  color: number | null;
  colorCss: string | null;
  width: number | null;
  height: number | null;
  lockdownTimerSeconds: number | null;
  lockdownCountdownSeconds: number | null;
  onlineShipOwnerCount: number | null;
  requiredShipOwnerCount: number | null;
  allShipOwnersOnline: boolean | null;
  lockdownEngaged: boolean | null;
  lockdownState: ModelRecord;
  shipState: ModelRecord;
}

interface WorldUpdate {
  type: string;
  world: WorldState | null;
  packet?: unknown;
  bubble?: CommsBubbleSummary;
  decoded?: unknown;
  updates?: unknown[];
  result?: unknown;
}
```

### Tiles

```ts
interface Tile {
  x: number;
  y: number;
  material: number;
  materialName?: string | null;
  shape: number;
  shapeName?: string | null;
  hp: number;
  /** @deprecated Use hp. Raw 0-255 HP fraction byte, not absolute integrity. */
  integrity: number;
  color: number | null;
  solid?: boolean | null;
  maxHp?: number | null;
  hpRatio?: number | null;
  hpValue?: number | null;
}

interface TilePhysics {
  filter?: {
    categoryBits: number;
    maskBits: number;
    groupIndex: number;
  };
  transparent?: boolean;
  walkway?: boolean;
  restitution?: number;
  friction?: number;
}

interface TileDefinition {
  name?: string;
  solid: boolean;
  destruct_item?: number;
  blocks_bullets?: boolean;
  hp?: number;
  no_build_surface?: boolean;
  physics?: TilePhysics;
}

interface Tileset {
  scale: number;
  atlas: string;
  tile_width: number;
  tiles: TileDefinition[];
}
```

### `ModelSnapshot`

```ts
interface ModelSnapshot {
  generation: number | null;
  tableCount: number;
  entityCount: number;
  removedEntities: number[];
  lastUpdate: unknown;
  errors: unknown[];
  entities: EntitySummary[];
  blocks: BlockSummary[];
  transforms: TransformSummary[];
  players: PlayerSummary[];
  shipControls: ShipControlSummary[];
  machines: MachineSummary;
  tables: unknown[];
}
```

## Additional Entity Component Shapes

```ts
interface TransformSummary {
  entity: number;
  x: number | null;
  y: number | null;
  rot: number | null;
  flags: unknown[];
}

interface ItemHolderSummary {
  entity: number;
  itemId: number | null;
  itemName: string | null;
  count: number | null;
}

interface ItemCrateSummary {
  entity: number;
  itemId: number | null;
  itemName: string | null;
  count: number | null;
  width: number | null;
  height: number | null;
  itemState: ModelRecord;
  sizeState: ModelRecord;
}

interface HoverOutlineSummary {
  entity: number;
  width: number | null;
  height: number | null;
  rawWidth: number | null;
  rawHeight: number | null;
  state: ModelRecord;
}

interface MapMarkerSummary {
  entity: number;
  kind: string;
  title: string | null;
  key: string | null;
  description: string | null;
  color: number | null;
  colorCss: string | null;
  accentColor: number | null;
  accentColorCss: string | null;
  width: number | null;
  height: number | null;
  labelState: ModelRecord;
  zoneState: ModelRecord;
}

interface DockingSpringSummary {
  entity: number;
  id: number | null;
  width: number;
  height: number;
  state: ModelRecord;
}

interface HugeThrusterSummary {
  entity: number;
  width: number;
  height: number;
  state: ModelRecord;
}

interface ShipSizeSummary {
  entity: number;
  width: number | null;
  height: number | null;
  rawWidth: number | null;
  rawHeight: number | null;
  state: ModelRecord;
}

interface HealthSummary {
  entity: number;
  hp: number | null;
  maxHp: number | null;
  ratio: number | null;
  state: ModelRecord;
}

interface BotSummary {
  entity: number;
  className: string;
  identifier: string;
  typeA: number | null;
  typeB: number | null;
}
```

## Blueprint Shapes

### Placement request

```ts
interface BlueprintPlacement {
  x: number;
  y: number;
  width?: number;
  height?: number;
  w?: number;
  h?: number;
  source: string;
}

interface BlueprintPlacementMessage {
  type: 9;
  x: number;
  y: number;
  w: number;
  h: number;
  source: string;
}
```

### Preview state

```ts
interface BlueprintPreviewSummary {
  entity: number;
  itemId: number;
  itemName: string | null;
  bits: number;
  rawBits: number | null;
  placementOffsets: number[];
  placementCount: number;
  placements: {
    offset: number;
    x: number | null;
    y: number | null;
    itemId: number;
    itemName: string | null;
  }[];
  x: number | null;
  y: number | null;
  rot: number | null;
  state: ModelRecord;
}
```

## PUI And Comms Shapes

```ts
interface PuiEvent {
  type: "pui";
  filter?: number;
  ent_id?: number;
  update?: boolean;
  data?: unknown;
  world?: number | null;
}

interface CommsMessage {
  type: 3;
  msg: string;
}

interface NormalizedCommsMessage {
  raw: unknown;
  text: string;
}

interface CommsEvent {
  type: "comms";
  filter?: number;
  ent_id: number | null;
  entity: number | null;
  msgs_text: unknown[];
  rawMessages: unknown[];
  messages: NormalizedCommsMessage[];
  update?: boolean;
  world?: number | null;
}

interface CommsBubbleSummary {
  sequence: number;
  worldId: number;
  entity: number | null;
  modelId: number | null;
  message: string;
  color: number | null;
  colorCss: string | null;
  durationSeconds: number | null;
  raw: unknown;
}
```

## Scanner And Ack Shapes

```ts
interface CommandAck {
  world: number;
  commandNumber: number;
}

interface ScannerResult {
  kind: "manifest" | "bom" | "unknown";
  sid: number | null;
  shipHex: string | null;
  shipName: string | null;
  blocks: Record<string, number> | null;
  objects: Record<string, number> | null;
  inventories: Record<string, number> | null;
  materials: Record<string, number> | null;
}
```

## Helper Function Exports

These are public lower-level helpers. Prefer the object/domain methods unless
you explicitly need protocol payloads or decoded utility functions.

### Msgpack

Module: `dredless/protocol/msgpack` or root.

```ts
function decodeMsgpack(bytes: Uint8Array | ArrayBuffer | number[]): unknown;
function encodeMsgpack(value: unknown): Uint8Array;
```

### Commands

Module: `dredless/protocol/commands` or root.

```ts
function buildSignedCommandPacket(command: Command, sessionId: number): Uint8Array;
```

### Inventory helpers

Module: `dredless/protocol/inventory` or root.

```ts
function normalizeEquipmentSlot(slot: EquipmentSlot): 16 | 17 | 18 | 19 | 20 | 21;
function equipmentSlotName(slot: number): "head" | "face" | "body" | "back" | "hands" | "feet" | null;
function buildInventoryDragCommand(source: number, target: number, split?: boolean): InventoryDragCommand;
function buildEquipItemCommand(source: number, slot: EquipmentSlot, split?: boolean): InventoryDragCommand;
function buildUnequipItemCommand(slot: EquipmentSlot, target?: number, split?: boolean): InventoryDragCommand;
function normalizeInventoryEvent(event: unknown): InventoryState;
```

Inventory drag output remains protocol-shaped:

```ts
interface InventoryDragCommand {
  drag: {
    source: number;
    target: number;
    split: boolean;
  };
}
```

`normalizeInventoryEvent()` returns the normalized `InventoryState` shape documented under `client.inventory`.

### Chat helpers

Module: `dredless/protocol/chat` or root.

```ts
function buildChatMessage(message?: string): ChatMessage;
```

Ship chat uses protocol message type 2. It is separate from comms-station
messages, which use type 3. The game handles ship chat through the same
chat-command path used by its chat commands, so client.sendChatMessage() can
send executable chat commands as well as ordinary chat text. For example:

```js
client.sendChatMessage("/save");
```

### Comms helpers

Module: `dredless/protocol/comms` or root.

```ts
function buildCommsMessage(message?: string): CommsMessage;
function normalizeCommsEvent(event: unknown): CommsEvent;
function flattenRichText(value: unknown): string;
```

### Sign helpers

Module: `dredless/protocol/sign` or root.

```ts
function buildSignTextMessage(text?: string, mode?: SignDisplayMode): SignTextMessage;
function normalizeSignDisplayMode(mode?: SignDisplayMode): 0 | 1 | 2;
function signDisplayModeName(mode: number): SignDisplayMode | null;
```

Output:

```ts
interface SignTextMessage {
  type: 5;
  cmd: "sign_text";
  args: [string, 0 | 1 | 2];
}
```

### Ship-management helpers

Module: `dredless/protocol/ship-management` or root.

```ts
function buildShipManagementMessage(act: string, arg?: unknown, extra?: Record<string, unknown> | null): ShipManagementMessage;
function buildShipPrivacyMessage(privacy: ShipPrivacy): ShipManagementMessage;
function buildShipGravityMessage(direction: ShipGravityDirection): ShipManagementMessage;
function buildSetPatronPerksMessage(enabled: boolean): ShipManagementMessage;
function normalizeGravityDirection(direction: ShipGravityDirection): 0 | 1 | 2 | 3;
function buildStarterRecoveryMessage(itemId: number): ShipManagementMessage;
function buildPlayerListMessage(): ShipManagementMessage;
function buildSaveShipMessage(): ShipManagementMessage;
function buildShipRenameRequestMessage(): ShipManagementMessage;
function buildShipRenameCommitMessage(name: string, color: string): ShipManagementMessage;
function buildInviteResetMessage(): ShipManagementMessage;
function buildSetPlayerRankMessage(refId: number, rank: ShipPlayerRank): ShipManagementMessage;
function buildKickPlayerMessage(refId: number): ShipManagementMessage;
function buildBanPlayerMessage(refId: number): ShipManagementMessage;
function buildUnbanPlayerMessage(refId: number): ShipManagementMessage;
function buildDemoteSelfMessage(): ShipManagementMessage;
function normalizePrivacy(privacy: ShipPrivacy): 0 | 1;
function normalizePlayerRank(rank: ShipPlayerRank): 0 | 1 | 3;
function normalizeShipConfig(event: unknown): ShipConfig;
function normalizeCaptainSubrank(event: unknown): CaptainSubrank;
function normalizeCrewLog(event: unknown, previous?: CrewLog | null): CrewLog;
function normalizeShipPlayerList(event: unknown, previous?: ShipPlayerList | null, currentCaptainSubrank?: CaptainSubrank | null): ShipPlayerList;
```

Message output:

```ts
interface ShipManagementMessage {
  type: 4;
  act: string;
  arg: unknown;
  arg2?: unknown;
  rank?: unknown;
}
```

### Blueprint helpers

Module: `dredless/protocol/blueprint` or root.

```ts
function buildBlueprintPlacementMessage(placement: BlueprintPlacement): BlueprintPlacementMessage;
```

### UI config helpers

Module: `dredless/protocol/ui-config` or root.

```ts
function buildNavigationUnitConfigData(entity: number, config: NavigationUnitConfig & { destination: number }): Uint8Array;
function buildNavigationUnitClipboardConfigData(config: NavigationUnitConfig & { destination: number }): Uint8Array;
function buildNavigationUnitPasteConfigData(entity: number, config: NavigationUnitConfig & { destination: number }): Uint8Array;
function buildGeneratorMazePuzzleData(entity: number, solution: string | number): Uint8Array;
function buildCargoHatchFilterConfigData(entity: number, filterMode?: LoaderFilterMode): Uint8Array;
function buildCargoHatchFilterItemsData(entity: number, filterSlots?: Array<number | null | undefined>): Uint8Array;
function buildCargoHatchFullConfigData(entity: number, config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): Uint8Array;
function buildCargoHatchCopyConfigData(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): Uint8Array;
function buildClipboardConfigData(target: ClipboardTarget, commandName: string, values?: Iterable<number>): Uint8Array;
function buildClipboardFixedAngleData(target: ClipboardTarget, direction: FixedAngleDirection): Uint8Array;
function buildGeneratorClipboardDirectionData(direction: FixedAngleDirection): Uint8Array;
function buildCargoEjectorDirectionData(entity: number, direction: FixedAngleDirection): Uint8Array;
function buildCargoEjectorPasteConfigData(entity: number, direction: FixedAngleDirection): Uint8Array;
function buildCargoEjectorCopyConfigData(direction: FixedAngleDirection): Uint8Array;
function buildCargoEjectorClipboardDirectionData(direction: FixedAngleDirection): Uint8Array;
function buildExpandoClipboardAngleData(angle: number): Uint8Array;
function buildLoaderClipboardConfigData(config?: LoaderConfig): Uint8Array;
function buildLoaderConfigData(entity: number, config?: LoaderConfig): Uint8Array;
function buildLoaderCopyConfigData(config?: LoaderFullConfig): Uint8Array;
function buildLoaderFilterConfigData(entity: number, filterMode?: LoaderFilterMode): Uint8Array;
function buildLoaderFilterItemsData(entity: number, filterSlots?: Array<number | null | undefined>): Uint8Array;
function buildLoaderFullConfigData(entity: number, config?: LoaderFullConfig): Uint8Array;
function buildPusherConfigData(entity: number, config?: PusherConfig): Uint8Array;
function buildPusherFilterItemsData(entity: number, filterSlots?: Array<number | null | undefined>): Uint8Array;
```

Clipboard/config input types:

```ts
type ClipboardTarget =
  | number
  | "loader" | "loader-config" | "loaderConfig"
  | "hatch" | "cargo-hatch" | "cargoHatch"
  | "ejector" | "cargo-ejector" | "cargoEjector"
  | "expando" | "expando-box" | "expandoBox"
  | "generator" | "shield-generator" | "shieldGenerator"
  | "navigation" | "navigation-unit" | "navigationUnit"
  | "nav" | "nav-unit" | "navUnit";

const FixedAngleDirection = { Right: "right", Up: "up", Left: "left", Down: "down" } as const;
type FixedAngleDirection = typeof FixedAngleDirection[keyof typeof FixedAngleDirection];
```

### Generator maze helpers

Module: `dredless/game/generator-maze` or root.

```ts
function generateGeneratorMaze(seed: number): GeneratorMaze;
function solveGeneratorMazeSeed(seed: number): string;
function maybeSolveGeneratorMazeSeed(seed: number | null | undefined): string | null;
```

Output:

```ts
interface GeneratorMazeCellWalls {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface GeneratorMazeCell {
  x: number;
  y: number;
  value: number;
  hex: string;
  digit: number;
  walls: GeneratorMazeCellWalls;
  backtrackDirection: number;
  marker: number;
}

interface GeneratorMaze {
  seed: number;
  width: number;
  height: number;
  cells: GeneratorMazeCell[];
  rows: GeneratorMazeCell[][];
  solution: string;
}
```

### Crypto, compression, and model decoding

Modules: `dredless/crypto/chacha`, `dredless/compression/lz4`,
`dredless/model`, and root.

```ts
function decryptPayload(
  wireBytes: Uint8Array | ArrayBuffer | number[],
  worldId: number,
  seed: number
): Uint8Array;

function decompressLz4Frame(bytes: Uint8Array | ArrayBuffer | number[]): Uint8Array;

function decodeModelData(bytes: Uint8Array | ArrayBuffer | number[]): unknown;
```

### Ship spec helpers

Module: `dredless/ships`.

```ts
function createShipSpec(name?: string, color?: string): ShipSpec;
function createInviteShipSpec(code: string): ShipSpec;
```

`createShipSpec()` returns a `{ type: "new", ... }` ship spec. 
`createInviteShipSpec()` returns a `{ type: "invite", code }` ship spec.

## Public Constants From Subpath Modules

These constants are exported by helper subpaths for consumers that need protocol
symbols. They are not required for normal object-domain use.

### `dredless/protocol/blueprint`

```ts
const BLUEPRINT_PLACEMENT_TYPE: 9;
```

### `dredless/protocol/comms`

```ts
const COMMS_MESSAGE_TYPE: 3;
```

### `dredless/protocol/inventory`

```ts
const EQUIPMENT_SLOT_INDEXES: Readonly<{
  head: 16;
  face: 17;
  body: 18;
  back: 19;
  hands: 20;
  feet: 21;
}>;
```

### `dredless/protocol/ship-management`

```ts
const GravityDirection: Readonly<{ Down: "down"; Up: "up"; Left: "left"; Right: "right" }>;
const GRAVITY_ACTION: "gravity";
const SET_PATRON_PERKS_ACTION: "set_patron_perks";
const CREW_LOG_LENGTH: 500;
const BAN_ACTION: "ban";
const UNBAN_ACTION: "unban";
const DEMOTE_SELF_ACTION: "demote_self";
const KICK_ACTION: "kick";
const PLAYER_LIST_ACTION: "player_list";
const SAVE_SHIP_ACTION: "save_team";
const INVITE_RESET_ACTION: "invite_reset";
const SET_PRIVACY_ACTION: "set_privacy";
const SET_RANK_ACTION: "set_rank";
const SHIP_MANAGEMENT_TYPE: 4;
const STARTER_RECOVERY_ACTION: "starter_recovery";
```

### `dredless/protocol/sign`

```ts
const SIGN_TEXT_COMMAND: "sign_text";
const SIGN_DISPLAY_MODES: Map<0 | 1 | 2, "always" | "when-near" | "on-hover">;
```

### `dredless/protocol/ui-config`

```ts
const CLIPBOARD_ACTION: 1;
const CLIPBOARD_ANGLE_COMMAND: "angle";
const CLIPBOARD_FIXED_ANGLE_COMMAND: "angle_fixed";
const CLIPBOARD_TARGET_VALUES: Map<string, number>;
const FIXED_ANGLE_VALUES: Map<string, 0 | 1 | 2 | 3>;
const GENERATOR_MAZE_PUZZLE_COMMAND: "maze_puzzle";
const LOADER_CONFIG_COMMAND: "config_loader";
const LOADER_FALSE: 0x8e;
const LOADER_FILTER_CONFIG_COMMAND: "filter_config";
const LOADER_FILTER_ITEMS_COMMAND: "filter_items";
const LOADER_TRUE: 0x8d;
const NAV_UNIT_COMMAND: "config_nav_unit";
const NAV_UNIT_FALSE: 0x8d;
const NAV_UNIT_TRUE: 0x8e;
const PUSHER_CONFIG_COMMAND: "config_pusher";
const PUSHER_FILTER_ITEMS_COMMAND: "filter_items";
```

## Usage Patterns

### Read loaders from a live client

Use [NODE_API.md](./NODE_API.md) or [BROWSER_API.md](./BROWSER_API.md) to start a client for the current runtime.

```js
await client.whenReady();

for (const loader of client.currentShip().machines.loaders()) {
  console.log(loader.id, loader.pick, loader.place, loader.cycle);
}
```

### Read all nearby ships, including detailed loaded worlds when available

```js
const ships = client.overworld().ships({
  includeWorld: true,
  includeModel: true,
  sort: "distance"
});

for (const ship of ships) {
  const snapshot = ship.snapshot();
  console.log(snapshot.name, snapshot.hexCode, snapshot.hasWorldData);
}
```

### Use generic features before narrowing to a machine type

```js
const entity = client.currentShip().entities.get(14);

if (entity.has("loader")) {
  const loader = entity.asLoader();
  loader.setCycle(10);
}

if (entity.has("outline")) {
  console.log(entity.feature("outline"));
}
```

### Configure a pusher

```js
const pusher = client.currentShip().machines.pusher(27);

pusher.configure({
  mode: "push",
  filteredMode: "pull",
  angle: 90,
  speed: 20,
  length: 30,
  filterInventory: true
});
```

### Configure a navigation unit

```js
const nav = client.currentShip().machines.navigationUnit();

nav.setDestination(30, {
  autoWarpOnShieldFailure: true,
  autoWarpOnNoCaptains: false
});
```

## Cost Guidelines

Use handles for normal live code:

```js
client.currentShip().entities.get(id);
client.currentShip().machines.loader(id);
```

Use raw grouped state for display, sorting, and cheap bulk reads:

```js
client.currentShip().entities.raw();
client.currentShip().machines.state();
```

Use snapshots when you need immutable point-in-time data:

```js
entity.snapshot();
client.currentShip().entities.snapshots();
client.state({ includeModel: true });
```

Use debug and world/model classes when reverse engineering, replaying captures,
or validating protocol assumptions:

```js
client.debug.modelRecord(worldId, tableId, entityId);
client.debug.decodeErrors();
client.debug.worldStore();
```
