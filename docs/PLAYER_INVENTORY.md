# Player input and inventory

[Documentation index](README.md) · [Machines](MACHINES.md) · [API reference](API_REFERENCE.md)

## Contents

- [Read the player](#read-the-player)
- [Send input](#send-input)
- [Persistent input settings](#persistent-input-settings)
- [Read inventory](#read-inventory)
- [Move and equip items](#move-and-equip-items)
- [Blueprints](#blueprints)
- [Chat and comms](#chat-and-comms)

## Read the player

```ts
client.player.current(): PlayerSummary | null;
client.player.entity(): EntityHandle | null;
client.player.name(): string | null;
client.player.rank(): CurrentPlayerRank;
```

`rank()` returns `{shipRank, subrank, isCaptain, patronTier}`. `shipRank` uses names such as `"guest"`, `"crew"`, or
`"captain"`; it can be `null` before local-player state is known. A WebSocket session ID (`sid`) is not the player's
entity ID. Management's `refId` is another identifier again.

## Send input

These methods return the client after sending or queueing input, without waiting for action success:

```ts
client.player.move(vector?: {x?: number; y?: number}, command?: Command): DredlessClient;
client.player.aim(point?: {x?: number; y?: number; mx?: number; my?: number}, command?: Command): DredlessClient;
client.player.action(flags?: Command, command?: Command): DredlessClient;
client.player.useEntity(entity: EntityRef, options?: {invSlot?: number; hold?: boolean},
                         command?: Command): DredlessClient;
client.player.useHeldItem(options?: {invSlot?: number; hold?: boolean}, command?: Command): DredlessClient;
client.player.placeHeldItem(options?: {invSlot?: number; hold?: boolean}, command?: Command): DredlessClient;
client.player.rotateHeldItem(options?: {invSlot?: number; hold?: boolean}, command?: Command): DredlessClient;
client.player.selectSlot(invSlot?: number, command?: Command): DredlessClient;
```

Movement `x`/`y` are input axes; aiming supplies game-coordinate `mx`/`my` (`x`/`y` are accepted by the aim helper).
`invSlot` defaults to `0` and `hold` to `true` for use/rotate helpers. These calls do not implement pathfinding, range
checks, or an automatic input loop.

Each send builds a complete command: unspecified command fields are defaulted, not inherited from the previous action.
Persistent settings below are the exception. If you need movement and aim/action in the same input, supply the other
fields through `command` instead of assuming separate sends merge.

**Fragment:** send combined input, then later send an explicit stop:

```js
client.player.move({x: 1, y: 0}, {mx: 10, my: 5});
// When the application decides movement should stop:
client.player.move({x: 0, y: 0});
```

`Command` exposes input flags (`jump`, `drop`, `act1`, `act2`, held/alternate variants), coordinates, inventory slot,
entity focus, menu selection, view settings, and drag payloads. Use [the declared Command shape](../src/index.d.ts) for
the full list; signed packet construction is described in [protocol tools](PROTOCOL.md#commands-and-payloads).

## Persistent input settings

```ts
client.player.inputSettings(): CurrentInputSettings;
client.player.setInputSettings(settings?: InputSettings, options?: {send?: boolean}): DredlessClient;
client.player.setView(width: number, height: number, options?: {send?: boolean}): DredlessClient;
client.player.setScreenSize(width: number, height: number, options?: {send?: boolean}): DredlessClient;
client.player.setWrenchMode(mode: WrenchMode, options?: {send?: boolean}): DredlessClient;
client.player.setTurretMode(mode: TurretMode, options?: {send?: boolean}): DredlessClient;
```

`InputSettings` accepts `wrenchMode`, `turretMode`, `viewWidth`, `viewHeight`, `screenWidth`, and `screenHeight`. View
sizes must be positive finite numbers; screen sizes must be positive integers. `send` defaults to `true`; `false` only
updates defaults for later commands.

| Constant     | Values                                             |
|--------------|----------------------------------------------------|
| `WrenchMode` | `DropAllItems`, `GrabPrimaryItems`, `GrabAllItems` |
| `TurretMode` | `ContinuousFire`, `VolleyFire`                     |

The constants' values are lowercase hyphenated names such as `"grab-primary-items"`. Defaults are grab-primary-items and
continuous-fire. These settings persist across input sends; ordinary movement/action fields do not.

## Read inventory

```ts
client.inventory.state(): InventoryState;
client.inventory.hotbarSize(): number;
client.inventory.allSlots(): InventorySlotHandle[];
client.inventory.hotbarSlots(): InventorySlotHandle[];
client.inventory.equipmentSlots(): Record<EquipmentSlot, InventorySlotHandle>;
client.inventory.slot(ref: InventorySlotRef): InventorySlotHandle;
client.inventory.findItem(itemId: number, options?: {area?: InventoryArea}): InventorySlotHandle | null;
client.inventory.findItems(itemId: number, options?: {area?: InventoryArea}): InventorySlotHandle[];
client.inventory.firstEmpty(options?: {area?: InventoryArea}): InventorySlotHandle | null;

type InventoryArea = "all" | "hotbar" | "equipment";
type InventorySlotRef = number | EquipmentSlot | InventorySlotHandle | InventorySlotSnapshot;
```

The normalized state has `hotbarSize`, `slots`, `hotbar`, and an `equipment` object. Hotbar size comes from the protocol
and is independent of the fixed equipment indexes.

| `EquipmentSlot` key | Value     | Absolute slot |
|---------------------|-----------|---------------|
| Head                | `"head"`  | 16            |
| Face                | `"face"`  | 17            |
| Body                | `"body"`  | 18            |
| Back                | `"back"`  | 19            |
| Hands               | `"hands"` | 20            |
| Feet                | `"feet"`  | 21            |

A slot handle exposes `index`, `kind`, `equipmentSlot`, `itemId`, `itemName`, `count`, `empty`, `exists()`, and
`snapshot()`. A slot snapshot is a frozen copy or `null`. Slot handles are live reads; no item is guaranteed to be
present at index zero.

## Move and equip items

```ts
client.inventory.move(source: InventorySlotRef, target: InventorySlotRef,
                      options?: {split?: boolean}, command?: Command): DredlessClient;
client.inventory.equip(source: InventorySlotRef, equipmentSlot?: EquipmentSlot,
                       options?: {split?: boolean}, command?: Command): DredlessClient;
client.inventory.unequip(equipmentSlot: EquipmentSlot, target?: InventorySlotRef,
                         options?: {split?: boolean}, command?: Command): DredlessClient;
client.inventory.select(slot: InventorySlotRef, command?: Command): DredlessClient;

slot.moveTo(target: InventorySlotRef, options?: {split?: boolean}, command?: Command): DredlessClient;
slot.equip(equipmentSlot?: EquipmentSlot, options?: {split?: boolean}, command?: Command): DredlessClient;
slot.unequip(target?: InventorySlotRef, options?: {split?: boolean}, command?: Command): DredlessClient;
slot.select(command?: Command): DredlessClient;
```

These are the ordinary call forms; option-object overloads are in the [declarations](../src/index.d.ts). Omit
`equipmentSlot` to infer it from the source item schema. Inference throws for an empty slot or an item not classified as
equipment. Unequip targets default to slot `0`; check that destination before moving items.

All actions send input and return immediately. Observe `inventory` for the resulting state. A server can reject the move
even when local argument validation succeeds.

**Fragment:** `equipmentItemId` must be an actual equipment item ID your application selected:

```js
const source = client.inventory.findItem(equipmentItemId, {area: "hotbar"});
if (!source) throw new Error("Requested item is not in the hotbar");
source.equip();
```

## Blueprints

```ts
interface BlueprintPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  source: string;
}

client.player.placeBlueprint(placement: BlueprintPlacement,
  options?: {invSlot?: number; hold?: boolean; mx?: number; my?: number},
  command?: Command): DredlessClient;
```

Supply a real blueprint source string and matching dimensions. `x`/`y` must be finite and width/height positive
integers; runtime builders also accept protocol aliases `w`/`h`. The helper sends the blueprint placement message and
uses the selected inventory slot, aiming at the placement coordinates unless overridden. The inventory item, range,
permissions, and game rules must allow placement. There is no placement-success promise.

`buildBlueprintPlacementMessage()` only builds the message; `client.net.sendBlueprintPlacement()` sends it without the
player-use step. Blueprint preview state is available as an entity feature; it is not proof a placement completed.

## Chat and comms

```ts
client.sendChatMessage(message?: string): DredlessClient;
client.sendCommsMessage(message?: string): DredlessClient;
commsStation.sendMessage(message?: string): DredlessClient;
```

Chat uses a chat protocol message. Comms targets the active comms interaction; a station handle's send method does not
include its ID in that message. Establish the interaction first and observe `comms`/`chat` events. Formatting and
outbound builders are listed in [protocol tools](PROTOCOL.md).
