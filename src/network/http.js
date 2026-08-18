import {getFetch, isBrowser, normalizeBaseUrl, resolveUrl} from "../runtime.js";
import {cookieHeader} from "./cookies.js";

export class HttpClient {
    constructor({baseUrl, session = null} = {}) {
        this.baseUrl = normalizeBaseUrl(baseUrl);
        this.session = session;
    }

    async request(path, init = {}) {
        const headers = new Headers(init.headers || {});
        const body = this.#body(init.body, headers);
        const cookie = this.session && !isBrowser() ? cookieHeader(this.baseUrl, this.session) : "";
        if (cookie) headers.set("cookie", cookie);
        return getFetch()(resolveUrl(this.baseUrl, path), {
            ...init,
            body,
            headers,
            credentials: isBrowser() ? "include" : init.credentials
        });
    }

    async json(path, init = {}) {
        const response = await this.request(path, init);
        if (!response.ok) throw new Error(`${path} failed: ${response.status} ${response.statusText}`);
        return response.json();
    }

    #body(body, headers) {
        if (body == null || typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body;
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
        return JSON.stringify(body);
    }
}
