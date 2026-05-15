import { DEFAULT_BASE_URL } from "../constants.js";
import { hostName, normalizeBaseUrl, resolveUrl } from "../runtime.js";
import { HttpClient } from "./http.js";

const cache = new Map();

export class ServerDirectory {
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

  async servers() {
    await this.load();
    if (!this.meta.serverInfo) throw new Error("Unable to locate server list in drednot bundle");
    return this.meta.serverInfo.servers;
  }

  async pick(id = null) {
    const servers = await this.servers();
    return servers.find((server) => server.index === Number(id)) || servers[0] || null;
  }

  async #fetchMeta() {
    const response = await new HttpClient({ baseUrl: this.baseUrl }).request("index.html");
    if (!response.ok) throw new Error(`Failed to fetch bundle: ${response.status} ${response.statusText}`);
    const text = await response.text();
    return { text, version: parseGameVersion(text), serverInfo: parseServerInfo(text, this.baseUrl) };
  }
}

export const fetchLatestGameVersion = (baseUrl = DEFAULT_BASE_URL) => new ServerDirectory(baseUrl).version();
export const listServers = (baseUrl = DEFAULT_BASE_URL) => new ServerDirectory(baseUrl).servers();

function parseGameVersion(text) {
  return text.match(/Object\.defineProperty\(exports,"GAME_VERSION",\{enumerable:true,get:\(\)=>e\}\);const e="([^"]+)"/)?.[1] || null;
}

function parseServerInfo(text, baseUrl) {
  const host = hostName(baseUrl);
  const match = text.match(/const n=(true|false);const \$="([^"]+)";const o="([^"]+)";const T="([^"]+)";const t="([^"]+)";const S=\[([^\]]+)\];const c=\[([^\]]+)\];const A="([^"]+)";const I="([^"]+)"/s);
  if (!match) return null;
  const [localDomain, baseDomain, testDomain, testGameDomain] = match.slice(2, 6);
  const domains = [...match[6].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  const names = [...match[7].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  const meta = { localDomain, baseDomain, testDomain, testGameDomain, masterDomain: match[8], testMasterDomain: match[9] };
  if (host === localDomain) return { mode: "local", servers: [server(0, localDomain, "Local Test 1")], meta };
  if (host === testDomain) return { mode: "test", servers: [server(0, testGameDomain, "Public Test")], meta };
  return { mode: "production", servers: domains.map((domain, index) => server(index, domain, names[index] || `Server ${index + 1}`)), meta };
}

function server(index, domain, description) {
  return { index, domain, description, playerCount: 0, maxPlayerCount: 0, ping: null, raw: { index, domain, description } };
}
