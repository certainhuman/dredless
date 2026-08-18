import {decodeModelPayload, decodeWorldPayload, decompressWorldChunk} from "../../protocol/inbound/world-payload.js";
import {ModelState} from "../model/index.js";
import {overworldZoneFromId} from "../overworld.js";
import {getTilesetForWorld} from "../tilesets.js";

const TILE_SHAPE_NAMES = new Map([
    [0, "full"],
    [5, "bottom-half"],
    [7, "top-half"]
]);

function tileShapeName(shape) {
    const id = Number(shape);
    return Number.isFinite(id) ? TILE_SHAPE_NAMES.get(id) ?? null : null;
}

const DEFAULT_HISTORY_LIMITS = {
    eventHistory: 200,
    modelPacketHistory: 100,
    chunkHistory: 64
};

function normalizeLimit(value, fallback) {
    if (value === Infinity) return Infinity;
    const limit = Number(value);
    if (!Number.isFinite(limit) || limit < 0) return fallback;
    return Math.floor(limit);
}

function pushBounded(target, value, limit) {
    if (limit === 0) return;
    target.push(value);
    if (target.length > limit) target.splice(0, target.length - limit);
}

const TILE_KEY_OFFSET = 1 << 24;
const TILE_KEY_STRIDE = 1 << 25;

export class WorldState {
    #materialCounts = new Map();

    constructor(id, limits = {}) {
        this.historyLimits = {
            eventHistory: normalizeLimit(limits.eventHistory, DEFAULT_HISTORY_LIMITS.eventHistory),
            modelPacketHistory: normalizeLimit(limits.modelPacketHistory, DEFAULT_HISTORY_LIMITS.modelPacketHistory),
            chunkHistory: normalizeLimit(limits.chunkHistory, DEFAULT_HISTORY_LIMITS.chunkHistory)
        };
        // Totals stay truthful even though the retained arrays are capped.
        this.totalChunkCount = 0;
        this.totalEventCount = 0;
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
        this.model = new ModelState({isOverworld: this.isOverworld});
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

    // Bounded event log. Kept as a method so every call site shares the cap and
    // the running total stays accurate.
    recordEvent(event) {
        this.totalEventCount += 1;
        pushBounded(this.events, event, this.historyLimits.eventHistory);
        return event;
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
            raw: {...raw}
        };
        this.commsBubbles.push(bubble);
        if (this.commsBubbles.length > 50) this.commsBubbles.splice(0, this.commsBubbles.length - 50);
        this.recordEvent({type: "comms-bubble", packet, bubble});
        this.lastPacket = packet;
        return bubble;
    }

    decodeEncrypted(data) {
        if (!data || this.seed == null) return null;
        return decodeWorldPayload(data, this.id, this.seed);
    }

    applyTile(value) {
        if (!Array.isArray(value) || value.length !== 6) return null;
        const [x, y, material, shape, hp, color] = value;
        return this.setTile({x, y, material, shape, hp, integrity: hp, color});
    }

    applyChunk(value) {
        if (!Array.isArray(value) || value.length !== 7) return null;
        const [chunkX, chunkY, minX, minY, maxX, maxY, compressedPatch] = value;
        // Index the decompressed bytes directly; spreading into a plain array cost
        // ~16k boxed elements for a full chunk.
        const patch = decompressWorldChunk(compressedPatch);
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        const count = width * height;
        const hasColor = patch.length >= count * 4;
        const tiles = new Array(count);
        const baseX = chunkX << 6;
        const baseY = chunkY << 6;
        for (let i = 0; i < count; i++) {
            const localX = minX + (i % width);
            const localY = minY + Math.floor(i / width);
            const hp = patch[i + count * 2];
            tiles[i] = this.#storeTile(this.#buildTile(
                baseX + localX,
                baseY + localY,
                patch[i],
                patch[i + count],
                hp,
                hasColor ? patch[i + count * 3] : null
            ));
        }
        this.totalChunkCount += 1;
        pushBounded(this.chunks, {chunkX, chunkY, minX, minY, maxX, maxY, tiles}, this.historyLimits.chunkHistory);
        this.lastChunkPatch = {chunkX, chunkY, minX, minY, maxX, maxY, count, hasColor};
        return tiles;
    }

    setTile(tile) {
        return this.#storeTile(this.normalizeTile(tile));
    }

    // Chunk decoding produces millions of tiles at join time, so build the final
    // object in one pass instead of a literal plus a spread copy.
    #buildTile(x, y, material, shape, hp, color) {
        const def = this.tileDefinition(material);
        const maxHp = def?.hp ?? null;
        const value = hp ?? null;
        return {
            x,
            y,
            material,
            shape,
            hp: value,
            integrity: value,
            color,
            materialName: def?.name ?? null,
            shapeName: tileShapeName(shape),
            solid: def?.solid ?? null,
            maxHp,
            hpRatio: typeof value === "number" ? value / 255 : null,
            hpValue: typeof value === "number" && typeof maxHp === "number" ? Math.round((value / 255) * maxHp) : null
        };
    }

    // Numeric key: a template string per tile was a measurable share of chunk
    // decode. The map is only ever read through values()/size, so the key format
    // is internal.
    #storeTile(normalized) {
        const key = ((normalized.y + TILE_KEY_OFFSET) * TILE_KEY_STRIDE) + (normalized.x + TILE_KEY_OFFSET);
        const previous = this.tiles.get(key);
        if (previous !== undefined) this.#countMaterial(previous.material, -1);
        this.#countMaterial(normalized.material, 1);
        this.tiles.set(key, normalized);
        return normalized;
    }

    #countMaterial(material, delta) {
        const id = Number(material);
        const next = (this.#materialCounts.get(id) || 0) + delta;
        if (next > 0) this.#materialCounts.set(id, next);
        else this.#materialCounts.delete(id);
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

    // Counts are maintained as tiles are stored; this used to rescan every tile
    // on each call and ran on every snapshot.
    materials() {
        return [...this.#materialCounts.entries()]
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

    snapshot({includeTiles = false, includeModel = false, includeBlocks = false} = {}) {
        const model = this.model.snapshot({includeTables: includeModel, includeBlocks});
        const overworldZone = this.isOverworld ? overworldZoneFromId(this.id) : null;
        return {
            id: this.id,
            is_overworld: this.isOverworld,
            overworldZone,
            shipMetadata: this.model.shipMetadata(),
            tileset: this.tileset,
            seed: this.seed,
            block_w: this.blockWidth,
            block_h: this.blockHeight,
            parent_world: this.parentWorld,
            parent_ent: this.parentEntity,
            tileCount: this.tiles.size,
            chunkCount: this.totalChunkCount,
            lastChunkPatch: this.lastChunkPatch,
            lastPacket: this.lastPacket,
            meta: this.meta,
            materials: this.materials(),
            model,
            entities: model.entities,
            blocks: model.blocks,
            transforms: model.transforms,
            machines: model.machines,
            players: model.players,
            shipControls: model.shipControls,
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

    blockAt(x, y) {
        return this.model.blockAt(x, y);
    }
}
