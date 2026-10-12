import {normalizePlayerRank} from "../../protocol/outbound/ship-management.js";

function timeoutValue(options) {
  const timeout = options.timeout ?? 5000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new RangeError("timeout must be positive milliseconds");
  return timeout;
}

function waitFor(client, eventType, read, timeout, label, send = null) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      client.off(eventType, check);
      client.off("close", closed);
    };
    const check = (...args) => {
      const value = read(...args);
      if (value) { cleanup(); resolve(value); }
    };
    const closed = () => { cleanup(); reject(new Error(`Disconnected while waiting for ${label}`)); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${label}`)); }, timeout);
    client.on(eventType, check);
    client.on("close", closed);
    if (send) {
      try { send(); } catch (error) { cleanup(); reject(error); return; }
    }
    check();
  });
}

export class TipDomain {
  #busy = false;
  #target = null;
  #current = null;

  constructor(client) {
    this.client = client;
    client.on("close", () => { this.#current = null; this.#target = null; });
  }

  get current() {
    return this.#current;
  }

  receive(event, world) {
    const options = Array.isArray(event.options) ? event.options.map(String) : [];
    const entity = this.#target?.world === world?.id ? this.#target.entity : null;
    const menu = Object.freeze({entity, world: world?.id ?? null, filter: event.filter ?? null,
      x: event.x ?? 0, y: event.y ?? 0, options: Object.freeze(options)});
    this.#current = options.length ? menu : null;
    this.client.emit("tip-list", menu, world);
  }

  async #exclusive(action) {
    if (this.#busy) throw new Error("A tip menu operation is already in progress");
    this.#busy = true;
    try {
      return await action();
    } catch (error) {
      this.#current = null;
      this.#target = null;
      throw error;
    } finally { this.#busy = false; }
  }

  async #open(entity, options) {
    if (!this.client.ready || !this.client.connected) throw new Error("Client must be connected and ready to open tips");
    const timeout = timeoutValue(options);
    const handle = typeof entity === "number" ? this.client.currentShip()?.entities.get(entity) : entity;
    if (!handle || handle.client !== this.client || !handle.exists()) throw new Error("Tip target must be an existing entity on this client");
    const world = this.client.worlds.currentWorldId;
    const scopeWorld = handle.scope === "ship" ? this.client.worlds.shipWorld()
      : handle.scope === "current" ? this.client.worlds.worlds.get(world)
        : handle.scope === "overworld" ? this.client.worlds.overworld()
          : this.client.worlds.worlds.get(Number(handle.scope));
    if (scopeWorld?.id !== world) {
      throw new Error("Tip target must be in the current world");
    }
    const position = handle.position;
    if (!position) throw new Error("Tip target has no position");
    this.#current = null;
    this.#target = {entity: handle.id, world, command: {...options.command,
      focus_ent: handle.id, mx: position.x, my: position.y}};
    // Subscribe before sending: attached sockets can deliver a reply synchronously.
    return waitFor(this.client, "tip-list", () => {
      return this.#current?.entity === handle.id && this.#current.world === world ? this.#current : null;
    }, timeout, "tip menu", () => {
      this.client.send({...this.#target.command, act1: false, act2: true, tip_select: null});
    });
  }

  open(entity, options = {}) {
    return this.#exclusive(() => this.#open(entity, options));
  }

  close(options = {}) {
    return this.#exclusive(async () => {
      const timeout = timeoutValue(options);
      const menu = this.#current;
      if (!menu) return this.client;
      if (!this.client.connected || !this.client.ready) throw new Error("Client must be connected and ready to close tips");
      if (menu.world !== this.client.worlds.currentWorldId) throw new Error("Tip menu belongs to another world");
      await waitFor(this.client, "tip-list", (update) => update?.world === menu.world
        && update.options.length === 0, timeout, "tip menu dismissal", () => {
        // The official client dismisses with a normal left click outside an entity.
        this.client.send({...options.command, focus_ent: null, config_ent: null,
          act1: true, act1_held: true, act2: false, tip_select: null});
      });
      this.#target = null;
      return this.client;
    });
  }

  select(option, command = {}) {
    if (this.#busy) throw new Error("A tip menu operation is already in progress");
    return this.#select(option, command);
  }

  #select(option, command = {}) {
    if (!this.client.connected || !this.client.ready) throw new Error("Client must be connected and ready to select tips");
    const menu = this.#current;
    if (!menu || menu.entity == null || !this.#target) throw new Error("Open an entity's tip menu before selecting an option");
    if (menu.world !== this.client.worlds.currentWorldId) throw new Error("Tip menu belongs to another world");
    const index = typeof option === "string" ? menu.options.indexOf(option) : option;
    if (!Number.isInteger(index) || index < 0 || index >= menu.options.length) throw new RangeError("Tip option is not in the current menu");
    this.client.send({...this.#target.command, ...command, focus_ent: menu.entity,
      act1: false, act2: false, tip_select: index});
    this.#current = null;
    this.#target = null;
    return this.client;
  }

  choose(entity, option, options = {}) {
    return this.#exclusive(async () => {
      await this.#open(entity, options);
      return this.#select(option);
    });
  }

  setRank(handle, rank, options = {}) {
    return this.#exclusive(async () => {
      const value = normalizePlayerRank(rank);
      const timeout = timeoutValue(options);
      if (!handle.exists()) throw new Error("Rank target no longer exists");
      if (handle.rank === value) return this.client;
      const text = {0: "Restrict to Guests", 1: "Restrict to Crew", 3: "Restrict to Captains"}[value];
      await this.#open(handle, options);
      await waitFor(this.client, "model", () => handle.rank === value, timeout, "access rank update",
        () => this.#select(text));
      return this.client;
    });
  }
}
