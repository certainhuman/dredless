import {DEFAULT_BASE_URL} from "./constants.js";

export const isNode = () => typeof process !== "undefined" && Boolean(process.versions?.node);
export const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
export const normalizeBaseUrl = (baseUrl = DEFAULT_BASE_URL) => new URL(baseUrl, DEFAULT_BASE_URL).origin;
export const resolveUrl = (baseUrl, path = "") => new URL(String(path).replace(/^\//, ""), `${normalizeBaseUrl(baseUrl)}/`).href;
export const hostName = (baseUrl) => new URL(normalizeBaseUrl(baseUrl)).hostname;
export const asNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

export function debug(...args) {
    if (isNode() && process.env.DREDLESS_LOG === "1") console.log("[dredless]", ...args);
}

export function getFetch() {
    if (typeof fetch !== "function") throw new Error("globalThis.fetch is not available");
    return fetch.bind(globalThis);
}

let wsModulePromise = null;

export async function getWebSocket() {
    if (isBrowser()) {
        if (typeof WebSocket !== "function") throw new Error("globalThis.WebSocket is not available");
        return WebSocket;
    }
    if (typeof WebSocket === "function" && WebSocket.name !== "WebSocket") return WebSocket;
    if (isNode()) {
        wsModulePromise ??= import("ws").then((module) => module.default || module.WebSocket || module);
        return wsModulePromise;
    }
    if (typeof WebSocket === "function") return WebSocket;
    throw new Error("globalThis.WebSocket is not available");
}
