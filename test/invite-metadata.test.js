import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {fetchInviteMetadata, parseInviteMetadata} from "../src/network/invites.js";

const html = await readFile(new URL("./fixtures/invite-drednot.html", import.meta.url), "utf8");

test("parseInviteMetadata extracts invite fields", () => {
    assert.deepEqual(parseInviteMetadata(html), {
        shipId: "75ECD", name: "pink princess", color: null,
        previewImageUrl: "https://pub.drednot.io/prod/icon/2026_8_27/b9fe46a4a9010b3891738ed91352cba0",
        hostname: "drednot.io", inviteCode: "dMWuzasF-5shIgGo0UE2iwCU"
    });
});

test("fetchInviteMetadata requests only the invite page", async () => {
    let requested;
    const metadata = await fetchInviteMetadata("https://drednot.io/invite/example", {
        fetchImpl: async (url, init) => {
            requested = {url, init};
            return {ok: true, text: async () => html};
        }
    });
    assert.equal(requested.url, "https://drednot.io/invite/example");
    assert.equal(requested.init.headers.accept, "text/html");
    assert.equal(metadata.inviteCode, "dMWuzasF-5shIgGo0UE2iwCU");
});
