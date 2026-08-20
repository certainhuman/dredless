import assert from "node:assert/strict";
import test from "node:test";

import {buildChatMessage} from "../src/protocol/outbound/chat.js";
import {encodeMsgpack} from "../src/protocol/codec/msgpack.js";

function hex(value) {
    return Buffer.from(value).toString("hex");
}

test("buildChatMessage matches the official ship chat send capture", () => {
    assert.deepEqual(buildChatMessage("my message"), {type: 2, msg: "my message"});
    assert.equal(
        hex(encodeMsgpack(buildChatMessage("my message"))),
        "82a47479706502a36d7367aa6d79206d657373616765",
        "sending-chat-messages.jsonl"
    );
});
