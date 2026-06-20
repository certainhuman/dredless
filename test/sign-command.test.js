import assert from "node:assert/strict";
import test from "node:test";

import { encodeMsgpack } from "../src/protocol/msgpack.js";
import {
  buildSignTextMessage,
  normalizeSignDisplayMode,
  signDisplayModeName
} from "../src/protocol/sign.js";

function hex(value) {
  return Buffer.from(value).toString("hex");
}

test("buildSignTextMessage matches official client sign captures", () => {
  assert.deepEqual(buildSignTextMessage("mymessage", "on-hover"), {
    type: 5,
    cmd: "sign_text",
    args: ["mymessage", 2]
  });
  assert.equal(
    hex(encodeMsgpack(buildSignTextMessage("mymessage", "on-hover"))),
    "83a47479706505a3636d64a97369676e5f74657874a46172677392a96d796d65737361676502",
    "save-sign-with-text-mymessage-and-mode-on-hover.jsonl"
  );
  assert.equal(
    hex(encodeMsgpack(buildSignTextMessage("myothermessage", "when-near"))),
    "83a47479706505a3636d64a97369676e5f74657874a46172677392ae6d796f746865726d65737361676501",
    "save-sign-with-text-myothermessage-and-mode-when-near.jsonl"
  );
});

test("normalizeSignDisplayMode accepts public API aliases", () => {
  assert.equal(normalizeSignDisplayMode(), 0);
  assert.equal(normalizeSignDisplayMode("always"), 0);
  assert.equal(normalizeSignDisplayMode(0), 0);
  assert.equal(normalizeSignDisplayMode("when-near"), 1);
  assert.equal(normalizeSignDisplayMode("whenNear"), 1);
  assert.equal(normalizeSignDisplayMode("near"), 1);
  assert.equal(normalizeSignDisplayMode(1), 1);
  assert.equal(normalizeSignDisplayMode("on-hover"), 2);
  assert.equal(normalizeSignDisplayMode("onHover"), 2);
  assert.equal(normalizeSignDisplayMode("hover"), 2);
  assert.equal(normalizeSignDisplayMode(2), 2);
  assert.throws(() => normalizeSignDisplayMode("invalid"), /sign display mode/);
});

test("signDisplayModeName maps numeric display modes", () => {
  assert.equal(signDisplayModeName(0), "always");
  assert.equal(signDisplayModeName(1), "when-near");
  assert.equal(signDisplayModeName(2), "on-hover");
  assert.equal(signDisplayModeName(3), null);
});
