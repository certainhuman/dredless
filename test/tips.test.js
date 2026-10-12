import assert from "node:assert/strict";
import test from "node:test";
import {DredlessClient} from "../src/client/index.js";
import {ModelState} from "../src/state/model/index.js";
import {decodeMsgpack, encodeMsgpack} from "../src/protocol/codec/msgpack.js";

const options = ["Restrict to Captains", "Restrict to Crew", "Restrict to Guests"];

function setup() {
  let onMessage;
  const ws = {readyState: 1, send() {}, addEventListener(type, callback) {
    if (type === "message") onMessage = callback;
  }};
  const client = DredlessClient.attachWebSocket(ws);
  const packet = (value) => onMessage({data: encodeMsgpack(value)});
  packet({type: 21, sid: 123, world: 1});
  const world = client.worlds.get(1);
  world.isOverworld = false;
  world.model.setWorldKind(false);
  world.model.tables.set(0, new Map([[22, {q20: 280, q24: 80}], [23, {q20: 300, q24: 80}]]));
  world.model.tables.set(7, new Map([[22, {q20: 220}], [23, {q20: 219}]]));
  world.model.tables.set(8, new Map([[22, {q20: 3}], [23, {q20: 1}]]));
  const commands = [];
  const menu = (list = options, id = 1) => packet({type: 20, world: id,
    events: [{type: "tip_list", filter: 123, x: 7, y: 2, options: list}]});
  ws.send = (bytes) => commands.push(decodeMsgpack(bytes));
  const changeRank = (id, rank) => {
    const next = new ModelState({isOverworld: false});
    next.tables = new Map(world.model.tables);
    next.tables.set(8, new Map(world.model.tables.get(8)));
    next.tables.get(8).set(id, {q20: rank});
    world.model = next;
    client.emit("model", {world});
  };
  return {client, ws, menu, commands, changeRank, door: client.ship().machines.door(22),
    spawn: client.ship().machines.spawnPoint(23)};
}

test("tips open and select captured options while preserving raw side events", async () => {
  const {client, door, menu, commands} = setup();
  let raw;
  client.on("side-event", (event) => { raw = event; });
  const pending = door.openTips();
  assert.equal(commands[0].focus_ent, 22);
  assert.equal(commands[0].act2, true);
  assert.equal(commands[0].mx, 7);
  menu();
  const list = await pending;
  assert.equal(list.entity, 22);
  assert.deepEqual(list.options, options);
  assert.ok(Object.isFrozen(list.options));
  assert.equal(raw.type, "tip_list");
  assert.throws(() => client.tips.select("Missing"), RangeError);
  assert.equal(client.tips.select("Restrict to Crew"), client);
  assert.equal(commands[1].tip_select, 1);
  assert.equal(commands[1].act2, false);
  assert.equal(commands[1].focus_ent, 22);
  assert.equal(client.tips.current, null);
  assert.throws(() => client.tips.select(0), /Open/);
});

test("tip operations ignore another world's menu and reject overlap", async () => {
  const {client, door, menu} = setup();
  const pending = client.tips.choose(door, 2);
  await assert.rejects(door.openTips(), /already in progress/);
  assert.throws(() => client.tips.select(0), /already in progress/);
  menu(options, 2);
  menu();
  assert.equal(await pending, client);
});

test("empty menus, timeout and disconnect clear state and release pending operations", async () => {
  const {client, door, menu} = setup();
  const pending = door.openTips({timeout: 20});
  menu([]);
  assert.equal(client.tips.current, null);
  await assert.rejects(pending, /Timed out/);
  const next = door.openTips();
  client.emit("close", {});
  await assert.rejects(next, /Disconnected/);
  assert.equal(client.tips.current, null);
});

test("door and spawn rank setters map names to menu indices and wait for confirmation", async () => {
  const {client, door, spawn, menu, commands, changeRank} = setup();
  const doorPending = door.setRank("crew");
  menu();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(commands[1].tip_select, 1);
  changeRank(22, 1);
  assert.equal(await doorPending, client);
  const spawnPending = spawn.setRank(0);
  menu();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(commands[3].focus_ent, 23);
  assert.equal(commands[3].tip_select, 2);
  changeRank(23, 0);
  assert.equal(await spawnPending, client);
  const captainPending = spawn.setRank("captain");
  menu();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(commands[5].tip_select, 0);
  changeRank(23, 3);
  await captainPending;
  await spawn.setRank(3);
  assert.equal(commands.length, 6, "same rank sends no commands");
  await assert.rejects(door.setRank(2), RangeError);
});

test("rank setter rejects when the server does not confirm the change", async () => {
  const {door, menu} = setup();
  const pending = door.setRank("guest", {timeout: 20});
  menu();
  await assert.rejects(pending, /access rank update/);
});

test("readonly send failure cleans up and targets outside the current world reject", async () => {
  const {client, door} = setup();
  client.send = () => { throw new Error("readonly"); };
  await assert.rejects(door.openTips(), /readonly/);
  await assert.rejects(door.openTips(), /readonly/);
  client.worlds.currentWorldId = 2;
  await assert.rejects(door.openTips(), /current world/);
});

test("tips close sends captured dismissal input and waits for the same world's empty menu", async () => {
  const {client, door, menu, commands} = setup();
  const opening = door.openTips();
  menu();
  await opening;
  let completed = false;
  const closing = client.tips.close({command: {mx: 8.325, my: 2.727}})
    .then((value) => { completed = true; return value; });
  assert.equal(commands[1].act1, true);
  assert.equal(commands[1].act1_held, true);
  assert.equal(commands[1].act2, false);
  assert.equal(commands[1].focus_ent, null);
  assert.equal(commands[1].config_ent, null);
  assert.equal(commands[1].tip_select, null);
  assert.equal(commands[1].mx, Math.fround(8.325));
  await assert.rejects(door.openTips(), /already in progress/);
  menu([], 2);
  await Promise.resolve();
  assert.equal(completed, false);
  menu([]);
  assert.equal(await closing, client);
  assert.equal(client.tips.current, null);
  await client.tips.close();
  assert.equal(commands.length, 2, "closing an absent menu sends nothing");
});

test("tips close rejects on timeout and disconnect", async () => {
  const {client, door, menu} = setup();
  let opening = door.openTips();
  menu();
  await opening;
  await assert.rejects(client.tips.close({timeout: 20}), /tip menu dismissal/);
  opening = door.openTips();
  menu();
  await opening;
  const closing = client.tips.close();
  client.emit("close", {});
  await assert.rejects(closing, /Disconnected/);
});
