# Troubleshooting and limitations

[Documentation index](README.md) · [Client lifecycle](CLIENT.md) · [Events](EVENTS.md)

## Contents

- [Connection and identity](#connection-and-identity)
- [Missing or stale state](#missing-or-stale-state)
- [Actions that appear to do nothing](#actions-that-appear-to-do-nothing)
- [Timeouts and retries](#timeouts-and-retries)
- [Browser and HTTP problems](#browser-and-http-problems)
- [Useful diagnostics](#useful-diagnostics)

## Connection and identity

| Symptom                                        | Check                                                                                          |
|------------------------------------------------|------------------------------------------------------------------------------------------------|
| `fetch is not available`                       | Run on a Node runtime with built-in global `fetch`, or provide it before calling HTTP APIs     |
| Import/top-level-await syntax error            | Use `.mjs`/ES modules in Node; use a module script or async wrapper in browser scripts         |
| A different anonymous account appears each run | Retain/reuse `anonKey`; factories without a key can create a new identity                      |
| Top-level join ignores your account            | Pass your `session`, or call the method on that session directly                               |
| Join rejects with `4007` and `never_load=true` | If the ship is saved, use `startShip()` so the server may load it                              |
| Invite join fails                              | Use the invite code segment and the intended server; check permission/expiry and close details |
| Connection closes after saving                 | Expected with `Saved` (4015); successful save ends the connection                              |
| Client stays disconnected                      | There is no automatic reconnect; create a new connection/client                                |

`createSession()` does not perform a registered-provider login. [Node authentication](NODE_API.md#authentication-and-reuse) explains using an existing session cookie; [browser authentication](BROWSER_API.md#execution-context) uses the ambient jar.

## Missing or stale state

- A ready client can still have missing world/components/panels. Check nullable reads, then subscribe to the relevant update and read the cache once.
- A handler installed after an awaited factory can miss initial events. Use a connection descriptor and attach listeners before awaiting readiness when those first events matter.
- Attachment cannot recover frames received before it began. Inventing `ready`/`sid` metadata does not reconstruct ECS state.
- Entity IDs are scoped by world. Do not pass an overworld ship entity ID where an interior machine ID is expected.
- A nearby ship's presence does not imply its interior is loaded. `includeWorld` only includes already-decoded data.
- Handles and raw summaries have different lifetimes. Entity handles read live state; ship-read handles hold the summary from that query. Re-query ship reads after updates.
- Disconnect retains last-known worlds while clearing active management/panel state. Do not treat retained data as current server state.
- Client/world snapshots are not universally deep-cloned or frozen. Mutating returned objects can affect shared cached data; select and clone fields for history.
- Unsupported decoding can look like absent state. Inspect `decode-error` before assuming the server has no such component.

## Actions that appear to do nothing

First establish whether the API waits for an effect. A returned client means sent/queued, not successful. `await` on a synchronous setter adds no confirmation.

| Action                                                        | Common cause                                                                                                                                                    |
|---------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Loader/pusher/hatch configuration throws an enum error        | Numeric decoded/default enums are merged into builders requiring named enums. Supply all enum fields explicitly; see [machine limitations](MACHINES.md#loaders) |
| Launcher angle/power changes no intended target               | Those commands use the active interaction. A launcher handle alone does not select it                                                                           |
| Sign setter throws a display-mode error                       | Pass `SignDisplayMode.Always`, `WhenNear`, or `OnHover` explicitly; its numeric default is currently rejected by the named-mode builder                         |
| Sign/fabricator/comms operation affects the wrong interaction | Their messages also rely on active UI state; `open()` does not await panel readiness                                                                            |
| Context-menu operation times out                              | Entity must exist in the current world, have a position, be in range, and expose the requested menu                                                             |
| Menu selection seems successful but effect is absent          | `choose()` resolves when selection is sent, not after the action; use a specialized confirmation method where available                                         |
| Inventory equip fails                                         | The slot can be empty/non-equipment; infer from a known item or pass a valid explicit equipment slot                                                            |
| Model state ignores mutations to returned objects             | Cached objects are not configuration commands; call the action methods                                                                                          |
| Combining separate movement/aim sends loses fields            | Ordinary input fields default on each complete command; combine them in one call's command object                                                               |
| Rank/kick/ban fails despite local flags                       | Server captain hierarchy and permission checks are authoritative                                                                                                |

Range, permissions, inventory, Safe Zone status, cooldowns, and game rules are not bypassed by Dredless. Check [management completion conditions](MANAGEMENT.md#completion-and-shared-rules) and [machine targeting](MACHINES.md#targeting-and-completion).

## Timeouts and retries

Management waits generally default to 10000 ms; tip operations default to 5000 ms per response. Only documented methods implement these waits. Raw requests and ordinary setters do not acquire a success promise by being awaited.

A timeout stops local waiting, not the server action. Check resulting state before repeating a save, account mutation, recovery, or other consequential request. Messages without request IDs can be mistaken for later retries' responses. Concurrent operations that share an active UI/menu can interfere even when the library does not reject them locally.

Watch `disconnect` separately from `error`; a socket error can precede its eventual close. Catch operation rejections and inspect `DisconnectError.disconnect` when available.

## Browser and HTTP problems

Browser code needs access to the relevant origin/cookies. Loading a CDN script on another origin does not authorize access to Drednot. Workers, extension backgrounds, and popups can have different cookie access from a page/content script.

Use `createSession()` to inspect an existing ambient browser identity; `createAnonSession()` can change it. A blank JavaScript-readable cookie property does not prove the browser lacks an HttpOnly session.

For custom HTTP calls, `session.request()` JSON-stringifies ordinary objects. Send URL-encoded forms as strings with their form content type; native Fetch body types are not all supported by this wrapper. Check status and merge cookies yourself when using the raw helper.

Account methods scrape labeled HTML fields and forms. A login/challenge page, changed markup, missing clan form, or malformed perk list can reject the read. Perk removal cannot confirm success if the subsequent page omits a readable list. These methods have no built-in timeout/cancellation options. See [account limitations](ACCOUNT.md#failures-and-data-lifetime).

## Useful diagnostics

**Fragment:** inspect bounded errors and normalized close details without dumping credential-bearing snapshots:

```js
client.on("decode-error", (entry) => console.error(entry));
client.on("error", (error) => console.error(error.message));
client.on("disconnect", (info) => console.error(info));
console.log(client.debug.decodeErrors());
```

For a bug report, include the package version, runtime/entrypoint, operation, relevant error/close code, and whether state was available before the action. A small sanitized capture can help protocol investigations. Session/connection snapshots and HARs can contain authentication cookies; avoid using an entire state dump as an ordinary diagnostic log.

[Protocol tools](PROTOCOL.md) describes frame decoding, world/model layers, and retained histories. The complete [declarations](../src/index.d.ts) are the field reference when inspecting a component not expanded in the prose guides.
