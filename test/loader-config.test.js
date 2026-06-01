import assert from "node:assert/strict";
import test from "node:test";
import { ModelState } from "../src/game/model.js";
import { WorldState, WorldStore } from "../src/game/world.js";
import { LoaderConfigTracker } from "../src/game/loader-config.js";

const WORLD = 11479;
const ENTITY = 27;

const sequenceFixtures = [
  {
    sample: "loader-changing-pick.jsonl",
    rows: [
      [51, { q20: 0, q24: -2, q36: 1, q40: 880 }, [1, 5]],
      [1, { q20: -1, q24: -2, q36: 1, q40: 880 }, [0, 5]],
      [3, { q20: 3, q24: -4, q36: 1, q40: 880 }, [4, 3]],
      [3, { q20: 2, q24: -3, q36: 1, q40: 880 }, [3, 4]],
      [2, { q20: 2, q24: -6, q36: 1, q40: 880 }, [3, 1]],
      [3, { q20: 5, q24: 0, q36: 1, q40: 880 }, [6, 7]]
    ]
  },
  {
    sample: "loader-changing-pick-2.jsonl",
    rows: [
      [51, { q20: 0, q24: 4, q36: -1, q40: 880 }, [7, 3]],
      [3, { q20: -7, q24: 6, q36: -1, q40: 880 }, [0, 5]],
      [3, { q20: -3, q24: 4, q36: -1, q40: 880 }, [4, 3]],
      [3, { q20: -4, q24: 5, q36: -1, q40: 880 }, [3, 4]],
      [2, { q20: -4, q24: 2, q36: -1, q40: 880 }, [3, 1]],
      [3, { q20: -1, q24: 8, q36: -1, q40: 880 }, [6, 7]]
    ]
  },
  {
    sample: "loader-changing-pick-3.jsonl",
    rows: [
      [51, { q20: 0, q24: -1, q36: 1, q40: 880 }, [2, 5]],
      [3, { q20: 5, q24: -4, q36: 1, q40: 880 }, [7, 2]],
      [3, { q20: 2, q24: 0, q36: 1, q40: 880 }, [4, 6]],
      [3, { q20: 5, q24: -3, q36: 1, q40: 880 }, [7, 3]],
      [3, { q20: 3, q24: -6, q36: 1, q40: 880 }, [5, 0]],
      [3, { q20: 5, q24: -2, q36: 1, q40: 880 }, [7, 4]]
    ]
  },
  {
    sample: "loader-changing-pick-4.jsonl",
    rows: [
      [49, { q20: 0, q36: 4, q40: 880 }, [7, 4]],
      [3, { q20: -6, q24: -4, q36: 4, q40: 880 }, [1, 0]],
      [3, { q20: -1, q24: -1, q36: 4, q40: 880 }, [6, 3]],
      [3, { q20: -6, q24: 1, q36: 4, q40: 880 }, [1, 5]],
      [3, { q20: -1, q24: -3, q36: 4, q40: 880 }, [6, 1]],
      [3, { q20: -5, q24: -4, q36: 4, q40: 880 }, [2, 0]]
    ]
  },
  {
    sample: "loader-changing-pick-5.jsonl",
    rows: [
      [51, { q20: 0, q24: 2, q36: -1, q40: 880 }, [5, 3]],
      [1, { q20: 1, q24: 2, q36: -1, q40: 880 }, [6, 3]],
      [3, { q20: 2, q24: 5, q36: -1, q40: 880 }, [7, 6]],
      [3, { q20: -5, q24: 0, q36: -1, q40: 880 }, [0, 1]],
      [3, { q20: -3, q24: 5, q36: -1, q40: 880 }, [2, 6]],
      [3, { q20: -5, q24: 4, q36: -1, q40: 880 }, [0, 5]]
    ]
  }
];

const singleStateFixtures = [
  ["loader-pick-bottom-left-place-bottom-right.jsonl", 51, { q20: 0, q24: 2, q36: 3, q40: 880 }, [5, 7]],
  ["loader-pick-bottom-middle-place-middle-right.jsonl", 49, { q20: 0, q36: 3, q40: 880 }, [6, 4]],
  ["loader-pick-bottom-middle-place-top-right.jsonl", 51, { q20: 0, q24: 3, q36: -2, q40: 880 }, [6, 2]],
  ["loader-pick-niddle-left-place-top-middle.jsonl", 50, { q24: 0, q36: -3, q40: 880 }, [3, 1]],
  ["loader-pick-niddle-right-place-bottom-middle.jsonl", 51, { q20: 0, q24: 1, q36: 2, q40: 880 }, [4, 6]],
  ["loader-pick-niddle-right-place-top-middle.jsonl", 51, { q20: 0, q24: 1, q36: -3, q40: 880 }, [4, 1]],
  ["loader-pick-top-left-place-bottom-left.jsonl", 51, { q20: 0, q24: -3, q36: 1, q40: 880 }, [0, 5]],
  ["loader-pick-top-left-place-bottom-middle.jsonl", 51, { q20: 0, q24: -3, q36: 2, q40: 880 }, [0, 6]],
  ["loader-pick-top-left-place-bottom-right.jsonl", 51, { q20: 0, q24: -3, q36: 3, q40: 880 }, [0, 7]],
  ["loader-pick-top-left-place-middle-left.jsonl", 51, { q20: 0, q24: -3, q36: -1, q40: 880 }, [0, 3]],
  ["loader-pick-top-left-place-middle-right.jsonl", 49, { q20: 0, q36: -3, q40: 880 }, [0, 4]],
  ["loader-pick-top-left-place-top-middle.jsonl", 51, { q20: 0, q24: -3, q36: -3, q40: 880 }, [0, 1]],
  ["loader-pick-top-left-place-top-right.jsonl", 51, { q20: 0, q24: -3, q36: -2, q40: 880 }, [0, 2]],
  ["loader-pick-top-right-place-bottom-middle.jsonl", 51, { q20: 0, q24: -1, q36: 2, q40: 880 }, [2, 6]],
  ["loader-pick-still-broken2.jsonl", 55, { q20: 0, q24: -3, q28: 3, q36: -1, q40: 860 }, [0, 7]],
  ["loader-pick-still-broken3.jsonl", 53, { q20: 0, q28: -2, q36: -1, q40: 860 }, [1, 4]]
];

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

test("loader pick/place sequence captures", () => {
  for (const fixture of sequenceFixtures) {
    const tracker = new LoaderConfigTracker();
    for (const [index, [mask, loader, expected]] of fixture.rows.entries()) {
      tracker.updateRecord(WORLD, ENTITY, loader, mask);
      const config = tracker.getConfig(WORLD, ENTITY, loader);
      assert.deepEqual(
        [config.pick, config.place],
        expected,
        `${fixture.sample} row ${index} raw=${JSON.stringify(loader)}`
      );
    }
  }
});

test("loader pick/place single-state captures", () => {
  for (const [sample, mask, loader, expected] of singleStateFixtures) {
    const tracker = new LoaderConfigTracker();
    tracker.updateRecord(WORLD, ENTITY, loader, mask);
    const config = tracker.getConfig(WORLD, ENTITY, loader);
    assert.deepEqual([config.pick, config.place], expected, `${sample} raw=${JSON.stringify(loader)}`);
  }
});

test("ModelState exposes loader config after full packet state is applied", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    table78Section(162, ENTITY, 51, [0, -2, 1, 880])
  ));
  assert.deepEqual(
    [model.entity(ENTITY).contents.loader.pick, model.entity(ENTITY).contents.loader.place],
    [1, 5]
  );

  model.apply(modelData(
    2,
    table78Section(162, ENTITY, 1, [-1])
  ));
  assert.deepEqual(
    [model.entity(ENTITY).contents.loader.pick, model.entity(ENTITY).contents.loader.place],
    [0, 5]
  );
});

test("ModelState applies loader tracker updates after all table 78 sections in a packet", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    table78Section(162, ENTITY, 51, [0, -2, 1, 880]),
    table78Section(168, ENTITY, 2, [-4])
  ));

  assert.deepEqual(
    [model.entity(ENTITY).contents.loader.pick, model.entity(ENTITY).contents.loader.place],
    [5, 5]
  );
});

test("ModelState decodes direct loader position/cycle baseline", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    table78Section(162, ENTITY, 19, [-1, 1, 720])
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 2);
  assert.equal(loader.place, 5);
  assert.equal(loader.requireOutput, false);
  assert.equal(loader.cycle, 37);
  assert.equal(loader.stack, 16);
});

test("ModelState decodes initial require-output from loader baseline mask", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    table78Section(162, ENTITY, 51, [0, -1, 1, 880])
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 2);
  assert.equal(loader.place, 5);
  assert.equal(loader.requireOutput, true);
  assert.equal(loader.cycle, 45);
  assert.equal(loader.stack, 16);
});

test("ModelState decodes loader stack limit updates", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    table78Section(162, ENTITY, 19, [-2, 2, 720])
  ));
  assert.equal(model.entity(ENTITY).contents.loader.stack, 16);

  const rows = [
    [-15, 1],
    [-11, 5],
    [-8, 8],
    [0, 16],
    [-7, 9],
    [-13, 3],
    [-14, 2]
  ];
  let previousQ32 = 0;
  for (const [index, [q32, expected]] of rows.entries()) {
    model.apply(modelData(
      index + 2,
      table78Section(162, ENTITY, 8, [q32 - previousQ32])
    ));
    previousQ32 = q32;
    assert.equal(model.entity(ENTITY).contents.loader.stack, expected, `q32=${q32}`);
  }
});

test("ModelState decodes loader stack from baseline plus q32 delta", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    table78Section(162, ENTITY, 120, [-1, -15, 390, 0])
  ));
  assert.equal(model.entity(ENTITY).contents.loader.stack, 1);
  assert.equal(model.entity(ENTITY).contents.loader.cycle, 20.5);

  const rows = [
    [3, 5],
    [6, 8],
    [-1, 1],
    [14, 16]
  ];
  let previousQ32 = -1;
  for (const [index, [q32, expected]] of rows.entries()) {
    model.apply(modelData(
      index + 2,
      table78Section(162, ENTITY, 8, [q32 - previousQ32])
    ));
    previousQ32 = q32;
    assert.equal(model.entity(ENTITY).contents.loader.stack, expected, `q32=${q32}`);
    assert.equal(model.entity(ENTITY).contents.loader.cycle, 20.5, `q32=${q32} cycle`);
  }
});

test("ModelState decodes wait-for-stack initial state and toggles", () => {
  const initiallyOn = new ModelState();
  initiallyOn.apply(modelData(
    1,
    table78Section(162, ENTITY, 91, [0, -2, 2, -2, 720])
  ));
  assert.equal(initiallyOn.entity(ENTITY).contents.loader.waitForStack, true);
  assert.equal(initiallyOn.entity(ENTITY).contents.loader.stack, 14);
  assert.equal(initiallyOn.entity(ENTITY).contents.loader.cycle, 37);

  for (const [index, expected] of [false, true, false].entries()) {
    initiallyOn.apply(modelData(
      index + 2,
      table78Section(162, ENTITY, 64, [0])
    ));
    assert.equal(initiallyOn.entity(ENTITY).contents.loader.waitForStack, expected, `initial on toggle ${index}`);
  }

  const initiallyOff = new ModelState();
  initiallyOff.apply(modelData(
    1,
    table78Section(162, ENTITY, 27, [-2, 2, -2, 720])
  ));
  assert.equal(initiallyOff.entity(ENTITY).contents.loader.waitForStack, false);
  assert.equal(initiallyOff.entity(ENTITY).contents.loader.stack, 14);
  assert.equal(initiallyOff.entity(ENTITY).contents.loader.cycle, 37);

  for (const [index, expected] of [true, false, true].entries()) {
    initiallyOff.apply(modelData(
      index + 2,
      table78Section(162, ENTITY, 64, [0])
    ));
    assert.equal(initiallyOff.entity(ENTITY).contents.loader.waitForStack, expected, `initial off toggle ${index}`);
  }
});

test("ModelState preserves q44 cycle baseline stack behavior", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    table78Section(162, ENTITY, 91, [0, -2, 2, -2, 720])
  ));
  assert.equal(model.entity(ENTITY).contents.loader.stack, 14);

  const rows = [
    [1, 13],
    [0, 12],
    [-1, 11],
    [-2, 10],
    [2, 14],
    [4, 16]
  ];
  let previousQ32 = 2;
  for (const [index, [q32, expected]] of rows.entries()) {
    model.apply(modelData(
      index + 2,
      table78Section(162, ENTITY, 8, [q32 - previousQ32])
    ));
    previousQ32 = q32;
    assert.equal(model.entity(ENTITY).contents.loader.stack, expected, `q32=${q32}`);
  }
});

test("ModelState decodes q44 cycle baseline with direct q36 updates", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    table78Section(162, ENTITY, 104, [-1, -11, 0])
  ));
  assert.equal(model.entity(ENTITY).contents.loader.cycle, 1);

  const rows = [
    [100, 6],
    [104, 6.2],
    [20, 2],
    [380, 20],
    [390, 20.5]
  ];
  let previousQ36 = 0;
  for (const [index, [q36, expected]] of rows.entries()) {
    model.apply(modelData(
      index + 2,
      table78Section(162, ENTITY, 16, [q36 - previousQ36])
    ));
    previousQ36 = q36;
    assert.equal(model.entity(ENTITY).contents.loader.cycle, expected, `q36=${q36}`);
  }
});

test("q28 is priority only outside loader baseline records", () => {
  const tracker = new LoaderConfigTracker();
  const topLeftToBottomRight = { q20: 0, q24: -3, q28: 3, q36: -1, q40: 860 };
  tracker.updateRecord(WORLD, ENTITY, topLeftToBottomRight, 55);
  assert.deepEqual(
    [tracker.getConfig(WORLD, ENTITY, topLeftToBottomRight).pick, tracker.getConfig(WORLD, ENTITY, topLeftToBottomRight).place],
    [0, 7]
  );
  assert.equal(tracker.getConfig(WORLD, ENTITY, topLeftToBottomRight).priority, 0);

  const initial = { q32: -1, q36: -11, q40: 380, q44: 0 };
  tracker.updateRecord(WORLD, ENTITY, initial, 120);
  assert.equal(tracker.getConfig(WORLD, ENTITY, initial).priority, 0);

  const low = { ...initial, q28: -1 };
  tracker.updateRecord(WORLD, ENTITY, low, 4);
  assert.equal(tracker.getConfig(WORLD, ENTITY, low).priority, -1);

  const high = { ...initial, q28: 1 };
  tracker.updateRecord(WORLD, ENTITY, high, 4);
  assert.equal(tracker.getConfig(WORLD, ENTITY, high).priority, 1);
});

test("priority offset captures", () => {
  const highLowNormalLow = new LoaderConfigTracker();
  const high = { q20: 0, q24: 2, q28: -2, q36: 1, q40: 860 };
  highLowNormalLow.updateRecord(WORLD, ENTITY, high, 55);
  assert.equal(highLowNormalLow.getConfig(WORLD, ENTITY, high).priority, 1, "loader-priority-high-low-normal-low initial high");

  const low = { ...high, q28: -4 };
  highLowNormalLow.updateRecord(WORLD, ENTITY, low, 4);
  assert.equal(highLowNormalLow.getConfig(WORLD, ENTITY, low).priority, -1, "loader-priority-high-low-normal-low low");

  const normal = { ...high, q28: -3 };
  highLowNormalLow.updateRecord(WORLD, ENTITY, normal, 4);
  assert.equal(highLowNormalLow.getConfig(WORLD, ENTITY, normal).priority, 0, "loader-priority-high-low-normal-low normal");

  highLowNormalLow.updateRecord(WORLD, ENTITY, low, 4);
  assert.equal(highLowNormalLow.getConfig(WORLD, ENTITY, low).priority, -1, "loader-priority-high-low-normal-low final low");

  const lowNormalHigh = new LoaderConfigTracker();
  const initialLow = { q20: 0, q24: 2, q28: -2, q36: -1, q40: 860 };
  lowNormalHigh.updateRecord(WORLD, ENTITY, initialLow, 55);
  assert.equal(lowNormalHigh.getConfig(WORLD, ENTITY, initialLow).priority, -1, "loader-priority-low-normal-high initial low");

  const nextNormal = { ...initialLow, q28: -1 };
  lowNormalHigh.updateRecord(WORLD, ENTITY, nextNormal, 4);
  assert.equal(lowNormalHigh.getConfig(WORLD, ENTITY, nextNormal).priority, 0, "loader-priority-low-normal-high normal");

  const nextHigh = { ...initialLow, q28: 0 };
  lowNormalHigh.updateRecord(WORLD, ENTITY, nextHigh, 4);
  assert.equal(lowNormalHigh.getConfig(WORLD, ENTITY, nextHigh).priority, 1, "loader-priority-low-normal-high high");
});

test("require output toggle capture", () => {
  const tracker = new LoaderConfigTracker();
  const loader = { q20: 0, q24: -1, q28: 1, q36: 1, q40: 860 };

  tracker.updateRecord(WORLD, ENTITY, loader, 55);
  assert.equal(tracker.getConfig(WORLD, ENTITY, loader).requireOutput, true, "initial on");

  tracker.updateRecord(WORLD, ENTITY, loader, 32);
  assert.equal(tracker.getConfig(WORLD, ENTITY, loader).requireOutput, false, "first toggle off");

  tracker.updateRecord(WORLD, ENTITY, loader, 32);
  assert.equal(tracker.getConfig(WORLD, ENTITY, loader).requireOutput, true, "second toggle on");

  tracker.updateRecord(WORLD, ENTITY, loader, 32);
  assert.equal(tracker.getConfig(WORLD, ENTITY, loader).requireOutput, false, "third toggle off");
});

test("ModelState exposes normalized pusher configuration", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    table78Section(163, ENTITY, 4, [450])
  ));

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
  ));

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
    tableSection(160, hatch, 0, []),
    tableSection(161, hatch, 0, [])
  ));

  const entity = model.entity(hatch);
  assert.equal(entity.typeId, 221);
  assert.equal(entity.typeName, "Cargo Hatch (Packaged)");
  assert.equal(entity.contents?.loader, undefined);
  assert.equal(entity.kind.includes("loader"), false);
});

test("ModelState decodes full initial loader config from loader-ex", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 127, [-1, -2, 2, 1, -4, 100, 0]),
    tableSection(161, ENTITY, 2, fieldDelta(109))
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 1);
  assert.equal(loader.pickName, "top-middle");
  assert.equal(loader.place, 6);
  assert.equal(loader.placeName, "bottom-middle");
  assert.equal(loader.requireOutput, true);
  assert.equal(loader.priority, 1);
  assert.equal(loader.priorityName, "high");
  assert.equal(loader.cycle, 6);
  assert.equal(loader.stack, 12);
  assert.equal(loader.waitForStack, true);
  assert.equal(loader.filterMode, 3);
  assert.equal(loader.filterModeName, "block-all");
  assert.deepEqual(loader.filterSlots, [null, 109, null]);
});

test("ModelState decodes sparse initial loader config from loader-ex-2", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 57, [0, 3, -5, 780]),
    tableSection(160, ENTITY, 1, fieldDelta(2)),
    tableSection(161, ENTITY, 2, fieldDelta(109))
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 6);
  assert.equal(loader.pickName, "bottom-middle");
  assert.equal(loader.place, 4);
  assert.equal(loader.placeName, "middle-right");
  assert.equal(loader.requireOutput, true);
  assert.equal(loader.priority, 0);
  assert.equal(loader.priorityName, "normal");
  assert.equal(loader.cycle, 40);
  assert.equal(loader.stack, 11);
  assert.equal(loader.waitForStack, false);
  assert.equal(loader.filterMode, 2);
  assert.equal(loader.filterModeName, "allow-filter");
  assert.deepEqual(loader.filterSlots, [null, 109, null]);
});

test("ModelState decodes q24/q28 initial loader config from loader-ex-3", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 63, [0, 4, -1, -1, -8, 840]),
    tableSection(160, ENTITY, 1, fieldDelta(1)),
    tableSection(161, ENTITY, 2, fieldDelta(109))
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 7);
  assert.equal(loader.pickName, "bottom-right");
  assert.equal(loader.place, 3);
  assert.equal(loader.placeName, "middle-left");
  assert.equal(loader.requireOutput, true);
  assert.equal(loader.priority, -1);
  assert.equal(loader.priorityName, "low");
  assert.equal(loader.cycle, 43);
  assert.equal(loader.stack, 8);
  assert.equal(loader.waitForStack, false);
  assert.equal(loader.filterMode, 1);
  assert.equal(loader.filterModeName, "block-filter");
  assert.deepEqual(loader.filterSlots, [null, 109, null]);
});

test("ModelState decodes direct-cycle initial loader config from loader-ex-4", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 31, [-3, -2, -1, -12, 940]),
    tableSection(160, ENTITY, 0, []),
    tableSection(161, ENTITY, 2, fieldDelta(109))
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 0);
  assert.equal(loader.pickName, "top-left");
  assert.equal(loader.place, 2);
  assert.equal(loader.placeName, "top-right");
  assert.equal(loader.requireOutput, false);
  assert.equal(loader.priority, -1);
  assert.equal(loader.priorityName, "low");
  assert.equal(loader.cycle, 48);
  assert.equal(loader.stack, 4);
  assert.equal(loader.waitForStack, false);
  assert.equal(loader.filterMode, 0);
  assert.equal(loader.filterModeName, "allow-all");
  assert.deepEqual(loader.filterSlots, [null, 109, null]);
});

test("ModelState decodes q44 direct-cycle initial loader config from loader-ex-5", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 95, [0, -3, -2, 1, -10, 960]),
    tableSection(160, ENTITY, 1, fieldDelta(3)),
    tableSection(161, ENTITY, 2, fieldDelta(109))
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 0);
  assert.equal(loader.pickName, "top-left");
  assert.equal(loader.place, 2);
  assert.equal(loader.placeName, "top-right");
  assert.equal(loader.requireOutput, false);
  assert.equal(loader.priority, 1);
  assert.equal(loader.priorityName, "high");
  assert.equal(loader.cycle, 49);
  assert.equal(loader.stack, 6);
  assert.equal(loader.waitForStack, true);
  assert.equal(loader.filterMode, 3);
  assert.equal(loader.filterModeName, "block-all");
  assert.deepEqual(loader.filterSlots, [null, 109, null]);
});

test("ModelState decodes q44 priority offset updates from loader-ex-9", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 95, [0, 4, -3, 1, -5, 700]),
    tableSection(160, ENTITY, 1, fieldDelta(1)),
    tableSection(161, ENTITY, 4, fieldDelta(109))
  ));

  let loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 7);
  assert.equal(loader.pickName, "bottom-right");
  assert.equal(loader.place, 1);
  assert.equal(loader.placeName, "top-middle");
  assert.equal(loader.priority, 1);
  assert.equal(loader.priorityName, "high");
  assert.equal(loader.cycle, 36);
  assert.equal(loader.stack, 11);
  assert.equal(loader.waitForStack, true);

  const rows = [
    [-4, 0, "normal"],
    [-5, -1, "low"],
    [-3, 1, "high"],
    [-4, 0, "normal"]
  ];
  let previousQ28 = -3;
  for (const [q28, expected, name] of rows) {
    model.apply(modelData(
      2,
      table78Section(162, ENTITY, 4, [q28 - previousQ28])
    ));
    previousQ28 = q28;

    loader = model.entity(ENTITY).contents.loader;
    assert.equal(loader.priority, expected, `q28=${q28}`);
    assert.equal(loader.priorityName, name, `q28=${q28} name`);
  }
});

test("ModelState decodes q44 full-row priority and filter fallback from loader-ex-10", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 127, [-1, 1, -1, -1, -4, 880, 0]),
    tableSection(161, ENTITY, 4, fieldDelta(109))
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 4);
  assert.equal(loader.pickName, "middle-right");
  assert.equal(loader.place, 3);
  assert.equal(loader.placeName, "middle-left");
  assert.equal(loader.requireOutput, true);
  assert.equal(loader.priority, -1);
  assert.equal(loader.priorityName, "low");
  assert.equal(loader.cycle, 45);
  assert.equal(loader.stack, 12);
  assert.equal(loader.waitForStack, true);
  assert.equal(loader.filterMode, 3);
  assert.equal(loader.filterModeName, "block-all");
  assert.deepEqual(loader.filterSlots, [null, null, 109]);
});

test("ModelState decodes q32 filter baseline from loader-ex-11", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 121, [-1, 3, -1, 1060, 0])
  ));

  let loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 6);
  assert.equal(loader.pickName, "bottom-middle");
  assert.equal(loader.place, 4);
  assert.equal(loader.placeName, "middle-right");
  assert.equal(loader.requireOutput, true);
  assert.equal(loader.priority, 0);
  assert.equal(loader.priorityName, "normal");
  assert.equal(loader.cycle, 54);
  assert.equal(loader.stack, 15);
  assert.equal(loader.waitForStack, true);
  assert.equal(loader.filterMode, 3);
  assert.equal(loader.filterModeName, "block-all");
  assert.equal(loader.filterSlots, null);

  model.apply(modelData(
    2,
    table78Section(162, ENTITY, 4, [1])
  ));

  loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.priority, 1);
  assert.equal(loader.priorityName, "high");
  assert.equal(loader.filterMode, 3);
  assert.equal(loader.filterModeName, "block-all");
  assert.equal(loader.stack, 15);

  model.apply(modelData(
    3,
    table78Section(162, ENTITY, 8, [-1])
  ));

  loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.stack, 15);
  assert.equal(loader.filterMode, 2);
  assert.equal(loader.filterModeName, "allow-filter");
});

test("ModelState decodes q32 priority and table 77 filter slot from loader-ex-12", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 63, [0, 4, -4, -1, -1, 1060]),
    tableSection(160, ENTITY, 1, fieldDelta(2)),
    tableSection(161, ENTITY, 4, fieldDelta(109))
  ));

  let loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 7);
  assert.equal(loader.pickName, "bottom-right");
  assert.equal(loader.place, 0);
  assert.equal(loader.placeName, "top-left");
  assert.equal(loader.requireOutput, true);
  assert.equal(loader.priority, -1);
  assert.equal(loader.priorityName, "low");
  assert.equal(loader.cycle, 54);
  assert.equal(loader.stack, 15);
  assert.equal(loader.waitForStack, false);
  assert.equal(loader.filterMode, 2);
  assert.equal(loader.filterModeName, "allow-filter");
  assert.deepEqual(loader.filterSlots, [null, null, 109]);

  model.apply(modelData(
    2,
    table78Section(162, ENTITY, 4, [1])
  ));

  loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.priority, 0);
  assert.equal(loader.priorityName, "normal");
  assert.equal(loader.filterMode, 2);
  assert.deepEqual(loader.filterSlots, [null, null, 109]);
});

test("ModelState decodes q32 filter fallback from loader-ex-13", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 127, [-1, 4, -4, 1, -1, 1060, 0])
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 7);
  assert.equal(loader.pickName, "bottom-right");
  assert.equal(loader.place, 0);
  assert.equal(loader.placeName, "top-left");
  assert.equal(loader.requireOutput, true);
  assert.equal(loader.priority, 1);
  assert.equal(loader.priorityName, "high");
  assert.equal(loader.cycle, 54);
  assert.equal(loader.stack, 15);
  assert.equal(loader.waitForStack, true);
  assert.equal(loader.filterMode, 2);
  assert.equal(loader.filterModeName, "allow-filter");
  assert.equal(loader.filterSlots, null);
});

test("ModelState decodes q44 loader baseline without q28 from loader-ex-6", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 91, [0, -3, 3, -7, 880]),
    tableSection(160, ENTITY, 1, fieldDelta(3)),
    tableSection(161, ENTITY, 2, fieldDelta(109))
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 0);
  assert.equal(loader.pickName, "top-left");
  assert.equal(loader.place, 7);
  assert.equal(loader.placeName, "bottom-right");
  assert.equal(loader.requireOutput, false);
  assert.equal(loader.priority, 0);
  assert.equal(loader.priorityName, "normal");
  assert.equal(loader.cycle, 45);
  assert.equal(loader.stack, 9);
  assert.equal(loader.waitForStack, true);
  assert.equal(loader.filterMode, 3);
  assert.equal(loader.filterModeName, "block-all");
  assert.deepEqual(loader.filterSlots, [null, 109, null]);
});

test("ModelState decodes sparse direct-cycle initial loader config from loader-ex-8", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 30, [-2, 1, -4, 700]),
    tableSection(160, ENTITY, 1, fieldDelta(2)),
    tableSection(161, ENTITY, 5, [153, 166].flatMap(fieldDelta))
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 3);
  assert.equal(loader.pickName, "middle-left");
  assert.equal(loader.place, 2);
  assert.equal(loader.placeName, "top-right");
  assert.equal(loader.requireOutput, false);
  assert.equal(loader.priority, 1);
  assert.equal(loader.priorityName, "high");
  assert.equal(loader.cycle, 36);
  assert.equal(loader.stack, 12);
  assert.equal(loader.waitForStack, false);
  assert.equal(loader.filterMode, 2);
  assert.equal(loader.filterModeName, "allow-filter");
});

test("ModelState keeps q44/no-q28 loader place origin across pick/place deltas", () => {
  const middleRight = new ModelState();
  middleRight.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 91, [0, -3, -2, -11, 380])
  ));
  middleRight.apply(modelData(
    2,
    table78Section(162, ENTITY, 3, [3, 2])
  ));
  let loader = middleRight.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 3);
  assert.equal(loader.pickName, "middle-left");
  assert.equal(loader.place, 4);
  assert.equal(loader.placeName, "middle-right");
  assert.equal(loader.stack, 5);

  const topRight = new ModelState();
  topRight.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 91, [0, -3, 3, -11, 380])
  ));
  topRight.apply(modelData(
    2,
    table78Section(162, ENTITY, 2, [-5])
  ));
  loader = topRight.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 0);
  assert.equal(loader.pickName, "top-left");
  assert.equal(loader.place, 2);
  assert.equal(loader.placeName, "top-right");
  assert.equal(loader.stack, 5);
});

test("ModelState updates q44/no-q40 loader cycle through q36 baseline delta edits", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 91, [0, -3, 3, -5, 900]),
    tableSection(160, ENTITY, 1, fieldDelta(3)),
    tableSection(161, ENTITY, 2, fieldDelta(109))
  ));

  assert.equal(model.entity(ENTITY).contents.loader.cycle, 46);
  assert.equal(model.entity(ENTITY).contents.loader.stack, 11);

  const rows = [
    [15, 47],
    [35, 48],
    [55, 49],
    [75, 50]
  ];
  let previousQ36 = -5;
  for (const [q36, expected] of rows) {
    model.apply(modelData(
      2,
      table78Section(162, ENTITY, 16, [q36 - previousQ36])
    ));
    previousQ36 = q36;

    const loader = model.entity(ENTITY).contents.loader;
    assert.equal(loader.cycle, expected, `q36=${q36}`);
    assert.equal(loader.stack, 11, `q36=${q36} stack`);
    assert.equal(loader.pick, 0);
    assert.equal(loader.place, 7);
    assert.equal(loader.requireOutput, false);
  }
});

test("ModelState keeps q44/no-q40 cycle stable on require-output q40 materialization", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 91, [0, -3, 3, -7, 880]),
    tableSection(160, ENTITY, 1, fieldDelta(3)),
    tableSection(161, ENTITY, 2, fieldDelta(109))
  ));

  model.apply(modelData(
    2,
    table78Section(162, ENTITY, 32, [0])
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.cycle, 45);
  assert.equal(loader.stack, 9);
  assert.equal(loader.requireOutput, true);
});

test("ModelState updates q44 direct-cycle loader config without toggling wait state", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 95, [0, -3, -2, 1, -10, 960]),
    tableSection(160, ENTITY, 1, fieldDelta(3)),
    tableSection(161, ENTITY, 2, fieldDelta(109))
  ));

  model.apply(modelData(
    2,
    table78Section(162, ENTITY, 64, [40])
  ));

  let loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.cycle, 51);
  assert.equal(loader.waitForStack, true);

  model.apply(modelData(
    3,
    table78Section(162, ENTITY, 64, [0])
  ));

  loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.cycle, 51);
  assert.equal(loader.waitForStack, false);
});

test("ModelState does not rebase loader positions from active flag bits on later updates", () => {
  const model = new ModelState();
  model.apply(modelData(
    1,
    tableSection(43, ENTITY, 3, [252, 1].flatMap(fieldDelta)),
    table78Section(162, ENTITY, 127, [-1, -2, 2, 1, -4, 100, 0]),
    tableSection(161, ENTITY, 2, fieldDelta(109))
  ));

  model.apply(modelData(
    2,
    table78Section(162, ENTITY, 99, [5, -4, 0, 0])
  ));

  const loader = model.entity(ENTITY).contents.loader;
  assert.equal(loader.pick, 6);
  assert.equal(loader.pickName, "bottom-middle");
  assert.equal(loader.place, 2);
  assert.equal(loader.placeName, "top-right");
  assert.equal(loader.requireOutput, true);
  assert.equal(loader.waitForStack, true);
  assert.equal(loader.priority, 1);
  assert.equal(loader.cycle, 6);
  assert.equal(loader.stack, 12);
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
