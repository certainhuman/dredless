export class EventBus {
  #listeners = new Map();

  on(type, callback) {
    if (typeof callback !== "function") return this;
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type).add(callback);
    return this;
  }

  off(type, callback) {
    this.#listeners.get(type)?.delete(callback);
    return this;
  }

  once(type, callback) {
    const wrapped = (...args) => {
      this.off(type, wrapped);
      callback(...args);
    };
    return this.on(type, wrapped);
  }

  emit(type, ...args) {
    const listeners = this.#listeners.get(type);
    if (!listeners || listeners.size === 0) return;
    // Copy only when there is more than one listener: the copy exists so a
    // listener may unsubscribe mid-dispatch, and a lone listener removing
    // itself cannot disturb an iteration that is already finishing.
    for (const callback of listeners.size === 1 ? listeners : [...listeners]) {
      try {
        callback(...args);
      } catch (error) {
        if (type === "error" || !this.#listeners.has("error")) throw error;
        this.emit("error", error);
      }
    }
  }
}
