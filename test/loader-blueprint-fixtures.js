import {
  AdjacentPosition,
  Blueprint,
  FilterType,
  Item,
  Priority,
  Structure,
  filterConfig,
  filterItemsConfig,
  loaderConfig
} from "dsa-shipshape";

const SKATES = Item.SPEED_SKATES;
const IRON = Item.IRON;
const STANDARD_AMMO = Item.STANDARD_AMMO;
const COOLING_CELL = Item.COOLING_CELL;

const POSITIONS = [
  AdjacentPosition.TOP_LEFT,
  AdjacentPosition.TOP_MIDDLE,
  AdjacentPosition.TOP_RIGHT,
  AdjacentPosition.LEFT_MIDDLE,
  AdjacentPosition.RIGHT_MIDDLE,
  AdjacentPosition.BOTTOM_LEFT,
  AdjacentPosition.BOTTOM_MIDDLE,
  AdjacentPosition.BOTTOM_RIGHT
];
const PRIORITIES = [Priority.LOW, Priority.NORMAL, Priority.HIGH];
const FILTER_MODES = [
  FilterType.ALLOW_ALL,
  FilterType.BLOCK_FILTER_ONLY,
  FilterType.ALLOW_FILTER_ONLY,
  FilterType.BLOCK_ALL
];
const STACKS = [1, 2, 4, 6, 8, 9, 11, 12, 15, 16];
const CYCLE_TIMES = [20, 40, 100, 120, 140, 160, 180, 360, 720, 860, 980, 1080];
const FILTER_SLOTS = [
  [0, 0, 0],
  [IRON, 0, 0],
  [0, SKATES, 0],
  [0, 0, SKATES],
  [STANDARD_AMMO, 0, 0],
  [IRON, STANDARD_AMMO, COOLING_CELL],
  [SKATES, IRON, 0],
  [0, STANDARD_AMMO, COOLING_CELL]
];

function loaderConfigs(config, filterMode = FilterType.ALLOW_ALL, slots = []) {
  return [
    loaderConfig(config),
    filterConfig(filterMode),
    filterItemsConfig(slots[0] ?? 0, slots[1] ?? 0, slots[2] ?? 0)
  ];
}

function normalizeLoaderConfig(configs) {
  const loader = configs.find((config) => config.type === "config_loader");
  const filter = configs.find((config) => config.type === "filter_config");
  const items = configs.find((config) => config.type === "filter_items");
  if (!loader) throw new Error("loader fixture build is missing config_loader");
  return {
    pick: loader.pickPosition,
    place: loader.placePosition,
    priority: loader.priority - 1,
    stack: loader.maxStack,
    cycle: loader.cycleTime / 20,
    requireOutput: loader.requireOutputInventory,
    waitForStack: loader.waitForStackLimit,
    filterMode: filter?.filterType ?? FilterType.ALLOW_ALL,
    filterSlots: items?.items.map((item) => item || null) ?? [null, null, null]
  };
}

export function normalizeLoaderBuild(build) {
  return {
    x: build.x,
    y: build.y,
    ...normalizeLoaderConfig(build.configs)
  };
}

function createLoaderBlueprint(name, width, height, cases) {
  const structure = new Structure(width, height);
  for (const item of cases) {
    structure.place(Item.LOADER_PACKAGED, item.x, item.y, {
      configs: loaderConfigs(item.config, item.filterMode, item.filterSlots)
    });
  }
  const blueprint = structure.toBlueprint();
  const code = Blueprint.encode(blueprint, { prefix: true });
  const loaders = structure.getAll()
    .filter((build) => build.item === Item.LOADER_PACKAGED)
    .map((build) => ({
      name: cases.find((item) => item.x === build.x && item.y === build.y)?.name ?? `${build.x},${build.y}`,
      ...normalizeLoaderBuild(build)
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return { name, code, blueprint, loaders };
}

function differentPlace(pick, seed) {
  let place = POSITIONS[(seed * 3 + 1) % POSITIONS.length];
  if (place === pick) place = POSITIONS[(seed + 5) % POSITIONS.length];
  return place;
}

function generatedLoaderCase(name, x, y, seed, overrides = {}) {
  const pickPosition = overrides.pickPosition ?? POSITIONS[seed % POSITIONS.length];
  const placePosition = overrides.placePosition ?? differentPlace(pickPosition, seed);
  return {
    name,
    x,
    y,
    config: {
      pickPosition,
      placePosition,
      priority: overrides.priority ?? PRIORITIES[seed % PRIORITIES.length],
      maxStack: overrides.maxStack ?? STACKS[seed % STACKS.length],
      cycleTime: overrides.cycleTime ?? CYCLE_TIMES[seed % CYCLE_TIMES.length],
      requireOutputInventory: overrides.requireOutputInventory ?? Boolean(seed & 1),
      waitForStackLimit: overrides.waitForStackLimit ?? Boolean(seed & 2)
    },
    filterMode: overrides.filterMode ?? FILTER_MODES[seed % FILTER_MODES.length],
    filterSlots: overrides.filterSlots ?? FILTER_SLOTS[seed % FILTER_SLOTS.length]
  };
}

function makeMatrixCases() {
  const cases = [
    {
      name: "default-horizontal",
      x: 2,
      y: 2,
      config: {
        pickPosition: AdjacentPosition.LEFT_MIDDLE,
        placePosition: AdjacentPosition.RIGHT_MIDDLE,
        priority: Priority.NORMAL
      }
    },
    {
      name: "slow-high-wait",
      x: 5,
      y: 2,
      config: {
        pickPosition: AdjacentPosition.TOP_MIDDLE,
        placePosition: AdjacentPosition.BOTTOM_MIDDLE,
        priority: Priority.HIGH,
        maxStack: 12,
        cycleTime: 120,
        requireOutputInventory: true,
        waitForStackLimit: true
      },
      filterMode: FilterType.BLOCK_ALL,
      filterSlots: [0, SKATES, 0]
    },
    {
      name: "low-small-stack",
      x: 8,
      y: 2,
      config: {
        pickPosition: AdjacentPosition.BOTTOM_RIGHT,
        placePosition: AdjacentPosition.LEFT_MIDDLE,
        priority: Priority.LOW,
        maxStack: 8,
        cycleTime: 860,
        requireOutputInventory: true
      },
      filterMode: FilterType.BLOCK_FILTER_ONLY,
      filterSlots: [IRON, 0, 0]
    },
    {
      name: "direct-cycle-shape",
      x: 11,
      y: 2,
      config: {
        pickPosition: AdjacentPosition.TOP_LEFT,
        placePosition: AdjacentPosition.TOP_RIGHT,
        priority: Priority.HIGH,
        maxStack: 6,
        cycleTime: 980,
        waitForStackLimit: true
      },
      filterMode: FilterType.BLOCK_ALL,
      filterSlots: [0, SKATES, 0]
    },
    {
      name: "allow-filter-third-slot",
      x: 14,
      y: 2,
      config: {
        pickPosition: AdjacentPosition.RIGHT_MIDDLE,
        placePosition: AdjacentPosition.LEFT_MIDDLE,
        priority: Priority.LOW,
        maxStack: 12,
        cycleTime: 900,
        requireOutputInventory: true,
        waitForStackLimit: true
      },
      filterMode: FilterType.ALLOW_FILTER_ONLY,
      filterSlots: [0, 0, SKATES]
    },
    {
      name: "no-output-wait",
      x: 2,
      y: 5,
      config: {
        pickPosition: AdjacentPosition.RIGHT_MIDDLE,
        placePosition: AdjacentPosition.BOTTOM_RIGHT,
        priority: Priority.HIGH,
        maxStack: 9,
        cycleTime: 160,
        waitForStackLimit: true
      },
      filterMode: FilterType.BLOCK_FILTER_ONLY,
      filterSlots: [IRON, 0, 0]
    },
    {
      name: "standard-ammo-stack-one",
      x: 5,
      y: 5,
      config: {
        pickPosition: AdjacentPosition.BOTTOM_LEFT,
        placePosition: AdjacentPosition.TOP_LEFT,
        priority: Priority.NORMAL,
        maxStack: 1,
        cycleTime: 20,
        requireOutputInventory: true
      },
      filterMode: FilterType.ALLOW_FILTER_ONLY,
      filterSlots: [STANDARD_AMMO, 0, 0]
    },
    {
      name: "mixed-filter-slots",
      x: 8,
      y: 5,
      config: {
        pickPosition: AdjacentPosition.BOTTOM_MIDDLE,
        placePosition: AdjacentPosition.TOP_MIDDLE,
        priority: Priority.NORMAL,
        maxStack: 15,
        cycleTime: 1080,
        requireOutputInventory: true,
        waitForStackLimit: true
      },
      filterMode: FilterType.BLOCK_ALL,
      filterSlots: [IRON, STANDARD_AMMO, COOLING_CELL]
    }
  ];

  const occupied = new Set(cases.map((item) => `${item.x},${item.y}`));
  let seed = 8;
  for (let y = 1; y <= 8; y++) {
    for (let x = 1; x <= 14; x++) {
      if (occupied.has(`${x},${y}`)) continue;
      cases.push(generatedLoaderCase(`matrix-${String(seed).padStart(2, "0")}`, x, y, seed));
      seed += 1;
    }
  }
  return cases;
}

function makeDeltaCases(reconfigured = false) {
  const cases = [
    {
      name: "cycle-q40-origin",
      x: 2,
      y: 2,
      config: {
        pickPosition: AdjacentPosition.LEFT_MIDDLE,
        placePosition: AdjacentPosition.BOTTOM_RIGHT,
        priority: Priority.HIGH,
        maxStack: 9,
        cycleTime: 100,
        requireOutputInventory: true,
        waitForStackLimit: true
      },
      filterMode: FilterType.BLOCK_ALL,
      filterSlots: [IRON, 0, 0]
    },
    {
      name: "cycle-q44-origin",
      x: 5,
      y: 2,
      config: {
        pickPosition: AdjacentPosition.RIGHT_MIDDLE,
        placePosition: AdjacentPosition.LEFT_MIDDLE,
        priority: Priority.HIGH,
        maxStack: 9,
        cycleTime: 160,
        waitForStackLimit: true
      },
      filterMode: FilterType.BLOCK_FILTER_ONLY,
      filterSlots: [IRON, 0, 0]
    },
    {
      name: "priority-offset",
      x: 8,
      y: 2,
      config: {
        pickPosition: AdjacentPosition.BOTTOM_RIGHT,
        placePosition: AdjacentPosition.TOP_MIDDLE,
        priority: Priority.HIGH,
        maxStack: 11,
        cycleTime: 720,
        waitForStackLimit: true
      },
      filterMode: FilterType.BLOCK_FILTER_ONLY,
      filterSlots: [0, 0, SKATES]
    }
  ];

  if (reconfigured) {
    cases[0] = {
      ...cases[0],
      config: { ...cases[0].config, cycleTime: 140 }
    };
    cases[1] = {
      ...cases[1],
      config: { ...cases[1].config, cycleTime: 180 }
    };
    cases[2] = {
      ...cases[2],
      config: { ...cases[2].config, priority: Priority.LOW }
    };
  }

  const occupied = new Set(cases.map((item) => `${item.x},${item.y}`));
  let seed = 3;
  for (let y = 1; y <= 6; y++) {
    for (let x = 1; x <= 10; x++) {
      if (occupied.has(`${x},${y}`)) continue;
      const base = generatedLoaderCase(`delta-${String(seed).padStart(2, "0")}`, x, y, seed + 30);
      cases.push(reconfigured ? reconfigureDeltaCase(base, seed) : base);
      seed += 1;
    }
  }
  return cases;
}

function makePairMatrixCases() {
  const cases = [];
  let index = 0;
  for (let variant = 0; variant < 3; variant += 1) {
    for (let pick = 0; pick < POSITIONS.length; pick += 1) {
      for (let place = 0; place < POSITIONS.length; place += 1) {
        if (pick === place) continue;
        const seed = 200 + index + (variant * 37);
        cases.push({
          name: `pair-${String(index).padStart(3, "0")}`,
          x: 1 + (index % 21),
          y: 1 + Math.floor(index / 21),
          config: {
            pickPosition: POSITIONS[pick],
            placePosition: POSITIONS[place],
            priority: PRIORITIES[(pick + place + variant) % PRIORITIES.length],
            maxStack: STACKS[(pick * 2 + place + variant) % STACKS.length],
            cycleTime: CYCLE_TIMES[(pick + (place * 2) + (variant * 3)) % CYCLE_TIMES.length],
            requireOutputInventory: Boolean((pick + variant) & 1),
            waitForStackLimit: Boolean((place + variant) & 1)
          },
          filterMode: FILTER_MODES[(pick + place + variant) % FILTER_MODES.length],
          filterSlots: FILTER_SLOTS[seed % FILTER_SLOTS.length]
        });
        index += 1;
      }
    }
  }
  return cases;
}

function makeDelta2Cases(reconfigured = false) {
  const cases = [];
  let index = 0;
  for (let y = 1; y <= 7; y += 1) {
    for (let x = 1; x <= 12; x += 1) {
      const base = generatedLoaderCase(`delta2-${String(index).padStart(2, "0")}`, x, y, 500 + index);
      cases.push(reconfigured ? reconfigureDelta2Case(base, index) : base);
      index += 1;
    }
  }
  return cases;
}

function makeCheckerCases() {
  const cases = [];
  let index = 0;
  for (let y = 1; y <= 9; y += 1) {
    for (let x = 1; x <= 15; x += 1) {
      if (((x + y) & 1) === 0) continue;
      const seed = 800 + (index * 5);
      cases.push(generatedLoaderCase(`checker-${String(index).padStart(2, "0")}`, x, y, seed, {
        pickPosition: POSITIONS[(x + (y * 2)) % POSITIONS.length],
        placePosition: POSITIONS[((x * 3) + y + 1) % POSITIONS.length],
        priority: PRIORITIES[(x + y) % PRIORITIES.length],
        maxStack: STACKS[(x + (y * 3)) % STACKS.length],
        cycleTime: CYCLE_TIMES[((x * 2) + y) % CYCLE_TIMES.length],
        requireOutputInventory: Boolean(x & 1),
        waitForStackLimit: Boolean(y & 1),
        filterMode: FILTER_MODES[(x + (y * 2)) % FILTER_MODES.length],
        filterSlots: FILTER_SLOTS[seed % FILTER_SLOTS.length]
      }));
      if (cases.at(-1).config.pickPosition === cases.at(-1).config.placePosition) {
        cases.at(-1).config.placePosition = POSITIONS[(cases.at(-1).config.placePosition + 1) % POSITIONS.length];
      }
      index += 1;
    }
  }
  return cases;
}

function makeDelta3Cases(reconfigured = false) {
  const cases = [];
  let index = 0;
  for (let y = 1; y <= 6; y += 1) {
    for (let x = 1; x <= 9; x += 1) {
      const base = generatedLoaderCase(`delta3-${String(index).padStart(2, "0")}`, x, y, 900 + (index * 3), {
        priority: PRIORITIES[index % PRIORITIES.length],
        maxStack: STACKS[(index * 3) % STACKS.length],
        cycleTime: CYCLE_TIMES[(index * 5) % CYCLE_TIMES.length],
        requireOutputInventory: Boolean(index & 1),
        waitForStackLimit: Boolean(index & 2)
      });
      cases.push(reconfigured ? reconfigureDelta3Case(base, index) : base);
      index += 1;
    }
  }
  return cases;
}

function makeDelta4Cases(reconfigured = false) {
  const cases = [];
  let index = 0;
  for (let y = 1; y <= 6; y += 1) {
    for (let x = 1; x <= 10; x += 1) {
      const base = generatedLoaderCase(`delta4-${String(index).padStart(2, "0")}`, x, y, 1100 + (index * 7), {
        priority: PRIORITIES[(index + 1) % PRIORITIES.length],
        maxStack: STACKS[(index + 4) % STACKS.length],
        cycleTime: CYCLE_TIMES[(index + 2) % CYCLE_TIMES.length],
        requireOutputInventory: Boolean(index & 1),
        waitForStackLimit: Boolean(index & 4)
      });
      cases.push(reconfigured ? reconfigureDelta4Case(base, index) : base);
      index += 1;
    }
  }
  return cases;
}

function makeDelta5Cases(reconfigured = false) {
  const cases = [];
  let index = 0;
  for (let y = 1; y <= 6; y += 1) {
    for (let x = 1; x <= 10; x += 1) {
      const base = generatedLoaderCase(`delta5-${String(index).padStart(2, "0")}`, x, y, 1300 + (index * 7), {
        priority: PRIORITIES[(index + 2) % PRIORITIES.length],
        maxStack: STACKS[(index + 7) % STACKS.length],
        cycleTime: CYCLE_TIMES[(index + 4) % CYCLE_TIMES.length],
        requireOutputInventory: Boolean(index & 2),
        waitForStackLimit: Boolean(index & 1)
      });
      cases.push(reconfigured ? reconfigureDelta5Case(base, index) : base);
      index += 1;
    }
  }
  return cases;
}

function makeDelta6Cases(reconfigured = false) {
  const cases = [];
  let index = 0;
  for (let y = 1; y <= 6; y += 1) {
    for (let x = 1; x <= 10; x += 1) {
      const base = generatedLoaderCase(`delta6-${String(index).padStart(2, "0")}`, x, y, 1500 + (index * 7), {
        priority: PRIORITIES[index % PRIORITIES.length],
        maxStack: STACKS[(index * 2) % STACKS.length],
        cycleTime: CYCLE_TIMES[(index + 6) % CYCLE_TIMES.length],
        requireOutputInventory: Boolean(index & 4),
        waitForStackLimit: Boolean(index & 2)
      });
      cases.push(reconfigured ? reconfigureDelta6Case(base, index) : base);
      index += 1;
    }
  }
  return cases;
}

function makeDeltaGapCycleCases(reconfigured = false) {
  const cases = [];
  for (let variant = 0; variant < 8; variant += 1) {
    for (let subset = 0; subset < 16; subset += 1) {
      const seed = 1700 + (variant * 41) + subset;
      const base = generatedLoaderCase(`gap-cycle-v${variant}-m${String(subset).padStart(2, "0")}`, 1 + subset, 1 + variant, seed, {
        priority: PRIORITIES[(variant + subset) % PRIORITIES.length],
        maxStack: STACKS[(variant + (subset * 3)) % STACKS.length],
        cycleTime: CYCLE_TIMES[(variant + (subset * 5)) % CYCLE_TIMES.length],
        requireOutputInventory: Boolean((variant + subset) & 1),
        waitForStackLimit: Boolean((variant * 3 + subset) & 2),
        filterMode: FILTER_MODES[(variant + subset) % FILTER_MODES.length],
        filterSlots: FILTER_SLOTS[(seed + 1) % FILTER_SLOTS.length]
      });
      cases.push(reconfigured ? reconfigureGapCycleCase(base, variant, subset) : base);
    }
  }
  return cases;
}

function makeDeltaGapNoCycleCases(reconfigured = false) {
  const cases = [];
  for (let variant = 0; variant < 4; variant += 1) {
    for (let subset = 0; subset < 16; subset += 1) {
      const seed = 2100 + (variant * 41) + subset;
      const base = generatedLoaderCase(`gap-no-cycle-v${variant}-m${String(subset).padStart(2, "0")}`, 1 + subset, 1 + variant, seed, {
        priority: PRIORITIES[(variant + subset + 1) % PRIORITIES.length],
        maxStack: STACKS[(variant + (subset * 5)) % STACKS.length],
        cycleTime: CYCLE_TIMES[(variant + (subset * 7)) % CYCLE_TIMES.length],
        requireOutputInventory: Boolean((variant + subset + 1) & 1),
        waitForStackLimit: Boolean((variant * 5 + subset) & 2),
        filterMode: FILTER_MODES[(variant + subset + 1) % FILTER_MODES.length],
        filterSlots: FILTER_SLOTS[(seed + 2) % FILTER_SLOTS.length]
      });
      cases.push(reconfigured ? reconfigureGapNoCycleCase(base, variant, subset) : base);
    }
  }
  return cases;
}

function makeDeltaMultiStepCases(step = 0) {
  const cases = [];
  for (let variant = 0; variant < 4; variant += 1) {
    for (let subset = 0; subset < 16; subset += 1) {
      const seed = 2500 + (variant * 47) + subset;
      let item = generatedLoaderCase(`delta-multi-v${variant}-m${String(subset).padStart(2, "0")}`, 1 + subset, 1 + variant, seed, {
        priority: PRIORITIES[(variant + (subset * 2)) % PRIORITIES.length],
        maxStack: STACKS[(variant + (subset * 7)) % STACKS.length],
        cycleTime: CYCLE_TIMES[(variant + (subset * 3)) % CYCLE_TIMES.length],
        requireOutputInventory: Boolean((variant + subset) & 1),
        waitForStackLimit: Boolean((variant + subset + 1) & 2),
        filterMode: FILTER_MODES[(variant + subset + 2) % FILTER_MODES.length],
        filterSlots: FILTER_SLOTS[(seed + 3) % FILTER_SLOTS.length]
      });
      for (let currentStep = 1; currentStep <= step; currentStep += 1) {
        item = reconfigureMultiStepCase(item, variant, subset, currentStep);
      }
      cases.push(item);
    }
  }
  return cases;
}

function reconfigureDeltaCase(item, seed) {
  const nextPick = POSITIONS[(item.config.pickPosition + 1) % POSITIONS.length];
  let nextPlace = POSITIONS[(item.config.placePosition + 2) % POSITIONS.length];
  if (nextPlace === nextPick) nextPlace = POSITIONS[(nextPlace + 3) % POSITIONS.length];
  return {
    ...item,
    config: {
      ...item.config,
      pickPosition: nextPick,
      placePosition: nextPlace,
      priority: PRIORITIES[(seed + 1) % PRIORITIES.length],
      maxStack: STACKS[(seed + 4) % STACKS.length],
      cycleTime: CYCLE_TIMES[(seed + 5) % CYCLE_TIMES.length],
      requireOutputInventory: !item.config.requireOutputInventory,
      waitForStackLimit: !item.config.waitForStackLimit
    },
    filterMode: FILTER_MODES[(seed + 1) % FILTER_MODES.length],
    filterSlots: FILTER_SLOTS[(seed + 2) % FILTER_SLOTS.length]
  };
}

function reconfigureDelta2Case(item, seed) {
  const pickShift = 3 + (seed % 3);
  const placeShift = 5 + (seed % 2);
  const nextPick = POSITIONS[(item.config.pickPosition + pickShift) % POSITIONS.length];
  let nextPlace = POSITIONS[(item.config.placePosition + placeShift) % POSITIONS.length];
  if (nextPlace === nextPick) nextPlace = POSITIONS[(nextPlace + 3) % POSITIONS.length];
  return {
    ...item,
    config: {
      ...item.config,
      pickPosition: nextPick,
      placePosition: nextPlace,
      priority: PRIORITIES[(seed + 2) % PRIORITIES.length],
      maxStack: STACKS[(STACKS.length - 1 - (seed % STACKS.length) + STACKS.length) % STACKS.length],
      cycleTime: CYCLE_TIMES[(seed + 7) % CYCLE_TIMES.length],
      requireOutputInventory: !item.config.requireOutputInventory,
      waitForStackLimit: !item.config.waitForStackLimit
    },
    filterMode: FILTER_MODES[(seed + 2) % FILTER_MODES.length],
    filterSlots: FILTER_SLOTS[(seed + 5) % FILTER_SLOTS.length]
  };
}

function reconfigureDelta3Case(item, seed) {
  const nextPick = POSITIONS[(item.config.pickPosition + 2 + (seed % 4)) % POSITIONS.length];
  let nextPlace = POSITIONS[(item.config.placePosition + 1 + (seed % 5)) % POSITIONS.length];
  if (nextPlace === nextPick) nextPlace = POSITIONS[(nextPlace + 4) % POSITIONS.length];
  return {
    ...item,
    config: {
      ...item.config,
      pickPosition: nextPick,
      placePosition: nextPlace,
      priority: item.config.priority,
      maxStack: STACKS[(seed + 6) % STACKS.length],
      cycleTime: CYCLE_TIMES[(seed + 9) % CYCLE_TIMES.length],
      requireOutputInventory: !item.config.requireOutputInventory,
      waitForStackLimit: !item.config.waitForStackLimit
    },
    filterMode: FILTER_MODES[(seed + 3) % FILTER_MODES.length],
    filterSlots: FILTER_SLOTS[(seed + 6) % FILTER_SLOTS.length]
  };
}

function reconfigureDelta4Case(item, seed) {
  let nextPick = POSITIONS[(item.config.pickPosition + 1 + (seed % 5)) % POSITIONS.length];
  if (nextPick === item.config.placePosition) nextPick = POSITIONS[(nextPick + 2) % POSITIONS.length];
  return {
    ...item,
    config: {
      ...item.config,
      pickPosition: nextPick,
      placePosition: item.config.placePosition,
      priority: item.config.priority,
      maxStack: item.config.maxStack,
      cycleTime: CYCLE_TIMES[(seed + 8) % CYCLE_TIMES.length],
      requireOutputInventory: !item.config.requireOutputInventory,
      waitForStackLimit: !item.config.waitForStackLimit
    },
    filterMode: FILTER_MODES[(seed + 1) % FILTER_MODES.length],
    filterSlots: FILTER_SLOTS[(seed + 3) % FILTER_SLOTS.length]
  };
}

function reconfigureDelta5Case(item, seed) {
  let nextPlace = POSITIONS[(item.config.placePosition + 2 + (seed % 4)) % POSITIONS.length];
  if (nextPlace === item.config.pickPosition) nextPlace = POSITIONS[(nextPlace + 3) % POSITIONS.length];
  return {
    ...item,
    config: {
      ...item.config,
      pickPosition: item.config.pickPosition,
      placePosition: nextPlace,
      priority: item.config.priority,
      maxStack: item.config.maxStack,
      cycleTime: CYCLE_TIMES[(seed + 10) % CYCLE_TIMES.length],
      requireOutputInventory: !item.config.requireOutputInventory,
      waitForStackLimit: !item.config.waitForStackLimit
    },
    filterMode: FILTER_MODES[(seed + 2) % FILTER_MODES.length],
    filterSlots: FILTER_SLOTS[(seed + 4) % FILTER_SLOTS.length]
  };
}

function reconfigureDelta6Case(item, seed) {
  return {
    ...item,
    config: {
      ...item.config,
      pickPosition: item.config.pickPosition,
      placePosition: item.config.placePosition,
      priority: PRIORITIES[(seed + 1) % PRIORITIES.length],
      maxStack: STACKS[(seed + 5) % STACKS.length],
      cycleTime: CYCLE_TIMES[(seed + 11) % CYCLE_TIMES.length],
      requireOutputInventory: !item.config.requireOutputInventory,
      waitForStackLimit: !item.config.waitForStackLimit
    },
    filterMode: FILTER_MODES[(seed + 3) % FILTER_MODES.length],
    filterSlots: FILTER_SLOTS[(seed + 5) % FILTER_SLOTS.length]
  };
}

function reconfigureGapCycleCase(item, variant, subset) {
  const config = reconfigureGapCaseConfig(item.config, variant, subset, {
    changeCycle: true,
    cycleSeed: variant + subset + 13
  });
  return {
    ...item,
    config,
    filterMode: FILTER_MODES[(variant + subset + 2) % FILTER_MODES.length],
    filterSlots: FILTER_SLOTS[(variant + subset + 4) % FILTER_SLOTS.length]
  };
}

function reconfigureGapNoCycleCase(item, variant, subset) {
  const config = reconfigureGapCaseConfig(item.config, variant, subset, {
    changeCycle: false,
    cycleSeed: variant + subset + 17
  });
  return {
    ...item,
    config,
    filterMode: FILTER_MODES[(variant + subset + 3) % FILTER_MODES.length],
    filterSlots: FILTER_SLOTS[(variant + subset + 5) % FILTER_SLOTS.length]
  };
}

function reconfigureMultiStepCase(item, variant, subset, step) {
  const config = reconfigureGapCaseConfig(item.config, variant + step, subset, {
    changeCycle: step !== 2,
    cycleSeed: variant + subset + (step * 11)
  });
  return {
    ...item,
    config,
    filterMode: FILTER_MODES[(variant + subset + step + 2) % FILTER_MODES.length],
    filterSlots: FILTER_SLOTS[(variant + subset + (step * 3)) % FILTER_SLOTS.length]
  };
}

function reconfigureGapCaseConfig(config, variant, subset, { changeCycle, cycleSeed }) {
  let pickPosition = config.pickPosition;
  let placePosition = config.placePosition;
  if (subset & 1) pickPosition = POSITIONS[(pickPosition + 1 + (variant % 6)) % POSITIONS.length];
  if (subset & 2) placePosition = POSITIONS[(placePosition + 2 + (variant % 5)) % POSITIONS.length];
  ({ pickPosition, placePosition } = keepDifferentPositions(pickPosition, placePosition, subset, variant));

  return {
    ...config,
    pickPosition,
    placePosition,
    priority: (subset & 4) ? nextPriority(config.priority, 1 + (variant % 2)) : config.priority,
    maxStack: (subset & 8) ? nextStack(config.maxStack, 3 + variant + subset) : config.maxStack,
    cycleTime: changeCycle ? nextCycleTime(config.cycleTime, cycleSeed) : config.cycleTime,
    requireOutputInventory: !config.requireOutputInventory,
    waitForStackLimit: !config.waitForStackLimit
  };
}

function keepDifferentPositions(pickPosition, placePosition, subset, variant) {
  if (pickPosition !== placePosition) return { pickPosition, placePosition };
  if (subset & 2) {
    return { pickPosition, placePosition: POSITIONS[(placePosition + 1 + (variant % 6)) % POSITIONS.length] };
  }
  return { pickPosition: POSITIONS[(pickPosition + 1 + (variant % 6)) % POSITIONS.length], placePosition };
}

function nextPriority(priority, shift) {
  const index = PRIORITIES.indexOf(priority);
  return PRIORITIES[((index < 0 ? 0 : index) + shift) % PRIORITIES.length];
}

function nextStack(stack, seed) {
  const index = STACKS.indexOf(stack);
  const next = STACKS[((index < 0 ? 0 : index) + seed) % STACKS.length];
  return next === stack ? STACKS[(STACKS.indexOf(next) + 1) % STACKS.length] : next;
}

function nextCycleTime(cycleTime, seed) {
  const index = CYCLE_TIMES.indexOf(cycleTime);
  const next = CYCLE_TIMES[((index < 0 ? 0 : index) + seed) % CYCLE_TIMES.length];
  return next === cycleTime ? CYCLE_TIMES[(CYCLE_TIMES.indexOf(next) + 1) % CYCLE_TIMES.length] : next;
}

export const loaderBlueprintFixtures = {
  matrix: createLoaderBlueprint("loader-config-matrix", 16, 10, makeMatrixCases()),
  pairMatrix: createLoaderBlueprint("loader-config-pairs", 23, 10, makePairMatrixCases()),
  checkerMatrix: createLoaderBlueprint("loader-config-checker", 17, 11, makeCheckerCases()),
  deltaBase: createLoaderBlueprint("loader-delta-base", 12, 8, makeDeltaCases(false)),
  deltaReconfigured: createLoaderBlueprint("loader-delta-reconfigured", 12, 8, makeDeltaCases(true)),
  delta2Base: createLoaderBlueprint("loader-delta-2-base", 14, 9, makeDelta2Cases(false)),
  delta2Reconfigured: createLoaderBlueprint("loader-delta-2-reconfigured", 14, 9, makeDelta2Cases(true)),
  delta3Base: createLoaderBlueprint("loader-delta-3-base", 11, 8, makeDelta3Cases(false)),
  delta3Reconfigured: createLoaderBlueprint("loader-delta-3-reconfigured", 11, 8, makeDelta3Cases(true)),
  delta4Base: createLoaderBlueprint("loader-delta-4-base", 12, 8, makeDelta4Cases(false)),
  delta4Reconfigured: createLoaderBlueprint("loader-delta-4-reconfigured", 12, 8, makeDelta4Cases(true)),
  delta5Base: createLoaderBlueprint("loader-delta-5-base", 12, 8, makeDelta5Cases(false)),
  delta5Reconfigured: createLoaderBlueprint("loader-delta-5-reconfigured", 12, 8, makeDelta5Cases(true)),
  delta6Base: createLoaderBlueprint("loader-delta-6-base", 12, 8, makeDelta6Cases(false)),
  delta6Reconfigured: createLoaderBlueprint("loader-delta-6-reconfigured", 12, 8, makeDelta6Cases(true)),
  deltaGapCycleBase: createLoaderBlueprint("loader-delta-gap-cycle-base", 18, 10, makeDeltaGapCycleCases(false)),
  deltaGapCycleReconfigured: createLoaderBlueprint("loader-delta-gap-cycle-reconfigured", 18, 10, makeDeltaGapCycleCases(true)),
  deltaGapNoCycleBase: createLoaderBlueprint("loader-delta-gap-no-cycle-base", 18, 6, makeDeltaGapNoCycleCases(false)),
  deltaGapNoCycleReconfigured: createLoaderBlueprint("loader-delta-gap-no-cycle-reconfigured", 18, 6, makeDeltaGapNoCycleCases(true)),
  deltaMultiBase: createLoaderBlueprint("loader-delta-multi-base", 18, 6, makeDeltaMultiStepCases(0)),
  deltaMultiStep1: createLoaderBlueprint("loader-delta-multi-step-1", 18, 6, makeDeltaMultiStepCases(1)),
  deltaMultiStep2: createLoaderBlueprint("loader-delta-multi-step-2", 18, 6, makeDeltaMultiStepCases(2)),
  deltaMultiStep3: createLoaderBlueprint("loader-delta-multi-step-3", 18, 6, makeDeltaMultiStepCases(3))
};

export function fixtureByName(fixture) {
  return new Map(fixture.loaders.map((loader) => [loader.name, loader]));
}

export function fixtureByPosition(fixture) {
  return new Map(fixture.loaders.map((loader) => [`${loader.x},${loader.y}`, loader]));
}
