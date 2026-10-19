# Client lifecycle and networking

[Documentation index](README.md) · [Events](EVENTS.md) · [API reference](API_REFERENCE.md)

## Contents

- [Construction and retention](#construction-and-retention)
- [Completion and readiness](#completion-and-readiness)
- [Attach an existing WebSocket](#attach-an-existing-websocket)
- [Disconnects](#disconnects)
- [Send commands and messages](#send-commands-and-messages)
- [Inspect client state](#inspect-client-state)

## Construction and retention

Normally obtain a client from a [session factory](NODE_API.md#join-start-and-invites). Construct one yourself when you
need listeners installed before the connection becomes ready:

```ts
new DredlessClient(connection: Connection, options?: DredlessClientOptions): DredlessClient;

interface DredlessClientOptions {
  connect?: boolean;            // true
  packetHistory?: number;       // 200 packets
  eventHistory?: number;        // 200 events per WorldState
  modelPacketHistory?: number;  // 100 packets per WorldState
  chunkHistory?: number;        // 64 chunks per WorldState
}

client.whenReady(): Promise<DredlessClient>;
client.close(code?: number, reason?: string): DredlessClient;
client.disconnect(code?: number, reason?: string): DredlessClient;
```

The constructor connects immediately unless `connect: false`. That option supports offline inspection; it does not
provide a later public `connect()` method. History limits bound retained debugging buffers, not the live decoded world.
`0` disables a buffer; `Infinity` makes it unbounded. Negative/non-finite values fall back to defaults, except the
explicit `Infinity` case.

`close()` defaults to code `1000` and reason `"client"`; `disconnect()` is an alias. Readonly attachments make closing a
no-op. For writable clients, closure state changes when the socket close handler runs.

## Completion and readiness

`whenReady()` resolves when the server's ready packet arrives. Session client factories await it before returning. A
close before readiness rejects with `DisconnectError`; connection/decoding setup failures can reject with other errors.

Readiness is not a guarantee that all entities, model components, inventory, or interaction panels are populated.
`currentShip()` and individual fields can be missing. Read existing caches and subscribe to
relevant [events](EVENTS.md). Install listeners using the connection-descriptor pattern if you need the earliest
packets.

Most synchronous actions return the client and send or queue a command. They do not verify its effect. Commands
generally queue until connected, ready, and carrying a session ID; decoded messages queue until connected and, by
default, ready. Writes after a disconnect reject rather than being queued for reconnection. Promise-based
management/menu methods have their own readiness checks, timeout, and overlap rules.

| Example                     | Completion meaning                     |
|-----------------------------|----------------------------------------|
| `loader.configure(config)`  | Configuration sent/queued              |
| `tips.choose(entity, text)` | Menu received and selection sent       |
| `door.setRank("crew")`      | Requested rank observed in model state |
| `management.rename(name)`   | Rename allowed and commit sent         |
| `management.resetInvite()`  | A changed nonempty invite key observed |
| `management.save()`         | Server closed with `DropReason.Saved`  |

A timeout ends local waiting; it does not cancel an action already processed by the server. Do not automatically repeat
a mutation solely because its confirmation timed out.

## Attach an existing WebSocket

```ts
DredlessClient.attachWebSocket(socket: unknown, options?: AttachWebSocketOptions): DredlessClient;

interface AttachWebSocketOptions {
  mode?: "observe" | "bootstrap" | "readonly";
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

Modes and browser ownership concerns are covered in [browser attachment](BROWSER_API.md#attach-to-an-existing-socket).
Metadata does not reconstruct frames received before attachment. `ready: true`/`sid` should describe an
already-initialized protocol session, not invent a new one.

## Disconnects

Listen to `"disconnect"` for normalized information:

```ts
interface DisconnectInfo {
  readonly code: number;
  readonly name: keyof typeof DropReason | null;
  readonly reason: string;
  readonly wasClean: boolean | null;
}
```

**Fragment:**

```js
client.on("disconnect", (info) => {
  console.log(info.name, info.code, info.reason);
});
```

The close handler first marks the client disconnected/not ready, clears `sid`, pending writes, keepalive,
management/panel state, and command acknowledgments. It sets `client.lastDisconnect` and `client.net.lastDisconnect`,
then emits `"disconnect"` and the original `"close"` arguments. World data and historical buffers remain available as
last-known state, not evidence of a live connection.

There is no automatic reconnect. Create/join a new client and reinstall subscriptions when your application decides to
reconnect.

`DisconnectError` carries the normalized record in `.disconnect`. `normalizeDisconnect()` accepts a browser close event
or Node-style code/reason. Missing codes become `1006`; unknown/standard codes have `name: null`. `wasClean` is `null`
when the socket API does not supply it.

| Code | `DropReason` name | Code | `DropReason` name |
|------|-------------------|------|-------------------|
| 4000 | ProtocolError     | 4010 | Idle              |
| 4001 | BadVersion        | 4011 | ShipDestruct      |
| 4002 | ConnectLimit      | 4012 | JoinBlocked       |
| 4003 | ConnectRate       | 4013 | HardBanned        |
| 4004 | TeamLimit         | 4014 | NoLoad            |
| 4005 | FullPlayers       | 4015 | Saved             |
| 4006 | FullTeams         | 4016 | InvalidInvite     |
| 4007 | TeamNotAvailable  | 4017 | Shutdown          |
| 4008 | Kicked            | 4018 | ServerError       |
| 4009 | Banned            | 4019 | GTFO              |

These exports are available from Node, browser, and `dredless/network`.

## Send commands and messages

Prefer player, machine, and management methods for normal actions. `client.net` is the lower-level transport domain:

```ts
client.net.send(command?: Command): DredlessClient;
client.net.sendMessage(message: unknown, options?: {afterReady?: boolean}): DredlessClient;
client.net.sendRaw(message: unknown, options?: {afterReady?: boolean}): DredlessClient;
client.net.sendEntityCommand(cmd: string, args?: unknown[]): DredlessClient;
client.net.sendUiConfig(data: unknown): DredlessClient;
client.net.sendBlueprintPlacement(placement: BlueprintPlacement): DredlessClient;
client.net.setOutfit(outfit: unknown): DredlessClient;
```

`send()` applies input settings, fills command defaults, and signs the command. It is for player-input packets.
`sendMessage()` MessagePack-encodes a decoded protocol object. `afterReady` defaults to `true`.

Despite its name, `sendRaw()` is an alias of `sendMessage()`: it does not transmit pre-encoded bytes unchanged. Do not
pass the output of `encodeMsgpack()` to it expecting raw transport. UI config byte arrays are payloads passed to
`sendUiConfig()`, not whole WebSocket frames.

`net` also exposes `connected`, `ready`, `sid`, `packetCount`, `lastPacket`, and `lastDisconnect`. Direct client
transport methods exist too; using the domain makes intent clearer.

## Inspect client state

```ts
client.state(options?: {includeTiles?: boolean; includeModel?: boolean}): ClientSnapshot;
client.snapshot(options?: {includeTiles?: boolean; includeModel?: boolean}): ClientSnapshot;
```

The implementation exposes `snapshot()` as well as `state()`. The result groups connection metadata, worlds, inventory,
panels, management caches (including `crewLog`), recent packet/event buffers, acknowledgments, and decode errors. Full
fields live in [ClientSnapshot](../src/index.d.ts).

Client/world snapshots are not uniformly cloned or frozen. For example, `client.state().inventory` and management
objects are shared references; don't mutate them. [World state](WORLD_STATE.md#live-reads-and-snapshots) distinguishes
frozen entity snapshots from aggregate state. Snapshots may contain session credentials through `session`/`connection`;
select fields before logging.

`includeModel` includes raw model tables, and `includeTiles` includes tile values. For blocks, use a world snapshot with
`includeBlocks: true`; the client snapshot implementation currently does not forward `includeBlocks`, even though its
declaration lists the option.
