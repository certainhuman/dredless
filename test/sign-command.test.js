import assert from "node:assert/strict";
import test from "node:test";

import {encodeMsgpack} from "../src/protocol/msgpack.js";
import {SignDisplayMode, buildSignTextMessage, normalizeSignDisplayMode, signDisplayModeName} from "../src/protocol/sign.js";

function hex(value) {
    return Buffer.from(value).toString("hex");
}

test("buildSignTextMessage matches official client sign captures", () => {
    assert.deepEqual(buildSignTextMessage("mymessage", SignDisplayMode.OnHover), {
        type: 5,
        cmd: "sign_text",
        args: ["mymessage", 2]
    });
    assert.equal(
        hex(encodeMsgpack(buildSignTextMessage("mymessage", SignDisplayMode.OnHover))),
        "83a47479706505a3636d64a97369676e5f74657874a46172677392a96d796d65737361676502",
        "save-sign-with-text-mymessage-and-mode-on-hover.jsonl"
    );
    assert.equal(
        hex(encodeMsgpack(buildSignTextMessage("myothermessage", SignDisplayMode.WhenNear))),
        "83a47479706505a3636d64a97369676e5f74657874a46172677392ae6d796f746865726d65737361676501",
        "save-sign-with-text-myothermessage-and-mode-when-near.jsonl"
    );
});

test("normalizeSignDisplayMode accepts enum values", () => {
    assert.equal(normalizeSignDisplayMode(), 0);
    assert.equal(normalizeSignDisplayMode(SignDisplayMode.Always), 0);
    assert.equal(normalizeSignDisplayMode(SignDisplayMode.WhenNear), 1);
    assert.equal(normalizeSignDisplayMode(SignDisplayMode.OnHover), 2);
    assert.throws(() => normalizeSignDisplayMode("whenNear"), /SignDisplayMode/);
    assert.throws(() => normalizeSignDisplayMode("near"), /SignDisplayMode/);
    assert.throws(() => normalizeSignDisplayMode(1), /SignDisplayMode/);
});

test("signDisplayModeName maps numeric display modes", () => {
    assert.equal(signDisplayModeName(0), "always");
    assert.equal(signDisplayModeName(1), SignDisplayMode.WhenNear);
    assert.equal(signDisplayModeName(2), SignDisplayMode.OnHover);
    assert.equal(signDisplayModeName(3), null);
});
