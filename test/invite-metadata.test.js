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

test("parseInviteMetadata preserves trailing spaces in ship names", () => {
    const trailingSpaceHtml = html.replace("pink princess", "pink princess ");
    assert.equal(parseInviteMetadata(trailingSpaceHtml).name, "pink princess ");
});

test("fetchInviteMetadata requests only the invite page", async () => {
    const requested = [];
    const metadata = await fetchInviteMetadata("https://drednot.io/invite/example", {
        fetchImpl: async (url, init) => {
            requested.push({url, init});
            return {ok: true, text: async () => html};
        }
    });
    assert.equal(requested[0].url, "https://drednot.io/invite/example");
    assert.equal(requested[0].init.headers.accept, "text/html");
    assert.equal(requested.length, 1);
    assert.equal(metadata.inviteCode, "dMWuzasF-5shIgGo0UE2iwCU");
    assert.equal("color" in metadata, false);
});
