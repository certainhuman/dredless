# Ship management

[Documentation index](README.md) · [Events](EVENTS.md#management-updates) · [Account perks](ACCOUNT.md#ships-with-patron-perks)

## Contents

- [Completion and shared rules](#completion-and-shared-rules)
- [Read management state](#read-management-state)
- [Save a ship](#save-a-ship)
- [Rename a ship](#rename-a-ship)
- [Privacy and invite reset](#privacy-and-invite-reset)
- [Crew control](#crew-control)
- [Demote yourself](#demote-yourself)
- [Starter recovery](#starter-recovery)
- [Crew logs](#crew-logs)
- [Patron perks](#patron-perks)
- [Gravity](#gravity)

## Completion and shared rules

Methods below live on `client.management`. Server permissions still apply; having a method does not grant captain/owner
access.

| Operation                              | Return                    | What has completed?                          |
|----------------------------------------|---------------------------|----------------------------------------------|
| `canSave()`                            | `boolean`                 | Local eligibility check only                 |
| `save(options?)`                       | `Promise<DisconnectInfo>` | Close with `Saved` code 4015 received        |
| `rename(name, options?)`               | `Promise<void>`           | Permission allowed and commit sent           |
| `resetInvite(options?)`                | `Promise<ShipConfig>`     | Changed nonempty invite key observed         |
| `demoteSelf(options?)`                 | `Promise<void>`           | Demotion received and caches cleared         |
| `recoverStarterItem(itemId, options?)` | `Promise<void>`           | Successful recovery response received        |
| Other action methods                   | `DredlessClient`          | Command sent/queued; no confirmation awaited |

The promise-based operations require a connected, ready, writable client. Options use `timeout` in milliseconds, default
**10000**, positive and at most **2147483647**. A second pending call of the same operation rejects; this is not a
general lock across all management actions.

Sending errors, disconnects, and timeouts reject. Disconnect failures use `DisconnectError` with `.disconnect`. Rename,
recovery, and invite-reset waits also reject when demotion interrupts them or their confirmation arrives for a changed
current world. Save relies on its close result; self-demotion waits for the demotion event.

Timeout does not undo a server action. Replies do not carry request identifiers, so a matching later event confirms
observed state, not necessarily a uniquely correlated request. Avoid competing raw requests and blind retries while
waiting.

Direct client aliases include `canSaveShip`, `saveShip`, `renameShip`, `resetInvite`, `demoteSelf`, and
`recoverStarterItem` with the same corresponding options/returns. Prefer the domain in application code.

## Read management state

```ts
client.management.config(): ShipConfig | null;
client.management.playerList(): ShipPlayerList | null;
client.management.crewLog(): CrewLog | null;
client.management.hasCheats(): boolean;
client.management.requestPlayerList(): DredlessClient;
```

Config includes `privacy`, `privacyName`, `inviteKey`, `teamId`, and `patronPerks`. `hasCheats()` reads the cached
captain-subrank message's cheat flag; it is not a capability test for arbitrary commands.

Player-list messages update/remove individual entries and merge them into the cache. `ShipPlayerList` includes
`players`, latest nonremoved `changes`, `removedPlayers`, `ownerCaptainRank`, and derived `shipOwners`. Each player
entry has `refId`, identity/color, rank, captain rank, item/alias data, playtime, online count, and management flags.
Use `refId` for management commands, not an entity ID or `sid`.

`canBeManaged` and owner-related fields are derived hints; the server remains authoritative. The current normalization
marks players at the lowest positive captain rank as `shipOwners`; this can include tied ranks. It is not a guarantee
that the server recognizes a unique owner for an owner-only action.

Read cached data once and subscribe to `ship-config`, `captain-subrank`, `player-list`, and `crew-log`. They can contain
`null` after demotion. `requestPlayerList()` sends a refresh request; it does not return the response or wait for it.
Config/logs arrive through server session messages.

## Save a ship

```ts
client.management.canSave(): boolean;
client.management.save(options?: {timeout?: number}): Promise<DisconnectInfo>;
```

`canSave()` requires a connected/ready client, a current ship with a known parent world, and parent `danger_level === 0`
(Safe Zone). Missing or unsafe metadata returns `false`. It does not check all server-side permission rules.

**Fragment:** this saves the ship and ejects its players:

```js
if (!client.management.canSave()) throw new Error("Ship is not in a known Safe Zone");
const result = await client.management.save();
console.log(result.name); // Saved
```

The promise resolves only when the socket closes with `DropReason.Saved` (4015). Any other close code rejects. If the
server keeps the connection open without confirming, the operation times out. After success the client is disconnected;
join/start a new client to continue using the ship.

## Rename a ship

```ts
client.management.rename(name: string, options?: {color?: string; timeout?: number}): Promise<void>;
```

Name must be a string of at most **32 UTF-16 code units**, matching the official input limit. It is not automatically
trimmed; the client permits an empty string, with final validation left to the server. Optional color is a six-digit
`#RRGGBB` string; omit it to preserve the color from the permission response.

**Fragment:**

```js
await client.management.rename("New Name", {color: "#3a8bce"});
```

The helper requests permission, waits for `rename_response`, then sends the commit. A denial rejects with the server's
message. There is no dedicated commit-success acknowledgment handled by the official client; this promise resolves when
the commit is sent. Observe ship metadata for the eventual name/color.

## Privacy and invite reset

```ts
client.management.setPrivacy(privacy: ShipPrivacy): DredlessClient;
client.management.resetInvite(options?: {timeout?: number}): Promise<ShipConfig>;

type ShipPrivacy = 0 | 1 | boolean | "public" | "private";
```

`0`, `false`, and `"public"` select public; `1`, `true`, and `"private"` select private. The privacy setter does not
await confirmation; read `config()` or `ship-config`.

**Fragment:** resetting the invite invalidates its previous link:

```js
const config = await client.management.resetInvite();
console.log(config.inviteKey);
```

Reset waits for a config whose nonempty invite key differs from the key cached when the request began. Unchanged-key
config updates are ignored. If no previous key was known, the first subsequent nonempty key satisfies the wait. It
returns the updated config; it does not prove that a particular request caused that update.

## Crew control

```ts
client.management.setPlayerRank(refId: number, rank: ShipPlayerRank): DredlessClient;
client.management.kickPlayer(refId: number): DredlessClient;
client.management.banPlayer(refId: number): DredlessClient;
client.management.unbanPlayer(refId: number): DredlessClient;

type ShipPlayerRank = 0 | 1 | 3 | "guest" | "crew" | "captain";
```

Rank values are guest 0, crew 1, captain 3. IDs must be nonnegative integers. These calls send immediately and do not
await a player-list change. Observe the merged list and server messages. A locally plausible `canBeManaged` value does
not override server restrictions.

**Fragment:** `selectedRefId` must come from a player-list entry selected by your application:

```js
const player = client.management.playerList()?.players.find((entry) => entry.refId === selectedRefId);
if (!player || player.refId === null) throw new Error("No matching management entry");
client.management.unbanPlayer(player.refId);
```

Player-rank changes are different from [door/spawn access restrictions](MACHINES.md#context-menus-and-access).

## Demote yourself

```ts
client.management.demoteSelf(options?: {timeout?: number}): Promise<void>;
```

This requests demotion to Guest. It can remove the account's ability to load/manage the ship and can revoke its patron
contribution. The server's demotion response is the confirmation, not merely sending the command.

Before emitting `demote`, Dredless clears ship config, captain subrank/cheat flags, player list, and crew log. It then
emits their cache events with `null`. Pending rename/recovery/invite-reset waits reject. Player entity rank is still
driven by subsequent model updates; cache clearing does not fabricate a model update.

If the server does not send a demotion response, the promise times out. The helper does not manufacture a success result
from an unrelated captain-subrank value.

## Starter recovery

```ts
client.management.recoverStarterItem(itemId: number,
  options?: {timeout?: number}): Promise<void>;
```

Use an actual starter-recovery item ID supported by the server. IDs must be nonnegative integers. Recovery is an
owner-controlled server action: it deletes existing instances of the relevant items from the ship and returns them to
the caller's inventory. The official UI describes a once-per-minute limit; the server enforces eligibility and cooldown.

The promise waits for `starter_recovery_response`. Missing/null `fail_reason` resolves; otherwise it rejects with the
server's failure message. Inventory/model effects arrive through their normal updates. Every response also emits
`starter-recovery` with `{success, failReason}` and the original session packet, including responses to lower-level
requests.

## Crew logs

```ts
client.management.crewLog(): CrewLog | null;

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

Logs are pushed as captain/session `log` messages. There is no separate log-fetch request in the official client. Before
the first message, the cache is `null`; a received empty log is a non-null object with `entries: []`.

Apply each message in order: clear for `reset`, remove the last remaining entry for `amend`, append the new entries,
then retain the newest **500**. `entries` is the resulting log, oldest first; `changes` is just the entries supplied by
the latest message. An empty reset/amend can still change state. Counts aggregate repeated actions and do not expand the
array.

`text` flattens supported rich-text content. Styled content, date/image/badge tokens remain available in `rawText` for
custom rendering. `icon` remains an asset path. `refId`/`secondaryRefId` preserve server player references used to
filter the official player list.

**Fragment:**

```js
const report = (log) => console.log(log?.entries ?? []);
client.on("crew-log", report);
report(client.management.crewLog());
```

The event's second argument is the original session packet. The cache is also available at `client.crewLog` and
`client.state().crewLog`. Demotion emits `crew-log` with `null`; disconnect clears the cache before the disconnect
event.

## Patron perks

```ts
client.management.setPatronPerks(enabled: boolean): DredlessClient;
client.management.enablePatronPerks(): DredlessClient;
client.management.disablePatronPerks(): DredlessClient;
client.management.patronPerks(): ShipPatronPerk[] | null;
client.management.hasPatronPerks(name?: string): boolean;
```

Setters apply/remove the caller's contribution on the current ship and return immediately. The direct client alias is `setShipPatronPerks(enabled)`. `enabled` must be a boolean;
the aliases pass true/false. The server checks account eligibility, permissions, and available perk allocations.
Disabling does not remove other patrons' contributions. Patron items can despawn after perks are removed.

`patronPerks()` reads config's `{name, color, tier}[]`: `null` if config is unavailable, `[]` if known empty. Color is
packed RGB; known tiers are `bronze`, `silver`, `gold`, `plat`, and `flux`. `hasPatronPerks()` checks any contributor; a
supplied string checks an exact, case-sensitive name. Unknown config returns `false`.

`patron-perks-response` emits `{failure}` plus the packet for every `perk_response`. A true flag reports failure; a
false flag alone is not a current applied-patrons list. Observe `ship-config` for that state. Setters do not
optimistically change the list.

To remove your perks from a listed ship without joining it, use the
separate [account method](ACCOUNT.md#ships-with-patron-perks).

## Gravity

```ts
client.management.setGravity(direction: ShipGravityDirection): DredlessClient;
type ShipGravityDirection = "down" | "up" | "left" | "right" | 0 | 1 | 2 | 3;
```

This sends the official `coolsnake303` gravity control immediately, without awaiting confirmation. The search string
reveals controls in the official UI; it is not an unlock request required by the protocol.

| Constant                 | String    | Wire value |
|--------------------------|-----------|------------|
| `GravityDirection.Down`  | `"down"`  | 0          |
| `GravityDirection.Up`    | `"up"`    | 1          |
| `GravityDirection.Left`  | `"left"`  | 2          |
| `GravityDirection.Right` | `"right"` | 3          |

Values must be exactly one of these lowercase names or numeric values. This mapping differs from `FixedAngleDirection`
used by machine configuration. Direct client alias: `setShipGravity(direction)`.
