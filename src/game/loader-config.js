export const LOADER_POSITION_NAMES = new Map([
  [0, "top-left"],
  [1, "top-middle"],
  [2, "top-right"],
  [3, "middle-left"],
  [4, "middle-right"],
  [5, "bottom-left"],
  [6, "bottom-middle"],
  [7, "bottom-right"]
]);

export const LOADER_PRIORITY_NAMES = new Map([
  [-1, "low"],
  [0, "normal"],
  [1, "high"]
]);

export const LOADER_FILTER_MODE_NAMES = new Map([
  [0, "allow-all"],
  [1, "block-filter"],
  [2, "allow-filter"],
  [3, "block-all"]
]);

const DEFAULT_LOADER_PRIORITY = 0;
const DEFAULT_LOADER_FILTER_MODE = 0;
const DEFAULT_LOADER_STACK = 16;
const DEFAULT_LOADER_CYCLE = 1;
const DEFAULT_LOADER_PICK = 3;
const DEFAULT_LOADER_PLACE = 4;
const LOADER_CONFIG_NUMERIC_BITS = [1, 2, 4, 8, 16];
const LOADER_CONFIG_NUMERIC_FIELDS = ["q20", "q24", "q28", "q32", "q36"];

export function wrapLoaderPosition(value) {
  return value == null ? null : ((value % 8) + 8) % 8;
}

export function enumName(map, value) {
  if (value == null) return "-";
  const name = map.get(value);
  return name == null ? String(value) : `${name}(${value})`;
}

export function decodeIndexedLoaderSnapshotRecord(loader, mask = 0, cumulative = null, reference = null) {
  const config = {
    pick: 3,
    place: 4,
    priority: DEFAULT_LOADER_PRIORITY,
    requireOutput: false,
    waitForStack: false,
    stack: DEFAULT_LOADER_STACK,
    cycle: DEFAULT_LOADER_CYCLE
  };

  if (mask & 32) config.requireOutput = true;
  if (mask & 64) config.waitForStack = true;

  switch (mask) {
    case 0:
      break;
    case 1:
      config.pick = wrapLoaderPosition((loader.q20 ?? 0) + 3);
      if (cumulative?.q40 != null) config.requireOutput = true;
      break;
    case 2:
      if (reference && cumulative?.q40 != null && loader.q24 != null) {
        if (loader.q24 <= -8) {
          config.pick = wrapLoaderPosition((reference.pick ?? 3) + 1);
          config.place = wrapLoaderPosition((reference.place ?? 4) + 3);
          config.requireOutput = true;
        } else {
          config.pick = wrapLoaderPosition((reference.pick ?? 3) + 2);
          config.place = wrapLoaderPosition((reference.place ?? 4) + 4);
        }
      } else {
        config.place = wrapLoaderPosition((loader.q24 ?? 0) + 4);
      }
      break;
    case 3:
      config.pick = reference && loader.q24 <= -8
        ? wrapLoaderPosition((reference.pick ?? 3) + (loader.q20 ?? 0) + 3)
        : wrapLoaderPosition((loader.q20 ?? 0) + 3);
      config.place = wrapLoaderPosition((loader.q24 ?? 0) + 4);
      // Some repeated full-snapshot rows keep flag state in the materialized
      // cumulative row while only sending pick/place deltas in the row mask.
      if (cumulative?.q44 != null && cumulative?.q36 == null && cumulative?.q40 == null) {
        config.requireOutput = true;
        config.waitForStack = true;
      }
      break;
    case 5:
      config.pick = wrapLoaderPosition((loader.q28 ?? 0) + 1);
      config.place = wrapLoaderPosition((loader.q28 ?? 0) + 3);
      break;
    case 6:
      config.pick = wrapLoaderPosition((loader.q24 ?? 0) + 5);
      config.place = wrapLoaderPosition((loader.q24 ?? 0) + 3);
      config.requireOutput = true;
      break;
    case 7:
      if (reference && (cumulative?.q40 != null || loader.q24 <= -8 || loader.q28 >= 2)) {
        if (loader.q24 <= -8) {
          config.pick = wrapLoaderPosition((reference.pick ?? 3) + (loader.q20 ?? 0) + 5);
          config.place = wrapLoaderPosition(reference.place ?? 4);
          config.requireOutput = true;
          config.waitForStack = true;
          if (loader.q28 != null) config.priority = loader.q28;
        } else if (loader.q28 >= 2) {
          config.pick = wrapLoaderPosition((reference.pick ?? 3) + loader.q28);
          config.place = wrapLoaderPosition((reference.place ?? 4) + (loader.q20 ?? 0));
          config.priority = loader.q28 - 4;
        } else if ((loader.q20 ?? 0) >= 3) {
          config.pick = wrapLoaderPosition((reference.pick ?? 3) + (loader.q20 ?? 0));
          config.place = wrapLoaderPosition(reference.place ?? 4);
          config.priority = (loader.q28 ?? 0) + 1;
          config.requireOutput = Boolean(reference.requireOutput);
          config.waitForStack = Boolean(reference.waitForStack);
        } else {
          config.pick = wrapLoaderPosition((loader.q20 ?? 0) + 2);
          config.place = wrapLoaderPosition((reference.place ?? 4) + (loader.q24 ?? 0));
          config.priority = (loader.q28 ?? 0) + 1;
        }
      } else {
        config.pick = wrapLoaderPosition((loader.q20 ?? 0) + 3);
        config.place = wrapLoaderPosition((loader.q24 ?? 0) + 4);
        if (loader.q28 != null) config.priority = loader.q28;
      }
      break;
    case 8:
      config.pick = wrapLoaderPosition((cumulative?.q40 ?? 0) + 4);
      config.place = wrapLoaderPosition((cumulative?.q28 ?? 0) + 2);
      config.requireOutput = true;
      break;
    case 9:
      config.pick = wrapLoaderPosition((loader.q20 ?? 0) + 3);
      config.place = wrapLoaderPosition((cumulative?.q40 ?? 0) + 3);
      break;
    case 18:
      config.pick = wrapLoaderPosition(loader.q24 ?? 0);
      config.place = wrapLoaderPosition((loader.q36 ?? 0) + 2);
      if (loader.q36 != null) config.cycle = (loader.q36 / 20) + 1;
      break;
    case 32:
      break;
    case 65:
      config.pick = wrapLoaderPosition((loader.q44 ?? 0) + 3);
      break;
    case 33:
      config.pick = wrapLoaderPosition((loader.q40 ?? 0) + 3);
      config.place = wrapLoaderPosition((loader.q20 ?? 0) + 4);
      break;
    case 34:
      config.pick = wrapLoaderPosition((loader.q24 ?? 0) + 3);
      config.place = wrapLoaderPosition((loader.q40 ?? 0) + 4);
      break;
    case 35:
      config.pick = wrapLoaderPosition((loader.q24 ?? 0) + 3);
      config.place = wrapLoaderPosition((loader.q40 ?? 0) + 4);
      break;
    case 67:
      config.pick = wrapLoaderPosition((loader.q24 ?? 0) + 3);
      config.place = wrapLoaderPosition((loader.q44 ?? 0) + 4);
      break;
    case 95:
      config.pick = wrapLoaderPosition((loader.q24 ?? 0) + 3);
      config.place = wrapLoaderPosition((loader.q28 ?? 0) + 4);
      if (loader.q32 != null) config.priority = loader.q32;
      if (loader.q36 != null) config.stack = DEFAULT_LOADER_STACK + loader.q36;
      if (loader.q44 != null) config.cycle = (loader.q44 / 20) + 1;
      break;
    case 98:
      config.place = wrapLoaderPosition((loader.q40 ?? 0) + 4);
      break;
    case 99:
      config.pick = wrapLoaderPosition((loader.q24 ?? 0) + 3);
      config.place = wrapLoaderPosition((loader.q40 ?? 0) + 4);
      break;
    case 126:
      config.pick = wrapLoaderPosition(loader.q28 ?? 0);
      config.place = wrapLoaderPosition(loader.q24 ?? 0);
      if (loader.q32 != null) config.priority = loader.q32;
      if (loader.q36 != null) config.stack = DEFAULT_LOADER_STACK + loader.q36;
      if (loader.q40 != null) config.cycle = (loader.q40 / 20) + 1;
      break;
    default:
      return null;
  }

  return config;
}

export function decodeLoaderSnapshotRecord(loader, mask = loader?.lastMask ?? 0) {
  if (!loader) return null;
  const hasRequireOutput = Boolean(mask & 32);
  const hasWaitForStack = Boolean(mask & 64);
  const hasFlag = hasRequireOutput || hasWaitForStack;
  const slots = [];

  for (const [index, bit] of LOADER_CONFIG_NUMERIC_BITS.entries()) {
    if (!(mask & bit)) continue;
    const value = loader[LOADER_CONFIG_NUMERIC_FIELDS[index]];
    if (value == null) return null;
    slots.push(value);
  }
  if (hasRequireOutput) {
    if (loader.q40 == null) return null;
    slots.push(loader.q40);
  } else if (hasWaitForStack) {
    if (loader.q44 == null) return null;
    slots.push(loader.q44);
  }

  if (hasFlag && slots.length) slots.shift();

  const config = {
    pick: 3,
    place: 4,
    priority: DEFAULT_LOADER_PRIORITY,
    requireOutput: hasRequireOutput,
    waitForStack: hasWaitForStack,
    stack: DEFAULT_LOADER_STACK,
    cycle: DEFAULT_LOADER_CYCLE
  };

  if (mask & 1) {
    if (!slots.length) return null;
    config.pick = wrapLoaderPosition(slots.shift() + 3);
  }
  if (mask & 2) {
    if (!slots.length) return null;
    config.place = wrapLoaderPosition(slots.shift() + 4);
  }
  if (mask & 4) {
    if (!slots.length) return null;
    config.priority = slots.shift();
  }
  if (mask & 8) {
    if (!slots.length) return null;
    config.stack = DEFAULT_LOADER_STACK + slots.shift();
  }
  if (mask & 16) {
    if (!slots.length) return null;
    config.cycle = (slots.shift() / 20) + 1;
  }

  return config;
}

function decodeLoaderSemanticDeltaRecord(loader, mask = loader?.lastMask ?? 0) {
  if (!loader) return null;
  const hasRequireOutput = Boolean(mask & 32);
  const hasWaitForStack = Boolean(mask & 64);
  if (!hasRequireOutput && !hasWaitForStack) return null;

  const slots = [];
  for (const [index, bit] of LOADER_CONFIG_NUMERIC_BITS.entries()) {
    if (!(mask & bit)) continue;
    slots.push(loader[LOADER_CONFIG_NUMERIC_FIELDS[index]] ?? 0);
  }
  if (hasRequireOutput) slots.push(loader.q40 ?? 0);
  else if (hasWaitForStack) slots.push(loader.q44 ?? 0);

  if (slots.length) slots.shift();

  const config = {};
  if (mask & 1) config.pick = slots.shift() ?? 0;
  if (mask & 2) config.place = slots.shift() ?? 0;
  if (mask & 4) config.priority = slots.shift() ?? 0;
  if (mask & 8) config.stack = slots.shift() ?? 0;
  if (mask & 16) config.cycleTicks = slots.shift() ?? 0;
  config.requireOutput = hasRequireOutput;
  config.waitForStack = hasWaitForStack;
  return config;
}

function loaderDeltaRecord(loader, mask, previous) {
  const record = { lastMask: mask };
  for (const [field, bit] of [
    ["q20", 1],
    ["q24", 2],
    ["q28", 4],
    ["q32", 8],
    ["q36", 16],
    ["q40", 32],
    ["q44", 64]
  ]) {
    if (!(mask & bit)) continue;
    if (field === "q44" && ((mask & 32) || loader?.q44 == null)) continue;
    record[field] = (loader?.[field] ?? 0) - (previous?.[field] ?? 0);
  }
  return record;
}

function isSemanticLoaderDelta(changed, full) {
  return !full &&
    changed.previous != null &&
    (changed.mask & 96) === 96;
}

function filterSlotValue(value) {
  return value == null || value === 0 ? null : value;
}

export class LoaderConfigTracker {
  constructor() {
    this.pickBases = new Map();
    this.pickDeltaBases = new Map();
    this.placeBases = new Map();
    this.placeDeltaBases = new Map();
    this.currentPicks = new Map();
    this.currentPlaces = new Map();
    this.sparsePositionBaselines = new Set();
    this.priorities = new Map();
    this.priorityOffsets = new Map();
    this.filterModes = new Map();
    this.filterSources = new Map();
    this.requireOutputs = new Map();
    this.waitForStacks = new Map();
    this.stackBases = new Map();
    this.stackSources = new Map();
    this.cycles = new Map();
    this.cycleModes = new Map();
    this.cycleDeltaBases = new Map();
    this.directCycleValues = new Map();
    this.directCycleFields = new Map();
  }

  updateFromModel(update) {
    const world = update?.world;
    const model = update?.result?.model;
    if (!world || !model) return;
    const seenEntities = new Set();
    for (const section of model.sections || []) {
      if (section.table !== 78) continue;
      for (const changed of section.records || []) {
        if (changed.indexedLoaderConfig) {
          this.updateIndexedSnapshotRecord(world.id, changed.entity, changed.record, changed.mask, changed.cumulativeRecord, changed.configEntity);
          continue;
        }
        const loader = changed.record ?? world.model.record(78, changed.entity);
        this.updateRecord(world.id, changed.entity, loader, changed.mask, changed.previous, {
          repeatedInUpdate: seenEntities.has(changed.entity),
          repeatedInSection: changed.repeatedInSection,
          semanticSnapshot: Boolean(model.full),
          semanticDelta: isSemanticLoaderDelta(changed, model.full),
          deltaRecord: loaderDeltaRecord(loader, changed.mask, changed.previous)
        });
        seenEntities.add(changed.entity);
      }
    }
  }

  updateRecord(worldId, entityId, loader, mask = 0, previous = null, options = {}) {
    if (!loader) return;
    const key = this.#key(worldId, entityId);
    const hasTrackedConfig = this.#hasTrackedConfig(key);
    if (hasTrackedConfig &&
      (options.repeatedInSection || options.repeatedInUpdate) &&
      this.sparsePositionBaselines.has(key) &&
      this.hasPositionConfig(worldId, entityId)) {
      return;
    }
    if (!hasTrackedConfig && this.#isDirectPositionCycleBaseline(loader, mask)) {
      this.pickBases.set(key, 3);
      this.pickDeltaBases.set(key, 0);
      this.placeBases.set(key, 4);
      this.placeDeltaBases.set(key, 0);
      this.#setCurrentPosition(key, loader);
      if ((mask & 4) && loader.q28 >= -1 && loader.q28 <= 1) this.priorities.set(key, loader.q28);
      this.requireOutputs.set(key, Boolean(mask & 32));
      this.waitForStacks.set(key, Boolean(mask & 64));
      this.stackBases.set(key, 16);
      this.stackSources.delete(key);
      this.cycleModes.set(key, "direct");
      this.cycleDeltaBases.set(key, 0);
      this.directCycleValues.set(key, loader.q44 ?? loader.q36);
      this.directCycleFields.set(key, loader.q44 == null ? "q36" : "q44");
      this.cycles.set(key, ((loader.q44 ?? loader.q36) / 20) + 1);
      return;
    }

    if (!hasTrackedConfig && options.allowSparseBaseline && this.#isSparsePositionBaseline(loader, mask)) {
      this.#applySparsePositionBaseline(key, loader, mask);
      return;
    }

    const baseline = hasTrackedConfig ? null : this.#loaderBaseline(loader, mask, options.semanticSnapshot);
    if (hasTrackedConfig && options.semanticDelta && this.#applySemanticDelta(worldId, entityId, loader, mask, previous, options.deltaRecord)) {
      return;
    }
    const hasInitialConfigFields = baseline || ((mask & 31) && ((mask & 32) || ((mask & 64) && (mask & 4))));
    // Loader table 78 is an affine config vector: initial/full rows establish
    // origins, then later rows are deltas even when active flag bits are present.
    if (!hasTrackedConfig && hasInitialConfigFields && mask !== 32 && mask !== 64) {
      if (baseline) this.#applyLoaderBaseline(key, loader, baseline);
      else {
        const usedQ28AsPositionBase = this.#initializePositionBaseline(key, loader, mask);
        if ((mask & 4) && loader.q28 != null) {
          if (usedQ28AsPositionBase) this.#initializePriorityOffset(key, loader);
          else this.priorities.set(key, loader.q28);
        }
      }
      this.requireOutputs.set(key, Boolean(mask & 32));
      this.waitForStacks.set(key, Boolean(mask & 64));
      if (!this.stackBases.has(key)) this.#initializeStackBaseline(key, loader);
      if (!this.cycles.has(key)) this.#initializeCycleBaseline(key, loader);
      return;
    }

    const q44CycleChanged = (mask & 64) &&
      this.#usesQ44CycleBase(key) &&
      loader.q44 != null &&
      (
        this.#fieldChanged(previous, loader, "q44") ||
        (this.directCycleValues.has(key) && loader.q44 !== this.directCycleValues.get(key))
      );
    const q40DirectCycleChanged = (mask & 32) &&
      this.cycleModes.get(key) === "q40-direct" &&
      loader.q40 != null &&
      (
        this.#fieldChanged(previous, loader, "q40") ||
        (this.directCycleValues.has(key) && loader.q40 !== this.directCycleValues.get(key))
      );
    if (q44CycleChanged) {
      this.directCycleValues.set(key, loader.q44);
      this.#updateCycle(key, loader);
    } else if (q40DirectCycleChanged) {
      this.directCycleValues.set(key, loader.q40);
      this.#updateCycle(key, loader);
    } else if ((mask & 32) && mask === 32) {
      this.requireOutputs.set(key, !this.requireOutputs.get(key));
    } else if ((mask & 32) && !this.requireOutputs.has(key)) {
      this.requireOutputs.set(key, true);
    }
    // The same bit is also the wait-for-stack toggle. Treat a real q44 value
    // change as cycle config, and an unchanged standalone bit as the toggle.
    if (!q44CycleChanged) {
      if ((mask & 64) && mask === 64) this.waitForStacks.set(key, !this.waitForStacks.get(key));
      else if ((mask & 64) && !this.waitForStacks.has(key)) this.waitForStacks.set(key, true);
    }
    if ((mask & 4) && loader.q28 != null) this.priorities.set(key, this.#priority(key, loader.q28));
    if ((mask & 8) && this.filterSources.get(key) === "q32" && loader.q32 != null) this.filterModes.set(key, loader.q32);
    const q32FilterOnlyUpdate = this.filterSources.get(key) === "q32" && mask === 8;
    if ((mask & 8) && !options.semanticDelta && !q32FilterOnlyUpdate && loader.q32 != null && this.stackBases.has(key)) {
      const previousConfig = this.getConfig(worldId, entityId, previous);
      this.stackBases.set(key, previousConfig.stack - (previous?.q32 ?? 0));
      this.stackSources.set(key, "q32");
    }
    if (mask & 16) this.#updateCycle(key, loader);
    if ((mask & 3) && this.hasPositionConfig(worldId, entityId)) this.#setCurrentPosition(key, loader);
  }

  updateIndexedSnapshotRecord(worldId, entityId, loader, mask = 0, cumulative = null, configEntity = null) {
    if (!loader) return false;
    const reference = configEntity == null || Number(configEntity) === Number(entityId)
      ? null
      : this.#trackedConfig(worldId, configEntity);
    const config = decodeIndexedLoaderSnapshotRecord(loader, mask, cumulative, reference);
    if (!config) return false;

    const key = this.#key(worldId, entityId);
    this.pickBases.set(key, config.pick);
    this.pickDeltaBases.set(key, loader.q20 ?? 0);
    this.placeBases.set(key, config.place);
    this.placeDeltaBases.set(key, loader.q24 ?? 0);
    this.currentPicks.set(key, config.pick);
    this.currentPlaces.set(key, config.place);
    this.sparsePositionBaselines.delete(key);
    this.priorities.set(key, config.priority);
    if (mask === 95 && loader.q28 != null) this.priorityOffsets.set(key, config.priority - loader.q28);
    else this.priorityOffsets.delete(key);
    this.filterModes.delete(key);
    this.filterSources.delete(key);
    this.requireOutputs.set(key, config.requireOutput);
    this.waitForStacks.set(key, config.waitForStack);
    this.stackBases.set(key, config.stack - (loader.q32 ?? 0));
    this.stackSources.delete(key);
    this.cycles.set(key, config.cycle);
    if (mask === 95) {
      this.cycleModes.set(key, "q44-q36-delta");
      this.cycleDeltaBases.set(key, loader.q36 ?? 0);
      this.directCycleValues.set(key, loader.q44);
      this.directCycleFields.set(key, "q44");
    } else if (mask === 126) {
      this.cycleModes.set(key, "offset");
      this.cycleDeltaBases.set(key, loader.q36 ?? 0);
      this.directCycleValues.delete(key);
      this.directCycleFields.delete(key);
    } else {
      this.cycleModes.set(key, "direct");
      this.cycleDeltaBases.set(key, 0);
    }
    if (loader.q36 != null && mask === 18) {
      this.directCycleValues.set(key, loader.q36);
      this.directCycleFields.set(key, "q36");
    } else if (mask !== 95 && mask !== 126) {
      this.directCycleValues.delete(key);
      this.directCycleFields.delete(key);
    }
    return true;
  }

  delete(worldId, entityId) {
    const key = this.#key(worldId, entityId);
    this.pickBases.delete(key);
    this.pickDeltaBases.delete(key);
    this.placeBases.delete(key);
    this.placeDeltaBases.delete(key);
    this.currentPicks.delete(key);
    this.currentPlaces.delete(key);
    this.sparsePositionBaselines.delete(key);
    this.priorities.delete(key);
    this.priorityOffsets.delete(key);
    this.filterModes.delete(key);
    this.filterSources.delete(key);
    this.requireOutputs.delete(key);
    this.waitForStacks.delete(key);
    this.stackBases.delete(key);
    this.stackSources.delete(key);
    this.cycles.delete(key);
    this.cycleModes.delete(key);
    this.cycleDeltaBases.delete(key);
    this.directCycleValues.delete(key);
    this.directCycleFields.delete(key);
  }

  getConfig(worldId, entityId, loader, loaderFilter = null, filterSlots = null) {
    const key = this.#key(worldId, entityId);
    const pick = this.currentPicks.has(key) ? this.currentPicks.get(key) : this.#pick(key, loader);
    const place = this.currentPlaces.has(key) ? this.currentPlaces.get(key) : this.#place(key, loader);
    const stackBase = this.stackBases.get(key) ?? 16;
    const stackSource = this.stackSources.get(key) ?? "q32";
    const stackField = stackSource === "fixed" ? null : loader?.[stackSource];
    const stack = stackField == null
      ? this.stackBases.has(key) || this.hasPositionConfig(worldId, entityId) ? stackBase : null
      : stackBase + stackField;
    const cycle = this.cycles.has(key)
      ? this.cycles.get(key)
      : loader?.q40 == null || loader.q36 == null ? null : ((loader.q40 + loader.q36) / 20) + 1;
    return {
      pick,
      place,
      priority: this.priorities.has(key) ? this.priorities.get(key) : DEFAULT_LOADER_PRIORITY,
      requireOutput: this.requireOutputs.has(key) ? this.requireOutputs.get(key) : false,
      waitForStack: this.waitForStacks.has(key) ? this.waitForStacks.get(key) : false,
      stack: stack ?? DEFAULT_LOADER_STACK,
      cycle: cycle ?? DEFAULT_LOADER_CYCLE,
      filterMode: loaderFilter ? loaderFilter.q20 ?? DEFAULT_LOADER_FILTER_MODE : this.#filterMode(key, loader) ?? DEFAULT_LOADER_FILTER_MODE,
      filterSlots: filterSlots ? [filterSlotValue(filterSlots.q20), filterSlotValue(filterSlots.q24), filterSlotValue(filterSlots.q28)] : null
    };
  }

  hasPositionConfig(worldId, entityId) {
    const key = this.#key(worldId, entityId);
    return this.pickBases.has(key) && this.placeBases.has(key);
  }

  #hasTrackedConfig(key) {
    return this.pickBases.has(key) ||
      this.placeBases.has(key) ||
      this.priorities.has(key) ||
      this.priorityOffsets.has(key) ||
      this.filterModes.has(key) ||
      this.requireOutputs.has(key) ||
      this.waitForStacks.has(key) ||
      this.stackBases.has(key) ||
      this.cycles.has(key);
  }

  #fieldChanged(previous, loader, field) {
    return previous != null && loader != null && previous[field] !== loader[field];
  }

  #usesQ44CycleBase(key) {
    const mode = this.cycleModes.get(key);
    return mode === "q44-q36-delta";
  }

  #initializePositionBaseline(key, loader, mask) {
    const hasQ28PositionBase = loader.q28 != null && (mask & 4);
    if (loader.q24 != null) {
      this.pickBases.set(key, wrapLoaderPosition(loader.q24 + 3));
      this.pickDeltaBases.set(key, loader.q20 ?? 0);
      this.placeDeltaBases.set(key, loader.q24);
      const initialPlace = hasQ28PositionBase
        ? loader.q28 + 4
        : loader.q36 == null ? null : loader.q36 + 4;
      if (initialPlace != null) this.placeBases.set(key, wrapLoaderPosition(initialPlace));
      return hasQ28PositionBase;
    }

    if (hasQ28PositionBase) {
      this.pickBases.set(key, wrapLoaderPosition(loader.q28 + 3));
      this.pickDeltaBases.set(key, 0);
      this.placeBases.set(key, 4);
      this.placeDeltaBases.set(key, 0);
      return true;
    }

    if (loader.q20 != null && loader.q36 != null) {
      this.pickBases.set(key, wrapLoaderPosition(loader.q36 + 3));
      this.pickDeltaBases.set(key, 0);
      this.placeBases.set(key, 4);
      this.placeDeltaBases.set(key, 0);
    }
    return false;
  }

  #initializeCycleBaseline(key, loader) {
    if (loader?.q44 != null && (loader.q36 == null || loader.q40 == null)) {
      this.cycleModes.set(key, "q44-q36-delta");
      this.cycleDeltaBases.set(key, loader.q36 ?? 0);
      this.directCycleValues.set(key, loader.q44);
      this.directCycleFields.set(key, "q44");
      this.cycles.set(key, (loader.q44 / 20) + 1);
      return;
    }
    if (loader?.q40 == null || loader.q36 == null) return;
    this.cycleModes.set(key, "offset");
    this.cycleDeltaBases.set(key, loader.q36 ?? 0);
    this.directCycleValues.delete(key);
    this.directCycleFields.delete(key);
    this.cycles.set(key, (loader.q40 / 20) + 1);
  }

  #initializeStackBaseline(key, loader) {
    if (this.stackBases.has(key)) return;
    if (loader?.q32 == null) return;
    const baseline = this.#loaderBaseline(loader, loader?.lastMask);
    if (baseline) {
      this.stackBases.set(key, baseline.stack - loader.q32);
      return;
    }
    if (loader.q20 == null && loader.q24 == null && loader.q28 == null && loader.q36 != null) {
      this.stackBases.set(key, 17 + loader.q36);
      return;
    }
    this.stackBases.set(key, 16);
  }

  #initializePriorityOffset(key, loader) {
    if (loader?.q28 == null || loader?.q36 == null) return;
    const offset = loader.q36 + 2;
    const priority = loader.q28 + offset;
    if (priority < -1 || priority > 1) return;
    this.priorityOffsets.set(key, offset);
    this.priorities.set(key, priority);
  }

  #priority(key, q28) {
    return q28 + (this.priorityOffsets.get(key) ?? 0);
  }

  #updateCycle(key, loader) {
    const mode = this.cycleModes.get(key);
    if (mode === "direct") {
      if (loader?.q36 != null) {
        this.directCycleValues.set(key, loader.q36);
        this.directCycleFields.set(key, "q36");
        this.cycles.set(key, (loader.q36 / 20) + 1);
      } else if (loader?.q44 != null) {
        this.directCycleValues.set(key, loader.q44);
        this.directCycleFields.set(key, "q44");
        this.cycles.set(key, (loader.q44 / 20) + 1);
      }
      return;
    }
    if (mode === "q44-q36-delta") {
      const base = loader?.q44 ?? this.directCycleValues.get(key);
      if (base != null) {
        this.directCycleValues.set(key, base);
        this.directCycleFields.set(key, "q44");
        const q36 = loader?.q36 ?? 0;
        this.cycles.set(key, base < 0 && loader?.q36 != null
          ? (q36 / 20) + 1
          : ((base + q36 - (this.cycleDeltaBases.get(key) ?? 0)) / 20) + 1);
      }
      return;
    }
    if (mode === "q40-direct") {
      if (loader?.q40 != null) {
        this.directCycleValues.set(key, loader.q40);
        this.directCycleFields.set(key, "q40");
        this.cycles.set(key, (loader.q40 / 20) + 1);
      }
      return;
    }
    if (loader?.q40 == null) {
      if (loader?.q44 != null || loader?.q36 != null) this.cycles.set(key, ((loader.q44 ?? loader.q36) / 20) + 1);
      return;
    }
    const deltaBase = this.cycleDeltaBases.get(key) ?? 0;
    this.cycles.set(key, ((loader.q40 + (loader.q36 ?? 0) - deltaBase) / 20) + 1);
  }

  #isDirectPositionCycleBaseline(loader, mask) {
    return (mask & 19) === 19 &&
      loader.q20 != null &&
      loader.q24 != null &&
      loader.q36 != null &&
      loader.q40 == null &&
      loader.q44 == null;
  }

  #trackedConfig(worldId, entityId) {
    const key = this.#key(worldId, entityId);
    if (!this.#hasTrackedConfig(key)) return null;
    return {
      pick: this.currentPicks.has(key) ? this.currentPicks.get(key) : this.pickBases.get(key),
      place: this.currentPlaces.has(key) ? this.currentPlaces.get(key) : this.placeBases.get(key),
      priority: this.priorities.get(key) ?? DEFAULT_LOADER_PRIORITY,
      requireOutput: this.requireOutputs.get(key) ?? false,
      waitForStack: this.waitForStacks.get(key) ?? false,
      stack: this.stackBases.get(key) ?? DEFAULT_LOADER_STACK,
      cycle: this.cycles.get(key) ?? DEFAULT_LOADER_CYCLE
    };
  }

  #isSparsePositionBaseline(loader, mask) {
    return (mask & 3) === 3 &&
      loader.q20 != null &&
      loader.q24 != null &&
      loader.q28 == null &&
      loader.q32 == null &&
      loader.q36 == null &&
      loader.q44 == null;
  }

  #applySparsePositionBaseline(key, loader, mask) {
    const pickField = loader.q40 == null ? loader.q20 : loader.q24;
    const placeField = loader.q40 == null ? loader.q24 : loader.q40;
    const pick = wrapLoaderPosition(pickField + 3);
    const place = wrapLoaderPosition(placeField + 4);
    this.pickBases.set(key, pick);
    this.pickDeltaBases.set(key, loader.q20 ?? 0);
    this.placeBases.set(key, place);
    this.placeDeltaBases.set(key, loader.q24 ?? 0);
    this.currentPicks.set(key, pick);
    this.currentPlaces.set(key, place);
    this.sparsePositionBaselines.add(key);
    this.priorities.set(key, DEFAULT_LOADER_PRIORITY);
    this.requireOutputs.set(key, Boolean(mask & 32));
    this.waitForStacks.set(key, Boolean(mask & 64));
    this.stackBases.set(key, DEFAULT_LOADER_STACK);
    this.cycles.set(key, DEFAULT_LOADER_CYCLE);
  }

  #filterMode(key, loader) {
    if (this.filterSources.get(key) === "q32" && loader?.q32 != null) {
      return this.#validFilterMode(loader.q32);
    }
    if (this.filterModes.has(key)) return this.#validFilterMode(this.filterModes.get(key));
    const baseline = this.#loaderBaseline(loader, loader?.lastMask);
    if (!baseline) return null;
    return this.#validFilterMode(baseline.filterMode);
  }

  #validFilterMode(mode) {
    return mode >= 0 && mode <= 3 ? mode : null;
  }

  #semanticFilterMode(loader, mask) {
    const q28IsDirectPriority = loader.q28 != null && loader.q28 >= -1 && loader.q28 <= 1;
    const q24FilterMode = loader.q24 != null && loader.q32 != null && loader.q40 != null ? loader.q24 + 2 : null;
    const q28FilterMode = loader.q28 != null && loader.q32 != null ? loader.q28 + 1 : null;
    const q32FilterMode = !q28IsDirectPriority && loader.q28 != null && loader.q32 != null && loader.q40 != null ? loader.q32 + 1 : null;
    const q32DirectMode = loader.q28 == null && loader.q32 != null && (mask & 32) ? loader.q32 : null;
    if (q28IsDirectPriority && this.#validFilterMode(q24FilterMode) != null) return q24FilterMode;
    if (this.#validFilterMode(q28FilterMode) != null) return q28FilterMode;
    if (this.#validFilterMode(q32FilterMode) != null) return q32FilterMode;
    if (this.#validFilterMode(q32DirectMode) != null) return q32DirectMode;
    if (this.#validFilterMode(q24FilterMode) != null) return q24FilterMode;
    return null;
  }

  #semanticFilterField(loader, mask) {
    const q32DirectMode = loader.q28 == null && loader.q32 != null && (mask & 32) ? loader.q32 : null;
    return this.#validFilterMode(q32DirectMode) != null ? "q32" : null;
  }

  #loaderBaseline(loader, mask = loader?.lastMask, semanticSnapshot = false) {
    const snapshot = semanticSnapshot ? decodeLoaderSnapshotRecord(loader, mask) : null;
    if (snapshot) {
      return {
        pickBase: snapshot.pick,
        pickDeltaBase: loader.q20 ?? 0,
        placeBase: snapshot.place,
        placeDeltaBase: loader.q24 ?? 0,
        priority: snapshot.priority,
        stack: snapshot.stack,
        stackField: "fixed",
        cycle: snapshot.cycle,
        cycleMode: loader.q44 != null && loader.q40 == null ? "q44-q36-delta" : "offset",
        filterMode: this.#semanticFilterMode(loader, mask),
        filterField: this.#semanticFilterField(loader, mask),
        q32: loader.q32 ?? 0
      };
    }
    if (!loader || loader.q36 == null) return null;
    if (loader.q40 == null && loader.q44 == null) {
      if (loader.q20 != null || loader.q24 == null || loader.q28 == null || loader.q32 == null) return null;
      return {
        pickBase: wrapLoaderPosition(loader.q28 + 2),
        pickDeltaBase: 0,
        placeBase: wrapLoaderPosition(loader.q24 + 4),
        placeDeltaBase: loader.q24,
        priority: loader.q28,
        stack: 16 + loader.q32,
        cycle: (loader.q36 / 20) + 1,
        cycleMode: "direct",
        filterMode: loader.q28 + 1,
        q32: loader.q32
      };
    }
    if (loader.q24 == null &&
      loader.q28 == null &&
      loader.q20 != null &&
      loader.q32 != null &&
      loader.q40 != null &&
      loader.q44 != null) {
      return {
        pickBase: wrapLoaderPosition(loader.q20 + 7),
        pickDeltaBase: loader.q20,
        placeBase: 4,
        placeDeltaBase: 0,
        priority: 0,
        stack: 16 + loader.q36,
        stackField: "q36",
        cycle: (loader.q40 / 20) + 1,
        cycleMode: "q40-direct",
        filterMode: loader.q32,
        filterField: "q32",
        q32: loader.q32
      };
    }
    const q20 = loader.q20 ?? 0;
    const q32 = loader.q32 ?? 0;
    let pickBase = null;
    let placeBase = null;

    if (loader.q44 != null && loader.q40 == null && loader.q28 == null && loader.q24 != null && loader.q32 != null) {
      pickBase = wrapLoaderPosition(loader.q24 + 3);
      placeBase = wrapLoaderPosition(loader.q32 + 4);
    } else if (loader.q24 != null) {
      pickBase = wrapLoaderPosition(loader.q24 + 3);
      placeBase = loader.q28 != null
        ? wrapLoaderPosition(loader.q28 + 4)
        : wrapLoaderPosition(loader.q36 + 4);
    } else if (loader.q28 != null) {
      pickBase = wrapLoaderPosition(loader.q28 + 3);
      placeBase = 4;
    } else if (loader.q20 != null) {
      pickBase = wrapLoaderPosition(loader.q36 + 3);
      placeBase = 4;
    }

    if (pickBase == null || placeBase == null) return null;
    const q28IsDirectPriority = loader.q28 != null && loader.q28 >= -1 && loader.q28 <= 1;
    const priority = loader.q28 != null && loader.q32 != null && loader.q44 != null && loader.q40 != null
      ? loader.q32
      : loader.q28 != null && loader.q32 != null && loader.q44 == null && loader.q40 == null
        ? loader.q28
        : loader.q28 != null && loader.q32 != null && loader.q44 == null && loader.q40 != null
          ? loader.q32
          : loader.q32 != null && loader.q44 != null && loader.q40 == null
          ? loader.q32
          : null;
    const q28FilterMode = loader.q28 != null && loader.q32 != null && loader.q44 != null ? loader.q28 + 1 : null;
    const q24FilterMode = loader.q24 != null && loader.q32 != null && loader.q44 != null && loader.q40 != null ? loader.q24 + 2 : null;
    const q32FilterMode = !q28IsDirectPriority && loader.q28 != null && loader.q32 != null && loader.q44 != null && loader.q40 != null
      ? loader.q32 + 1
      : null;
    const filterMode = q28IsDirectPriority && q24FilterMode != null && q24FilterMode >= 0 && q24FilterMode <= 3
      ? q24FilterMode
      : q28FilterMode != null && q28FilterMode >= 0 && q28FilterMode <= 3
        ? q28FilterMode
        : q32FilterMode != null && q32FilterMode >= 0 && q32FilterMode <= 3 ? q32FilterMode : q24FilterMode;
    return {
      pickBase,
      pickDeltaBase: q20,
      placeBase,
      placeDeltaBase: loader.q24 ?? 0,
      priority,
      stack: loader.q32 == null ? null : 16 + loader.q36,
      cycle: ((loader.q40 ?? loader.q44) / 20) + 1,
      cycleMode: loader.q44 != null && loader.q40 == null ? "q44-q36-delta" : "offset",
      filterMode,
      q32
    };
  }

  #applyLoaderBaseline(key, loader, baseline) {
    this.pickBases.set(key, baseline.pickBase);
    this.pickDeltaBases.set(key, baseline.pickDeltaBase);
    this.placeBases.set(key, baseline.placeBase);
    this.placeDeltaBases.set(key, baseline.placeDeltaBase);
    this.sparsePositionBaselines.delete(key);
    this.#setCurrentPosition(key, loader);
    if (baseline.filterMode != null) {
      this.filterModes.set(key, baseline.filterMode);
      if (baseline.filterField) this.filterSources.set(key, baseline.filterField);
      else this.filterSources.delete(key);
    }
    if (baseline.stack != null) {
      const stackField = baseline.stackField === "fixed" ? 0 : baseline.stackField ? loader[baseline.stackField] ?? 0 : baseline.q32;
      this.stackBases.set(key, baseline.stack - stackField);
      if (baseline.stackField) this.stackSources.set(key, baseline.stackField);
      else this.stackSources.delete(key);
    }
    this.cycleModes.set(key, baseline.cycleMode);
    if (baseline.cycleMode === "direct") {
      this.cycleDeltaBases.set(key, 0);
      this.directCycleValues.set(key, loader.q44 ?? loader.q36);
      this.directCycleFields.set(key, loader.q44 == null ? "q36" : "q44");
    } else if (baseline.cycleMode === "q44-q36-delta") {
      this.cycleDeltaBases.set(key, loader.q36 ?? 0);
      this.directCycleValues.set(key, loader.q44);
      this.directCycleFields.set(key, "q44");
    } else if (baseline.cycleMode === "q40-direct") {
      this.cycleDeltaBases.set(key, 0);
      this.directCycleValues.set(key, loader.q40);
      this.directCycleFields.set(key, "q40");
    } else {
      this.cycleDeltaBases.set(key, loader.q36 ?? 0);
      this.directCycleValues.delete(key);
      this.directCycleFields.delete(key);
    }
    this.cycles.set(key, baseline.cycle);
    if (baseline.priority != null && baseline.priority >= -1 && baseline.priority <= 1) {
      if (loader.q28 != null) this.priorityOffsets.set(key, baseline.priority - loader.q28);
      this.priorities.set(key, baseline.priority);
    } else if (loader.q28 != null && loader.q36 != null) this.#initializePriorityOffset(key, loader);
  }

  #applySemanticDelta(worldId, entityId, loader, mask, previous, deltaRecord) {
    const key = this.#key(worldId, entityId);
    const delta = decodeLoaderSemanticDeltaRecord(deltaRecord ?? loaderDeltaRecord(loader, mask, previous), mask);
    if (!delta) return false;

    const previousConfig = this.getConfig(worldId, entityId, previous);
    const pick = delta.pick == null ? previousConfig.pick : wrapLoaderPosition((previousConfig.pick ?? DEFAULT_LOADER_PICK) + delta.pick);
    const place = delta.place == null ? previousConfig.place : wrapLoaderPosition((previousConfig.place ?? DEFAULT_LOADER_PLACE) + delta.place);

    if (pick != null) {
      this.pickBases.set(key, pick);
      this.pickDeltaBases.set(key, loader?.q20 ?? 0);
      this.currentPicks.set(key, pick);
    }
    if (place != null) {
      this.placeBases.set(key, place);
      this.placeDeltaBases.set(key, loader?.q24 ?? 0);
      this.currentPlaces.set(key, place);
    }

    if (delta.priority != null) {
      const priority = previousConfig.priority + delta.priority;
      this.priorities.set(key, priority);
      if (loader?.q28 != null) this.priorityOffsets.set(key, priority - loader.q28);
      else this.priorityOffsets.delete(key);
    }

    if (delta.stack != null) {
      this.stackBases.set(key, previousConfig.stack + delta.stack);
      this.stackSources.set(key, "fixed");
    }

    if (delta.cycleTicks != null) {
      this.cycles.set(key, previousConfig.cycle + (delta.cycleTicks / 20));
      if (loader?.q44 != null && loader.q40 == null) {
        this.cycleModes.set(key, "q44-q36-delta");
        this.cycleDeltaBases.set(key, loader.q36 ?? 0);
        this.directCycleValues.set(key, loader.q44);
        this.directCycleFields.set(key, "q44");
      } else {
        this.cycleModes.set(key, "offset");
        this.cycleDeltaBases.set(key, loader?.q36 ?? 0);
        this.directCycleValues.delete(key);
        this.directCycleFields.delete(key);
      }
    }

    if (delta.requireOutput) this.requireOutputs.set(key, !previousConfig.requireOutput);
    if (delta.waitForStack) this.waitForStacks.set(key, !previousConfig.waitForStack);
    this.sparsePositionBaselines.delete(key);
    return true;
  }

  #setCurrentPosition(key, loader) {
    const pick = this.#pick(key, loader);
    const place = this.#place(key, loader);
    if (pick != null) this.currentPicks.set(key, pick);
    if (place != null) this.currentPlaces.set(key, place);
  }

  #pick(key, loader) {
    if (!loader) return null;
    if (this.pickBases.has(key)) return wrapLoaderPosition(this.pickBases.get(key) + ((loader.q20 ?? 0) - (this.pickDeltaBases.get(key) ?? 0)));
    if (loader.q24 != null) return wrapLoaderPosition(loader.q24 + 3);
    if (loader.q36 != null) return wrapLoaderPosition(loader.q36 + 3);
    if (loader.q20 != null) return wrapLoaderPosition(loader.q20);
    return null;
  }

  #place(key, loader) {
    if (!loader) return null;
    if (this.placeBases.has(key)) {
      const base = this.placeBases.get(key);
      if (loader.q24 != null && this.placeDeltaBases.has(key)) {
        return wrapLoaderPosition(base + (loader.q24 - this.placeDeltaBases.get(key)));
      }
      return wrapLoaderPosition(base);
    }
    if (loader.q36 != null) return loader.q24 == null ? 4 : wrapLoaderPosition(loader.q36 + 4);
    return null;
  }

  #key(worldId, entityId) {
    return `${worldId ?? "-"}:${entityId}`;
  }
}
