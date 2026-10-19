# Event catalog

[Documentation index](README.md) · [Client lifecycle](CLIENT.md) · [API reference](API_REFERENCE.md)

## Contents

- [Ordering and listeners](#ordering-and-listeners)
- [Lifecycle and transport](#lifecycle-and-transport)
- [World updates](#world-updates)
- [Player and interaction updates](#player-and-interaction-updates)
- [Management updates](#management-updates)
- [Errors](#errors)

## Ordering and listeners

```ts
client.on(type: string, callback: (...args: any[]) => void): DredlessClient;
client.off(type: string, callback: (...args: any[]) => void): DredlessClient;
client.once(type: string, callback: (...args: any[]) => void): DredlessClient;
```

Callbacks run synchronously. Returned promises are not awaited, so handle errors inside async listeners. Keep frequent
model/packet listeners short. Ordinary listener exceptions are forwarded to an `"error"` listener when one exists;
otherwise they can interrupt dispatch. Errors encountered during packet processing can be recorded as decode errors.

Events are not replayed when you subscribe. Factory methods wait for readiness, so initial world, inventory, or
management events may have happened before you receive the client. Subscribe and also read the corresponding cache. For
earliest-event capture, construct a client from a [Connection descriptor](NODE_API.md#construct-a-client-yourself).

**Fragment:** keep a callback reference to remove an `on()` listener:

```js
const report = () => console.log(client.management.crewLog()?.entries.length ?? 0);
client.on("crew-log", report);
report();
// Later:
client.off("crew-log", report);
```

`once()` removes its wrapper before invoking it. `off()` expects the registered function identity; it does not cancel a
`once()` wrapper using the original callback. A manually emitted event does not update state or simulate an authentic
server response.

## Lifecycle and transport

| Event        | Callback arguments                                 | Timing/meaning                                                                  |
|--------------|----------------------------------------------------|---------------------------------------------------------------------------------|
| `attach`     | `(client)`                                         | Attached socket initialized; can fire during `attachWebSocket()`                |
| `open`       | `(client)`                                         | Socket marked connected; can fire during attachment                             |
| `ready`      | `(client)`                                         | Ready packet processed, `sid`/world set, queued writes flushed                  |
| `disconnect` | `(info: DisconnectInfo)`                           | Close cleanup completed; see [disconnects](CLIENT.md#disconnects)               |
| `close`      | Browser `(event, reason)` or Node `(code, reason)` | Raw close arguments, after `disconnect`                                         |
| `packet`     | `(packet)`                                         | Decoded inbound packet retained, before it is applied to world/management state |
| `command`    | `(command)`                                        | Signed input sent; no server acknowledgment implied                             |
| `message`    | `(message)`                                        | Decoded outgoing message encoded/sent; no server acknowledgment implied         |
| `bootstrap`  | `(message)`                                        | Initial outfit/bootstrap message sent by an owning client                       |
| `event`      | `(packet)`                                         | Inbound packet not handled by a more specific branch                            |

WebSocket errors are distinct from a later close. A `ready` event does not mean every state component is present. Raw
`packet` callbacks run before state application; read updated state from a specific update event instead.

## World updates

These events receive an update object with `.world` referencing the already-updated `WorldState`:

| Event           | Callback arguments | Important fields                                                              |
|-----------------|--------------------|-------------------------------------------------------------------------------|
| `world`         | `(update)`         | `update.world` with metadata applied                                          |
| `tiles`         | `(update)`         | `world`, `decoded`, `updates`, `errors`                                       |
| `model`         | `(update)`         | `world`, `result` with model changes, side events, command number, timing     |
| `comms-bubble`  | `(update)`         | `world`, `packet`, `bubble`                                                   |
| `world-removed` | See below          | World removed from store                                                      |
| `ack`           | `(ack)`            | `{world, commandNumber}`; latest advancing nonnegative command acknowledgment |

The current implementation emits `world-removed` twice: first with the world update object, then with its raw packet.
Handle that duplication if subscribing directly. It does not imply two removals.

`model` fires after world/model application but before its side events are dispatched to inventory, panels, and other
caches. The corresponding acknowledgment is processed afterward too. Do not assume an inventory event embedded in the
same packet has already run inside a `model` listener.

## Player and interaction updates

| Event            | Callback arguments                   | Cache/state                                              |
|------------------|--------------------------------------|----------------------------------------------------------|
| `inventory`      | `(inventory: InventoryState, world)` | `client.inventory.state()` updated                       |
| `tip-list`       | `(menu: TipList, world)`             | Frozen menu; empty options also emitted                  |
| `pui`            | `(panel, world)`                     | `client.puiPanels`, keyed by entity                      |
| `comms`          | `(panel, world)`                     | `client.commsPanels` and active panel                    |
| `side-event`     | `(event, world)`                     | Remaining model side events; also receives raw tip lists |
| `tip_warn`       | `(event, world)`                     | Warning retained in `client.warnings`                    |
| `sfx`            | `(event, world)`                     | Effect retained in `client.effects`                      |
| `chat`           | `(packet)`                           | Raw chat packet retained in `client.chat`                |
| `motd`           | `(packet)`                           | Raw MOTD packet retained in `client.motd`                |
| `outfit`         | `(packet)`                           | Outfit cached by protocol session ID                     |
| `cpu`            | `(packet)`                           | `client.cpuLoad` set from packet                         |
| `scanner-result` | `(result, packet)`                   | `lastScannerResult` and history updated                  |

`tip-list` does not carry an authoritative target ID from the server. Its `.entity` is inferred from a pending menu
request, or `null` for unsolicited menus. [Context menus](MACHINES.md#context-menus-and-access) explains concurrency and
targeting.

`CommsEvent.messages` contains `{raw, text}` entries; `text` flattens supported rich-text content.
See [declarations](../src/index.d.ts) for full `InventoryState`, `TipList`, `PuiEvent`, `CommsEvent`, and
`ScannerResult` shapes.

## Management updates

| Event                   | Callback arguments                | Meaning                                                     |
|-------------------------|-----------------------------------|-------------------------------------------------------------|
| `ship-config`           | `(config: ShipConfig              | null, packet)`                                              | Config cache updated or cleared |
| `captain-subrank`       | `(rank: CaptainSubrank            | null, packet)`                                              | Captain/cheat cache updated or cleared |
| `player-list`           | `(list: ShipPlayerList            | null, packet)`                                              | Player-list changes merged, or cache cleared |
| `crew-log`              | `(log: CrewLog                    | null, packet)`                                              | Reset/amend/append applied, or log cleared |
| `demote`                | `(packet)`                        | Permission-scoped caches cleared before this event          |
| `starter-recovery`      | `({success, failReason}, packet)` | Recovery response; `failReason` is string or `null`         |
| `patron-perks-response` | `({failure}, packet)`             | Patron operation response; applied patrons come from config |
| `session`               | `(packet)`                        | Raw captain/session packet, after dedicated handling        |

Demotion clears ship config, captain subrank, player list, and crew log. It emits `demote`, then the four cache events
with `null`, then the raw `session` event. Disconnect also clears these caches, but uses the disconnect events rather
than emitting each cache event.

Rename permission replies remain on `session`; the rename promise handles them internally. It does not expose a
dedicated commit-success event. Detailed operation contracts are in [management](MANAGEMENT.md).

## Errors

| Event          | Callback arguments              | Use                                                                   |
|----------------|---------------------------------|-----------------------------------------------------------------------|
| `error`        | `(error)`                       | Connection/frame errors and forwarded listener exceptions             |
| `decode-error` | `(entry, error, packet, world)` | A retained processing/decoding error; context arguments may be absent |

`entry` includes `time`, `message`, `packetType`, and `world`. Inspect `client.debug.decodeErrors()` for recent retained
entries. Some decoders can retain partial state despite reporting an error; an empty/missing decoded component is not
proof it does not exist on the server.
