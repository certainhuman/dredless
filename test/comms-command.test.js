import assert from "node:assert/strict";
import test from "node:test";

import {buildCommsMessage, flattenRichText, normalizeCommsEvent} from "../src/protocol/comms.js";
import {encodeMsgpack} from "../src/protocol/msgpack.js";

function hex(value) {
    return Buffer.from(value).toString("hex");
}

test("buildCommsMessage matches official client comms send capture", () => {
    assert.deepEqual(buildCommsMessage("my message"), {type: 3, msg: "my message"});
    assert.equal(
        hex(encodeMsgpack(buildCommsMessage("my message"))),
        "82a47479706503a36d7367aa6d79206d657373616765",
        "send-msg-my message.jsonl"
    );
});

test("normalizeCommsEvent flattens official rich-text message rows", () => {
    const event = normalizeCommsEvent({
        type: "comms",
        filter: 100011240,
        ent_id: 47,
        msgs_text: [[
            {
                t: "bdi style=\"background:rgb(230,77,214);color:#000;font-weight:normal;\"",
                c: ["Corvera", {t: "sub", c: ["{", "F568B3", "}"]}]
            },
            ": ",
            "my message"
        ]],
        update: true
    });

    assert.equal(event.entity, 47);
    assert.equal(event.messages.length, 1);
    assert.equal(event.messages[0].text, "Corvera{F568B3}: my message");
});

test("normalizeCommsEvent preserves multiple comms history rows", () => {
    const speaker = {
        t: "bdi style=\"background:rgb(230,77,214);color:#000;font-weight:normal;\"",
        c: ["Corvera", {t: "sub", c: ["{", "F568B3", "}"]}]
    };
    const event = normalizeCommsEvent({
        type: "comms",
        filter: 100011240,
        ent_id: 47,
        msgs_text: [
            [speaker, ": ", "my message"],
            [speaker, ": ", "d"],
            [speaker, ": ", "d"],
            [speaker, ": ", "d"],
            [speaker, ": ", "d"],
            [speaker, ": ", "d"]
        ]
    });

    assert.equal(event.messages.length, 6);
    assert.deepEqual(event.messages.map((message) => message.text), [
        "Corvera{F568B3}: my message",
        "Corvera{F568B3}: d",
        "Corvera{F568B3}: d",
        "Corvera{F568B3}: d",
        "Corvera{F568B3}: d",
        "Corvera{F568B3}: d"
    ]);
});

test("flattenRichText accepts nested official rich text shapes", () => {
    assert.equal(flattenRichText(["a", {t: "b", c: ["b", {c: "c"}]}]), "abc");
});
