import assert from "node:assert/strict";
import test from "node:test";
import { ModelState } from "../src/game/model.js";
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

function table78Section(tag, entity, mask, deltas) {
  return [
    ...streamInt(tag),
    ...streamInt(entity),
    ...unsigned(mask),
    ...deltas.flatMap(fieldDelta),
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
  assert.equal(initiallyOn.entity(ENTITY).contents.loader.stack, 18);
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
  assert.equal(model.entity(ENTITY).contents.loader.stack, 18);

  const rows = [
    [1, 17],
    [0, 16],
    [-1, 15],
    [-2, 14],
    [2, 18],
    [4, 20]
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
