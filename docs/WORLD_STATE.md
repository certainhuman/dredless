# World and entity reads

[Documentation index](README.md) · [Machines](MACHINES.md) · [Events](EVENTS.md)

## Contents

- [Choose a world](#choose-a-world)
- [Entities and features](#entities-and-features)
- [Machine and other collections](#machine-and-other-collections)
- [Nearby ships](#nearby-ships)
- [Live reads and snapshots](#live-reads-and-snapshots)
- [Coordinates and incomplete data](#coordinates-and-incomplete-data)

## Choose a world

```ts
client.currentShip(): ShipDomain | null;
client.ship(): ShipDomain | null; // Alias of currentShip().
client.overworld(): OverworldDomain | null;
client.world(id: number): WorldDomain | null;
client.currentPlayerEntity(): EntityHandle | null;
```

The ship world describes its interior. The overworld contains ship entities and surrounding objects. Nearby ships may be
represented in the overworld without their interiors being decoded. An entity ID is meaningful only together with its
world.

A `WorldDomain` exposes `id`, `exists()`, `entities`, `machines`, `players`, `blocks`, and `materials`, plus
`snapshot(options?)`. A `ShipDomain` adds `metadata`, `entity()`, and `overworldEntity`. These refer to the ship's
associated overworld entity when available, not its local player.

**Fragment:** read what is available now:

```js
const ship = client.currentShip();
if (ship) {
  console.log(ship.id, ship.metadata);
  console.log(ship.players.all());
}
```

World domains capture a scope. Reacquire a current-ship domain when changing ships rather than assuming an old handle
follows every future world transition.

## Entities and features

```ts
world.entities.all(): EntityHandle[];
world.entities.get(entity: EntityRef): EntityHandle;
world.entities.snapshots(): EntitySnapshot[];
world.entities.states(): EntitySnapshot[]; // Alias of snapshots().

type EntityRef = number | EntityHandle | EntitySummary | EntityDebugSummary;

entity.exists(): boolean;
entity.snapshot(): EntitySnapshot | null;
entity.is(type: string): boolean;
entity.has(feature: string): boolean;
entity.feature(feature: string): unknown | null;
entity.as(type: string): MachineHandle | null;
entity.openTips(options?: TipOptions): Promise<TipList>;
entity.use(options?: {invSlot?: number; hold?: boolean}, command?: Command): DredlessClient;
```

`get()` constructs a lightweight live handle; it does not validate existence. Reads such as `id`, `type`, `position`,
`health`, and `features` resolve against currently decoded state. `entity.entity` is a deprecated alias for `id`.

Use feature checks for generic behavior, or narrow to machine-specific handles with `asLoader()`, `asPusher()`,
`asLauncher()`, `asNavigationUnit()`, `as("fabricator")`, `asCommsStation()`, `asSign()`, `asGenerator()`,
`asCargoHatch()`, `asCargoEjector()`, `asCannon()`, `asThruster()`, `asHelm()`, `asDoor()`, `asSpawnPoint()`,
`asShieldProjector()`, `asFluidTank()`, or `asExpandoBox()`.

**Fragment:** inspect an actual decoded entity instead of assuming a particular ID exists:

```js
const entity = client.currentShip()?.entities.all().find((item) => item.has("loader"));
const loader = entity?.asLoader();
if (loader) console.log(loader.id, loader.state);
```

`EntitySnapshot` includes `id`, `entity`, `type`, `features`, `position`, `rotation`, and methods `is`, `has`, and
`feature`. Component data is available through `feature()`. Generic summaries contain `transform`, footprint/label/kind
metadata, and typed components. See `EntitySummary`, `EntityContentsSummary`, and component summary types in
the [declarations](../src/index.d.ts).

## Machine and other collections

`world.machines` is the typed entrypoint for machines. [Machine reference](MACHINES.md#find-a-machine) lists every
collection and special lookup behavior.

```ts
world.machines.state(): MachineSummary;
world.machines.raw(): MachineSummary; // Alias of state().
world.players.all(): PlayerSummary[];
world.players.current(): PlayerSummary | null;
world.blocks.all(): BlockSummary[];
world.blocks.at(x: number, y: number): BlockSummary | null;
world.materials.all(): MaterialSummary[];
```

`MachineSummary` groups arrays such as `loaders`, `pushers`, `pusherBeams`, `launchers`, `cannons`, and `doors`. Use it
for bulk display; use handles for actions. Raw/summary objects should be treated as read-only even when JavaScript does
not freeze them.

Materials summarize decoded blocks; they are not an authoritative ship inventory. A missing collection or component can
reflect incomplete decoding, not an absent server object.

## Nearby ships

```ts
client.overworld()?.ships(options?: ShipReadOptions): ShipHandle[];
client.overworld()?.shipByHex(hexCode: string, options?: ShipReadOptions): ShipHandle | null;
client.overworld()?.shipByEntity(entity: EntityRef, options?: ShipReadOptions): ShipHandle | null;

interface ShipReadOptions {
  includeWorld?: boolean;  // true
  includeTiles?: boolean;  // false
  includeModel?: boolean;  // false
  includeBlocks?: boolean; // false
  sort?: "distance" | null;
}

shipHandle.snapshot(): ShipReadSummary;
shipHandle.world(): WorldDomain | null;
```

A ship handle exposes `entity`, `name`, `hexCode`, `distance`, `worldId`, and `hasWorldData`. Its summary includes
position, thrust, shield, warp, control data, and optionally a decoded `world`. Distance is measured between available
overworld transforms; it is `null` when those positions are missing.

**Fragment:**

```js
const ships = client.overworld()?.ships({includeWorld: false, sort: "distance"}) ?? [];
for (const ship of ships) console.log(ship.hexCode, ship.name, ship.distance);
```

`includeWorld` includes data already in the client; it does not fetch another ship's interior. `hasWorldData` describes
the returned summary with the chosen options. Ship read handles hold a summary from the read that created them; re-query
for a fresh list/summary after updates.

## Live reads and snapshots

| API                                              | Semantics                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------|
| Entity/machine handle properties                 | Resolve against current decoded state                                         |
| `entity.snapshot()`, `entities.snapshots()`      | Cloned, frozen entity snapshots, cached by source-summary identity            |
| Machine `.state`, collection `.state()`/`.raw()` | Summary reads; no universal immutability guarantee                            |
| `shipHandle.snapshot()`                          | Returns the summary held by that ship read handle                             |
| `world.snapshot()` / `client.state()`            | Aggregate snapshots with some copied arrays and some shared nested references |

Do not mutate returned state to configure the server. Use action/configuration methods. For historical records, select
the serializable fields you need and clone those fields yourself. Client/world snapshots are not a promise of deep
immutability.

```ts
world.snapshot(options?: {
  includeTiles?: boolean;
  includeModel?: boolean;
  includeBlocks?: boolean;
}): WorldSnapshot | null;
```

Tiles, raw model tables, and block materialization are opt-in because they can be large. `includeModel` includes raw
tables; it does not mean ordinary entity/machine summaries were otherwise missing. For direct model snapshots, the
corresponding raw-table option is `includeTables`.

The client also retains compatibility reads such as `client.entities(scope?)`, `client.entity(id, scope?)`, and
`client.shipWorld(options?)`. Prefer scoped domains for new code. Scopes are `"ship"`, `"current"`, `"overworld"`, or a
numeric world ID.

## Coordinates and incomplete data

Positions and distances are game/world coordinates, not browser pixels. A ship interior and the overworld are different
coordinate spaces. Raw transform `q*` fields are decoder internals; read normalized transforms and the explicitly named
angle fields instead.

Angle inputs/outputs are not uniform across all APIs: cannon outputs are radians, launcher setters take degrees, and
discrete direction enums have operation-specific wire mappings. [Machines](MACHINES.md) documents each one.

Readiness does not guarantee all component tables, a local player, a panel, or another ship's interior. Watch `model`/
`world` events, tolerate missing fields, and inspect [decode errors](PROTOCOL.md#debug-domains-and-state-classes) when
apparently present objects cannot be read.
