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
    for (const callback of [...(this.#listeners.get(type) || [])]) {
      try {
        callback(...args);
      } catch (error) {
        if (type === "error" || !this.#listeners.has("error")) throw error;
        this.emit("error", error);
      }
    }
  }
}
