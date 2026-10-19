import {isBrowser} from "../runtime.js";

export async function fetchAccountDetails(session) {
    const response = await session.request("account/", {
        method: "GET",
        headers: {accept: "text/html"},
        credentials: "include",
        cache: "no-store"
    });
    session.mergeSetCookies(response);
    if (!response.ok) throw new Error(`Account page request failed: ${response.status} ${response.statusText}`);
    return parseAccountDetails(await response.text());
}

export async function fetchClanTag(session) {
    return (await fetchAccountDetails(session)).clan;
}

export async function setClanTag(session, tag) {
    if (typeof tag !== "string") throw new TypeError("tag must be a string");
    return updateClanTag(session, tag);
}

export async function clearClanTag(session) {
    return updateClanTag(session, "");
}

async function updateClanTag(session, tag) {
    // The Clear form has no named fields; ordinary updates contain only `tag`.
    const body = tag === "" ? "" : new URLSearchParams({tag}).toString();
    await postAccountForm(session, "account/clan", body, "Clan tag update");
    const clan = await fetchClanTag(session);
    if ((clan.tag ?? "") !== tag) throw new Error("Clan tag update was not confirmed by the account page");
    return clan;
}

export async function removeShipPerks(session, shipId) {
    const id = requirePerkShipId(shipId);
    await postAccountForm(session, "account/remove_perks", new URLSearchParams({ship: id}).toString(), "Ship perk removal");
    const {shipsWithPerks} = await fetchAccountDetails(session);
    if (shipsWithPerks === null || shipsWithPerks.some((ship) => ship.shipId === id)) {
        throw new Error("Ship perk removal was not confirmed by the account page");
    }
    return shipsWithPerks;
}

async function postAccountForm(session, path, body, operation) {
    const response = await session.request(path, {
        method: "POST",
        headers: {
            accept: "text/html",
            "content-type": "application/x-www-form-urlencoded",
            ...(!isBrowser() ? {origin: new URL(session.baseUrl).origin} : {})
        },
        body,
        credentials: "include",
        referrer: `${session.baseUrl}/account/`,
        // Node must merge cookies before following the form's redirect.
        redirect: isBrowser() ? "follow" : "manual"
    });
    session.mergeSetCookies(response);
    if (!response.ok && response.status !== 302 && response.status !== 303) {
        throw new Error(`${operation} failed: ${response.status} ${response.statusText}`);
    }
    // Consume the redirect/HTML response before fetching the confirmation page.
    await response.text();
}

export function parseAccountDetails(html) {
    // Only extract the captured account form and labeled fields. Never execute HTML.
    const source = String(html).replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
    let tag = null;
    let found = false;
    for (const form of source.matchAll(/<form\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/form\s*>/gi)) {
        const action = attributes(form[1]).get("action");
        if (!action || new URL(action, "https://drednot.io/").pathname !== "/account/clan") continue;
        for (const input of form[2].matchAll(/<input\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
            const attrs = attributes(input[1]);
            if (attrs.get("name") !== "tag") continue;
            tag = attrs.get("value") || null;
            found = true;
            break;
        }
        if (found) break;
    }
    if (!found) throw new Error("Account page has no clan form; authentication may be required or the page format has changed");

    const fields = new Map();
    for (const paragraph of source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)) {
        const label = paragraph[1].match(/<b\b[^>]*>([\s\S]*?)<\/b\s*>/i);
        const code = paragraph[1].match(/<code\b((?:"[^"]*"|'[^']*'|[^'">])*)>/i);
        if (label && code) fields.set(text(label[1]).replace(/:\s*$/, "").toLowerCase(), attributes(code[1]).get("data-info") ?? null);
    }
    const rawIdentity = fields.get("identity (service)") || null;
    const identityParts = rawIdentity?.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    const count = text(source).match(/Your current clan tag has\s+([\d,]+)\s+other users?\b/i);
    return {
        email: fields.get("email") || null,
        identity: identityParts ? identityParts[1].trim() : rawIdentity,
        identityService: identityParts ? identityParts[2].trim() : null,
        clan: {tag, otherUsers: tag !== null && count ? Number(count[1].replace(/,/g, "")) : null},
        shipsWithPerks: parseShipsWithPerks(source)
    };
}

function parseShipsWithPerks(source) {
    const heading = source.match(/<(b|strong)\b[^>]*>\s*Ships\s+with\s+Perks\s+Applied\s*:\s*<\/\1\s*>/i);
    if (!heading) return null;
    const list = source.slice(heading.index + heading[0].length).match(/^\s*(?:<\/[^>]+>\s*)*<ul\b[^>]*>([\s\S]*?)<\/ul\s*>/i);
    if (!list) throw new Error("Account page's applied-perks list could not be parsed");
    const ships = [];
    for (const item of list[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)) {
        const form = item[1].match(/<form\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/form\s*>/i);
        const action = form && attributes(form[1]).get("action");
        if (!action || new URL(action, "https://drednot.io/").pathname !== "/account/remove_perks") {
            throw new Error("Account page's applied-perks entry has no removal form");
        }
        let shipId = null;
        for (const input of form[2].matchAll(/<input\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
            const attrs = attributes(input[1]);
            if (attrs.get("name") === "ship") shipId = requirePerkShipId(attrs.get("value"));
        }
        if (shipId === null) throw new Error("Account page's applied-perks entry has no ship identifier");
        const label = decodeHtml(item[1].slice(0, form.index).replace(/<[^>]*>/g, ""));
        const parts = label.match(/^([\s\S]*?) \{([^{}]+)\}\s*$/);
        ships.push({shipId, name: parts ? parts[1] : label.trim(), hexCode: parts ? parts[2] : null});
    }
    return ships;
}

function requirePerkShipId(value) {
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0)) {
        throw new RangeError("shipId must be a positive safe integer or a decimal ID string from shipsWithPerks");
    }
    if ((typeof value !== "string" && typeof value !== "number") || !/^[1-9]\d*$/.test(String(value))) {
        throw new TypeError("shipId must be a positive integer or a decimal ID string from shipsWithPerks");
    }
    return String(value);
}

function attributes(source) {
    const result = new Map();
    for (const match of source.matchAll(/([^\s=<>"'`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        result.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""));
    }
    return result;
}

function text(source) {
    return decodeHtml(source.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
    const named = {amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " "};
    return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (raw, entity) => {
        const name = entity.toLowerCase();
        if (Object.hasOwn(named, name)) return named[name];
        const code = name.startsWith("#x") ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "\ufffd";
    });
}
