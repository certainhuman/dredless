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

export function wrapLoaderPosition(value) {
  return value == null ? null : ((value % 8) + 8) % 8;
}

export function enumName(map, value) {
  if (value == null) return "-";
  const name = map.get(value);
  return name == null ? String(value) : `${name}(${value})`;
}

export class LoaderConfigTracker {
  constructor() {
    this.pickBases = new Map();
    this.pickDeltaBases = new Map();
    this.placeBases = new Map();
    this.placeDeltaBases = new Map();
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
    for (const section of model.sections || []) {
      if (section.table !== 78) continue;
      for (const changed of section.records || []) {
        const loader = world.model.record(78, changed.entity);
        this.updateRecord(world.id, changed.entity, loader, changed.mask, changed.previous);
      }
    }
  }

  updateRecord(worldId, entityId, loader, mask = 0, previous = null) {
    if (!loader) return;
    const key = this.#key(worldId, entityId);
    const hasTrackedConfig = this.#hasTrackedConfig(key);
    if (!hasTrackedConfig && this.#isDirectPositionCycleBaseline(loader, mask)) {
      this.pickBases.set(key, 3);
      this.pickDeltaBases.set(key, 0);
      this.placeBases.set(key, 4);
      this.placeDeltaBases.set(key, 0);
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

    const baseline = hasTrackedConfig ? null : this.#loaderBaseline(loader);
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
      this.#initializeStackBaseline(key, loader);
      this.#initializeCycleBaseline(key, loader);
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
    if (mask & 16) this.#updateCycle(key, loader);
  }

  delete(worldId, entityId) {
    const key = this.#key(worldId, entityId);
    this.pickBases.delete(key);
    this.pickDeltaBases.delete(key);
    this.placeBases.delete(key);
    this.placeDeltaBases.delete(key);
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
    const pick = this.#pick(key, loader);
    const place = this.#place(key, loader);
    const stackBase = this.stackBases.get(key) ?? 16;
    const stackSource = this.stackSources.get(key) ?? "q32";
    const stackField = stackSource === "q36" ? loader?.q36 : loader?.q32;
    const stack = stackField == null
      ? this.stackBases.has(key) || this.hasPositionConfig(worldId, entityId) ? stackBase : null
      : stackBase + stackField;
    const cycle = this.cycles.has(key)
      ? this.cycles.get(key)
      : loader?.q40 == null ? null : ((loader.q40 + (loader.q36 ?? 0)) / 20) + 1;
    return {
      pick,
      place,
      priority: this.priorities.has(key) ? this.priorities.get(key) : 0,
      requireOutput: this.requireOutputs.has(key) ? this.requireOutputs.get(key) : null,
      waitForStack: this.waitForStacks.has(key) ? this.waitForStacks.get(key) : null,
      stack,
      cycle,
      filterMode: loaderFilter ? loaderFilter.q20 ?? 0 : this.#filterMode(key, loader),
      filterSlots: filterSlots ? [filterSlots.q20 ?? null, filterSlots.q24 ?? null, filterSlots.q28 ?? null] : null
    };
  }

  hasPositionConfig(worldId, entityId) {
    const key = this.#key(worldId, entityId);
    return this.pickBases.has(key) || this.placeBases.has(key);
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
    if (loader?.q40 == null) return;
    this.cycleModes.set(key, "offset");
    this.cycleDeltaBases.set(key, loader.q36 ?? 0);
    this.directCycleValues.delete(key);
    this.directCycleFields.delete(key);
    this.cycles.set(key, (loader.q40 / 20) + 1);
  }

  #initializeStackBaseline(key, loader) {
    if (this.stackBases.has(key)) return;
    if (loader?.q32 == null) return;
    const baseline = this.#loaderBaseline(loader);
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
        this.cycles.set(key, ((base + (loader?.q36 ?? 0) - (this.cycleDeltaBases.get(key) ?? 0)) / 20) + 1);
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

  #filterMode(key, loader) {
    if (this.filterSources.get(key) === "q32" && loader?.q32 != null) {
      return this.#validFilterMode(loader.q32);
    }
    if (this.filterModes.has(key)) return this.#validFilterMode(this.filterModes.get(key));
    const baseline = this.#loaderBaseline(loader);
    if (!baseline) return null;
    return this.#validFilterMode(baseline.filterMode);
  }

  #validFilterMode(mode) {
    return mode >= 0 && mode <= 3 ? mode : null;
  }

  #loaderBaseline(loader) {
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
    if (baseline.filterMode != null) {
      this.filterModes.set(key, baseline.filterMode);
      if (baseline.filterField) this.filterSources.set(key, baseline.filterField);
      else this.filterSources.delete(key);
    }
    if (baseline.stack != null) {
      const stackField = baseline.stackField === "q36" ? loader.q36 ?? 0 : baseline.q32;
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
