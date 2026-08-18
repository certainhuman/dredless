import {DEFAULT_BASE_URL} from "../constants.js";
import {hostName, normalizeBaseUrl} from "../runtime.js";

export function cookiePrefix(baseUrl = DEFAULT_BASE_URL) {
    const host = hostName(baseUrl);
    if (host === "test.drednot.io") return "test_";
    if (host === "local.drednot.io") return "local_";
    return "";
}

export const cookieName = (baseUrl, name) => `${cookiePrefix(baseUrl)}${name}`;

export function parseCookies(text = "") {
    const cookies = new Map();
    for (const part of String(text).split(/;\s*/)) {
        const index = part.indexOf("=");
        if (index <= 0) continue;
        cookies.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
    }
    return cookies;
}

export function browserCookies() {
    return canReadDocumentCookie() ? parseCookies(document.cookie || "") : new Map();
}

export function canReadDocumentCookie() {
    try {
        return typeof document !== "undefined" && typeof document.cookie === "string";
    } catch (_) {
        return false;
    }
}

export function hasCookieStore() {
    return typeof globalThis.cookieStore !== "undefined" && typeof globalThis.cookieStore.getAll === "function";
}

export async function readBrowserCookie(name) {
    if (hasCookieStore()) {
        try {
            const cookie = typeof globalThis.cookieStore.get === "function" ? await globalThis.cookieStore.get(name) : null;
            if (cookie?.value != null) return cookie.value;
        } catch (_) {
            // Fall through to document.cookie below.
        }
    }
    return browserCookies().get(name) || "";
}

export function setCookieValues(baseUrl, source = {}) {
    const base = normalizeBaseUrl(baseUrl);
    const values = source instanceof Map ? source : source?.cookies instanceof Map ? source.cookies : Object.entries(source || {});
    const cookies = new Map(values);
    const prefix = cookiePrefix(base);
    const anonKey = source.anonKey || source.anon_key;
    const gameSession = source.gameSession || source.game_session;
    const noticeVersion = source.noticeVersion || source.notice_version;
    if (anonKey && !cookies.has(`${prefix}anon_key`)) cookies.set(`${prefix}anon_key`, anonKey);
    if (gameSession && !cookies.has(`${prefix}game_session`)) cookies.set(`${prefix}game_session`, gameSession);
    if (noticeVersion && !cookies.has(`${prefix}notice_version`)) cookies.set(`${prefix}notice_version`, noticeVersion);
    return cookies;
}

export function cookieHeader(baseUrl, source = {}) {
    return [...setCookieValues(baseUrl, source)].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("; ");
}

export function readSetCookies(headers, names = ["game_session", "anon_key"], baseUrl = DEFAULT_BASE_URL) {
    const values = typeof headers?.getSetCookie === "function"
        ? headers.getSetCookie()
        : headers?.get?.("set-cookie") ? [headers.get("set-cookie")] : [];
    const found = new Map();
    const prefix = cookiePrefix(baseUrl);
    for (const header of values) {
        for (const name of names) {
            for (const key of prefix ? [name, `${prefix}${name}`] : [name]) {
                const regex = new RegExp(`(?:^|,\\s*)${key}=([^;]+)`, "g");
                let match;
                while ((match = regex.exec(header))) found.set(key, decodeURIComponent(match[1]));
            }
        }
    }
    return found;
}
