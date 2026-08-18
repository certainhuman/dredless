import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { WorldStore } from "../src/game/world.js";
import { decodeMsgpack } from "../src/protocol/msgpack.js";

function officialCaptureUrl(name) {
  return new URL(`./fixtures/${name}`, import.meta.url);
}

function applyOfficialCapture(store, name, onPacket = null) {
  const url = officialCaptureUrl(name);
  if (!fs.existsSync(url)) return false;
  const text = fs.readFileSync(url, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch (_) { continue; }
    if (event.event !== "official-ws-frame" || event.direction !== "in" || !event.data?.base64) continue;
    const packet = decodeMsgpack(Buffer.from(event.data.base64, "base64"));
    const update = store.apply(packet);
    if (onPacket) onPacket({ store, packet, update, event });
  }
  return true;
}

function componentInAnyWorld(store, entityId, component) {
  for (const world of store.worlds.values()) {
    const entity = world.model.entity(entityId);
    const value = entity?.contents?.[component];
    if (value) return value;
  }
  return null;
}

function componentInWorld(store, worldId, entityId, component) {
  const entity = store.worlds.get(worldId)?.model.entity(entityId);
  return entity?.contents?.[component] || null;
}

test("loader transfer state exposes held item while an item is moving", (t) => {
  const store = new WorldStore();
  const samples = [];
  if (!applyOfficialCapture(store, "machine-progress-loader-transfer.jsonl", ({ store: currentStore }) => {
    const loader = componentInAnyWorld(currentStore, 25, "loader");
    if (loader) samples.push(loader);
  })) t.skip("capture not present");

  assert.ok(samples.some((loader) => loader.active && loader.heldItemId === 232), "loader reports the iron block while it is held for transfer");
  assert.equal(samples.at(-1).active, false, "loader is inactive after the held item leaves");
});

test("fabricator progress exposes clamped progress, raw progress, and crafting item", (t) => {
  const store = new WorldStore();
  if (!applyOfficialCapture(store, "machine-progress-loader-transfer.jsonl")) t.skip("baseline capture not present");

  const samples = [];
  if (!applyOfficialCapture(store, "machine-progress-fabricator.jsonl", ({ store: currentStore }) => {
    const fabricator = componentInAnyWorld(currentStore, 44, "fabricator");
    if (fabricator) samples.push(fabricator);
  })) t.skip("capture not present");

  assert.equal(Math.max(...samples.map((fab) => fab.progressRaw ?? -Infinity)), 102);
  assert.equal(Math.max(...samples.map((fab) => fab.progress ?? -Infinity)), 100);
  assert.ok(samples.some((fab) => fab.active && fab.craftingItemId === 105), "fabricator reports the ship shield booster while crafting");
  assert.equal(samples.at(-1).active, false);
  assert.equal(samples.at(-1).progress, 0);
});


test("cargo hatch pickup animation exposes openFraction", (t) => {
  const store = new WorldStore();
  const samples = [];
  if (!applyOfficialCapture(store, "machine-progress-cargo-hatch.jsonl", ({ store: currentStore }) => {
    const hatch = componentInWorld(currentStore, 13282, 52, "cargoHatch");
    if (hatch?.openFraction != null) samples.push(hatch.openFraction);
  })) t.skip("capture not present");

  assert.deepEqual([...new Set(samples)], [0.25, 0.5, 0.75, 1, 0]);
});

test("cargo ejector owns table 49 progress state instead of generic processor", (t) => {
  const store = new WorldStore();
  if (!applyOfficialCapture(store, "machine-progress-loader-samples.jsonl")) t.skip("capture not present");

  const ejectors = [];
  for (const world of store.worlds.values()) {
    ejectors.push(...world.model.machines().cargoEjectors);
    assert.equal(world.model.machines().processors, undefined);
    assert.equal(world.model.entities().some((entity) => entity.contents?.processor), false);
  }

  assert.ok(ejectors.some((ejector) => ejector.typeId === 223 && ejector.progress === 4 && ejector.active === true));
});
