import assert from "node:assert/strict";
import test from "node:test";

import { encodeMsgpack } from "../src/protocol/msgpack.js";
import {
  buildShipPrivacyMessage,
  buildStarterRecoveryMessage,
  normalizePrivacy
} from "../src/protocol/ship-management.js";

function hex(value) {
  return Buffer.from(value).toString("hex");
}

test("buildShipPrivacyMessage matches official client privacy captures", () => {
  assert.deepEqual(buildShipPrivacyMessage("public"), { type: 4, act: "set_privacy", arg: 0 });
  assert.deepEqual(buildShipPrivacyMessage("private"), { type: 4, act: "set_privacy", arg: 1 });
  assert.equal(
    hex(encodeMsgpack(buildShipPrivacyMessage("public"))),
    "83a47479706504a3616374ab7365745f70726976616379a361726700",
    "change-ship-privacy-to-public.jsonl"
  );
  assert.equal(
    hex(encodeMsgpack(buildShipPrivacyMessage("private"))),
    "83a47479706504a3616374ab7365745f70726976616379a361726701",
    "change-ship-privacy-to-private.jsonl"
  );
});

test("buildStarterRecoveryMessage matches official client recovery captures", () => {
  assert.deepEqual(buildStarterRecoveryMessage(216), { type: 4, act: "starter_recovery", arg: 216 });
  assert.equal(
    hex(encodeMsgpack(buildStarterRecoveryMessage(216))),
    "83a47479706504a3616374b0737461727465725f7265636f76657279a3617267ccd8",
    "reclaim-starter-helm.jsonl"
  );
});

test("normalizePrivacy accepts public API aliases", () => {
  assert.equal(normalizePrivacy("public"), 0);
  assert.equal(normalizePrivacy(false), 0);
  assert.equal(normalizePrivacy(0), 0);
  assert.equal(normalizePrivacy("private"), 1);
  assert.equal(normalizePrivacy(true), 1);
  assert.equal(normalizePrivacy(1), 1);
  assert.throws(() => normalizePrivacy("friends"), /privacy/);
});
