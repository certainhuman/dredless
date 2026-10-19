# Account details, clan tags, and perk ships

[Documentation index](README.md) · [Node authentication](NODE_API.md#authentication-and-reuse) · [Browser setup](BROWSER_API.md)

## Contents

- [Methods and authentication](#methods-and-authentication)
- [Read account details](#read-account-details)
- [Read and change clan tags](#read-and-change-clan-tags)
- [Ships with patron perks](#ships-with-patron-perks)
- [Failures and data lifetime](#failures-and-data-lifetime)

## Methods and authentication

These methods live on `Session` and are inherited by `AnonSession` and `BrowserSession`. They use the authenticated
account page at the session's base URL. A session object does not by itself guarantee that the server exposes the
registered-account fields or forms.

```ts
session.fetchAccountDetails(): Promise<AccountDetails>;
session.fetchClanTag(): Promise<ClanTagDetails>;
session.setClanTag(tag: string): Promise<ClanTagDetails>;
session.clearClanTag(): Promise<ClanTagDetails>;
session.removeShipPerks(shipId: string | number): Promise<AccountPerkShip[]>;
```

Use [Node session cookies](NODE_API.md#authentication-and-reuse)
or [browser ambient authentication](BROWSER_API.md#execution-context). Dredless does not automate identity-provider
login. Account operations use HTTP and do not require a game WebSocket.

## Read account details

```ts
interface ClanTagDetails {
  tag: string | null;
  otherUsers: number | null;
}
interface AccountPerkShip {
  shipId: string;
  name: string;
  hexCode: string | null;
}
interface AccountDetails {
  name: string | null;
  color: number | null;
  email: string | null;
  identity: string | null;
  identityService: string | null;
  clan: ClanTagDetails;
  shipsWithPerks: AccountPerkShip[] | null;
}
```

**Fragment:** `session` is authenticated using the runtime setup guide:

```js
const details = await session.fetchAccountDetails();
console.log(details.name, details.color, details.clan.tag);
```

| Field             | Source and meaning                                                                          |
|-------------------|---------------------------------------------------------------------------------------------|
| `name`            | The account page's “You are” label, preserving name text spacing                            |
| `color`           | Label background as packed RGB, matching `session.account.color`; not foreground text color |
| `email`           | Actual value in the email element's `data-info` attribute                                   |
| `identity`        | Identity value from `data-info`, with final parenthesized service removed                   |
| `identityService` | That service label, such as `Discord`, preserving displayed spelling                        |
| `clan`            | Current tag and the number of other users sharing it                                        |
| `shipsWithPerks`  | This account's applied ship contributions, described below                                  |

Missing/unrecognized scalar fields return `null`. Color parsing recognizes hexadecimal background/background-color
styles, not arbitrary CSS expressions. Email/identity values are read from attributes despite their visible masked text.

`fetchAccountStatus()` is separate: it reads JSON, updates `session.account` and status flags, and returns the decoded
response. It does not expose email, identity service, clan data, or applied perk ships. `fetchAccountDetails()` does not
refresh that status cache.

## Read and change clan tags

**Fragment:** these setters change the account's clan tag:

```js
const before = await session.fetchClanTag();
const updated = await session.setClanTag("Example Clan");
const cleared = await session.clearClanTag();
```

`fetchClanTag()` returns only the `clan` object from a fresh account-page read. Empty tags become `null`. `otherUsers`
excludes the current account and is `null` if the page does not report a count; it is not a member roster or a directory
of clans.

`setClanTag()` requires a string, submits a URL-encoded `tag` field, then reads the page to confirm the stored tag. The
helper preserves the submitted value; server validation/normalization can cause exact-value confirmation to fail. No
local length rule is imposed here. `clearClanTag()` sends the official empty clear form; `setClanTag("")` does the same.
Both resolve with the confirmed `ClanTagDetails`.

Clan tags are for leaderboard attribution. They are not an in-game identity marker or proof of clan membership.

## Ships with patron perks

`details.shipsWithPerks` contains one entry per parsed account removal form. A recognized empty list is `[]`; a missing
section is `null`. Malformed present lists reject rather than silently becoming empty.

| Field     | Example            | Use                                                         |
|-----------|--------------------|-------------------------------------------------------------|
| `shipId`  | `"1844458"`        | Decimal form identifier; pass this to `removeShipPerks()`   |
| `hexCode` | `"ABD1C2"`         | Human-visible code without braces; not the removal selector |
| `name`    | `"⏰ Out of Time"` | Displayed ship name                                         |

These form/display IDs are distinct identifiers, not decimal/hex conversions. Names preserve spacing when the displayed
code can be parsed; fallback label parsing trims the label and returns `hexCode: null`.

**Fragment:** this removes the current account's contribution from a selected listed ship:

```js
const details = await session.fetchAccountDetails();
const ship = details.shipsWithPerks?.find((entry) => entry.hexCode === selectedHexCode);
if (!ship) throw new Error("Selected ship is not in the account's applied-perks list");
const remaining = await session.removeShipPerks(ship.shipId);
```

`removeShipPerks()` accepts the positive decimal string from the form, or a positive safe integer. It posts the form's
`ship` field, reads account details again, and resolves with the remaining list only if that ID is absent. It rejects if
the ship is still listed or a readable list is unavailable. This confirms the page's observed state, not which request
caused it; an already-absent ship can also satisfy confirmation.

This account-page action does not require joining the ship and removes only the caller's contribution. It does not
directly edit a connected client's management cache. Current-ship perk controls and events are documented
in [management](MANAGEMENT.md#patron-perks).

## Failures and data lifetime

These methods scrape website HTML, not a stable JSON account API. They depend on the account form, field labels, and
applied-ships markup. A login/challenge page or a page without the expected clan form rejects. An unreadable perks
section can also cause account/clan reads to reject because they share the full parser.

Setters check HTTP results and read back state. Redirects alone are not success confirmation. A rejected confirmation
does not undo an account action the server already processed. The methods have no built-in per-call timeout or
cancellation option and do not serialize concurrent mutations; coordinate conflicting writes in your application.

Each read makes fresh requests; email, identity, clan details, and perk-ship lists are returned directly, not added to
`session.account` or `session.toJSON()`. Choose which fields to retain or log.

The perk-removal request is based on the official account form; a completed removal transaction was not available in the
reference capture. Success therefore depends on the live endpoint accepting that form and the subsequent page exposing a
readable list.
