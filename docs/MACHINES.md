# Machines and context menus

[Documentation index](README.md) · [World state](WORLD_STATE.md) · [Player input](PLAYER_INVENTORY.md)

## Contents

- [Find a machine](#find-a-machine)
- [Targeting and completion](#targeting-and-completion)
- [Context menus and access](#context-menus-and-access)
- [Loaders](#loaders)
- [Pushers](#pushers)
- [Launchers](#launchers)
- [Navigation units](#navigation-units)
- [Fabricators](#fabricators)
- [Signs and comms](#signs-and-comms)
- [Hatches, ejectors, and clipboard settings](#hatches-ejectors-and-clipboard-settings)
- [Generators and read-only machine state](#generators-and-read-only-machine-state)

## Find a machine

Get `machines` from a world domain, usually `client.currentShip()?.machines`. Plural methods return arrays of typed handles; singular methods accept `EntityRef` (an ID, handle, or summary):

| Collection           | Lookup                    | Handle                  |
|----------------------|---------------------------|-------------------------|
| `loaders()`          | `loader(entity)`          | `LoaderHandle`          |
| `pushers()`          | `pusher(entity)`          | `PusherHandle`          |
| `launchers()`        | `launcher(entity)`        | `LauncherHandle`        |
| `navigationUnits()`  | `navigationUnit(entity?)` | `NavigationUnitHandle`  |
| `fabricators()`      | `fabricator(entity)`      | `FabricatorHandle`      |
| `commsStations()`    | `commsStation(entity?)`   | `CommsStationHandle`    |
| `signs()`            | `sign(entity)`            | `SignHandle`            |
| `generators()`       | `generator(entity)`       | `GeneratorHandle`       |
| `cargoHatches()`     | `cargoHatch(entity)`      | `CargoHatchHandle`      |
| `cargoEjectors()`    | `cargoEjector(entity)`    | `CargoEjectorHandle`    |
| `cannons()`          | `cannon(entity)`          | `CannonHandle`          |
| `thrusters()`        | `thruster(entity)`        | `ThrusterHandle`        |
| `helms()`            | `helm(entity)`            | `HelmHandle`            |
| `doors()`            | `door(entity)`            | `DoorHandle`            |
| `spawnPoints()`      | `spawnPoint(entity)`      | `SpawnPointHandle`      |
| `shieldProjectors()` | `shieldProjector(entity)` | `ShieldProjectorHandle` |
| `fluidTanks()`       | `fluidTank(entity)`       | `FluidTankHandle`       |
| `expandoBoxes()`     | `expandoBox(entity)`      | `ExpandoBoxHandle`      |

Navigation and comms lookups can choose an available handle when the entity argument is omitted, or return `null`. Other lookups create a handle without guaranteeing existence. Check `exists()`/`state` before using it. `machines.state()` and `.raw()` return grouped summaries, including pusher beams and shield generators.

Every machine handle inherits entity reads and actions. `.state` is a nullable machine summary property, not a method. `open(options?, command?)` sends player-use input and returns the client; it does not wait for a panel. Full summary fields are in the [handle and summary declarations](../src/index.d.ts).

## Targeting and completion

The server enforces range, permissions, and game state. Helpers neither move the player nor grant access.

| Action family                                               | Target                            | Completion                                            |
|-------------------------------------------------------------|-----------------------------------|-------------------------------------------------------|
| Loader/pusher/nav/hatch/ejector config, generator puzzle    | Entity embedded in config payload | Sent/queued                                           |
| Launcher angle/power, fabricator controls, sign text, comms | Active server interaction         | Sent/queued; the handle's ID is not in these messages |
| `open()`                                                    | Entity focus in player input      | Sent/queued, not panel-ready                          |
| Tip menu operations                                         | Requested current-world entity    | See menu contracts below                              |
| Door/spawn `setRank()`                                      | Menu target                       | Requested rank observed in model                      |

For active-interaction actions, first open/use the intended machine and wait for the relevant panel or interaction state. The library does not offer a general `waitForPanel()` helper. Calling `someLauncher.setAngle()` alone does not select `someLauncher`.

## Context menus and access

```ts
client.tips.current: TipList | null;
client.tips.open(entity: number | EntityHandle, options?: TipOptions): Promise<TipList>;
client.tips.select(option: number | string, command?: Command): DredlessClient;
client.tips.choose(entity: number | EntityHandle, option: number | string,
                   options?: TipOptions): Promise<DredlessClient>;
client.tips.close(options?: TipOptions): Promise<DredlessClient>;
entity.openTips(options?: TipOptions): Promise<TipList>;
door.setRank(rank: ShipPlayerRank, options?: TipOptions): Promise<DredlessClient>;
spawnPoint.setRank(rank: ShipPlayerRank, options?: TipOptions): Promise<DredlessClient>;

interface TipOptions { timeout?: number; command?: Command; }
interface TipList {
  readonly entity: number | null;
  readonly world: number | null;
  readonly filter: number | null;
  readonly x: number;
  readonly y: number;
  readonly options: readonly string[];
}
```

**Fragment:** inspect and dismiss a visible door's menu:

```js
const door = client.currentShip()?.machines.doors()[0];
if (!door) throw new Error("No door is currently decoded");
const menu = await door.openTips();
console.log(menu.options);
await client.tips.close();
```

- `open()` waits for a nonempty menu. A target must exist on this client, be in the current world, and have a position.
- `select()` accepts an exact displayed string or zero-based index. It sends the selection and clears the local menu without waiting for its effect.
- `choose()` opens a fresh menu and sends a selection. Its promise does not confirm the selected action finished.
- `close()` uses the normal dismissal click and waits for an empty tip list. With no menu, it resolves without sending.
- Door/spawn `setRank()` accepts `"guest"`, `"crew"`, `"captain"`, or `0`, `1`, `3`. It opens the appropriate menu, selects the restriction, and waits for model confirmation. It sends nothing if the rank already matches. This controls entity access, not a player's crew rank.

Timeout defaults to **5000 ms per response**; a rank change can involve a menu wait and a model wait. Only one asynchronous tip operation can run per client; overlaps reject. Disconnect, timeout, invalid menu choices, and invalid targets reject. Raw context-menu commands or another actor using the same socket can interfere with these operations.

The server does not include the target ID in a tip list. Dredless infers it from the pending request; unsolicited menus have `entity: null`. Empty menus still emit `tip-list` and set `current` to `null`. Repeated menus are not repeated action acknowledgments.

## Loaders

```ts
loader.configure(config?: LoaderConfig): DredlessClient;
loader.configureFull(config?: LoaderFullConfig): DredlessClient;
loader.copy(config?: LoaderFullConfig): DredlessClient;
loader.setPickPlace(pick: LoaderPosition, place: LoaderPosition, config?: LoaderConfig): DredlessClient;
loader.setPriority(priority: LoaderPriority, config?: LoaderConfig): DredlessClient;
loader.setStack(stack: number, config?: LoaderConfig): DredlessClient;
loader.setCycle(seconds: number, config?: LoaderConfig): DredlessClient;
loader.setRequireOutput(value: boolean, config?: LoaderConfig): DredlessClient;
loader.setWaitForStack(value: boolean, config?: LoaderConfig): DredlessClient;
loader.setFilterMode(mode: LoaderFilterMode): DredlessClient;
loader.setFilterItems(slots?: Array<number | null | undefined>): DredlessClient;

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

| Input              | Values/units                                                                                                                                           |
|--------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `LoaderPosition`   | `TopLeft`, `TopMiddle`, `TopRight`, `MiddleLeft`, `MiddleRight`, `BottomLeft`, `BottomMiddle`, `BottomRight` constants; values such as `"middle-left"` |
| `LoaderPriority`   | `Low`/`Normal`/`High`, values `"low"`/`"normal"`/`"high"`                                                                                              |
| `stack`            | Non-negative integer item count                                                                                                                        |
| `cycle`            | Seconds, at least 1; rounded to 20 ticks/second, at most 65535 ticks                                                                                   |
| `LoaderFilterMode` | `AllowAll`, `BlockFilter`, `AllowFilter`, `BlockAll`; values `"allow-all"`, `"block-filter"`, `"allow-filter"`, `"block-all"`                          |
| `filterSlots`      | Three item IDs (`0–65535`); omitted/null entries encode as zero; entries after the first three are not encoded                                         |

State uses numeric codes: positions follow the table order above (`0–7`), priority is `-1/0/1`, and filter mode is `0–3`. Use `pickName`, `placeName`, `priorityName`, and `filterModeName` on `.state` for names. Component defaults when omitted by the server are middle-left → middle-right, normal priority, stack 16, cycle 1 second, both flags false.

**Current limitation:** high-level configuration merges numeric decoded enum values into builders that accept named enum inputs. Supply `pick`, `place`, and `priority` explicitly for configuration/setter/copy calls; also supply `filterMode` for full config/copy. Numeric state fields cannot be passed straight back as configuration enums. This applies even to a scalar setter such as `setCycle(seconds, config)`.

**Fragment:** all enum fields are explicit:

```js
import {LoaderPosition, LoaderPriority} from "dredless/node";

const loader = client.currentShip()?.machines.loaders()[0];
if (!loader) throw new Error("No loader is currently decoded");
loader.configure({
  pick: LoaderPosition.MiddleLeft,
  place: LoaderPosition.MiddleRight,
  priority: LoaderPriority.Normal,
  cycle: 5,
  stack: 12
});
```

`configureFull()` includes filter mode/items; `configure()` does not. `.state` also exposes held-item, active, and progress values. These calls return immediately; observe `model` for changes. Copy writes clipboard configuration, not a local object clone.

## Pushers

```ts
pusher.configure(config?: PusherConfig): DredlessClient;
pusher.setAngle(angle: number, config?: PusherConfig): DredlessClient;
pusher.setSpeed(speed: number, config?: PusherConfig): DredlessClient;
pusher.setLength(length: number, config?: PusherConfig): DredlessClient;
pusher.setMode(mode: PusherMode, config?: PusherConfig): DredlessClient;
pusher.setFilteredMode(mode: PusherMode, config?: PusherConfig): DredlessClient;
pusher.setFilterInventory(value: boolean, config?: PusherConfig): DredlessClient;
pusher.setFilterItems(slots?: Array<number | null | undefined>): DredlessClient;

interface PusherConfig {
  mode?: PusherMode;
  filteredMode?: PusherMode;
  angle?: number;
  speed?: number;
  length?: number;
  filterInventory?: boolean;
}
```

`PusherMode.Push`/`Pull`/`DoNothing` are `"push"`/`"pull"`/`"do-nothing"`; state codes are `0/1/2`. Supply **both mode fields explicitly** to configuration and scalar setter calls because numeric decoded/default modes otherwise fail the named-enum builder validation.

Angle is the UI's degree value. Length is maximum beam distance in game units; speed is the UI's target movement speed, not a guarantee of actual object speed. These values are not browser pixels or a requested number of blocks. The target-speed control does not compensate for gravity, friction, or other forces.

The compact encoder requires finite numbers; integer values must be in `0–65535`. Fractional values use float32 encoding and do not have the same integer range check; that is not evidence the server accepts arbitrary fractions/ranges. Server rules still apply. Defaults without decoded values are angle 0, speed 20, length 1000, filterInventory false.

**Fragment:**

```js
const pusher = client.currentShip()?.machines.pushers()[0];
if (!pusher) throw new Error("No pusher is currently decoded");
pusher.configure({mode: "push", filteredMode: "pull", angle: 90, speed: 20, length: 30});
```

`pusher.beam` exposes observed beam state: `active`, mode/name, and current length. It is distinct from the configured maximum length. `filterInventory` tests inventories of objects such as players and expando-boxes. The three filter item slots use the same item-ID convention as loaders.

## Launchers

```ts
launcher.setAngle(degrees: number): DredlessClient;
launcher.setPower(power: number): DredlessClient;
```

Both act on the **active launcher interaction**, not an entity ID embedded in the command. Open/use the intended launcher first and establish that interaction before setting it. There is no promise that `open()` has completed that step. A handle by itself cannot configure an arbitrary launcher remotely.

Angle inputs are finite numbers, rounded to an integer and normalized into `0–359` degrees. Power must be an integer in `0–30`. These are sent immediately, without success confirmation.

Read `.state.angleDegrees`, `.state.angleRadians`, or `.state.angleRaw`. The angle is the launcher's decoded angle; the API does not add an inferred mounting rotation. Power is not exposed in `LauncherSummary`.

## Navigation units

```ts
nav.configure(config?: NavigationUnitConfig): DredlessClient;
nav.copy(config?: NavigationUnitConfig): DredlessClient;
nav.paste(config?: NavigationUnitConfig): DredlessClient;
nav.setDestination(destination: number, config?: NavigationUnitConfig): DredlessClient;
nav.setAutoWarp(config?: NavigationUnitConfig): DredlessClient;
nav.startWarp(config?: NavigationUnitConfig): DredlessClient;
nav.cancelWarp(config?: NavigationUnitConfig): DredlessClient;

interface NavigationUnitConfig {
  destination?: number;
  page?: number;
  warp?: boolean | "start" | "idle" | "cancel";
  autoWarpOnShieldFailure?: boolean;
  autoWarpOnNoCaptains?: boolean;
}
```

Destination is the game destination ID, not a ship entity ID. The encoded destination and page are integers in `0–255`; that byte range does not imply every destination ID is a valid game zone. Supply it explicitly if no current configuration is decoded. High-level methods fill other omitted fields from available state. Builders require a destination and can have stricter types than these high-level methods.

`setAutoWarp()` updates the supplied automatic-warp flags. `startWarp()`/`cancelWarp()` send warp actions; they do not await warp completion. Read `.state.destinationName`, auto-warp flags, and the ship's warp summary for observed state. `copy()`/`paste()` use the server's clipboard/configuration protocol.

## Fabricators

```ts
fabricator.panel(): PuiEvent | null;
fabricator.add(itemId: number, count?: number, index?: number): DredlessClient;
fabricator.sub(itemId: number, count?: number, index?: number): DredlessClient;
fabricator.clearQueue(): DredlessClient;
fabricator.toggleRepeat(): DredlessClient;
fabricator.lockResource(row: number): DredlessClient;
fabricator.unlockResource(row: number): DredlessClient;
fabricator.eject(row: number): DredlessClient;
```

These control the active fabricator UI. `add()` defaults to count 1/index -1; `sub()` defaults to count 1/index 0. Queue indexes and resource rows refer to the current UI, not entity IDs. Read the relevant panel first. All methods send immediately; observe PUI/model updates for results.

`.state`, `.progress`, `.active`, and `.craftingItem` expose decoded status. `FabricatorType` exports the named values `Starter`, `Munitions`, `Engineering`, and `Equipment` (lowercase string values) for fabricator categories. `panel()` reads the entity-keyed cached PUI; a cached panel does not itself prove that machine remains the active interaction.

## Signs and comms

```ts
sign.setText(text?: string, mode?: SignDisplayMode): DredlessClient;
commsStation.panel(): CommsEvent | null;
commsStation.sendMessage(message?: string): DredlessClient;
```

Sign text and comms messages apply to their active interactions. Establish the intended interaction before writing. Pass an explicit named sign mode: the high-level sign setter currently defaults to numeric `0`, which the named-mode builder rejects. `SignDisplayMode.Always`, `WhenNear`, and `OnHover` have values `"always"`, `"when-near"`, and `"on-hover"`; read `.text`/`.mode` for decoded sign state. Sending a message/text is not a confirmed update.

## Hatches, ejectors, and clipboard settings

```ts
hatch.configure(config?: {filterMode?: LoaderFilterMode; filterSlots?: Array<number | null | undefined>}): DredlessClient;
hatch.copy(config?: {filterMode?: LoaderFilterMode; filterSlots?: Array<number | null | undefined>}): DredlessClient;
hatch.paste(config?: {filterMode?: LoaderFilterMode; filterSlots?: Array<number | null | undefined>}): DredlessClient;
hatch.setFilterMode(mode: LoaderFilterMode): DredlessClient;
hatch.setFilterItems(slots?: Array<number | null | undefined>): DredlessClient;

ejector.setDirection(direction: FixedAngleDirection): DredlessClient;
ejector.copy(direction?: FixedAngleDirection): DredlessClient;
ejector.paste(direction?: FixedAngleDirection): DredlessClient;
```

Hatch full configuration/copy/paste also needs an explicit named `filterMode` to avoid the numeric-default enum limitation. Filter slots are three item IDs. Read hatch `.openFraction`/state for observed position.

`FixedAngleDirection.Right`, `Up`, `Left`, and `Down` are `"right"`, `"up"`, `"left"`, and `"down"`. Their wire order is **right 0, up 1, left 2, down 3**, which differs from [gravity](MANAGEMENT.md#gravity). Ejector copy/paste defaults to right; these operations send config/clipboard commands, not local copies.

Additional direct client clipboard helpers are `setGeneratorClipboardDirection(direction)`, `setExpandoClipboardAngle(degrees)`, and `setClipboardFixedAngle(target, direction)`. Expando angles must be integer degrees in `0–359`. Use [protocol/config builders](PROTOCOL.md#configuration-builders) for more clipboard controls; setters return immediately.

## Generators and read-only machine state

```ts
generator.solvePuzzle(solution: string | number): DredlessClient;
```

Supply the solution as a digit string (at most 255 encoded bytes). Numeric arguments are converted to solution text; they are **not** interpreted as maze seeds, and cannot preserve leading zeros. Prefer strings. This targets the generator entity and sends without confirmation. `.state.puzzleSeed` and `.state.puzzleSolution` expose available puzzle data; [maze helpers](PROTOCOL.md#generator-maze-helpers) can compute a solution from a seed without sending.

| Handle           | Useful reads                                                             |
|------------------|--------------------------------------------------------------------------|
| Cannon           | Ammo, charge/spin/recoil, `relativeAngleRadians`, `absoluteAngleRadians` |
| Thruster         | `.state`                                                                 |
| Helm             | `.state`, `.occupied`                                                    |
| Shield projector | `.state`, `.active`                                                      |
| Fluid tank       | `.state`, `.amount`                                                      |
| Expando-box      | `.state`, `.item`, `.count`                                              |
| Generator        | Shield-generator `.state`                                                |
| Ejector          | `.state`, `.active`, `.progress`                                         |

Cannon relative angle is radians from the mount. Absolute angle is ship-coordinate radians normalized to `[0, 2π)`; it needs both aim and mounting rotation. Missing inputs produce `null`. These fields replace raw `aim`; they do not expose a cannon aim setter.

Summary progress, counts, health, occupancy, and raw model records vary by component; use the component's [declared summary](../src/index.d.ts) rather than assuming all machines share a progress scale or health convention.
