import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Blueprint, Item, Structure } from "dsa-shipshape";
import { ModelState } from "../src/game/model.js";
import { generateGeneratorMaze, solveGeneratorMazeSeed } from "../src/game/generator-maze.js";
import { WorldState, WorldStore } from "../src/game/world.js";
import {
  buildCargoEjectorClipboardDirectionData,
  buildCargoEjectorCopyConfigData,
  buildCargoEjectorPasteConfigData,
  buildCargoHatchCopyConfigData,
  buildCargoHatchFilterConfigData,
  buildCargoHatchFilterItemsData,
  buildCargoHatchFullConfigData,
  buildExpandoClipboardAngleData,
  buildGeneratorClipboardDirectionData,
  buildGeneratorMazePuzzleData,
  buildLoaderClipboardConfigData,
  buildLoaderConfigData,
  buildLoaderCopyConfigData,
  buildLoaderFilterConfigData,
  buildLoaderFilterItemsData,
  buildLoaderFullConfigData,
  buildNavigationUnitClipboardConfigData,
  buildNavigationUnitConfigData,
  buildNavigationUnitPasteConfigData,
  buildPusherConfigData,
  buildPusherFilterItemsData
} from "../src/protocol/ui-config.js";
import {
  fixtureByName,
  loaderBlueprintFixtures,
  normalizeLoaderBuild
} from "./loader-blueprint-fixtures.js";

const WORLD = 11479;
const ENTITY = 27;
const NAV_HUMMINGBIRD = 10;
const NAV_FINCH = 20;
const NAV_SPARROW = 30;
const NAV_RAVEN = 40;
const NAV_FALCON = 50;
const NAV_COMBAT_ARENA = 60;

function navEncoded(baseId) {
  return baseId - 1;
}

function unsigned(value) {
  const bytes = [];
  let raw = value;
  do {
    let byte = raw & 0x7f;
    raw = Math.floor(raw / 128);
    if (raw) byte |= 0x80;
    bytes.push(byte);
  } while (raw);
  return bytes;
}

function streamInt(value) {
  return unsigned(value >= 0 ? value * 2 : (-value * 2) - 1);
}

function fieldDelta(value) {
  return unsigned(value >= 0 ? value * 2 : (-value * 2) + 1);
}

function textBlob(value) {
  const bytes = new TextEncoder().encode(value);
  return [...streamInt(bytes.length), ...bytes];
}

function table78Section(tag, entity, mask, deltas) {
  return [
    ...streamInt(tag),
    ...streamInt(entity),
    ...unsigned(mask),
    ...deltas.flatMap(fieldDelta),
    ...streamInt(0)
  ];
}

function table54Section(entity, mask, deltas) {
  return tableSection(137, entity, mask, deltas.flatMap(fieldDelta));
}

function tableSection(tag, entity, mask, payload) {
  return [
    ...streamInt(tag),
    ...streamInt(entity),
    ...unsigned(mask),
    ...payload,
    ...streamInt(0)
  ];
}

function modelData(generation, ...sections) {
  return Uint8Array.from([
    ...streamInt(generation),
    ...sections.flat(),
    ...streamInt(0)
  ]);
}

function normalizeSlots(slots) {
  return slots == null ? null : slots.map((slot) => slot?.itemId ?? slot ?? null);
}

function hex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function reviveLogValue(value) {
  if (Array.isArray(value)) return value.map(reviveLogValue);
  if (value && typeof value === "object") {
    if (typeof value.$binary === "string") return new Uint8Array(Buffer.from(value.$binary, "base64"));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveLogValue(item)]));
  }
  return value;
}

function captureUrl(name) {
  return new URL(`./fixtures/${name}`, import.meta.url);
}

function replayCapture(name) {
  const store = new WorldStore();
  const text = fs.readFileSync(captureUrl(name), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const event = reviveLogValue(JSON.parse(line));
    if (event.event === "packet" && event.packet) store.apply(event.packet);
  }
  return store;
}

function replayCaptureUntil(name, predicate) {
  const store = new WorldStore();
  const text = fs.readFileSync(captureUrl(name), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const event = reviveLogValue(JSON.parse(line));
    if (event.event !== "packet" || !event.packet) continue;
    const update = store.apply(event.packet);
    if (predicate(update, store)) return store;
  }
  return store;
}

function placedLoaderEntities(world) {
  return world.model.entities().filter((entity) =>
    entity.transform && entity.contents?.loader && entity.typeId === Item.LOADER_PACKAGED
  );
}

function assertFixturePositionsPresent(world, fixture, offsetX, offsetY) {
  const positions = new Set(placedLoaderEntities(world).map((entity) => `${entity.transform.x},${entity.transform.y}`));
  for (const loader of fixture.loaders) {
    assert.ok(
      positions.has(`${loader.x + offsetX},${loader.y + offsetY}`),
      `${fixture.name} missing loader ${loader.name}`
    );
  }
}

function assertFixtureLoadersMatch(world, fixture, offsetX, offsetY) {
  const byPosition = new Map(placedLoaderEntities(world).map((entity) => [`${entity.transform.x},${entity.transform.y}`, entity]));
  for (const loader of fixture.loaders) {
    const entity = byPosition.get(`${loader.x + offsetX},${loader.y + offsetY}`);
    assert.ok(entity, `${fixture.name} missing loader ${loader.name}`);
    assertLoaderMatchesFixture(entity.contents.loader, loader, `${fixture.name} ${loader.name}`);
  }
}

function assertLoaderMatchesFixture(loader, expected, message) {
  assert.equal(loader.pick, expected.pick, `${message} pick`);
  assert.equal(loader.place, expected.place, `${message} place`);
  assert.equal(loader.priority, expected.priority, `${message} priority`);
  assert.equal(loader.requireOutput, expected.requireOutput, `${message} requireOutput`);
  assert.equal(loader.waitForStack, expected.waitForStack, `${message} waitForStack`);
  assert.equal(loader.stack, expected.stack, `${message} stack`);
  assert.equal(loader.cycle, expected.cycle, `${message} cycle`);
  assert.equal(loader.filterMode, expected.filterMode, `${message} filterMode`);
  assert.deepEqual(normalizeSlots(loader.filterSlots), expected.filterSlots, `${message} filterSlots`);
}

function assertFixturePositionsMatch(left, right) {
  assert.deepEqual(
    left.loaders.map((loader) => [loader.name, loader.x, loader.y]),
    right.loaders.map((loader) => [loader.name, loader.x, loader.y])
  );
}

function fixtureDeltaMasks(baseFixture, reconfiguredFixture) {
  const baseByName = fixtureByName(baseFixture);
  return [...new Set(reconfiguredFixture.loaders.map((loader) =>
    loaderSemanticDeltaParts(baseByName.get(loader.name), loader).mask
  ))].sort((a, b) => a - b);
}

function loaderSemanticDeltaParts(before, after) {
  const pickDelta = after.pick - before.pick;
  const placeDelta = after.place - before.place;
  const priorityDelta = after.priority - before.priority;
  const stackDelta = after.stack - before.stack;
  const cycleDelta = Math.round((after.cycle - before.cycle) * 20);
  let mask = 96;
  const values = [0];

  if (placeDelta) {
    mask |= 2;
    values.push(placeDelta);
  }
  if (pickDelta) {
    mask |= 1;
    values.splice(1, 0, pickDelta);
  }
  if (priorityDelta) {
    mask |= 4;
    values.push(priorityDelta);
  }
  if (stackDelta) {
    mask |= 8;
    values.push(stackDelta);
  }
  if (cycleDelta) {
    mask |= 16;
    values.push(cycleDelta);
  }

  return { mask, values };
}

test("dsa-shipshape loader blueprint fixtures round-trip normalized configs", () => {
  assert.ok(loaderBlueprintFixtures.matrix.loaders.length >= 100, "matrix fixture should stay dense");
  assert.ok(loaderBlueprintFixtures.pairMatrix.loaders.length >= 160, "pair matrix fixture should cover all pick/place pairs");
  assert.ok(loaderBlueprintFixtures.checkerMatrix.loaders.length >= 60, "checker matrix fixture should stay dense");
  assert.ok(loaderBlueprintFixtures.deltaBase.loaders.length >= 60, "delta base fixture should stay dense");
  assert.ok(loaderBlueprintFixtures.delta2Base.loaders.length >= 80, "second delta base fixture should stay dense");
  assert.ok(loaderBlueprintFixtures.delta3Base.loaders.length >= 50, "third delta base fixture should stay dense");
  assert.ok(loaderBlueprintFixtures.delta4Base.loaders.length >= 60, "fourth delta base fixture should stay dense");
  assert.ok(loaderBlueprintFixtures.delta5Base.loaders.length >= 60, "fifth delta base fixture should stay dense");
  assert.ok(loaderBlueprintFixtures.delta6Base.loaders.length >= 60, "sixth delta base fixture should stay dense");
  assert.ok(loaderBlueprintFixtures.deltaGapCycleBase.loaders.length >= 128, "cycle gap fixture should cover every mask repeatedly");
  assert.ok(loaderBlueprintFixtures.deltaGapNoCycleBase.loaders.length >= 64, "no-cycle gap fixture should probe every mask repeatedly");
  assert.ok(loaderBlueprintFixtures.deltaMultiBase.loaders.length >= 64, "multi-step delta fixture should stay dense");
  assert.equal(
    loaderBlueprintFixtures.deltaReconfigured.loaders.length,
    loaderBlueprintFixtures.deltaBase.loaders.length,
    "delta fixtures must reconfigure the same loader count"
  );
  assert.equal(
    loaderBlueprintFixtures.delta2Reconfigured.loaders.length,
    loaderBlueprintFixtures.delta2Base.loaders.length,
    "second delta fixtures must reconfigure the same loader count"
  );
  assert.equal(
    loaderBlueprintFixtures.delta3Reconfigured.loaders.length,
    loaderBlueprintFixtures.delta3Base.loaders.length,
    "third delta fixtures must reconfigure the same loader count"
  );
  assert.equal(
    loaderBlueprintFixtures.delta4Reconfigured.loaders.length,
    loaderBlueprintFixtures.delta4Base.loaders.length,
    "fourth delta fixtures must reconfigure the same loader count"
  );
  assert.equal(
    loaderBlueprintFixtures.delta5Reconfigured.loaders.length,
    loaderBlueprintFixtures.delta5Base.loaders.length,
    "fifth delta fixtures must reconfigure the same loader count"
  );
  assert.equal(
    loaderBlueprintFixtures.delta6Reconfigured.loaders.length,
    loaderBlueprintFixtures.delta6Base.loaders.length,
    "sixth delta fixtures must reconfigure the same loader count"
  );
  assert.equal(
    loaderBlueprintFixtures.deltaGapCycleReconfigured.loaders.length,
    loaderBlueprintFixtures.deltaGapCycleBase.loaders.length,
    "cycle gap delta fixtures must reconfigure the same loader count"
  );
  assert.equal(
    loaderBlueprintFixtures.deltaGapNoCycleReconfigured.loaders.length,
    loaderBlueprintFixtures.deltaGapNoCycleBase.loaders.length,
    "no-cycle gap delta fixtures must reconfigure the same loader count"
  );
  assert.equal(
    loaderBlueprintFixtures.deltaMultiStep1.loaders.length,
    loaderBlueprintFixtures.deltaMultiBase.loaders.length,
    "multi-step first delta fixture must reconfigure the same loader count"
  );
  assert.equal(
    loaderBlueprintFixtures.deltaMultiStep2.loaders.length,
    loaderBlueprintFixtures.deltaMultiBase.loaders.length,
    "multi-step second delta fixture must reconfigure the same loader count"
  );
  assert.equal(
    loaderBlueprintFixtures.deltaMultiStep3.loaders.length,
    loaderBlueprintFixtures.deltaMultiBase.loaders.length,
    "multi-step third delta fixture must reconfigure the same loader count"
  );

  for (const fixture of Object.values(loaderBlueprintFixtures)) {
    const decoded = Structure.fromBlueprint(Blueprint.decode(fixture.code));
    const actual = decoded.getAll()
      .filter((build) => build.item === Item.LOADER_PACKAGED)
      .map(normalizeLoaderBuild)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const expected = fixture.loaders.map(({ name, ...loader }) => loader);
    assert.deepEqual(actual, expected, `${fixture.name} round trip`);
  }

  assertFixturePositionsMatch(loaderBlueprintFixtures.deltaBase, loaderBlueprintFixtures.deltaReconfigured);
  assertFixturePositionsMatch(loaderBlueprintFixtures.delta2Base, loaderBlueprintFixtures.delta2Reconfigured);
  assertFixturePositionsMatch(loaderBlueprintFixtures.delta3Base, loaderBlueprintFixtures.delta3Reconfigured);
  assertFixturePositionsMatch(loaderBlueprintFixtures.delta4Base, loaderBlueprintFixtures.delta4Reconfigured);
  assertFixturePositionsMatch(loaderBlueprintFixtures.delta5Base, loaderBlueprintFixtures.delta5Reconfigured);
  assertFixturePositionsMatch(loaderBlueprintFixtures.delta6Base, loaderBlueprintFixtures.delta6Reconfigured);
  assertFixturePositionsMatch(loaderBlueprintFixtures.deltaGapCycleBase, loaderBlueprintFixtures.deltaGapCycleReconfigured);
  assertFixturePositionsMatch(loaderBlueprintFixtures.deltaGapNoCycleBase, loaderBlueprintFixtures.deltaGapNoCycleReconfigured);
  assertFixturePositionsMatch(loaderBlueprintFixtures.deltaMultiBase, loaderBlueprintFixtures.deltaMultiStep1);
  assertFixturePositionsMatch(loaderBlueprintFixtures.deltaMultiBase, loaderBlueprintFixtures.deltaMultiStep2);
  assertFixturePositionsMatch(loaderBlueprintFixtures.deltaMultiBase, loaderBlueprintFixtures.deltaMultiStep3);
});

test("loader gap fixtures cover suspected semantic delta masks", () => {
  assert.deepEqual(
    fixtureDeltaMasks(loaderBlueprintFixtures.deltaGapCycleBase, loaderBlueprintFixtures.deltaGapCycleReconfigured),
    Array.from({ length: 16 }, (_, index) => 112 + index),
    "cycle gap fixture masks"
  );
  assert.deepEqual(
    fixtureDeltaMasks(loaderBlueprintFixtures.deltaGapNoCycleBase, loaderBlueprintFixtures.deltaGapNoCycleReconfigured),
    Array.from({ length: 16 }, (_, index) => 96 + index),
    "no-cycle gap fixture masks"
  );
  assert.deepEqual(
    fixtureDeltaMasks(loaderBlueprintFixtures.deltaMultiBase, loaderBlueprintFixtures.deltaMultiStep1),
    Array.from({ length: 16 }, (_, index) => 112 + index),
    "multi-step first delta masks"
  );
  assert.deepEqual(
    fixtureDeltaMasks(loaderBlueprintFixtures.deltaMultiStep1, loaderBlueprintFixtures.deltaMultiStep2),
    Array.from({ length: 16 }, (_, index) => 96 + index),
    "multi-step second delta masks"
  );
  assert.deepEqual(
    fixtureDeltaMasks(loaderBlueprintFixtures.deltaMultiStep2, loaderBlueprintFixtures.deltaMultiStep3),
    Array.from({ length: 16 }, (_, index) => 112 + index),
    "multi-step third delta masks"
  );
});

test("loader blueprint captures replay and match fixture configs", () => {
  const captures = [
    ["loader-config-matrix.jsonl", loaderBlueprintFixtures.matrix, 11.5, 11.5],
    ["loader-delta.jsonl", loaderBlueprintFixtures.deltaReconfigured, 12.5, 11.5],
    ["loader-config-pairs.jsonl", loaderBlueprintFixtures.pairMatrix, 7.5, 11.5],
    ["loader-delta-2.jsonl", loaderBlueprintFixtures.delta2Reconfigured, 12.5, 13.5],
    ["loader-config-checker.jsonl", loaderBlueprintFixtures.checkerMatrix, 9.5, 9.5],
    ["loader-delta-3.jsonl", loaderBlueprintFixtures.delta3Reconfigured, 12.5, 11.5],
    ["loader-delta-4.jsonl", loaderBlueprintFixtures.delta4Reconfigured, 11.5, 11.5],
    ["loader-delta-5.jsonl", loaderBlueprintFixtures.delta5Reconfigured, 11.5, 11.5],
    ["loader-delta-6.jsonl", loaderBlueprintFixtures.delta6Reconfigured, 11.5, 11.5],
    ["loader-delta-gap-cycle.jsonl", loaderBlueprintFixtures.deltaGapCycleReconfigured, 9.5, 11.5],
    ["loader-delta-gap-cycle-2.jsonl", loaderBlueprintFixtures.deltaGapCycleReconfigured, 9.5, 11.5],
    ["loader-delta-gap-no-cycle.jsonl", loaderBlueprintFixtures.deltaGapNoCycleReconfigured, 9.5, 15.5],
    ["loader-delta-multi.jsonl", loaderBlueprintFixtures.deltaMultiStep3, 9.5, 12.5]
  ];

  for (const [name, fixture, offsetX, offsetY] of captures) {
    const store = replayCapture(name);
    const world = store.shipWorld();
    assert.ok(world, `${name} ship world`);
    assert.deepEqual(world.model.errors, [], `${name} decode errors`);
    assert.equal(placedLoaderEntities(world).length, fixture.loaders.length, `${name} loader count`);
    assertFixturePositionsPresent(world, fixture, offsetX, offsetY);
    assertFixtureLoadersMatch(world, fixture, offsetX, offsetY);
  }
});

test("ModelState exposes normalized pusher configuration", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    table78Section(163, ENTITY, 4, [450])
  ), { full: true });

  let pusher = model.entity(ENTITY).contents.pusher;
  assert.equal(pusher.mode, 2);
  assert.equal(pusher.modeName, "Do Nothing");
  assert.equal(pusher.filteredMode, 0);
  assert.equal(pusher.filteredModeName, "Push");
  assert.equal(pusher.angle, 45);
  assert.equal(pusher.speed, 20);
  assert.equal(pusher.length, 1000);
  assert.equal(pusher.filterInventory, false);

  model.apply(modelData(
    2,
    tableSection(163, ENTITY, 63, [
      ...unsigned(1),
      ...[-1, 2, 1350, 500, 50].flatMap(fieldDelta)
    ]),
    table78Section(161, ENTITY, 7, [100, 101, 103])
  ), { full: true });

  pusher = model.entity(ENTITY).contents.pusher;
  assert.equal(model.entity(ENTITY).contents.loader, undefined);
  assert.equal(pusher.mode, 1);
  assert.equal(pusher.modeName, "Pull");
  assert.equal(pusher.filteredMode, 2);
  assert.equal(pusher.filteredModeName, "Do Nothing");
  assert.equal(pusher.angle, 180);
  assert.equal(pusher.speed, 25);
  assert.equal(pusher.length, 1005);
  assert.equal(pusher.filterInventory, true);
  assert.deepEqual(pusher.filterSlots, [100, 101, 103]);
});

test("ModelState does not classify cargo hatch filter tables as loader config", () => {
  const model = new ModelState();
  const hatch = 221;
  model.apply(modelData(
    1,
    tableSection(43, hatch, 1, fieldDelta(221)),
    tableSection(160, hatch, 1, fieldDelta(2)),
    tableSection(161, hatch, 4, fieldDelta(152))
  ), { full: true });

  const entity = model.entity(hatch);
  assert.equal(entity.typeId, 221);
  assert.equal(entity.typeName, "Cargo Hatch (Packaged)");
  assert.equal(entity.contents?.loader, undefined);
  assert.equal(entity.contents?.cargoHatch?.filterMode, 2);
  assert.equal(entity.contents?.cargoHatch?.filterModeName, "allow-filter");
  assert.deepEqual(entity.contents?.cargoHatch?.filterSlots, [null, null, 152]);
  assert.equal(model.machines().cargoHatches.length, 1);
  assert.equal(entity.kind.includes("loader"), false);
  assert.equal(entity.kind.includes("cargo_hatch"), true);
});

test("ModelState does not classify navigation unit table 78 state as loader config", () => {
  const model = new ModelState();
  const nav = 261;
  model.apply(modelData(
    1,
    tableSection(43, nav, 1, fieldDelta(261)),
    table78Section(162, nav, 25, [navEncoded(NAV_FALCON), 1, 0])
  ));

  const entity = model.entity(nav);
  assert.equal(entity.typeId, 261);
  assert.equal(entity.typeName, "Navigation Unit (Starter, Packaged)");
  assert.equal(entity.contents?.loader, undefined);
  assert.equal(entity.contents?.navigationUnit?.destination, NAV_FALCON);
  assert.equal(entity.contents?.navigationUnit?.destinationName, "falcon");
  assert.equal(entity.contents?.navigationUnit?.autoWarpOnShieldFailure, false);
  assert.equal(entity.contents?.navigationUnit?.autoWarpOnNoCaptains, false);
  assert.equal(entity.kind.includes("loader"), false);
  assert.equal(entity.kind.includes("navigation_unit"), true);
});

test("ModelState decodes navigation unit auto-warp baseline flags", () => {
  const enabled = new ModelState();
  enabled.apply(modelData(
    1,
    tableSection(43, 261, 1, fieldDelta(261)),
    table78Section(162, 261, 3, [navEncoded(NAV_RAVEN), 1])
  ));
  assert.equal(enabled.entity(261).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(enabled.entity(261).contents.navigationUnit.autoWarpOnNoCaptains, true);

  const disabled = new ModelState();
  disabled.apply(modelData(
    1,
    tableSection(43, 262, 1, fieldDelta(261)),
    table78Section(162, 262, 19, [0, navEncoded(NAV_RAVEN), 1])
  ));
  assert.equal(disabled.entity(262).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(disabled.entity(262).contents.navigationUnit.autoWarpOnNoCaptains, false);

  const shieldDisabled = new ModelState();
  shieldDisabled.apply(modelData(
    1,
    tableSection(43, 263, 1, fieldDelta(261)),
    table78Section(162, 263, 11, [0, navEncoded(NAV_RAVEN), 1])
  ));
  assert.equal(shieldDisabled.entity(263).contents.navigationUnit.destination, NAV_RAVEN);
  assert.equal(shieldDisabled.entity(263).contents.navigationUnit.destinationName, "raven");
  assert.equal(shieldDisabled.entity(263).contents.navigationUnit.autoWarpOnShieldFailure, false);
  assert.equal(shieldDisabled.entity(263).contents.navigationUnit.autoWarpOnNoCaptains, true);

  const bothDisabled = new ModelState();
  bothDisabled.apply(modelData(
    1,
    tableSection(43, 264, 1, fieldDelta(261)),
    table78Section(162, 264, 25, [0, navEncoded(NAV_SPARROW), 0])
  ));
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destination, NAV_SPARROW);
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destinationName, "sparrow");
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.autoWarpOnShieldFailure, false);
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.autoWarpOnNoCaptains, false);

  bothDisabled.apply(modelData(2, table78Section(162, 264, 2, [1])));
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destination, NAV_SPARROW);
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destinationName, "sparrow");

  bothDisabled.apply(modelData(3, table78Section(162, 264, 2, [-1])));
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destination, NAV_SPARROW);
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destinationName, "sparrow");

  bothDisabled.apply(modelData(4, table78Section(162, 264, 27, [0, 2, -1, 0])));
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destination, NAV_SPARROW);
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destinationName, "sparrow");
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.autoWarpOnShieldFailure, false);
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.autoWarpOnNoCaptains, false);

  bothDisabled.apply(modelData(5, table78Section(162, 264, 1, [-10])));
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destination, NAV_FINCH);
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destinationName, "finch");

  bothDisabled.apply(modelData(6, table78Section(162, 264, 1, [30])));
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destination, NAV_FALCON);
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destinationName, "falcon");

  bothDisabled.apply(modelData(7, table78Section(162, 264, 1, [-40])));
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destination, NAV_HUMMINGBIRD);
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destinationName, "hummingbird");

  bothDisabled.apply(modelData(8, table78Section(162, 264, 1, [30])));
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destination, NAV_RAVEN);
  assert.equal(bothDisabled.entity(264).contents.navigationUnit.destinationName, "raven");

  const falconBase = new ModelState();
  falconBase.apply(modelData(
    1,
    tableSection(43, 265, 1, fieldDelta(261)),
    table78Section(162, 265, 17, [0, navEncoded(NAV_FALCON)])
  ));
  assert.equal(falconBase.entity(265).contents.navigationUnit.destination, NAV_FALCON);
  assert.equal(falconBase.entity(265).contents.navigationUnit.destinationName, "falcon");
  assert.equal(falconBase.entity(265).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(falconBase.entity(265).contents.navigationUnit.autoWarpOnNoCaptains, false);

  falconBase.apply(modelData(2, table78Section(162, 265, 1, [-10])));
  assert.equal(falconBase.entity(265).contents.navigationUnit.destination, NAV_RAVEN);
  assert.equal(falconBase.entity(265).contents.navigationUnit.destinationName, "raven");

  falconBase.apply(modelData(3, table78Section(162, 265, 1, [-20])));
  assert.equal(falconBase.entity(265).contents.navigationUnit.destination, NAV_FINCH);
  assert.equal(falconBase.entity(265).contents.navigationUnit.destinationName, "finch");

  falconBase.apply(modelData(4, table78Section(162, 265, 1, [-10])));
  assert.equal(falconBase.entity(265).contents.navigationUnit.destination, NAV_HUMMINGBIRD);
  assert.equal(falconBase.entity(265).contents.navigationUnit.destinationName, "hummingbird");

  falconBase.apply(modelData(5, table78Section(162, 265, 1, [20])));
  assert.equal(falconBase.entity(265).contents.navigationUnit.destination, NAV_SPARROW);
  assert.equal(falconBase.entity(265).contents.navigationUnit.destinationName, "sparrow");

  falconBase.apply(modelData(6, table78Section(162, 265, 1, [30])));
  assert.equal(falconBase.entity(265).contents.navigationUnit.destination, NAV_COMBAT_ARENA);
  assert.equal(falconBase.entity(265).contents.navigationUnit.destinationName, "combat-arena");

  const compactSparrow = new ModelState();
  compactSparrow.apply(modelData(
    1,
    tableSection(43, 266, 1, fieldDelta(261)),
    table78Section(162, 266, 9, [0, navEncoded(NAV_SPARROW)])
  ));
  assert.equal(compactSparrow.entity(266).contents.navigationUnit.destination, NAV_SPARROW);
  assert.equal(compactSparrow.entity(266).contents.navigationUnit.destinationName, "sparrow");
  assert.equal(compactSparrow.entity(266).contents.navigationUnit.autoWarpOnShieldFailure, false);
  assert.equal(compactSparrow.entity(266).contents.navigationUnit.autoWarpOnNoCaptains, true);

  const destinationOnlyFalcon = new ModelState();
  destinationOnlyFalcon.apply(modelData(
    1,
    tableSection(43, 267, 1, fieldDelta(261)),
    table78Section(162, 267, 1, [navEncoded(NAV_FALCON)])
  ));
  assert.equal(destinationOnlyFalcon.entity(267).contents.navigationUnit.destination, NAV_FALCON);
  assert.equal(destinationOnlyFalcon.entity(267).contents.navigationUnit.destinationName, "falcon");
  assert.equal(destinationOnlyFalcon.entity(267).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(destinationOnlyFalcon.entity(267).contents.navigationUnit.autoWarpOnNoCaptains, true);

  const q36Finch = new ModelState();
  q36Finch.apply(modelData(
    1,
    tableSection(43, 268, 1, fieldDelta(261)),
    table78Section(162, 268, 17, [0, navEncoded(NAV_FINCH)])
  ));
  assert.equal(q36Finch.entity(268).contents.navigationUnit.destination, NAV_FINCH);
  assert.equal(q36Finch.entity(268).contents.navigationUnit.destinationName, "finch");
  assert.equal(q36Finch.entity(268).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(q36Finch.entity(268).contents.navigationUnit.autoWarpOnNoCaptains, false);

  const noCaptainsOnlyHummingbird = new ModelState();
  noCaptainsOnlyHummingbird.apply(modelData(
    1,
    tableSection(43, 269, 1, fieldDelta(261)),
    table78Section(162, 269, 16, [0])
  ));
  assert.equal(noCaptainsOnlyHummingbird.entity(269).contents.navigationUnit.destination, NAV_HUMMINGBIRD);
  assert.equal(noCaptainsOnlyHummingbird.entity(269).contents.navigationUnit.destinationName, "hummingbird");
  assert.equal(noCaptainsOnlyHummingbird.entity(269).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(noCaptainsOnlyHummingbird.entity(269).contents.navigationUnit.autoWarpOnNoCaptains, false);

  const q24BaseFinch = new ModelState();
  q24BaseFinch.apply(modelData(
    1,
    tableSection(43, 270, 1, fieldDelta(261)),
    table78Section(162, 270, 19, [0, navEncoded(NAV_FINCH), 1])
  ));
  assert.equal(q24BaseFinch.entity(270).contents.navigationUnit.destination, NAV_FINCH);
  assert.equal(q24BaseFinch.entity(270).contents.navigationUnit.destinationName, "finch");
  assert.equal(q24BaseFinch.entity(270).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(q24BaseFinch.entity(270).contents.navigationUnit.autoWarpOnNoCaptains, false);

  q24BaseFinch.apply(modelData(2, table78Section(162, 270, 2, [-1])));
  assert.equal(q24BaseFinch.entity(270).contents.navigationUnit.destination, NAV_FINCH);
  assert.equal(q24BaseFinch.entity(270).contents.navigationUnit.destinationName, "finch");

  q24BaseFinch.apply(modelData(3, table78Section(162, 270, 1, [10])));
  assert.equal(q24BaseFinch.entity(270).contents.navigationUnit.destination, NAV_SPARROW);
  assert.equal(q24BaseFinch.entity(270).contents.navigationUnit.destinationName, "sparrow");

  q24BaseFinch.apply(modelData(4, table78Section(162, 270, 1, [-10])));
  assert.equal(q24BaseFinch.entity(270).contents.navigationUnit.destination, NAV_FINCH);
  assert.equal(q24BaseFinch.entity(270).contents.navigationUnit.destinationName, "finch");
});

test("ModelState toggles navigation unit auto-warp flags from table 78 masks", () => {
  const bothOff = new ModelState();
  bothOff.apply(modelData(
    1,
    tableSection(43, 261, 1, fieldDelta(261)),
    table78Section(162, 261, 27, [0, navEncoded(NAV_RAVEN), 1, 0])
  ));
  assert.equal(bothOff.entity(261).contents.navigationUnit.autoWarpOnShieldFailure, false);
  assert.equal(bothOff.entity(261).contents.navigationUnit.autoWarpOnNoCaptains, false);

  bothOff.apply(modelData(2, table78Section(162, 261, 8, [0])));
  assert.equal(bothOff.entity(261).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(bothOff.entity(261).contents.navigationUnit.autoWarpOnNoCaptains, false);

  bothOff.apply(modelData(3, table78Section(162, 261, 16, [0])));
  assert.equal(bothOff.entity(261).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(bothOff.entity(261).contents.navigationUnit.autoWarpOnNoCaptains, true);

  bothOff.apply(modelData(4, table78Section(162, 261, 8, [0])));
  assert.equal(bothOff.entity(261).contents.navigationUnit.autoWarpOnShieldFailure, false);
  assert.equal(bothOff.entity(261).contents.navigationUnit.autoWarpOnNoCaptains, true);

  bothOff.apply(modelData(5, table78Section(162, 261, 16, [0])));
  assert.equal(bothOff.entity(261).contents.navigationUnit.autoWarpOnShieldFailure, false);
  assert.equal(bothOff.entity(261).contents.navigationUnit.autoWarpOnNoCaptains, false);

  const bothOn = new ModelState();
  bothOn.apply(modelData(
    1,
    tableSection(43, 262, 1, fieldDelta(261)),
    table78Section(162, 262, 3, [navEncoded(NAV_RAVEN), 1])
  ));
  assert.equal(bothOn.entity(262).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(bothOn.entity(262).contents.navigationUnit.autoWarpOnNoCaptains, true);

  bothOn.apply(modelData(2, table78Section(162, 262, 8, [0])));
  assert.equal(bothOn.entity(262).contents.navigationUnit.autoWarpOnShieldFailure, false);
  assert.equal(bothOn.entity(262).contents.navigationUnit.autoWarpOnNoCaptains, true);

  bothOn.apply(modelData(3, table78Section(162, 262, 16, [0])));
  assert.equal(bothOn.entity(262).contents.navigationUnit.autoWarpOnShieldFailure, false);
  assert.equal(bothOn.entity(262).contents.navigationUnit.autoWarpOnNoCaptains, false);

  bothOn.apply(modelData(4, table78Section(162, 262, 8, [0])));
  assert.equal(bothOn.entity(262).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(bothOn.entity(262).contents.navigationUnit.autoWarpOnNoCaptains, false);

  bothOn.apply(modelData(5, table78Section(162, 262, 16, [0])));
  assert.equal(bothOn.entity(262).contents.navigationUnit.autoWarpOnShieldFailure, true);
  assert.equal(bothOn.entity(262).contents.navigationUnit.autoWarpOnNoCaptains, true);
});

test("buildNavigationUnitConfigData matches official client nav command captures", () => {
  const entity = 14;
  const destination = NAV_RAVEN;

  assert.equal(
    hex(buildNavigationUnitConfigData(entity, { destination, page: 0 })),
    "90000e8a0f636f6e6669675f6e61765f756e6974009028008e8d8d9191",
    "change-nav-destination.jsonl"
  );

  assert.equal(
    hex(buildNavigationUnitConfigData(entity, { destination, page: 1 })),
    "90000e8a0f636f6e6669675f6e61765f756e6974009028018e8d8d9191",
    "switch-nav-page.jsonl"
  );

  assert.equal(
    hex(buildNavigationUnitConfigData(entity, {
      destination,
      page: 1,
      autoWarpOnShieldFailure: true
    })),
    "90000e8a0f636f6e6669675f6e61765f756e6974009028018e8e8d9191",
    "toggle-warp-on-shields-fail.jsonl"
  );

  assert.equal(
    hex(buildNavigationUnitConfigData(entity, {
      destination,
      page: 1,
      autoWarpOnShieldFailure: true,
      autoWarpOnNoCaptains: true
    })),
    "90000e8a0f636f6e6669675f6e61765f756e6974009028018e8e8e9191",
    "toggle-warp-on-no-captains.jsonl and cancel-warp.jsonl"
  );

  assert.equal(
    hex(buildNavigationUnitConfigData(entity, {
      destination,
      page: 1,
      warp: "start",
      autoWarpOnShieldFailure: true,
      autoWarpOnNoCaptains: true
    })),
    "90000e8a0f636f6e6669675f6e61765f756e6974009028018d8e8e9191",
    "start-warp.jsonl"
  );

  assert.equal(
    hex(buildNavigationUnitClipboardConfigData({
      destination: NAV_HUMMINGBIRD,
      page: 1,
      autoWarpOnShieldFailure: false,
      autoWarpOnNoCaptains: false
    })),
    "9001068a0f636f6e6669675f6e61765f756e697400900a018e8d8d9191",
    "copy-nav-unit-config.jsonl"
  );

  assert.equal(
    hex(buildNavigationUnitPasteConfigData(51, {
      destination: NAV_HUMMINGBIRD,
      page: 1,
      autoWarpOnShieldFailure: false,
      autoWarpOnNoCaptains: false
    })),
    "9002338a0f636f6e6669675f6e61765f756e697400900a018e8d8d9191",
    "paste-nav-unit-config.jsonl"
  );
});

test("buildGeneratorMazePuzzleData matches official client generator captures", () => {
  assert.equal(
    hex(buildGeneratorMazePuzzleData(58, "132524")),
    "90003a8a0b6d617a655f70757a7a6c6500908a063133323532348d9191",
    "solve-generator-puzzle.jsonl"
  );

  assert.equal(
    hex(buildGeneratorMazePuzzleData(60, "41243")),
    "90003c8a0b6d617a655f70757a7a6c6500908a0534313234338d9191",
    "fail-generator-puzzle.jsonl"
  );
});

test("buildPusherConfigData matches official client pusher command captures", () => {
  const entity = 28;

  assert.equal(
    hex(buildPusherConfigData(entity, {
      mode: "do-nothing",
      filteredMode: "push",
      angle: 90,
      speed: 20,
      filterInventory: false,
      length: 1000
    })),
    "90001c8a0d636f6e6669675f70757368657200900200845a148e85e8039191",
    "change-pusher-angle-to-90.jsonl"
  );

  assert.equal(
    hex(buildPusherConfigData(entity, {
      mode: "do-nothing",
      filteredMode: "push",
      angle: 90,
      speed: 13,
      filterInventory: false,
      length: 300
    })),
    "90001c8a0d636f6e6669675f70757368657200900200845a0d8e852c019191",
    "change-pusher-target-speed-to-13.jsonl"
  );

  assert.equal(
    hex(buildPusherConfigData(entity, {
      mode: "push",
      filteredMode: "do-nothing",
      angle: 90,
      speed: 13,
      filterInventory: true,
      length: 300
    })),
    "90001c8a0d636f6e6669675f70757368657200900002845a0d8d852c019191",
    "enable-pusher-filter-by-inventory.jsonl"
  );

  assert.equal(
    hex(buildPusherFilterItemsData(entity, [100, 0, 0])),
    "90001c8a0c66696c7465725f6974656d730090846400009191",
    "add-wrench-to-pusher-filter-slot-1.jsonl"
  );
});

test("buildLoaderConfigData matches official client loader command captures", () => {
  const entity = 21;

  assert.equal(
    hex(buildLoaderConfigData(entity, {
      pick: "top-left",
      place: "top-right",
      priority: "normal",
      stack: 16,
      cycle: 1,
      requireOutput: false,
      waitForStack: false
    })),
    "9000158a0d636f6e6669675f6c6f61646572009000020110148e8e9191",
    "change-loader-pick-top-left-place-top-right.jsonl"
  );

  assert.equal(
    hex(buildLoaderConfigData(entity, {
      pick: "top-left",
      place: "top-right",
      priority: "normal",
      stack: 16,
      cycle: 1,
      requireOutput: true,
      waitForStack: false
    })),
    "9000158a0d636f6e6669675f6c6f61646572009000020110148d8e9191",
    "enable-loader-require-output-inventory.jsonl"
  );

  assert.equal(
    hex(buildLoaderConfigData(entity, {
      pick: "top-left",
      place: "top-right",
      priority: "high",
      stack: 16,
      cycle: 4,
      requireOutput: false,
      waitForStack: false
    })),
    "9000158a0d636f6e6669675f6c6f6164657200900002021080508e8e9191",
    "disable-loader-wait-for-stack-limit.jsonl"
  );

  assert.equal(
    hex(buildLoaderConfigData(entity, {
      pick: "top-left",
      place: "top-right",
      priority: "high",
      stack: 13,
      cycle: 4,
      requireOutput: false,
      waitForStack: false
    })),
    "9000158a0d636f6e6669675f6c6f6164657200900002020d80508e8e9191",
    "changing-loader-stack-limit-to-13.jsonl"
  );

  assert.equal(
    hex(buildLoaderConfigData(entity, {
      pick: "top-left",
      place: "top-right",
      priority: "high",
      stack: 16,
      cycle: 4,
      requireOutput: false,
      waitForStack: true
    })),
    "9000158a0d636f6e6669675f6c6f6164657200900002021080508e8d9191",
    "enable-loader-wait-for-stack-limit.jsonl"
  );

  assert.equal(
    hex(buildLoaderFilterConfigData(entity, "allow-filter")),
    "9000158a0d66696c7465725f636f6e6669670090029191",
    "change-loader-filter-to-allow-filter.jsonl"
  );

  assert.equal(
    hex(buildLoaderFilterItemsData(entity, [255, 0, 0])),
    "9000158a0c66696c7465725f6974656d73009085ff0000009191",
    "change-loader-filter-slot-0-to-fluid-tank.jsonl"
  );

  assert.equal(
    hex(buildLoaderFullConfigData(entity, {
      pick: "bottom-right",
      place: "bottom-middle",
      priority: "low",
      stack: 11,
      cycle: 8,
      requireOutput: false,
      waitForStack: false,
      filterMode: "allow-filter",
      filterSlots: [255, 0, 0]
    })),
    "9002158a0d636f6e6669675f6c6f6164657200900706000b80a08e8e918a0d66696c7465725f636f6e666967009002918a0c66696c7465725f6974656d73009085ff0000009191",
    "pasting-config-to-loader.jsonl"
  );

  assert.equal(
    hex(buildLoaderCopyConfigData({
      pick: "bottom-middle",
      place: "bottom-left",
      priority: "normal",
      stack: 14,
      cycle: 11,
      requireOutput: false,
      waitForStack: false,
      filterMode: "block-all",
      filterSlots: [0, 256, 0]
    })),
    "9001018a0d636f6e6669675f6c6f6164657200900605010e80dc8e8e918a0d66696c7465725f636f6e666967009003918a0c66696c7465725f6974656d73009000850001009191",
    "copying-config-from-loader.jsonl"
  );

  assert.equal(
    hex(buildLoaderClipboardConfigData({
      pick: "bottom-left",
      place: "top-right",
      priority: "normal",
      stack: 14,
      cycle: 11,
      requireOutput: false,
      waitForStack: false
    })),
    "9001018a0d636f6e6669675f6c6f6164657200900502010e80dc8e8e9191",
    "edit-loader-clipboard-pick-bottom-left-place-top-right .jsonl"
  );
});

test("buildCargoHatch config helpers match official client hatch command captures", () => {
  assert.equal(
    hex(buildCargoHatchFilterConfigData(55, "allow-filter")),
    "9000378a0d66696c7465725f636f6e6669670090029191",
    "change-filter-mode-to-allow-filter.jsonl"
  );

  assert.equal(
    hex(buildCargoHatchFilterItemsData(55, [0, 0, 152])),
    "9000378a0c66696c7465725f6974656d73009000008598009191",
    "change-filter-slot-2-to-flak-ammo.jsonl"
  );

  assert.equal(
    hex(buildCargoHatchCopyConfigData({ filterMode: "allow-filter", filterSlots: [0, 0, 152] })),
    "9001008a0d66696c7465725f636f6e666967009002918a0c66696c7465725f6974656d73009000008598009191",
    "copy-cargo-hatch-configs.jsonl"
  );

  assert.equal(
    hex(buildCargoHatchFullConfigData(55, { filterMode: "allow-filter", filterSlots: [0, 0, 152] })),
    "9002378a0d66696c7465725f636f6e666967009002918a0c66696c7465725f6974656d73009000008598009191",
    "paste-cargo-hatch-configs.jsonl"
  );
});

test("clipboard config helpers match official client generator and expando captures", () => {
  assert.equal(
    hex(buildGeneratorClipboardDirectionData("right")),
    "9001048a0b616e676c655f66697865640090009191",
    "change-generator-clipboard-direction-to-right.jsonl"
  );
  assert.equal(
    hex(buildGeneratorClipboardDirectionData("up")),
    "9001048a0b616e676c655f66697865640090019191",
    "change-generator-clipboard-direction-to-up.jsonl"
  );
  assert.equal(
    hex(buildGeneratorClipboardDirectionData("left")),
    "9001048a0b616e676c655f66697865640090029191",
    "change-generator-clipboard-direction-to-left.jsonl"
  );
  assert.equal(
    hex(buildGeneratorClipboardDirectionData("down")),
    "9001048a0b616e676c655f66697865640090039191",
    "change-generator-clipboard-direction-to-down.jsonl"
  );
  assert.equal(
    hex(buildExpandoClipboardAngleData(115)),
    "9001038a05616e676c65009084739191",
    "change-expando-clipboard-angle-to-115.jsonl"
  );
});

test("buildCargoEjector config helpers match official client ejector command captures", () => {
  assert.equal(
    hex(buildCargoEjectorCopyConfigData("right")),
    "9001078a0b616e676c655f66697865640090009191",
    "copy-cargo-ejector-configs.jsonl"
  );

  assert.equal(
    hex(buildCargoEjectorPasteConfigData(60, "right")),
    "90023c8a0b616e676c655f66697865640090009191",
    "paste-cargo-ejector-configs.jsonl"
  );

  assert.equal(
    hex(buildCargoEjectorClipboardDirectionData("left")),
    "9001078a0b616e676c655f66697865640090029191",
    "change-clipboard-cargo-ejector-direction-to-left.jsonl"
  );
});

test("solveGeneratorMazeSeed matches official client maze solutions", () => {
  assert.equal(solveGeneratorMazeSeed(29263270), "3652");
  assert.equal(solveGeneratorMazeSeed(1912924178), "13452");
  assert.equal(solveGeneratorMazeSeed(660008571), "121");
  assert.equal(solveGeneratorMazeSeed(13697024), "31235125316");
  assert.equal(solveGeneratorMazeSeed(508251904), "315");
});

test("generateGeneratorMaze exposes normalized cell rows", () => {
  const maze = generateGeneratorMaze(1912924178);
  assert.equal(maze.seed, 1912924178);
  assert.equal(maze.width, 10);
  assert.equal(maze.height, 10);
  assert.equal(maze.solution, "13452");
  assert.equal(maze.cells.length, 100);
  assert.equal(maze.rows.length, 10);
  assert.equal(maze.rows[0].length, 10);

  const first = maze.rows[0][0];
  assert.deepEqual(
    {
      x: first.x,
      y: first.y,
      value: first.value,
      hex: first.hex,
      digit: first.digit,
      walls: first.walls,
      backtrackDirection: first.backtrackDirection,
      marker: first.marker
    },
    {
      x: 0,
      y: 0,
      value: 0x1e,
      hex: "1e",
      digit: 1,
      walls: { up: false, down: true, left: true, right: true },
      backtrackDirection: 0,
      marker: 0
    }
  );

  assert.equal(maze.rows[9][9].hex, "2c");
  assert.equal(maze.rows[9][9].digit, 2);
});

test("navigation capture decodes layered overworld ids and nav base ids", () => {
  const store = replayCapture("nav-sample.jsonl");
  const overworld = store.overworld();
  assert.ok(overworld, "overworld loaded");
  assert.equal(overworld.id, 0);
  assert.deepEqual(overworld.snapshot().overworldZone, {
    id: 0,
    baseId: 0,
    layer: 0,
    key: "freeport",
    name: "Freeport",
    tiered: false,
    displayName: "Freeport"
  });

  const ship = store.shipWorld();
  assert.ok(ship, "ship world loaded");
  assert.equal(ship.parentWorld, 0);
  assert.deepEqual(ship.model.errors, [], "nav sample decode errors");

  const navigationUnits = ship.model.machines().navigationUnits;
  assert.equal(navigationUnits.length, 1);
  const [nav] = navigationUnits;
  assert.equal(nav.state.q20, navEncoded(NAV_HUMMINGBIRD));
  assert.equal(nav.destination, NAV_HUMMINGBIRD);
  assert.equal(nav.destinationName, "hummingbird");
});

test("WorldState names observed block tile shapes", () => {
  const world = new WorldState(1);
  world.readMeta({ world: 1, is_overworld: false });

  assert.equal(world.setTile({ x: 1, y: 1, material: 4, shape: 0, hp: 255, color: 250 }).shapeName, "full");
  assert.equal(world.setTile({ x: 1, y: 2, material: 4, shape: 7, hp: 255, color: 250 }).shapeName, "top-half");
  assert.equal(world.setTile({ x: 1, y: 3, material: 4, shape: 5, hp: 255, color: 250 }).shapeName, "bottom-half");
});

test("ModelState exposes normalized shield generator charge, efficiency, and stored core", () => {
  const model = new ModelState();
  const empty = ENTITY;
  const charged = ENTITY + 1;
  const chargedWithCore = ENTITY + 2;

  model.apply(modelData(
    1,
    tableSection(43, empty, 1, fieldDelta(256)),
    tableSection(144, empty, 0, []),
    tableSection(158, empty, 1, fieldDelta(1912924178)),
    tableSection(43, charged, 1, fieldDelta(256)),
    tableSection(144, charged, 3, [
      ...fieldDelta(4737),
      ...fieldDelta(166)
    ]),
    tableSection(43, chargedWithCore, 1, fieldDelta(256)),
    tableSection(42, chargedWithCore, 1, fieldDelta(123)),
    tableSection(144, chargedWithCore, 3, [
      ...fieldDelta(4682),
      ...fieldDelta(166)
    ])
  ));

  let generator = model.entity(empty).contents.shieldGenerator;
  assert.equal(generator.charge, 0);
  assert.equal(generator.maxCharge, 5000);
  assert.equal(generator.chargeRatio, 0);
  assert.equal(generator.efficiencyPercent, null);
  assert.equal(generator.hasShieldCore, false);
  assert.equal(generator.boostState, 0);
  assert.equal(generator.boostStateName, "inactive");
  assert.equal(generator.boostTimer, 0);
  assert.equal(generator.boostActive, false);
  assert.equal(generator.puzzleSeed, 1912924178);
  assert.equal(generator.puzzleSolution, "13452");

  generator = model.entity(charged).contents.shieldGenerator;
  assert.equal(generator.charge, 4737);
  assert.equal(generator.efficiencyPercent, 166);
  assert.equal(generator.efficiency, 1.66);
  assert.equal(generator.hasShieldCore, false);

  generator = model.entity(chargedWithCore).contents.shieldGenerator;
  assert.equal(generator.charge, 4682);
  assert.equal(generator.storedItemId, 123);
  assert.equal(generator.storedItemName, "Shield Core");
  assert.equal(generator.hasShieldCore, true);

  model.apply(modelData(
    2,
    tableSection(158, chargedWithCore, 24, [
      ...fieldDelta(1),
      ...fieldDelta(30)
    ])
  ));

  generator = model.entity(chargedWithCore).contents.shieldGenerator;
  assert.equal(generator.boostState, 1);
  assert.equal(generator.boostStateName, "boosted");
  assert.equal(generator.boostTimer, 30);
  assert.equal(generator.boostActive, true);

  model.apply(modelData(
    3,
    tableSection(158, chargedWithCore, 8, fieldDelta(1))
  ));

  generator = model.entity(chargedWithCore).contents.shieldGenerator;
  assert.equal(generator.boostState, 2);
  assert.equal(generator.boostStateName, "failed");

  model.apply(modelData(
    4,
    tableSection(158, chargedWithCore, 24, [
      ...fieldDelta(-2),
      ...fieldDelta(-30)
    ])
  ));

  generator = model.entity(chargedWithCore).contents.shieldGenerator;
  assert.equal(generator.boostState, 0);
  assert.equal(generator.boostTimer, 0);
  assert.equal(generator.boostActive, false);
});

test("ModelState exposes normalized sign text and display mode", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 9, [
      ...fieldDelta(0),
      ...fieldDelta(218)
    ]),
    tableSection(124, ENTITY, 1, textBlob("a sign 1"))
  ));

  assert.equal(model.entity(ENTITY).typeId, 218);
  let sign = model.entity(ENTITY).contents.sign;
  assert.equal(sign.text, "a sign 1");
  assert.equal(sign.displayMode, 0);
  assert.equal(sign.displayModeName, "always");

  model.apply(modelData(
    2,
    tableSection(124, ENTITY, 3, [
      ...textBlob("a sign 2"),
      ...fieldDelta(1)
    ])
  ));

  sign = model.entity(ENTITY).contents.sign;
  assert.equal(sign.text, "a sign 2");
  assert.equal(sign.displayMode, 1);
  assert.equal(sign.displayModeName, "when-near");

  model.apply(modelData(
    3,
    tableSection(124, ENTITY, 3, [
      ...textBlob("a sign 3"),
      ...fieldDelta(1)
    ])
  ));

  sign = model.entity(ENTITY).contents.sign;
  assert.equal(sign.text, "a sign 3");
  assert.equal(sign.displayMode, 2);
  assert.equal(sign.displayModeName, "on-hover");
});

test("ModelState exposes normalized spawn point rank", () => {
  const model = new ModelState();
  const captain = ENTITY;
  const crew = ENTITY + 1;
  const guest = ENTITY + 2;

  model.apply(modelData(
    1,
    tableSection(43, captain, 1, fieldDelta(219)),
    tableSection(44, captain, 1, fieldDelta(3)),
    tableSection(43, crew, 1, fieldDelta(219)),
    tableSection(44, crew, 1, fieldDelta(1)),
    tableSection(43, guest, 1, fieldDelta(219)),
    tableSection(44, guest, 0, [])
  ));

  let spawnPoint = model.entity(captain).contents.spawnPoint;
  assert.equal(spawnPoint.rank, 3);
  assert.equal(spawnPoint.rankName, "Captain");

  spawnPoint = model.entity(crew).contents.spawnPoint;
  assert.equal(spawnPoint.rank, 1);
  assert.equal(spawnPoint.rankName, "Crew");

  spawnPoint = model.entity(guest).contents.spawnPoint;
  assert.equal(spawnPoint.rank, 0);
  assert.equal(spawnPoint.rankName, "Guest");
});

test("ModelState exposes normalized door rank and open state", () => {
  const model = new ModelState();
  const captain = ENTITY;
  const crew = ENTITY + 1;
  const guest = ENTITY + 2;

  model.apply(modelData(
    1,
    tableSection(43, captain, 1, fieldDelta(220)),
    tableSection(44, captain, 1, fieldDelta(3)),
    tableSection(130, captain, 0, []),
    tableSection(43, crew, 1, fieldDelta(220)),
    tableSection(44, crew, 1, fieldDelta(1)),
    tableSection(130, crew, 0, []),
    tableSection(43, guest, 1, fieldDelta(220)),
    tableSection(44, guest, 0, []),
    tableSection(130, guest, 0, [])
  ));

  let door = model.entity(captain).contents.door;
  assert.equal(door.rank, 3);
  assert.equal(door.rankName, "Captain");
  assert.equal(door.open, false);

  door = model.entity(crew).contents.door;
  assert.equal(door.rank, 1);
  assert.equal(door.rankName, "Crew");

  door = model.entity(guest).contents.door;
  assert.equal(door.rank, 0);
  assert.equal(door.rankName, "Guest");

  model.apply(modelData(
    2,
    tableSection(130, captain, 1, unsigned(1))
  ));
  assert.equal(model.entity(captain).contents.door.open, true);

  model.apply(modelData(
    3,
    tableSection(130, captain, 1, unsigned(0))
  ));
  assert.equal(model.entity(captain).contents.door.open, false);
});

test("ModelState exposes normalized shield projector state", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 1, fieldDelta(257)),
    tableSection(145, ENTITY, 0, [])
  ));

  let projector = model.entity(ENTITY).contents.shieldProjector;
  assert.equal(projector.active, true);

  model.apply(modelData(
    2,
    tableSection(145, ENTITY, 1, unsigned(0))
  ));

  projector = model.entity(ENTITY).contents.shieldProjector;
  assert.equal(projector.active, false);

  model.apply(modelData(
    3,
    tableSection(145, ENTITY, 1, unsigned(1))
  ));

  projector = model.entity(ENTITY).contents.shieldProjector;
  assert.equal(projector.active, true);
});

test("ModelState decodes starter cannon aim-only and firing updates", () => {
  const model = new ModelState();
  const entity = 50;

  model.apply(modelData(
    1,
    tableSection(1, entity, 3, [fieldDelta(0), fieldDelta(0)]),
    tableSection(43, entity, 1, fieldDelta(227)),
    table54Section(entity, 15, [1, 2, 16750080, 16])
  ));

  let cannon = model.entity(entity).contents.cannon;
  assert.equal(cannon.ammoItemId, 150);
  assert.equal(cannon.ammoName, "Standard Ammo");
  assert.equal(cannon.ammoCount, 16);
  assert.equal(cannon.aim, 2);
  assert.equal(cannon.recoil, null);
  assert.deepEqual(cannon.recoils, [null, null]);

  model.apply(modelData(
    2,
    table54Section(entity, 2, [203])
  ));

  cannon = model.entity(entity).contents.cannon;
  assert.equal(cannon.aim, 205);
  assert.equal(cannon.ammoCount, 16);

  model.apply(modelData(
    3,
    table54Section(entity, 40, [-1, -24])
  ));

  cannon = model.entity(entity).contents.cannon;
  assert.equal(cannon.ammoCount, 15);
  assert.equal(cannon.aim, 205);
  assert.equal(cannon.recoil, -24);
  assert.deepEqual(cannon.recoils, [-24, null]);

  model.apply(modelData(
    4,
    table54Section(entity, 32, [24])
  ));

  cannon = model.entity(entity).contents.cannon;
  assert.equal(cannon.ammoCount, 15);
  assert.equal(cannon.recoil, 0);
});

test("ModelState decodes machine cannon high-bit state without metadata spillover", () => {
  const model = new ModelState();
  const entity = 87;

  model.apply(modelData(
    1,
    tableSection(1, entity, 3, [fieldDelta(20), fieldDelta(100)]),
    tableSection(43, entity, 1, fieldDelta(229)),
    table54Section(entity, 143, [4, -40, 16750080, 15, 129])
  ));

  let cannon = model.entity(entity).contents.cannon;
  assert.equal(cannon.typeId, 229);
  assert.equal(cannon.typeName, "Machine Cannon (Packaged)");
  assert.equal(cannon.ammoItemId, 150);
  assert.equal(cannon.ammoCount, 15);
  assert.equal(cannon.aim, -40);
  assert.equal(cannon.spin, 129);
  assert.equal(cannon.coolingCellCount, 0);
  assert.equal(model.snapshot().entities.length, 1);

  model.apply(modelData(
    2,
    table54Section(entity, 54, [257, -16750080, 3, 0])
  ));

  cannon = model.entity(entity).contents.cannon;
  assert.equal(cannon.aim, 217);
  assert.equal(cannon.ammoItemId, null);
  assert.equal(cannon.state.q44, 3);
  assert.equal(cannon.recoil, 0);
  assert.equal(cannon.recoil2, null);
  assert.equal(model.snapshot().entities.length, 1);

  model.apply(modelData(
    3,
    table54Section(entity, 64, [-25])
  ));

  cannon = model.entity(entity).contents.cannon;
  assert.equal(cannon.recoil, 0);
  assert.equal(cannon.recoil2, -25);
  assert.deepEqual(cannon.recoils, [0, -25]);

  model.apply(modelData(
    4,
    table54Section(entity, 128, [5])
  ));

  cannon = model.entity(entity).contents.cannon;
  assert.equal(cannon.spin, 134);
  assert.equal(model.snapshot().entities.length, 1);
});

test("ModelState decodes machine cannon cooling cell count", () => {
  const model = new ModelState();
  const none = 20;
  const one = 21;
  const twoLoaded = 23;
  const twoEmpty = 29;

  model.apply(modelData(
    1,
    tableSection(43, none, 1, fieldDelta(229)),
    table54Section(none, 1, [4]),
    tableSection(43, one, 1, fieldDelta(229)),
    table54Section(one, 513, [4, 1]),
    tableSection(43, twoLoaded, 1, fieldDelta(229)),
    table54Section(twoLoaded, 525, [4, 16750080, 16, 2]),
    tableSection(43, twoEmpty, 1, fieldDelta(229)),
    table54Section(twoEmpty, 513, [4, 2])
  ));

  assert.equal(model.entity(none).contents.cannon.coolingCellCount, 0);
  assert.equal(model.entity(one).contents.cannon.coolingCellCount, 1);
  assert.equal(model.entity(twoLoaded).contents.cannon.coolingCellCount, 2);
  assert.equal(model.entity(twoLoaded).contents.cannon.ammoCount, 16);
  assert.equal(model.entity(twoEmpty).contents.cannon.coolingCellCount, 2);
  assert.equal(model.entity(twoEmpty).contents.cannon.ammoCount, 0);
});

test("ModelState keeps helm type through sparse grab-state type updates", () => {
  const model = new ModelState();
  const heldThroughCapture = 3;
  const grabbedAndReleased = 4;
  const pilot = 22;

  model.apply(modelData(
    1,
    tableSection(1, heldThroughCapture, 3, [
      ...fieldDelta(0),
      ...fieldDelta(0)
    ]),
    tableSection(43, heldThroughCapture, 9, [
      ...fieldDelta(0),
      ...fieldDelta(215)
    ]),
    tableSection(1, grabbedAndReleased, 3, [
      ...fieldDelta(0),
      ...fieldDelta(0)
    ]),
    tableSection(43, grabbedAndReleased, 1, fieldDelta(215)),
    tableSection(138, pilot, 16, unsigned(1))
  ));

  assert.equal(model.entity(heldThroughCapture).typeId, 215);
  assert.equal(model.entity(heldThroughCapture).label, "Helm (Packaged)");
  assert.equal(model.entity(grabbedAndReleased).typeId, 215);
  assert.equal(model.entity(grabbedAndReleased).label, "Helm (Packaged)");
  assert.equal(model.entity(heldThroughCapture).contents.helm.occupied, true);
  assert.equal(model.entity(grabbedAndReleased).contents.helm.occupied, false);
  assert.equal(model.entity(pilot).contents.player.piloting, true);

  model.apply(modelData(
    2,
    tableSection(43, grabbedAndReleased, 8, fieldDelta(0)),
    tableSection(138, pilot, 16, unsigned(1))
  ));

  assert.equal(model.entity(grabbedAndReleased).typeId, 215);
  assert.equal(model.entity(grabbedAndReleased).label, "Helm (Packaged)");
  assert.equal(model.entity(grabbedAndReleased).contents.helm.occupied, true);
  assert.equal(model.entity(pilot).contents.player.piloting, true);

  model.apply(modelData(
    3,
    tableSection(43, grabbedAndReleased, 8, fieldDelta(0)),
    tableSection(138, pilot, 16, unsigned(0))
  ));

  assert.equal(model.entity(grabbedAndReleased).contents.helm.occupied, false);
  assert.equal(model.entity(pilot).contents.player.piloting, false);
});

test("ModelState decodes comms station charges and occupied state", () => {
  const model = new ModelState();
  const comms = 18;

  model.apply(modelData(
    1,
    tableSection(1, comms, 3, [
      ...fieldDelta(0),
      ...fieldDelta(0)
    ]),
    tableSection(43, comms, 1, fieldDelta(217)),
    tableSection(122, comms, 1, fieldDelta(5))
  ));

  assert.equal(model.entity(comms).contents.commsStation.charges, 5);
  assert.equal(model.entity(comms).contents.commsStation.maxCharges, 5);
  assert.equal(model.entity(comms).contents.commsStation.chargeRatio, 1);
  assert.equal(model.entity(comms).contents.commsStation.occupied, false);

  model.apply(modelData(
    2,
    tableSection(43, comms, 8, fieldDelta(0))
  ));

  assert.equal(model.entity(comms).contents.commsStation.occupied, true);

  model.apply(modelData(
    3,
    tableSection(122, comms, 1, fieldDelta(-1))
  ));

  assert.equal(model.entity(comms).contents.commsStation.charges, 4);
  assert.equal(model.entity(comms).contents.commsStation.chargeRatio, 0.8);

  model.apply(modelData(
    4,
    tableSection(43, comms, 8, fieldDelta(0))
  ));

  assert.equal(model.entity(comms).contents.commsStation.occupied, false);

  model.apply(modelData(
    5,
    tableSection(122, comms, 1, fieldDelta(1))
  ));

  assert.equal(model.entity(comms).contents.commsStation.charges, 5);
  assert.equal(model.entity(comms).contents.commsStation.chargeRatio, 1);
});

test("WorldStore decodes comms bubble packets", () => {
  const store = new WorldStore();
  const update = store.apply({
    type: 13,
    world: 14352,
    bubble: {
      model_id: 5,
      color: 11860793,
      msg: "the content of the message",
      time: 15
    }
  });

  assert.equal(update.type, "comms-bubble");
  assert.equal(update.bubble.entity, 5);
  assert.equal(update.bubble.modelId, 5);
  assert.equal(update.bubble.message, "the content of the message");
  assert.equal(update.bubble.color, 11860793);
  assert.equal(update.bubble.colorCss, "rgb(180,251,57)");
  assert.equal(update.bubble.durationSeconds, 15);
  assert.deepEqual(store.get(14352).commsBubbles, [update.bubble]);
  assert.deepEqual(store.get(14352).snapshot().commsBubbles, [update.bubble]);
});

test("ModelState decodes expando box contents and dynamic footprint", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(1, 19, 3, [725, 80].flatMap(fieldDelta)),
    tableSection(4, 19, 3, [20, 20].flatMap(fieldDelta)),
    tableSection(134, 19, 3, [20, 20].flatMap(fieldDelta)),
    tableSection(42, 19, 0, []),
    tableSection(43, 19, 3, [240, 1].flatMap(fieldDelta)),
    tableSection(164, 19, 0, [])
  ));

  let entity = model.entity(19);
  assert.equal(entity.contents.expandoBox.itemId, null);
  assert.equal(entity.contents.expandoBox.count, null);
  assert.equal(entity.contents.expandoBox.width, 2);
  assert.equal(entity.contents.expandoBox.height, 2);
  assert.equal(entity.contents.hoverOutline.width, 2);
  assert.equal(entity.contents.hoverOutline.height, 2);
  assert.deepEqual(entity.footprint, { width: 2, height: 2, source: "hover_outline" });
  assert.deepEqual(entity.occupies, [
    { x: 18, y: 2 },
    { x: 18, y: 3 },
    { x: 19, y: 2 },
    { x: 19, y: 3 }
  ]);

  model.apply(modelData(
    2,
    tableSection(4, 19, 3, [10, 0].flatMap(fieldDelta)),
    tableSection(134, 19, 3, [30, 20].flatMap(fieldDelta)),
    tableSection(42, 19, 3, [150, 64].flatMap(fieldDelta))
  ));

  entity = model.entity(19);
  assert.equal(entity.contents.expandoBox.itemId, 150);
  assert.equal(entity.contents.expandoBox.itemName, "Standard Ammo");
  assert.equal(entity.contents.expandoBox.count, 64);
  assert.equal(entity.contents.expandoBox.width, 5);
  assert.equal(entity.contents.expandoBox.height, 4);
  assert.equal(entity.contents.expandoBox.rawWidth, 50);
  assert.equal(entity.contents.expandoBox.rawHeight, 40);
  assert.equal(entity.contents.hoverOutline.width, 3);
  assert.equal(entity.contents.hoverOutline.height, 2);
  assert.deepEqual(entity.footprint, { width: 3, height: 2, source: "hover_outline" });
  assert.equal(model.machines().expandoBoxes.length, 1);

  model.apply(modelData(
    3,
    tableSection(4, 19, 3, [-9, 1].flatMap(fieldDelta)),
    tableSection(134, 19, 3, [-29, -19].flatMap(fieldDelta))
  ));

  entity = model.entity(19);
  assert.equal(entity.contents.expandoBox.width, 2.1);
  assert.equal(entity.contents.expandoBox.height, 2.1);
  assert.equal(entity.contents.hoverOutline.width, 2.1);
  assert.equal(entity.contents.hoverOutline.height, 2.1);
  assert.deepEqual(entity.footprint, { width: 3, height: 3, source: "hover_outline" });
});

test("ModelState decodes replicated player action preview", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(1, 87, 3, [800, 80].flatMap(fieldDelta)),
    tableSection(50, 87, 63, [175, 45, 5, 5, 40, 65280].flatMap(fieldDelta)),
    tableSection(138, 87, 1024, fieldDelta(232))
  ));

  let player = model.entity(87).contents.player;
  assert.equal(player.heldItemName, "Iron Block");
  assert.equal(player.actionPreview.active, true);
  assert.equal(player.actionPreview.actionName, "place");
  assert.equal(player.actionPreview.x, 17.5);
  assert.equal(player.actionPreview.y, 4.5);
  assert.equal(player.actionPreview.width, 0.5);
  assert.equal(player.actionPreview.height, 0.5);
  assert.equal(player.actionPreview.progress, 40);
  assert.equal(player.actionPreview.colorCss, "rgb(0,255,0)");

  model.apply(modelData(
    2,
    tableSection(50, 87, 56, [8, 60, 16646400].flatMap(fieldDelta)),
    tableSection(138, 87, 1024, fieldDelta(-115))
  ));

  player = model.entity(87).contents.player;
  assert.equal(player.heldItemName, "Starter Wrench");
  assert.equal(player.actionPreview.actionName, "break");
  assert.equal(player.actionPreview.height, 1.3);
  assert.equal(player.actionPreview.progress, 100);
  assert.equal(player.actionPreview.colorCss, "rgb(255,0,0)");

  model.apply(modelData(3, tableSection(50, 87, 16, fieldDelta(-100))));
  player = model.entity(87).contents.player;
  assert.equal(player.actionPreview.active, false);
  assert.equal(player.actionPreview.color, 16711680);

  model.apply(modelData(4, tableSection(50, 87, 32, fieldDelta(-16711680))));
  player = model.entity(87).contents.player;
  assert.equal(player.actionPreview.active, false);
  assert.equal(player.actionPreview.color, 0);
});

test("ModelState decodes thruster facing and fuel", () => {
  const typeSection = (entity, typeId) => tableSection(43, entity, 1, fieldDelta(typeId));
  const thrusterSection = (entity, mask, values) => tableSection(133, entity, mask, values.flatMap(fieldDelta));
  const model = new ModelState();

  model.apply(modelData(
    1,
    typeSection(10, 230), thrusterSection(10, 4, [63]),
    typeSection(11, 230), thrusterSection(11, 5, [1, 62]),
    typeSection(12, 230), thrusterSection(12, 1, [2]),
    typeSection(13, 230), thrusterSection(13, 1, [3]),
    typeSection(14, 231), thrusterSection(14, 1, [4]),
    typeSection(15, 231), thrusterSection(15, 1, [5]),
    typeSection(16, 231), thrusterSection(16, 1, [6]),
    typeSection(17, 231), thrusterSection(17, 1, [7])
  ));

  const thrusters = new Map(model.machines().thrusters.map((thruster) => [thruster.entity, thruster]));
  assert.equal(thrusters.size, 8);
  assert.deepEqual(
    [...thrusters.values()].map((thruster) => [thruster.entity, thruster.facing, thruster.facingName, thruster.fuel]),
    [
      [10, 0, "bottom", 63],
      [11, 1, "top", 62],
      [12, 2, "right", null],
      [13, 3, "left", null],
      [14, 4, "bottom-right", null],
      [15, 5, "bottom-left", null],
      [16, 6, "top-right", null],
      [17, 7, "top-left", null]
    ]
  );
  assert.equal(model.entity(10).contents.thruster.typeName, "Thruster (Packaged)");
  assert.equal(model.entity(14).contents.thruster.typeName, "Thruster (Starter, Packaged)");
  assert.ok(model.entity(10).kind.includes("thruster"));
});

test("blueprint scanner preview exposes grouped blueprint items", () => {
  const store = replayCaptureUntil("blueprints-sample.jsonl", (update) =>
    update?.type === "model" &&
    update.world?.id === 2872 &&
    update.result?.model?.sections?.some((section) => section.table === 12)
  );
  const world = store.shipWorld();
  assert.ok(world, "ship world");
  assert.deepEqual(world.model.errors, [], "blueprint sample decode errors");

  const player = world.model.players().find((item) => item.heldItemId === 120);
  assert.ok(player, "blueprint scanner holder");
  assert.equal(player.heldItemName, "Blueprint Scanner");
  assert.equal(player.actionPreview.actionName, "blueprint");
  assert.equal(player.actionPreview.active, true);
  assert.equal(player.actionPreview.blueprintId, 100003016);
  assert.equal(player.actionPreview.width, 1.5);
  assert.equal(player.actionPreview.height, 2);

  const expectedItems = [
    [232, "Iron Block", 7, 6, [0, 1, 2]],
    [237, "Item Net", 7, 6, [0, 1, 2]],
    [240, "Expando Box (Packaged)", 1, null, [0]]
  ];
  const previewItems = player.actionPreview.blueprintItems
    .map((item) => [item.itemId, item.itemName, item.bits, item.rawBits, item.placementOffsets])
    .sort((a, b) => a[0] - b[0]);
  assert.deepEqual(previewItems, expectedItems);

  const previewEntities = world.model.entities()
    .filter((entity) => entity.contents?.blueprintPreview)
    .map((entity) => [
      entity.category,
      entity.contents.blueprintPreview.itemId,
      entity.contents.blueprintPreview.placementCount
    ])
    .sort((a, b) => a[1] - b[1]);
  assert.deepEqual(previewEntities, expectedItems.map(([itemId, , , , offsets]) => ["blueprint_preview", itemId, offsets.length]));

  const expanded = player.actionPreview.blueprintItems
    .flatMap((item) => item.placements.map((placement) => [item.itemId, placement.x, placement.y]))
    .sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  assert.deepEqual(expanded, [
    [232, 13.5, 11.5], [232, 14.5, 11.5], [232, 15.5, 11.5],
    [237, 13.5, 8.5], [237, 14.5, 8.5], [237, 15.5, 8.5],
    [240, 14, 10]
  ]);
});

test("blueprint scanner preview expands repeated placement bits", () => {
  const store = replayCaptureUntil("more-blueprints-sample.jsonl", (update) =>
    update?.type === "model" &&
    update.world?.id === 2881 &&
    update.result?.model?.sections?.some((section) => section.table === 12)
  );
  const world = store.shipWorld();
  assert.ok(world, "ship world");
  assert.deepEqual(world.model.errors, [], "blueprint sample decode errors");

  const player = world.model.players().find((item) => item.heldItemId === 120);
  assert.ok(player, "blueprint scanner holder");
  assert.equal(player.actionPreview.actionName, "blueprint");
  assert.equal(player.actionPreview.width, 5);
  assert.equal(player.actionPreview.height, 1);
  assert.equal(player.actionPreview.blueprintId, 3692);
  assert.equal(player.actionPreview.blueprintItems.reduce((total, item) => total + item.placementCount, 0), 13);

  const expandedPositions = player.actionPreview.blueprintItems
    .flatMap((item) => item.placements.map((placement) => [placement.x, placement.y]))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  assert.deepEqual(expandedPositions, [
    [6.5, 9.5], [7.5, 9.5], [8.5, 9.5], [9.5, 9.5], [10.5, 9.5],
    [11.5, 9.5], [12.5, 9.5], [13.5, 9.5], [14.5, 9.5], [15.5, 9.5],
    [8.5, 10.5], [11.5, 10.5], [15.5, 10.5]
  ]);
});

