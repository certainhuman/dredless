import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {fetchInviteMetadata, parseInviteMetadata} from "../src/network/invites.js";

const html = await readFile(new URL("./fixtures/invite-drednot.html", import.meta.url), "utf8");

test("parseInviteMetadata extracts invite fields", () => {
    assert.deepEqual(parseInviteMetadata(html), {
        shipId: "75ECD", name: "pink princess",
        previewImageUrl: "https://pub.drednot.io/prod/icon/2026_8_27/b9fe46a4a9010b3891738ed91352cba0",
        hostname: "drednot.io", inviteCode: "dMWuzasF-5shIgGo0UE2iwCU"
    });
});

test("parseInviteMetadata preserves leading spaces in ship names", () => {
    const leadingSpaceHtml = html.replace("pink princess", " d").replace("75ECD", "D85DAC");
    assert.equal(parseInviteMetadata(leadingSpaceHtml).name, " d");
    assert.equal(parseInviteMetadata(leadingSpaceHtml).shipId, "D85DAC");
});

test("fetchInviteMetadata requests only the invite page", async () => {
    const requested = [];
    const metadata = await fetchInviteMetadata("https://drednot.io/invite/example", {
        fetchImpl: async (url, init) => {
            requested.push({url, init});
            if (url.includes("pub.drednot.io")) {
                return {ok: true, arrayBuffer: async () => Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Av/EABQQAQAAAAAAAAAAAAAAAAAAADD/2gAIAQEAAT8hH//Z", "base64"))};
            }
            return {ok: true, text: async () => html};
        }
    });
    assert.equal(requested[0].url, "https://drednot.io/invite/example");
    assert.equal(requested[0].init.headers.accept, "text/html");
    assert.equal(requested.length, 1);
    assert.equal(metadata.inviteCode, "dMWuzasF-5shIgGo0UE2iwCU");
    assert.equal("color" in metadata, false);
});

test("fetchInviteMetadata samples color only when opted in", async () => {
    const requested = [];
    const metadata = await fetchInviteMetadata("https://drednot.io/invite/example", {
        includeColor: true,
        fetchImpl: async (url, init) => {
            requested.push({url, init});
            if (url.includes("pub.drednot.io")) {
                return {ok: true, status: 206, arrayBuffer: async () => Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Av/EABQQAQAAAAAAAAAAAAAAAAAAADD/2gAIAQEAAT8hH//Z", "base64"))};
            }
            return {ok: true, text: async () => html};
        }
    });
    assert.ok(requested.length >= 2);
    assert.equal(requested[1].init.headers.range, "bytes=0-1023");
    assert.ok(metadata.color === null || /^rgb\(/.test(metadata.color));
});
