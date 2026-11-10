import {decodeWorldPayload, decompressWorldChunk} from "../../protocol/inbound/world-payload.js";
import {ModelState} from "../model/index.js";
import {defineLazyProperty} from "../model/decoder.js";
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

// Tiles are stored in columns rather than as one object per tile. Each 64x64
// chunk owns a single buffer of five byte columns (material, shape, hp, color,
// flags), so applying a chunk patch is a handful of bulk copies and a joined
// overworld costs a few bytes per tile instead of ~190. Tile objects are built
// only for callers that ask for them.
const CHUNK_SIZE = 64;
const CHUNK_CELLS = CHUNK_SIZE * CHUNK_SIZE;
const COLUMN_SHAPE = CHUNK_CELLS;
const COLUMN_HP = CHUNK_CELLS * 2;
const COLUMN_COLOR = CHUNK_CELLS * 3;
const COLUMN_FLAGS = CHUNK_CELLS * 4;
const CHUNK_COORD_LIMIT = 1 << 15;
const TILE_COORD_LIMIT = CHUNK_COORD_LIMIT * CHUNK_SIZE;
// Keys every stored tile object carries; anything beyond these is caller data
// that the columns cannot represent.
const TILE_OBJECT_KEY_COUNT = 13;
const CONCAT_BATCH = 4096;

// Values of a chunk view's `flags` column.
export const TileFlags = Object.freeze({
    /** The cell holds a tile. Zero means the cell is empty. */
    Present: 1,
    /** The tile was sent without a color; its `color` is null. */
    NoColor: 2
});

const SHAPE_NAMES_BY_ID = Array.from({length: 256}, (_, shape) => TILE_SHAPE_NAMES.get(shape) ?? null);

const isByte = (value) => typeof value === "number" && (value & 0xff) === value;
const isCellIndex = (value) => Number.isInteger(value) && value >= 0 && value < CHUNK_SIZE;
const isChunkCoord = (value) => Number.isInteger(value) && value >= -CHUNK_COORD_LIMIT && value < CHUNK_COORD_LIMIT;
const isTileCoord = (value) => Number.isInteger(value) && value >= -TILE_COORD_LIMIT && value < TILE_COORD_LIMIT;
const chunkKey = (chunkX, chunkY) => ((chunkY + CHUNK_COORD_LIMIT) * (CHUNK_COORD_LIMIT * 2)) + (chunkX + CHUNK_COORD_LIMIT);
const looseTileKey = (x, y) => `${x},${y}`;

// A world's tiles as objects. Deliberately small: each kind of read has one
// entry point, and it is the fastest one. There is no iterator, because walking
// 200k tiles through one costs several times what copying the array does.
// Scans that do not need objects should use WorldState.tileChunks().
class TileCollection {
    #count;
    #objects;

    constructor(count, objects) {
        this.#count = count;
        this.#objects = objects;
    }

    get size() {
        return this.#count();
    }

    // A fresh array of every tile.
    toArray() {
        return this.#objects().slice();
    }
}

export class WorldState {
    #chunkGrids = new Map();
    // Tiles the columns cannot hold: non-byte values, out-of-range coordinates,
    // or extra caller fields. Only reachable through setTile()/malformed patches.
    #looseTiles = new Map();
    #chunkViews = null;
    #tileVersion = 0;
    #tileStats = null;
    #tileStatsVersion = -1;
    #tileObjects = null;
    #tileObjectsVersion = -1;
    #tileObjectsRequestedVersion = -1;
    #materialDefs = null;
    #materialDefsTileset = null;

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
        this.tiles = new TileCollection(() => this.#readTileStats().count, () => this.#readTileObjects());
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
        const patch = this.applyChunkPatch(value);
        return patch ? patch.tiles : null;
    }

    // Applies a chunk patch and returns its history entry. The entry's `tiles`
    // array is built on first read, so ingestion never allocates tile objects.
    applyChunkPatch(value) {
        if (!Array.isArray(value) || value.length !== 7) return null;
        const [chunkX, chunkY, minX, minY, maxX, maxY, compressedPatch] = value;
        const patch = decompressWorldChunk(compressedPatch);
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        const count = width * height;
        const hasColor = patch.length >= count * 4;
        const baseX = chunkX << 6;
        const baseY = chunkY << 6;
        const entry = {chunkX, chunkY, minX, minY, maxX, maxY};

        const wellFormed = isChunkCoord(chunkX) && isChunkCoord(chunkY)
            && isCellIndex(minX) && isCellIndex(minY) && isCellIndex(maxX) && isCellIndex(maxY)
            && width > 0 && height > 0 && patch.length >= count * 3;
        if (wellFormed) {
            this.#writeChunkColumns(this.#chunkGrid(chunkX, chunkY), patch, minX, minY, width, height, hasColor);
            defineLazyProperty(entry, "tiles", () => {
                const tiles = new Array(count);
                for (let i = 0; i < count; i++) {
                    tiles[i] = this.#buildTile(
                        baseX + minX + (i % width),
                        baseY + minY + Math.floor(i / width),
                        patch[i],
                        patch[i + count],
                        patch[i + count * 2],
                        hasColor ? patch[i + count * 3] : null
                    );
                }
                return tiles;
            });
        } else {
            // Out-of-range or truncated patch: store tile by tile so whatever
            // the patch describes is still kept.
            const tiles = new Array(count);
            for (let i = 0; i < count; i++) {
                tiles[i] = this.#storeTile(this.#buildTile(
                    baseX + minX + (i % width),
                    baseY + minY + Math.floor(i / width),
                    patch[i],
                    patch[i + count],
                    patch[i + count * 2],
                    hasColor ? patch[i + count * 3] : null
                ));
            }
            entry.tiles = tiles;
        }

        this.totalChunkCount += 1;
        pushBounded(this.chunks, entry, this.historyLimits.chunkHistory);
        this.lastChunkPatch = {chunkX, chunkY, minX, minY, maxX, maxY, count, hasColor};
        return entry;
    }

    setTile(tile) {
        return this.#storeTile(this.normalizeTile(tile));
    }

    /** Bumped on every tile write; compare to skip work when nothing changed. */
    get tileVersion() {
        return this.#tileVersion;
    }

    // Zero-copy access for consumers that scan tiles every tick. The returned
    // views are live and stable for the life of the chunk: read the typed arrays
    // directly and use each view's `version` to skip chunks that have not changed.
    tileChunks() {
        return this.#chunkViews ??= Array.from(this.#chunkGrids.values(), (grid) => grid.view);
    }

    tileAt(x, y) {
        if (this.#looseTiles.size > 0) {
            const loose = this.#looseTiles.get(looseTileKey(x, y));
            if (loose) return loose;
        }
        if (!isTileCoord(x) || !isTileCoord(y)) return null;
        const grid = this.#chunkGrids.get(chunkKey(x >> 6, y >> 6));
        if (!grid) return null;
        const data = grid.data;
        const cell = ((y & 63) << 6) | (x & 63);
        const flags = data[COLUMN_FLAGS + cell];
        if (flags === 0) return null;
        return this.#buildTile(
            x,
            y,
            data[cell],
            data[COLUMN_SHAPE + cell],
            data[COLUMN_HP + cell],
            flags & TileFlags.NoColor ? null : data[COLUMN_COLOR + cell]
        );
    }

    // Drops tile objects retained for repeated `tiles.toArray()` reads. They are
    // rebuilt on the next read.
    releaseTileObjects() {
        this.#tileObjects = null;
        this.#tileObjectsRequestedVersion = -1;
        for (const grid of this.#chunkGrids.values()) {
            grid.objects = null;
            grid.objectsRequestedVersion = -1;
        }
    }

    #chunkGrid(chunkX, chunkY) {
        const key = chunkKey(chunkX, chunkY);
        let grid = this.#chunkGrids.get(key);
        if (!grid) {
            const data = new Uint8Array(CHUNK_CELLS * 5);
            grid = {
                data,
                stats: null,
                objects: null,
                objectsRequestedVersion: -1,
                view: {
                    chunkX,
                    chunkY,
                    originX: chunkX << 6,
                    originY: chunkY << 6,
                    version: 0,
                    material: data.subarray(0, COLUMN_SHAPE),
                    shape: data.subarray(COLUMN_SHAPE, COLUMN_HP),
                    hp: data.subarray(COLUMN_HP, COLUMN_COLOR),
                    color: data.subarray(COLUMN_COLOR, COLUMN_FLAGS),
                    flags: data.subarray(COLUMN_FLAGS, COLUMN_FLAGS + CHUNK_CELLS)
                }
            };
            this.#chunkGrids.set(key, grid);
            this.#chunkViews = null;
        }
        return grid;
    }

    // The only bookkeeping a tile write does. Counts and tile objects are derived
    // later, on demand, from whichever chunks were touched.
    #touchChunk(grid) {
        grid.stats = null;
        grid.objects = null;
        grid.view.version = ++this.#tileVersion;
    }

    #writeChunkColumns(grid, patch, minX, minY, width, height, hasColor) {
        const data = grid.data;
        const count = width * height;
        const columns = hasColor ? 4 : 3;
        const flag = hasColor ? TileFlags.Present : TileFlags.Present | TileFlags.NoColor;
        // The patch is column-major (all materials, then shapes, ...) and row
        // ordered within a column, so each row of each column is one copy. A
        // full-width patch is contiguous on both sides: one copy per column.
        const rows = width === CHUNK_SIZE ? 1 : height;
        const span = width === CHUNK_SIZE ? count : width;
        for (let row = 0; row < rows; row++) {
            const start = ((minY + row) << 6) + minX;
            const from = row * width;
            for (let column = 0; column < columns; column++) {
                const source = column * count + from;
                data.set(patch.subarray(source, source + span), column * CHUNK_CELLS + start);
            }
            if (!hasColor) data.fill(0, COLUMN_COLOR + start, COLUMN_COLOR + start + span);
            data.fill(flag, COLUMN_FLAGS + start, COLUMN_FLAGS + start + span);
        }
        this.#touchChunk(grid);
    }

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

    #storeTile(tile) {
        const {x, y} = tile;
        const inRange = isTileCoord(x) && isTileCoord(y);
        const columnar = inRange && isByte(tile.material) && isByte(tile.shape) && isByte(tile.hp)
            && (tile.color === null || isByte(tile.color))
            && Object.keys(tile).length === TILE_OBJECT_KEY_COUNT;

        if (this.#looseTiles.size > 0 && this.#looseTiles.delete(looseTileKey(x, y))) this.#tileVersion++;

        if (columnar) {
            const grid = this.#chunkGrid(x >> 6, y >> 6);
            const data = grid.data;
            const cell = ((y & 63) << 6) | (x & 63);
            data[cell] = tile.material;
            data[COLUMN_SHAPE + cell] = tile.shape;
            data[COLUMN_HP + cell] = tile.hp;
            data[COLUMN_COLOR + cell] = tile.color ?? 0;
            data[COLUMN_FLAGS + cell] = tile.color === null ? TileFlags.Present | TileFlags.NoColor : TileFlags.Present;
            this.#touchChunk(grid);
            return tile;
        }

        // Replace any columnar tile at the same position.
        const grid = inRange ? this.#chunkGrids.get(chunkKey(x >> 6, y >> 6)) : undefined;
        if (grid) {
            const cell = ((y & 63) << 6) | (x & 63);
            if (grid.data[COLUMN_FLAGS + cell] !== 0) {
                grid.data[COLUMN_FLAGS + cell] = 0;
                this.#touchChunk(grid);
            }
        }
        this.#looseTiles.set(looseTileKey(x, y), tile);
        this.#tileVersion++;
        return tile;
    }

    // Tile and material counts, derived from the columns on first read after a
    // write. Only chunks touched since the last read are rescanned.
    #readTileStats() {
        if (this.#tileStats && this.#tileStatsVersion === this.#tileVersion) return this.#tileStats;
        const totals = new Int32Array(256);
        let count = 0;
        for (const grid of this.#chunkGrids.values()) {
            let stats = grid.stats;
            if (!stats) {
                const data = grid.data;
                const histogram = new Uint16Array(256);
                let present = 0;
                for (let cell = 0; cell < CHUNK_CELLS; cell++) {
                    if (data[COLUMN_FLAGS + cell] === 0) continue;
                    histogram[data[cell]]++;
                    present++;
                }
                stats = grid.stats = {count: present, histogram};
            }
            count += stats.count;
            const histogram = stats.histogram;
            for (let material = 0; material < 256; material++) totals[material] += histogram[material];
        }
        const materials = new Map();
        for (let material = 0; material < 256; material++) {
            if (totals[material] > 0) materials.set(material, totals[material]);
        }
        for (const tile of this.#looseTiles.values()) {
            const id = Number(tile.material);
            materials.set(id, (materials.get(id) || 0) + 1);
            count++;
        }
        this.#tileStatsVersion = this.#tileVersion;
        return this.#tileStats = {count, materials};
    }

    // Per-material fields of a tile object, resolved once per tileset instead of
    // once per tile.
    #readMaterialDefs() {
        if (this.#materialDefs && this.#materialDefsTileset === this.tileset) return this.#materialDefs;
        const defs = new Array(256);
        for (let material = 0; material < 256; material++) {
            const def = this.tileDefinition(material);
            defs[material] = {name: def?.name ?? null, solid: def?.solid ?? null, maxHp: def?.hp ?? null};
        }
        this.#materialDefsTileset = this.tileset;
        return this.#materialDefs = defs;
    }

    #buildChunkTiles(grid) {
        const defs = this.#readMaterialDefs();
        const data = grid.data;
        const baseX = grid.view.originX;
        const baseY = grid.view.originY;
        const tiles = [];
        for (let cell = 0; cell < CHUNK_CELLS; cell++) {
            const flags = data[COLUMN_FLAGS + cell];
            if (flags === 0) continue;
            const material = data[cell];
            const shape = data[COLUMN_SHAPE + cell];
            const hp = data[COLUMN_HP + cell];
            const def = defs[material];
            const maxHp = def.maxHp;
            // Same shape and key order as #buildTile.
            tiles.push({
                x: baseX + (cell & 63),
                y: baseY + (cell >> 6),
                material,
                shape,
                hp,
                integrity: hp,
                color: flags & TileFlags.NoColor ? null : data[COLUMN_COLOR + cell],
                materialName: def.name,
                shapeName: SHAPE_NAMES_BY_ID[shape],
                solid: def.solid,
                maxHp,
                hpRatio: hp / 255,
                hpValue: typeof maxHp === "number" ? Math.round((hp / 255) * maxHp) : null
            });
        }
        return tiles;
    }

    // Every tile as an object. Objects are retained only once a caller asks a
    // second time for the same unchanged data, so a one-off dump leaves nothing
    // behind while a caller that polls pays only for chunks that changed.
    #readTileObjects() {
        if (this.#materialDefsTileset !== this.tileset) {
            this.releaseTileObjects();
            this.#materialDefs = null;
        }
        const version = this.#tileVersion;
        if (this.#tileObjects && this.#tileObjectsVersion === version) return this.#tileObjects;

        const parts = [];
        for (const grid of this.#chunkGrids.values()) {
            let tiles = grid.objects;
            if (!tiles) {
                tiles = this.#buildChunkTiles(grid);
                if (grid.objectsRequestedVersion === grid.view.version) grid.objects = tiles;
                else grid.objectsRequestedVersion = grid.view.version;
            }
            parts.push(tiles);
        }
        if (this.#looseTiles.size > 0) parts.push([...this.#looseTiles.values()]);
        // One bulk concat per batch of chunks rather than a push per tile; the
        // batching keeps the argument count bounded on very large worlds.
        let out = [];
        for (let start = 0; start < parts.length; start += CONCAT_BATCH) {
            out = out.concat(...parts.slice(start, start + CONCAT_BATCH));
        }

        if (this.#tileObjectsRequestedVersion === version) {
            this.#tileObjects = out;
            this.#tileObjectsVersion = version;
        } else {
            this.#tileObjects = null;
            this.#tileObjectsRequestedVersion = version;
        }
        return out;
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
        return [...this.#readTileStats().materials.entries()]
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
            tileCount: this.#readTileStats().count,
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
            projectiles: model.projectiles,
            bots: model.bots,
            rcds: model.rcds,
            balls: model.balls,
            recyclers: model.recyclers,
            shipControls: model.shipControls,
            pvpEvent: model.pvpEvent,
            pvpParties: model.pvpParties,
            commsBubbles: this.commsBubbles.slice(),
            tiles: includeTiles ? this.tiles.toArray() : undefined
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
