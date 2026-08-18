import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { WorldStore } from "../src/game/world.js";
import { decodeMsgpack } from "../src/protocol/msgpack.js";

const capture = new URL("./fixtures/pvp-event.jsonl", import.meta.url);

test("pvp event capture replays without frame or model decode errors", (t) => {
  if (!fs.existsSync(capture)) t.skip("test/fixtures/pvp-event.jsonl is not present");

  const store = new WorldStore();
  const errors = [];
  let incomingFrames = 0;
  let packets = 0;
  let sfxEvents = 0;
  let hatchWarnings = 0;
  let combatArenaPackets = 0;

  const lines = fs.readFileSync(capture, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch (_) { continue; }
    if (record.event !== "official-ws-frame" || record.direction !== "in" || !record.data?.base64) continue;
    incomingFrames += 1;

    let packet;
    try {
      packet = decodeMsgpack(Buffer.from(record.data.base64, "base64"));
      packets += 1;
    } catch (error) {
      errors.push({ line: index + 1, phase: "msgpack", message: error.message });
      continue;
    }

    if (packet.world === 50) combatArenaPackets += 1;

    for (const event of packet.events || []) {
      if (event.type === "sfx") sfxEvents += 1;
      if (event.type === "hatch_warning") hatchWarnings += 1;
    }

    try {
      store.apply(packet);
    } catch (error) {
      errors.push({ line: index + 1, phase: "world", message: error.message, type: packet.type, world: packet.world });
    }
  }

  assert.equal(errors.length, 0, JSON.stringify(errors.slice(0, 10), null, 2));
  assert.equal(incomingFrames, 33351);
  assert.equal(packets, incomingFrames);
  assert.ok(sfxEvents > 50000, "capture includes the heavy PvP sfx event stream");
  assert.equal(hatchWarnings, 59);
  assert.ok(combatArenaPackets > 10000, "Combat Arena overworld packets are present");
});
