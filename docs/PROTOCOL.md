# Protocol tools and debugging

[Documentation index](README.md) · [Client networking](CLIENT.md#send-commands-and-messages) · [API reference](API_REFERENCE.md)

## Contents

- [Import map](#import-map)
- [Commands and payloads](#commands-and-payloads)
- [Management builders](#management-builders)
- [Configuration builders](#configuration-builders)
- [Generator maze helpers](#generator-maze-helpers)
- [HTTP and invite tools](#http-and-invite-tools)
- [Debug domains and state classes](#debug-domains-and-state-classes)
- [Decoding limitations](#decoding-limitations)

## Import map

Prefer high-level domains when implementing game actions. These tools are for integrations, payload construction, capture analysis, and offline decoding. Check the subpath's declarations for full overloads and constants.

| Import                                                                          | Main exports                                                     | Declaration                                                                                    |
|---------------------------------------------------------------------------------|------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| `dredless/protocol`                                                             | Frame/world decoders and shared outbound builders                | [protocol/index.d.ts](../src/protocol/index.d.ts)                                              |
| `dredless/protocol/msgpack`                                                     | `encodeMsgpack`, `decodeMsgpack`                                 | [codec/msgpack.d.ts](../src/protocol/codec/msgpack.d.ts)                                       |
| `dredless/protocol/commands`                                                    | `buildSignedCommandPacket`                                       | [commands.d.ts](../src/protocol/outbound/commands.d.ts)                                        |
| `dredless/protocol/blueprint`                                                   | Blueprint placement builder/type constant                        | [blueprint.d.ts](../src/protocol/outbound/blueprint.d.ts)                                      |
| `dredless/protocol/comms`                                                       | Comms builder, rich-text flattening/normalization                | [comms.d.ts](../src/protocol/outbound/comms.d.ts)                                              |
| `dredless/protocol/inventory`                                                   | Drag/equip builders and slot normalization                       | [inventory.d.ts](../src/protocol/outbound/inventory.d.ts)                                      |
| `dredless/protocol/ship-management`                                             | Management builders, normalizers, action constants               | [ship-management.d.ts](../src/protocol/outbound/ship-management.d.ts)                          |
| `dredless/protocol/sign`                                                        | Sign builder/display-mode helpers                                | [sign.d.ts](../src/protocol/outbound/sign.d.ts)                                                |
| `dredless/protocol/ui-config`                                                   | Binary config/clipboard builders and enums                       | [ui-config.d.ts](../src/protocol/outbound/ui-config.d.ts)                                      |
| `dredless/game/generator-maze`                                                  | Maze generation/solution helpers                                 | [generator-maze.d.ts](../src/state/generator-maze.d.ts)                                        |
| `dredless/crypto/chacha`                                                        | `decryptPayload`                                                 | [chacha.d.ts](../src/crypto/chacha.d.ts)                                                       |
| `dredless/compression/lz4`                                                      | `decompressLz4Frame`                                             | [lz4.d.ts](../src/compression/lz4.d.ts)                                                        |
| `dredless/model`, `dredless/game/model`                                         | `ModelState`, `decodeModelData`                                  | [model/index.d.ts](../src/state/model/index.d.ts)                                              |
| `dredless/world`, `dredless/state`                                              | World/model state classes                                        | [world/index.d.ts](../src/state/world/index.d.ts), [state/index.d.ts](../src/state/index.d.ts) |
| `dredless/network`                                                              | Sessions, connections, discovery, ship/invite reads, disconnects | [network/index.d.ts](../src/network/index.d.ts)                                                |
| `dredless/servers`, `dredless/ships`, `dredless/connection`, `dredless/session` | Focused network APIs                                             | [package export map](../package.json)                                                          |

Runtime entrypoints re-export many shared builders, but not every low-level decoder or action constant. In particular, `decodeIncomingFrame()` belongs to `dredless/protocol`, not the root namespace. Importing from `node_modules/dredless/src/...` is unnecessary and bypasses the supported export map.

## Commands and payloads

```ts
encodeMsgpack(value: unknown): Uint8Array;
decodeMsgpack(bytes: Uint8Array | ArrayBuffer | number[]): unknown;
decodeIncomingFrame(data: string | Uint8Array | ArrayBuffer | number[]): unknown;
buildSignedCommandPacket(command: Command, sessionId: number): Uint8Array;
buildBlueprintPlacementMessage(placement: BlueprintPlacement): BlueprintPlacementMessage;
buildChatMessage(message?: string): ChatMessage;
buildCommsMessage(message?: string): CommsMessage;
buildSignTextMessage(text?: string, mode?: SignDisplayMode): SignTextMessage;
flattenRichText(value: unknown): string;
normalizeCommsEvent(event: unknown): CommsEvent;
```

`decodeIncomingFrame()` parses text as JSON and binary as MessagePack; it does not apply decoded packets to state. A model-bearing packet can still contain encrypted/compressed inner payloads.

`buildSignedCommandPacket()` returns the complete signed binary input frame. Ordinary message builders return decoded objects. UI config builders below return inner byte payloads. Keep these three representations distinct: `sendMessage()`/`sendRaw()` encode objects, while `send()` signs input and `sendUiConfig()` wraps a config payload.

```ts
buildInventoryDragCommand(source: number, target: number, split?: boolean): InventoryDragCommand;
buildEquipItemCommand(source: number, slot: EquipmentSlot, split?: boolean): InventoryDragCommand;
buildUnequipItemCommand(slot: EquipmentSlot, target?: number, split?: boolean): InventoryDragCommand;
normalizeEquipmentSlot(slot: EquipmentSlot): 16 | 17 | 18 | 19 | 20 | 21;
equipmentSlotName(slot: number): EquipmentSlot | null;
normalizeInventoryEvent(event: unknown): InventoryState;
normalizeSignDisplayMode(mode?: SignDisplayMode): 0 | 1 | 2;
signDisplayModeName(mode: number): SignDisplayMode | null;
```

Drag builders produce command fields to pass to input sending, not independent game messages. High-level [inventory methods](PLAYER_INVENTORY.md#move-and-equip-items) also accept slot handles and infer equipment locations.

## Management builders

These return `ShipManagementMessage` objects. They perform local argument validation but no I/O or response waiting:

```ts
buildShipManagementMessage(act: string, arg?: unknown, extra?: Record<string, unknown> | null): ShipManagementMessage;
buildShipPrivacyMessage(privacy: ShipPrivacy): ShipManagementMessage;
buildShipGravityMessage(direction: ShipGravityDirection): ShipManagementMessage;
buildSetPatronPerksMessage(enabled: boolean): ShipManagementMessage;
buildPlayerListMessage(): ShipManagementMessage;
buildInviteResetMessage(): ShipManagementMessage;
buildSaveShipMessage(): ShipManagementMessage;
buildShipRenameRequestMessage(): ShipManagementMessage;
buildShipRenameCommitMessage(name: string, color: string): ShipManagementMessage;
buildStarterRecoveryMessage(itemId: number): ShipManagementMessage;
buildSetPlayerRankMessage(refId: number, rank: ShipPlayerRank): ShipManagementMessage;
buildKickPlayerMessage(refId: number): ShipManagementMessage;
buildBanPlayerMessage(refId: number): ShipManagementMessage;
buildUnbanPlayerMessage(refId: number): ShipManagementMessage;
buildDemoteSelfMessage(): ShipManagementMessage;
```

`ShipManagementMessage` has `{type: 4, act, arg}` plus optional action-specific fields such as `rank` and `arg2`. The generic builder does not implement the action-specific permission/confirmation flows. Prefer [management methods](MANAGEMENT.md) for save, rename, invite reset, demotion, and recovery.

Normalization helpers:

```ts
normalizePrivacy(value: ShipPrivacy): 0 | 1;
normalizePlayerRank(value: ShipPlayerRank): 0 | 1 | 3;
normalizeGravityDirection(value: ShipGravityDirection): 0 | 1 | 2 | 3;
normalizeShipConfig(event: unknown): ShipConfig;
normalizeCaptainSubrank(event: unknown): CaptainSubrank;
normalizeShipPlayerList(event: unknown, previous?: ShipPlayerList | null,
                        captain?: CaptainSubrank | null): ShipPlayerList;
normalizeCrewLog(event: unknown, previous?: CrewLog | null): CrewLog;
```

Pass the inner session submessage, not the outer `{type: 25, submessage}` packet. Player-list/log normalizers merge with the previous normalized state; omitting it begins a fresh state. [Management](MANAGEMENT.md) describes their reset/amend/remove semantics. Action-name constants, `SHIP_MANAGEMENT_TYPE`, and `CREW_LOG_LENGTH` are exported by the management subpath.

## Configuration builders

All return `Uint8Array` payloads. Their configuration types and operational prerequisites are covered in [machines](MACHINES.md); these low-level functions do not merge cached state or open an interaction.

| Family           | Builder calls                                                                                                                                                                      |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Loader           | `buildLoaderConfigData(entity, config?)`, `buildLoaderFullConfigData(entity, config?)`, `buildLoaderFilterConfigData(entity, mode?)`, `buildLoaderFilterItemsData(entity, slots?)` |
| Pusher           | `buildPusherConfigData(entity, config?)`, `buildPusherFilterItemsData(entity, slots?)`                                                                                             |
| Navigation       | `buildNavigationUnitConfigData(entity, config)`, `buildNavigationUnitPasteConfigData(entity, config)`                                                                              |
| Hatch            | `buildCargoHatchFilterConfigData(entity, mode?)`, `buildCargoHatchFilterItemsData(entity, slots?)`, `buildCargoHatchFullConfigData(entity, config?)`                               |
| Ejector          | `buildCargoEjectorDirectionData(entity, direction)`, `buildCargoEjectorPasteConfigData(entity, direction)`                                                                         |
| Generator puzzle | `buildGeneratorMazePuzzleData(entity, solution)`                                                                                                                                   |

Clipboard payload builders:

- `buildLoaderClipboardConfigData(config?)`, `buildLoaderCopyConfigData(config?)`
- `buildNavigationUnitClipboardConfigData(config)`
- `buildCargoHatchCopyConfigData(config?)`
- `buildCargoEjectorCopyConfigData(direction)`, `buildCargoEjectorClipboardDirectionData(direction)`
- `buildGeneratorClipboardDirectionData(direction)`
- `buildExpandoClipboardAngleData(degrees)`
- `buildClipboardConfigData(target, commandName, values?)`
- `buildClipboardFixedAngleData(target, direction)`

Navigation builder config requires `destination`; hatch full/copy config contains `filterMode` and `filterSlots`. Generic clipboard values are `Iterable<number>`; `target` is a `ClipboardTarget` name or numeric selector. Full exact signatures and target aliases are maintained in [ui-config.d.ts](../src/protocol/outbound/ui-config.d.ts).

**Fragment:** `loader` is a live loader handle and `client` owns it. A complete explicit configuration avoids the current numeric-default enum limitation:

```js
import {buildLoaderConfigData} from "dredless/protocol/ui-config";

const payload = buildLoaderConfigData(loader.id, {
  pick: "middle-left", place: "middle-right", priority: "normal", cycle: 5, stack: 16
});
client.net.sendUiConfig(payload);
```

Named-enum validation and the numeric/default mismatch also affect low-level optional-config calls. Supply all required enum fields explicitly as described in [loaders](MACHINES.md#loaders), [pushers](MACHINES.md#pushers), and [hatches](MACHINES.md#hatches-ejectors-and-clipboard-settings).

## Generator maze helpers

```ts
generateGeneratorMaze(seed: number): GeneratorMaze;
solveGeneratorMazeSeed(seed: number): string;
maybeSolveGeneratorMazeSeed(seed: number | null | undefined): string | null;
```

Generation returns `{seed, width, height, cells, rows, solution}`. Each cell records coordinates, encoded value/hex/digit, wall flags, backtrack direction, and marker. Solving computes the solution string without network activity; the `maybe` form returns `null` for unusable input instead of requiring a known seed. Use a seed actually decoded for the target generator. To send a solution, call the generator handle's `solvePuzzle()`.

## HTTP and invite tools

Session/discovery signatures are in the [Node](NODE_API.md) and [browser](BROWSER_API.md) references. Additional named helpers include:

```ts
fetchInviteMetadata(invite: string | URL, options?: InviteFetchOptions): Promise<InviteMetadata>;
parseInviteMetadata(html: string): InviteMetadata;
createShipSpec(name?: string, color?: string): ShipSpec;
createInviteShipSpec(code: string): ShipSpec;
```

`InviteFetchOptions` accepts `includeColor` and `fetchImpl`. Invite metadata contains name, displayed ship ID, preview image URL, hostname, and invite code; optional color is CSS RGB sampled from the preview. The parser expects the invite page's metadata, including an invite URL, and may reject unrelated HTML.

Ship-spec helpers are available from `dredless/ships`; they construct objects without joining. The network subpath also exports discovery/resolution helpers; consult its re-export declarations when building custom connection flows.

## Debug domains and state classes

```ts
client.debug.packets(): unknown[];
client.debug.decodeErrors(): unknown[];
client.debug.worldStore(): WorldStore;
client.debug.modelTable(worldId: number, tableId: number): Map<number, ModelRecord>;
client.debug.modelRecord(worldId: number, tableId: number, entityId: number): ModelRecord | null;
client.debug.entities(scope?: ReadWorldScope): EntityDebugSummary[];
client.debug.entity(scope: ReadWorldScope, entity: EntityRef): EntityDebugSummary | null;
client.debug.puiPanels(): PuiEvent[];
client.debug.commsPanels(): CommsEvent[];
```

Debug reads expose retained/raw state, sometimes by reference. Do not mutate it while a live client is decoding. Capture history is bounded by [client retention options](CLIENT.md#construction-and-retention).

| Class        | Purpose                                      | Core methods                                                                                                                               |
|--------------|----------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `WorldStore` | Applies decoded packets into worlds          | `apply(packet)`, `get(id)`, `current()`, `shipWorld()`, `overworld()`, `snapshot(options?)`                                                |
| `WorldState` | Metadata, tiles, events, model for one world | `readMeta(packet)`, `decodeEncrypted(data)`, `entity(id)`, `entities()`, `table(id)`, `record(table, entity)`, `snapshot(options?)`        |
| `ModelState` | ECS records and derived summaries            | `apply(bytes)`, `table(id)`, `record(table, entity)`, `entities()`, `machines()`, `transforms()`, `snapshot(options?)`, `tablesSnapshot()` |

World snapshots can include tiles/model tables/blocks; model snapshots use `includeTables` and `includeBlocks`. Full constructors, read methods, and structures are in [world declarations](../src/state/world/index.d.ts) and [model declarations](../src/state/model/index.d.ts). Some direct implementation options are broader than their declared overloads.

Additional state APIs used in offline tooling:

```ts
worldStore.ids(): number[];
worldStore.currentShipEntity(): EntityDebugSummary | null;
worldState.addCommsBubble(packet: unknown): CommsBubbleSummary;
worldState.applyTile(value: unknown): Tile | null;
worldState.applyChunk(value: unknown): Tile[] | null;
worldState.setTile(tile: Tile): Tile;
worldState.normalizeTile(tile: Tile): Tile;
worldState.tileDefinition(material: number): TileDefinition | null;
modelState.itemHolders(): ItemHolderSummary[];
modelState.fabricators(): FabricatorSummary[];
modelState.players(): PlayerSummary[];
modelState.shipControls(): ShipControlSummary[];
modelState.shipMetadata(): ShipWorldMetadataSummary | null;
```

Tile/chunk setters update the local decoder state only; they are not server block-edit commands. `WorldStore.get(id)` creates a world when absent; use `.worlds.get(id)` to inspect without creating one. Read aggregate summaries through domains in ordinary live applications.

Binary tools include `decryptPayload(wireBytes, worldId, seed)`, `decompressLz4Frame(bytes)`, and `decodeModelData(bytes)`. The protocol aggregate also exposes inner world/model/chunk decoders. These expect the appropriate layer, seed, and world context; a captured WebSocket frame is not automatically a valid argument to a model decoder.

## Decoding limitations

A decoder can retain partial results while recording unsupported tags or malformed sections. Read `decode-error`, model errors, and the retained raw packet before concluding an entity/component is absent. Website parsers and protocol internals can change independently of this package.

Raw `ModelRecord` keys (`q20`, blobs, table IDs, and section tags) are implementation details. Prefer normalized public summaries for application code. Protocol research belongs in a local capture workflow; avoid encoding application behavior around guessed raw-field semantics when a typed field exists.
