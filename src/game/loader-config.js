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
    this.requireOutputs = new Map();
    this.waitForStacks = new Map();
    this.stackBases = new Map();
    this.cycles = new Map();
    this.cycleModes = new Map();
    this.cycleDeltaBases = new Map();
  }

  updateFromModel(update) {
    const world = update?.world;
    const model = update?.result?.model;
    if (!world || !model) return;
    for (const section of model.sections || []) {
      if (section.table !== 78) continue;
      for (const changed of section.records || []) {
        const loader = world.model.record(78, changed.entity);
        this.updateRecord(world.id, changed.entity, loader, changed.mask);
      }
    }
  }

  updateRecord(worldId, entityId, loader, mask = 0) {
    if (!loader) return;
    const key = this.#key(worldId, entityId);
    if (this.#isDirectPositionCycleBaseline(loader, mask)) {
      this.pickBases.set(key, 3);
      this.pickDeltaBases.set(key, 0);
      this.placeBases.set(key, 4);
      this.placeDeltaBases.set(key, 0);
      this.requireOutputs.set(key, Boolean(mask & 32));
      this.waitForStacks.set(key, Boolean(mask & 64));
      this.stackBases.set(key, 16);
      this.cycleModes.set(key, "direct");
      this.cycleDeltaBases.set(key, 0);
      this.cycles.set(key, ((loader.q44 ?? loader.q36) / 20) + 1);
      return;
    }

    if ((mask & 32) && mask !== 32) {
      const usedQ28AsPositionBase = this.#initializePositionBaseline(key, loader, mask);
      if ((mask & 4) && loader.q28 != null) {
        if (usedQ28AsPositionBase) this.#initializePriorityOffset(key, loader);
        else this.priorities.set(key, loader.q28);
      }
      if (this.#isFullConfigBaseline(loader, mask)) {
        const priority = loader.q28 - 1;
        if (priority >= -1 && priority <= 1) {
          this.priorityOffsets.set(key, -1);
          this.priorities.set(key, priority);
        }
        if (loader.q36 != null) this.stackBases.set(key, 15 + loader.q36);
      }
      this.requireOutputs.set(key, Boolean(mask & 32));
      this.waitForStacks.set(key, Boolean(mask & 64));
      this.#initializeStackBaseline(key, loader);
      this.#initializeCycleBaseline(key, loader);
      return;
    }

    if (mask & 32) this.requireOutputs.set(key, !this.requireOutputs.get(key));
    if (mask & 64) this.waitForStacks.set(key, !this.waitForStacks.get(key));
    if ((mask & 4) && loader.q28 != null) this.priorities.set(key, this.#priority(key, loader.q28));
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
    this.requireOutputs.delete(key);
    this.waitForStacks.delete(key);
    this.stackBases.delete(key);
    this.cycles.delete(key);
    this.cycleModes.delete(key);
    this.cycleDeltaBases.delete(key);
  }

  getConfig(worldId, entityId, loader, loaderFilter = null, filterSlots = null) {
    const key = this.#key(worldId, entityId);
    const pick = this.#pick(key, loader);
    const place = this.#place(key, loader);
    const stackBase = this.stackBases.get(key) ?? 16;
    const stack = loader?.q32 == null
      ? this.stackBases.has(key) || this.hasPositionConfig(worldId, entityId) ? stackBase : null
      : stackBase + loader.q32;
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
      filterMode: loaderFilter?.q20 ?? this.#filterMode(loader),
      filterSlots: filterSlots ? [filterSlots.q20 ?? null, filterSlots.q24 ?? null, filterSlots.q28 ?? null] : null
    };
  }

  hasPositionConfig(worldId, entityId) {
    const key = this.#key(worldId, entityId);
    return this.pickBases.has(key) || this.placeBases.has(key);
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
    if (loader?.q44 != null && loader.q36 == null) {
      this.cycleModes.set(key, "direct");
      this.cycleDeltaBases.set(key, 0);
      this.cycles.set(key, (loader.q44 / 20) + 1);
      return;
    }
    if (loader?.q40 == null) return;
    this.cycleModes.set(key, "offset");
    this.cycleDeltaBases.set(key, loader.q36 ?? 0);
    this.cycles.set(key, (loader.q40 / 20) + 1);
  }

  #initializeStackBaseline(key, loader) {
    if (this.stackBases.has(key)) return;
    if (loader?.q32 == null) return;
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
    if (this.cycleModes.get(key) === "direct") {
      if (loader?.q36 != null) this.cycles.set(key, (loader.q36 / 20) + 1);
      else if (loader?.q44 != null) this.cycles.set(key, (loader.q44 / 20) + 1);
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
      loader.q40 == null;
  }

  #isFullConfigBaseline(loader, mask) {
    return (mask & 127) === 127 &&
      loader.q20 != null &&
      loader.q24 != null &&
      loader.q28 != null &&
      loader.q32 != null &&
      loader.q36 != null &&
      loader.q40 != null &&
      loader.q44 != null;
  }

  #filterMode(loader) {
    if (!loader || !this.#isFullConfigBaseline(loader, loader.lastMask ?? 0)) return null;
    const mode = loader.q28 + 1;
    return mode >= 0 && mode <= 3 ? mode : null;
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
