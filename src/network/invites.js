import {getFetch, isBrowser} from "../runtime.js";

export async function fetchInviteMetadata(invite, {fetchImpl = null, includeColor = false} = {}) {
    const url = normalizeInviteUrl(invite);
    const fetcher = fetchImpl || getFetch();
    const response = await fetcher(url.href, {headers: {accept: "text/html"}});
    if (!response.ok) throw new Error(`Invite metadata request failed: ${response.status} ${response.statusText}`);
    const metadata = parseInviteMetadata(await response.text());
    if (!includeColor || !metadata.previewImageUrl) return metadata;
    return Object.freeze({...metadata, color: await fetchTopLeftColor(metadata.previewImageUrl, fetcher)});
}

async function fetchTopLeftColor(imageUrl, fetcher) {
    try {
        let response = await fetcher(imageUrl, {headers: {range: "bytes=0-1023"}});
        if (!response.ok) return null;
        const buffer = await response.arrayBuffer();
        try {
            return await decodeImageColor(buffer);
        } catch (error) {
            if (response.status !== 206) throw error;
            response = await fetcher(imageUrl);
            if (!response.ok) return null;
            return await decodeImageColor(await response.arrayBuffer());
        }
    } catch {
        return null;
    }
}

async function decodeImageColor(buffer) {
        if (isBrowser()) {
            const bitmap = await createImageBitmap(new Blob([buffer]));
            const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const context = canvas.getContext("2d");
            context.drawImage(bitmap, 0, 0, 1, 1);
            const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
            bitmap.close();
            return `rgb(${red},${green},${blue})`;
        }
        const sharpModule = await import("sharp");
        const sharp = sharpModule.default || sharpModule;
        const {data} = await sharp(buffer).extract({left: 0, top: 0, width: 1, height: 1}).raw().toBuffer({resolveWithObject: true});
        return `rgb(${data[0]},${data[1]},${data[2]})`;
}

export function parseInviteMetadata(html) {
    const embeddedUrl = metaContent(html, "og:url");
    const url = normalizeInviteUrl(embeddedUrl);
    const parsedTitle = parseInviteTitle(metaContent(html, "title") || "");
    const preview = metaContent(html, "og:image") || metaContent(html, "twitter:image");
    return Object.freeze({
        shipId: parsedTitle.shipId,
        name: parsedTitle.name,
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
    const match = title.match(/^Invite:\s?(.+?) \{([^{}]+)}(?:\s*-\s*drednot\.io)?\s*$/i);
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
