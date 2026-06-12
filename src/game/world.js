import { decryptPayload } from "../crypto/chacha.js";
import { decompressLz4Frame } from "../compression/lz4.js";
import { decodeMsgpack } from "../protocol/msgpack.js";
import { ModelState } from "./model.js";
import { overworldZoneFromId } from "./overworld.js";
import { getTilesetForWorld } from "./tilesets.js";

const TILE_SHAPE_NAMES = new Map([
  [0, "full"],
  [5, "bottom-half"],
  [7, "top-half"]
]);

function tileShapeName(shape) {
  const id = Number(shape);
  return Number.isFinite(id) ? TILE_SHAPE_NAMES.get(id) ?? null : null;
}

export class WorldStore {
  constructor() {
    this.currentWorldId = null;
    this.worlds = new Map();
  }

  get(id) {
    const worldId = Number(id);
    if (!this.worlds.has(worldId)) this.worlds.set(worldId, new WorldState(worldId));
    return this.worlds.get(worldId);
  }

  apply(packet) {
    if (!packet || packet.world == null) return null;
    if (packet.type === 22) return this.#applyMeta(packet);
    if (packet.type === 23) return this.#applyTiles(packet);
    if (packet.type === 20) return this.#applyModel(packet);
    if (packet.type === 13) return this.#applyCommsBubble(packet);
    return null;
  }

  snapshot({ includeTiles = false, includeModel = false } = {}) {
    return [...this.worlds.values()].map((world) => world.snapshot({ includeTiles, includeModel }));
  }

  ids() {
    return [...this.worlds.keys()];
  }

  overworld() {
    return [...this.worlds.values()].find((world) => world.isOverworld === true) || null;
  }

  shipWorld() {
    return this.currentWorldId != null ? this.worlds.get(Number(this.currentWorldId)) || null : [...this.worlds.values()].find((world) => world.isOverworld === false) || null;
  }

  currentShipEntity() {
    const shipWorld = this.shipWorld();
    if (!shipWorld || shipWorld.parentWorld == null || shipWorld.parentEntity == null) return null;
    return this.worlds.get(Number(shipWorld.parentWorld))?.entity(shipWorld.parentEntity) || null;
  }

  #applyMeta(packet) {
    if (packet.removed) {
      const world = this.worlds.get(Number(packet.world));
      if (world) world.readMeta(packet);
      this.worlds.delete(Number(packet.world));
      if (this.currentWorldId === Number(packet.world)) this.currentWorldId = null;
      return { type: "world-removed", world: world || null, packet };
    }
    const world = this.get(packet.world);
    world.readMeta(packet);
    if (this.currentWorldId == null && !world.isOverworld) this.currentWorldId = world.id;
    return { type: "world", world };
  }

  #applyTiles(packet) {
    const world = this.get(packet.world);
    const decoded = world.decodeEncrypted(packet.data);
    const updates = [];
    const errors = [];
    if (decoded && typeof decoded === "object") {
      for (const [kind, value] of Object.entries(decoded)) {
        try {
          if (kind === "0") updates.push({ kind, tiles: world.applyChunk(value) });
          else if (kind === "1") updates.push({ kind, tile: world.applyTile(value) });
          else updates.push({ kind, value });
        } catch (error) {
          errors.push(error);
          updates.push({ kind, value, error: error.message });
        }
      }
    }
    world.events.push({ type: "tiles", packet, decoded, updates, errors });
    return { type: "tiles", world, decoded, updates, errors };
  }

  #applyModel(packet) {
    const world = this.get(packet.world);
    const result = {
      worldId: packet.world,
      full: Boolean(packet.full),
      events: Array.isArray(packet.events) ? packet.events : [],
      modelData: packet.model_data || null,
      decoded: null,
      model: null,
      commandNumber: typeof packet.command_number === "number" ? packet.command_number : null,
      timing: {
        roundTimeLeft: packet.round_time_left ?? null,
        regenTimeLeft: packet.regen_time_left ?? null,
        removeOnRegen: packet.remove_on_regen ?? null,
        globalEventTime: packet.global_event_time ?? null,
        tickTime: packet.tick_time ?? null,
        tickQuota: packet.tick_quota ?? null,
        cpuLoad: packet.cpu_load ?? null,
        relayTime: packet.relay_time ?? null
      }
    };
    if (packet.model_data && world.seed != null) {
      const previousModel = world.model;
      try {
        if (packet.full) world.model = new ModelState({ isOverworld: world.isOverworld });
        result.decoded = decryptPayload(packet.model_data, packet.world, world.seed);
        result.model = world.model.apply(result.decoded, { full: Boolean(packet.full) });
        if (result.model?.error && packet.full && previousModel) world.model = previousModel;
      }
      catch (error) {
        if (packet.full && previousModel) world.model = previousModel;
        result.error = error;
      }
    }
    world.modelPackets.push(result);
    world.events.push({ type: "model", packet, result });
    world.lastPacket = packet;
    return { type: "model", world, result };
  }

  #applyCommsBubble(packet) {
    const world = this.get(packet.world);
    const bubble = world.addCommsBubble(packet);
    return { type: "comms-bubble", world, packet, bubble };
  }
}

export class WorldState {
  constructor(id) {
    this.id = id;
    this.seed = null;
    this.isOverworld = null;
    this.tileset = null;
    this.blockWidth = null;
    this.blockHeight = null;
    this.parentWorld = null;
    this.parentEntity = null;
    this.tiles = new Map();
    this.chunks = [];
    this.events = [];
    this.modelPackets = [];
    this.commsBubbles = [];
    this._bubbleSequence = 0;
    this.model = new ModelState({ isOverworld: this.isOverworld });
    this.lastChunkPatch = null;
    this.lastPacket = null;
    this.meta = null;
  }

  readMeta(packet) {
    this.meta = packet;
    this.seed = packet.seed ?? this.seed;
    const isOverworld = packet.is_overworld ?? this.isOverworld;
    this.isOverworld = isOverworld == null ? null : Boolean(isOverworld);
    this.tileset = this.isOverworld == null ? null : getTilesetForWorld(this.isOverworld);
    this.model.setWorldKind(this.isOverworld);
    this.blockWidth = packet.block_w ?? this.blockWidth;
    this.blockHeight = packet.block_h ?? this.blockHeight;
    this.parentWorld = packet.parent_world ?? this.parentWorld;
    this.parentEntity = packet.parent_ent ?? this.parentEntity;
    this.lastPacket = packet;
  }

  addCommsBubble(packet) {
    const raw = packet?.bubble && typeof packet.bubble === "object" ? packet.bubble : {};
    const color = Number.isFinite(Number(raw.color)) ? Number(raw.color) : null;
    const bubble = {
      sequence: ++this._bubbleSequence,
      worldId: this.id,
      entity: Number.isFinite(Number(raw.model_id)) ? Number(raw.model_id) : null,
      modelId: Number.isFinite(Number(raw.model_id)) ? Number(raw.model_id) : null,
      message: typeof raw.msg === "string" ? raw.msg : "",
      color,
      colorCss: color == null ? null : `rgb(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff})`,
      durationSeconds: Number.isFinite(Number(raw.time)) ? Number(raw.time) : null,
      raw: { ...raw }
    };
    this.commsBubbles.push(bubble);
    if (this.commsBubbles.length > 50) this.commsBubbles.splice(0, this.commsBubbles.length - 50);
    this.events.push({ type: "comms-bubble", packet, bubble });
    this.lastPacket = packet;
    return bubble;
  }

  decodeEncrypted(data) {
    if (!data || this.seed == null) return null;
    try { return decodeMsgpack(decryptPayload(data, this.id, this.seed)); }
    catch (_) { return null; }
  }

  applyTile(value) {
    if (!Array.isArray(value) || value.length !== 6) return null;
    const [x, y, material, shape, hp, color] = value;
    return this.setTile({ x, y, material, shape, hp, integrity: hp, color });
  }

  applyChunk(value) {
    if (!Array.isArray(value) || value.length !== 7) return null;
    const [chunkX, chunkY, minX, minY, maxX, maxY, compressedPatch] = value;
    const patch = [...decompressLz4Frame(compressedPatch)];
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const count = width * height;
    const hasColor = patch.length >= count * 4;
    const tiles = [];
    for (let i = 0; i < count; i++) {
      const localX = minX + (i % width);
      const localY = minY + Math.floor(i / width);
      tiles.push(this.setTile({
        x: (chunkX << 6) + localX,
        y: (chunkY << 6) + localY,
        material: patch[i],
        shape: patch[i + count],
        hp: patch[i + count * 2],
        integrity: patch[i + count * 2],
        color: hasColor ? patch[i + count * 3] : null
      }));
    }
    this.chunks.push({ chunkX, chunkY, minX, minY, maxX, maxY, tiles });
    this.lastChunkPatch = { chunkX, chunkY, minX, minY, maxX, maxY, count, hasColor };
    return tiles;
  }

  setTile(tile) {
    const normalized = this.normalizeTile(tile);
    this.tiles.set(`${normalized.x},${normalized.y}`, normalized);
    return normalized;
  }

  normalizeTile(tile) {
    const def = this.tileDefinition(tile.material);
    const hp = tile.hp ?? tile.integrity ?? null;
    const maxHp = def?.hp ?? null;
    return {
      ...tile,
      hp,
      integrity: hp,
      materialName: def?.name ?? null,
      shapeName: tileShapeName(tile.shape),
      solid: def?.solid ?? null,
      maxHp,
      hpRatio: typeof hp === "number" ? hp / 255 : null,
      hpValue: typeof hp === "number" && typeof maxHp === "number" ? Math.round((hp / 255) * maxHp) : null
    };
  }

  materials() {
    const counts = new Map();
    for (const tile of this.tiles.values()) {
      const material = Number(tile.material);
      counts.set(material, (counts.get(material) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([material, count]) => {
        const def = this.tileDefinition(material);
        return {
          material,
          name: def?.name ?? null,
          count,
          solid: def?.solid ?? null,
          hp: def?.hp ?? null
        };
      });
  }

  snapshot({ includeTiles = false, includeModel = false } = {}) {
    const model = this.model.snapshot({ includeTables: includeModel });
    const overworldZone = this.isOverworld ? overworldZoneFromId(this.id) : null;
    return {
      id: this.id,
      is_overworld: this.isOverworld,
      overworldZone,
      tileset: this.tileset,
      seed: this.seed,
      block_w: this.blockWidth,
      block_h: this.blockHeight,
      parent_world: this.parentWorld,
      parent_ent: this.parentEntity,
      tileCount: this.tiles.size,
      chunkCount: this.chunks.length,
      lastChunkPatch: this.lastChunkPatch,
      lastPacket: this.lastPacket,
      meta: this.meta,
      materials: this.materials(),
      model,
      entities: model.entities,
      blocks: model.blocks,
      transforms: this.model.transforms(),
      machines: this.model.machines(),
      players: this.model.players(),
      shipControls: this.model.shipControls(),
      commsBubbles: this.commsBubbles.slice(),
      tiles: includeTiles ? [...this.tiles.values()] : undefined
    };
  }

  table(id) {
    return this.model.table(id);
  }

  record(tableId, entityId) {
    return this.model.record(tableId, entityId);
  }

  tileDefinition(material) {
    if (!this.tileset || !Array.isArray(this.tileset.tiles)) return null;
    return this.tileset.tiles[Number(material)] || null;
  }

  entity(entityId) {
    return this.model.entity(entityId);
  }

  entities() {
    return this.model.entities();
  }

  blocks() {
    return this.model.blocks();
  }
}
