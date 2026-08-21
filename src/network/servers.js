import {DEFAULT_BASE_URL} from "../constants.js";
import {getWebSocket, hostName, normalizeBaseUrl} from "../runtime.js";
import {HttpClient} from "./http.js";

const cache = new Map();

class ServerDirectory {
    constructor(baseUrl = DEFAULT_BASE_URL) {
        this.baseUrl = normalizeBaseUrl(baseUrl);
        this.meta = null;
    }

    async load() {
        if (cache.has(this.baseUrl)) {
            this.meta = await cache.get(this.baseUrl);
            return this;
        }
        const promise = this.#fetchMeta();
        cache.set(this.baseUrl, promise);
        this.meta = await promise;
        return this;
    }

    async version() {
        await this.load();
        if (!this.meta.version) throw new Error("Unable to locate GAME_VERSION in drednot bundle");
        return this.meta.version;
    }

    async list() {
        return this.servers();
    }

    async servers() {
        await this.load();
        if (!this.meta.serverInfo) throw new Error("Unable to locate server list in drednot bundle");
        return this.meta.serverInfo.servers;
    }

    async get(id = null) {
        return this.pick(id);
    }

    async pick(id = null) {
        const servers = await this.servers();
        return servers.find((server) => server.index === Number(id)) || servers[0] || null;
    }

    async #fetchMeta() {
        const response = await new HttpClient({baseUrl: this.baseUrl}).request("index.html");
        if (!response.ok) throw new Error(`Failed to fetch bundle: ${response.status} ${response.statusText}`);
        const text = await response.text();
        return {text, version: parseGameVersion(text), serverInfo: parseServerInfo(text, this.baseUrl)};
    }
}

export const fetchGameVersion = (baseUrl = DEFAULT_BASE_URL) => new ServerDirectory(baseUrl).version();
export const fetchServers = (baseUrl = DEFAULT_BASE_URL) => new ServerDirectory(baseUrl).servers();
export async function fetchServerStatus(server, baseUrl = DEFAULT_BASE_URL) {
    const resolved = await resolveServer(server, baseUrl);
    if (!resolved?.domain) throw new Error(`Unable to resolve server ${serverId(server)}`);
    const WebSocket = await getWebSocket();
    const startedAt = Date.now();
    const socket = new WebSocket(`wss://${resolved.domain}:4000/`);

    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            callback(value);
            if (socket.readyState === 0 || socket.readyState === 1) socket.close();
        };
        const timeout = setTimeout(() => finish(reject, new Error(`Timed out fetching status for ${resolved.domain}`)), 10000);
        const onOpen = () => socket.send("yo");
        const onMessage = async (event) => {
            try {
                const data = JSON.parse(await websocketText(event?.data ?? event));
                const playerCount = Number(data.player_count);
                const maxPlayerCount = Number(data.player_max);
                if (!Number.isFinite(playerCount) || !Number.isFinite(maxPlayerCount)) throw new Error("Invalid server status response");
                finish(resolve, {playerCount, maxPlayerCount, ping: Date.now() - startedAt});
            } catch (error) {
                finish(reject, new Error(`Invalid status response from ${resolved.domain}: ${error.message}`));
            }
        };
        const onError = (event) => finish(reject, event?.error || new Error(`WebSocket error while fetching ${resolved.domain}`));
        if (typeof socket.on === "function") {
            socket.on("open", onOpen);
            socket.on("message", onMessage);
            socket.on("error", onError);
        } else if (typeof socket.addEventListener === "function") {
            socket.addEventListener("open", onOpen);
            socket.addEventListener("message", onMessage);
            socket.addEventListener("error", onError);
        } else {
            socket.onopen = onOpen;
            socket.onmessage = onMessage;
            socket.onerror = onError;
        }
    });
}

export async function fetchServerStatuses(baseUrl = DEFAULT_BASE_URL) {
    const servers = await fetchServers(baseUrl);
    return Promise.all(servers.map(async (server) => ({...server, ...await fetchServerStatus(server, baseUrl)})));
}

export async function fetchNoticeVersion(baseUrl = DEFAULT_BASE_URL) {
    const response = await new HttpClient({baseUrl}).request("index.html");
    if (!response.ok) throw new Error(`Failed to fetch notice version: ${response.status} ${response.statusText}`);
    const text = await response.text();
    const version = parseNoticeVersion(text);
    if (version == null) throw new Error("Unable to locate notice version in drednot page");
    return version;
}

export async function resolveServer(server, baseUrl = DEFAULT_BASE_URL) {
    if (server && typeof server === "object") return server;
    const id = Number(server);
    const servers = await fetchServers(baseUrl);
    return servers.find((item) => item.index === id) || null;
}

export function serverId(server) {
    if (server && typeof server === "object") return Number(server.index ?? server.id);
    return Number(server);
}

function parseGameVersion(text) {
    return text.match(/Object\.defineProperty\(exports,"GAME_VERSION",\{enumerable:true,get:\(\)=>e\}\);const e="([^"]+)"/)?.[1] || null;
}

function parseNoticeVersion(text) {
    const moduleMatch = text.match(/Object\.defineProperty\(exports,"checkNotice"[\s\S]{0,8000}?setCookie\)\("notice_version",([A-Za-z_$][\w$]*)\)/);
    if (moduleMatch) {
        const constant = moduleMatch[1];
        const prefix = text.slice(Math.max(0, moduleMatch.index - 1000), moduleMatch.index + moduleMatch[0].length);
        const constantMatch = prefix.match(new RegExp(`const\\s+${constant}\\s*=\\s*(\\d+)\\s*;`));
        if (constantMatch) return Number(constantMatch[1]);
    }

    const patterns = [
        /notice_version["']?\s*[:=]\s*["']?(\d+)/i,
        /noticeVersion["']?\s*[:=]\s*["']?(\d+)/i,
        /NOTICE_VERSION["']?\s*[:=]\s*["']?(\d+)/,
        /notice[^0-9]{0,40}version[^0-9]{0,20}(\d+)/i
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return Number(match[1]);
    }
    return null;
}

function parseServerInfo(text, baseUrl) {
    const host = hostName(baseUrl);
    const match = text.match(/const n=(true|false);const \$="([^"]+)";const o="([^"]+)";const T="([^"]+)";const t="([^"]+)";const S=\[([^\]]+)\];const c=\[([^\]]+)\];const A="([^"]+)";const I="([^"]+)"/s);
    if (!match) return null;
    const [localDomain, baseDomain, testDomain, testGameDomain] = match.slice(2, 6);
    const domains = [...match[6].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    const names = [...match[7].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    const meta = {
        localDomain,
        baseDomain,
        testDomain,
        testGameDomain,
        masterDomain: match[8],
        testMasterDomain: match[9]
    };
    if (host === localDomain) return {mode: "local", servers: [server(0, localDomain, "Local Test 1")], meta};
    if (host === testDomain) return {mode: "test", servers: [server(0, testGameDomain, "Public Test")], meta};
    return {
        mode: "production",
        servers: domains.map((domain, index) => server(index, domain, names[index] || `Server ${index + 1}`)),
        meta
    };
}

async function websocketText(data) {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
    if (typeof data?.text === "function") return data.text();
    return String(data);
}
function server(index, domain, description) {
    return {index, domain, description};
}
