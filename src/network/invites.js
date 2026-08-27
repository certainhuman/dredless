import {getFetch} from "../runtime.js";

export async function fetchInviteMetadata(invite, {fetchImpl = null} = {}) {
    const url = normalizeInviteUrl(invite);
    const response = await (fetchImpl || getFetch())(url.href, {headers: {accept: "text/html"}});
    if (!response.ok) throw new Error(`Invite metadata request failed: ${response.status} ${response.statusText}`);
    return parseInviteMetadata(await response.text());
}

export function parseInviteMetadata(html) {
    const embeddedUrl = metaContent(html, "og:url");
    const url = normalizeInviteUrl(embeddedUrl);
    const parsedTitle = parseInviteTitle(metaContent(html, "title") || "");
    const preview = metaContent(html, "og:image") || metaContent(html, "twitter:image");
    return Object.freeze({
        shipId: parsedTitle.shipId,
        name: parsedTitle.name,
        color: metaContent(html, "theme-color") || metaContent(html, "color") || null,
        previewImageUrl: preview ? new URL(preview, url).href : null,
        hostname: url.hostname,
        inviteCode: url.pathname.split("/").filter(Boolean).at(-1)
    });
}

function normalizeInviteUrl(invite) {
    const url = new URL(String(invite));
    if (!/^\/invite\/[^/]+\/?$/i.test(url.pathname)) throw new TypeError("Expected a Drednot invite URL");
    return url;
}

function parseInviteTitle(title) {
    const match = title.match(/^Invite:\s*(.*?)\s*\{([^{}]+)}(?:\s*-\s*drednot\.io)?\s*$/i);
    return match ? {name: decodeHtml(match[1]), shipId: decodeHtml(match[2])} : {name: null, shipId: null};
}

function metaContent(html, key) {
    if (key === "title") {
        const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
        return match ? decodeHtml(match[1].trim()) : null;
    }
    for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
        const property = attribute(tag[0], "property") || attribute(tag[0], "name");
        if (property?.toLowerCase() === key.toLowerCase()) return attribute(tag[0], "content");
    }
    return null;
}

function attribute(tag, name) {
    const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
    return match ? decodeHtml(match[2]) : null;
}

function decodeHtml(value) {
    return value.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|#39);/gi, (_, entity) => {
        const named = {amp: "&", lt: "<", gt: ">", quot: '"', apos: "'"};
        if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
        const number = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(number) ? String.fromCodePoint(number) : _;
    });
}
