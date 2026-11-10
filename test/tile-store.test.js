import assert from "node:assert/strict";
import test from "node:test";
import {TileFlags, WorldState, WorldStore} from "../src/state/world/index.js";
import {decryptPayload} from "../src/crypto/chacha.js";
import {encodeMsgpack} from "../src/protocol/codec/msgpack.js";
import {DredlessClient} from "../src/client/index.js";

// LZ4 frame holding one uncompressed block.
function lz4Frame(bytes) {
    const size = bytes.length;
    return Uint8Array.from([
        0x04, 0x22, 0x4d, 0x18, 0x60, 0x70, 0x00,
        size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, 0x80,
        ...bytes,
        0, 0, 0, 0
    ]);
}

// Chunk patch value as sent on the wire: columns of material, shape, hp and
// (optionally) color for the rectangle minX..maxX by minY..maxY.
function chunkPatch(chunkX, chunkY, minX, minY, maxX, maxY, cell, {color = true} = {}) {
    const width = maxX - minX + 1;
    const count = width * (maxY - minY + 1);
    const columns = color ? 4 : 3;
    const bytes = new Uint8Array(count * columns);
    for (let i = 0; i < count; i++) {
        const values = cell(minX + (i % width), minY + Math.floor(i / width));
        for (let column = 0; column < columns; column++) bytes[column * count + i] = values[column];
    }
    return [chunkX, chunkY, minX, minY, maxX, maxY, lz4Frame(bytes)];
}

function shipWorld() {
    const world = new WorldState(7);
    world.readMeta({type: 22, world: 7, seed: "seed", is_overworld: false});
    return world;
}

const byPosition = (a, b) => (a.y - b.y) || (a.x - b.x);

test("chunk patches are stored as columns and read back as the same tile objects", () => {
    const world = shipWorld();
    const tiles = world.applyChunk(chunkPatch(1, 2, 3, 4, 5, 5, (x, y) => [1 + (x % 3), y === 4 ? 0 : 7, 200 + x, 10 + y]));

    assert.equal(tiles.length, 6);
    assert.equal(world.tiles.size, 6);
    assert.equal(world.totalChunkCount, 1);
    assert.deepEqual(world.lastChunkPatch, {chunkX: 1, chunkY: 2, minX: 3, minY: 4, maxX: 5, maxY: 5, count: 6, hasColor: true});

    const expected = world.normalizeTile({x: 64 + 4, y: 128 + 5, material: 2, shape: 7, hp: 204, integrity: 204, color: 15});
    assert.deepEqual(world.tileAt(68, 133), expected);
    assert.equal(expected.shapeName, "top-half");
    assert.equal(world.tileAt(68, 140), null);
    assert.equal(world.tileAt(0, 0), null);

    // Patch order, stored order and point lookups all describe the same tiles.
    assert.deepEqual(world.tiles.toArray().sort(byPosition), [...tiles].sort(byPosition));
    assert.notEqual(world.tiles.toArray(), world.tiles.toArray());
    // One entry point per kind of read: the collection is not a Map or an iterable.
    assert.deepEqual(Object.getOwnPropertyNames(Object.getPrototypeOf(world.tiles)).sort(), ["constructor", "size", "toArray"]);
    assert.equal(world.tiles[Symbol.iterator], undefined);
    for (const tile of tiles) assert.deepEqual(world.tileAt(tile.x, tile.y), tile);
    assert.deepEqual(world.snapshot({includeTiles: true}).tiles.sort(byPosition), [...tiles].sort(byPosition));
    assert.equal(world.snapshot().tileCount, 6);
});

test("a full-width patch and a row-by-row patch produce identical chunks", () => {
    const cell = (x, y) => [(x * 7 + y) % 12, (x + y) % 2 ? 0 : 5, (x * 3 + y * 5) & 0xff, (x ^ y) & 0xff];
    const whole = shipWorld();
    whole.applyChunk(chunkPatch(0, 0, 0, 0, 63, 63, cell));

    const pieces = shipWorld();
    pieces.applyChunk(chunkPatch(0, 0, 0, 0, 63, 9, cell));
    pieces.applyChunk(chunkPatch(0, 0, 0, 10, 30, 63, cell));
    pieces.applyChunk(chunkPatch(0, 0, 31, 10, 63, 63, cell));

    assert.equal(whole.tiles.size, 4096);
    assert.equal(pieces.tiles.size, 4096);
    const [a] = whole.tileChunks();
    const [b] = pieces.tileChunks();
    for (const column of ["material", "shape", "hp", "color", "flags"]) assert.deepEqual(b[column], a[column], column);
    assert.deepEqual(pieces.materials(), whole.materials());
    assert.deepEqual(pieces.tiles.toArray(), whole.tiles.toArray());
});

test("patches without a color column store null colors", () => {
    const world = shipWorld();
    const tiles = world.applyChunk(chunkPatch(0, 0, 0, 0, 1, 0, () => [4, 0, 255], {color: false}));
    assert.deepEqual(tiles.map((tile) => tile.color), [null, null]);
    assert.equal(world.tileAt(1, 0).color, null);
    assert.equal(world.tiles.toArray()[0].color, null);
    assert.equal(world.tileChunks()[0].flags[0], TileFlags.Present | TileFlags.NoColor);

    // A later colored write clears the flag.
    world.applyTile([1, 0, 4, 0, 255, 9]);
    assert.equal(world.tileAt(1, 0).color, 9);
    assert.equal(world.tileChunks()[0].flags[1], TileFlags.Present);
});

test("tile counts and materials follow overwrites", () => {
    const world = shipWorld();
    world.applyChunk(chunkPatch(0, 0, 0, 0, 3, 0, (x) => [x < 2 ? 1 : 2, 0, 255, 0]));
    const counts = () => Object.fromEntries(world.materials().map(({material, count}) => [material, count]));
    assert.deepEqual(counts(), {1: 2, 2: 2});

    world.applyTile([0, 0, 2, 0, 255, 0]);
    assert.deepEqual(counts(), {1: 1, 2: 3});
    assert.equal(world.tiles.size, 4);

    world.applyTile([10, 0, 5, 0, 255, 0]);
    assert.deepEqual(counts(), {1: 1, 2: 3, 5: 1});
    assert.equal(world.tiles.size, 5);

    world.applyChunk(chunkPatch(0, 0, 0, 0, 3, 0, () => [3, 0, 255, 0]));
    assert.deepEqual(counts(), {3: 4, 5: 1});
    assert.equal(world.materials()[0].name, world.tileDefinition(3)?.name ?? null);
});

test("chunk views are live, stable and versioned", () => {
    const world = shipWorld();
    assert.deepEqual(world.tileChunks(), []);
    assert.equal(world.tileVersion, 0);

    world.applyChunk(chunkPatch(-1, 0, 62, 0, 63, 0, () => [1, 0, 100, 0]));
    world.applyChunk(chunkPatch(2, 3, 0, 0, 0, 0, () => [2, 0, 50, 0]));
    const chunks = world.tileChunks();
    assert.equal(chunks.length, 2);
    assert.equal(world.tileChunks(), chunks);

    const left = chunks.find((chunk) => chunk.chunkX === -1);
    const right = chunks.find((chunk) => chunk.chunkX === 2);
    assert.deepEqual([left.originX, left.originY], [-64, 0]);
    assert.deepEqual([right.originX, right.originY], [128, 192]);
    assert.equal(left.material.length, 4096);
    assert.equal(left.flags[62], TileFlags.Present);
    assert.equal(left.flags[0], 0);
    assert.deepEqual(world.tileAt(-2, 0), world.normalizeTile({x: -2, y: 0, material: 1, shape: 0, hp: 100, color: 0}));

    const leftVersion = left.version;
    const rightVersion = right.version;
    const worldVersion = world.tileVersion;
    world.applyTile([-1, 0, 9, 0, 77, 3]);
    assert.equal(world.tileChunks().find((chunk) => chunk.chunkX === -1), left);
    assert.equal(left.material[63], 9);
    assert.equal(left.hp[63], 77);
    assert.ok(left.version > leftVersion);
    assert.equal(right.version, rightVersion);
    assert.ok(world.tileVersion > worldVersion);
    assert.equal(left.version, world.tileVersion);

    // A new chunk shows up in a fresh listing.
    world.applyTile([1000, 1000, 1, 0, 1, 1]);
    assert.equal(world.tileChunks().length, 3);
});

test("chunk views describe every wire tile without building objects", () => {
    const world = shipWorld();
    world.applyChunk(chunkPatch(0, 0, 0, 0, 1, 1, (x, y) => [x + 1, 0, 10 * (y + 1), 5]));
    world.applyChunk(chunkPatch(1, 0, 0, 0, 0, 0, () => [6, 5, 1], {color: false}));
    const seen = [];
    for (const chunk of world.tileChunks()) {
        const {material, shape, hp, color, flags, originX, originY} = chunk;
        for (let i = 0; i < flags.length; i++) {
            if (!(flags[i] & TileFlags.Present)) continue;
            seen.push({
                x: originX + (i & 63),
                y: originY + (i >> 6),
                material: material[i],
                shape: shape[i],
                hp: hp[i],
                color: flags[i] & TileFlags.NoColor ? null : color[i]
            });
        }
    }
    assert.deepEqual(seen.sort(byPosition), [
        {x: 0, y: 0, material: 1, shape: 0, hp: 10, color: 5},
        {x: 1, y: 0, material: 2, shape: 0, hp: 10, color: 5},
        {x: 64, y: 0, material: 6, shape: 5, hp: 1, color: null},
        {x: 0, y: 1, material: 1, shape: 0, hp: 20, color: 5},
        {x: 1, y: 1, material: 2, shape: 0, hp: 20, color: 5}
    ]);
    assert.deepEqual(
        world.tiles.toArray().sort(byPosition).map(({x, y, material, shape, hp, color}) => ({x, y, material, shape, hp, color})),
        seen
    );
});

test("tiles the columns cannot represent are kept as given", () => {
    const world = shipWorld();
    const odd = world.setTile({x: 2, y: 3, material: 4, shape: 0, hp: null, color: 1, note: "custom"});
    assert.equal(odd.note, "custom");
    assert.equal(world.tileAt(2, 3), odd);
    assert.equal(world.tiles.size, 1);
    assert.deepEqual(world.materials().map(({material, count}) => [material, count]), [[4, 1]]);
    assert.deepEqual(world.tiles.toArray(), [odd]);
    assert.deepEqual(world.tileChunks(), []);

    // A wire tile at the same position replaces it...
    world.applyTile([2, 3, 5, 0, 200, 1]);
    assert.equal(world.tiles.size, 1);
    assert.equal(world.tileAt(2, 3).material, 5);
    assert.equal(world.tileAt(2, 3).note, undefined);

    // ...and an unrepresentable tile replaces a wire tile.
    const far = world.setTile({x: 2, y: 3, material: 300, shape: 0, hp: 255, color: 0});
    assert.equal(world.tiles.size, 1);
    assert.equal(world.tileAt(2, 3), far);
    assert.deepEqual(world.materials().map(({material, count}) => [material, count]), [[300, 1]]);

    const distant = world.setTile({x: 2 ** 30, y: 0, material: 1, shape: 0, hp: 255, color: 0});
    assert.equal(world.tileAt(2 ** 30, 0), distant);
    assert.equal(world.tiles.size, 2);
});

test("malformed chunk patches fall back to tile-by-tile storage", () => {
    const world = shipWorld();
    // maxX beyond the chunk: stored, but not in the chunk's columns.
    const tiles = world.applyChunk(chunkPatch(0, 0, 63, 0, 64, 0, (x) => [x === 63 ? 1 : 2, 0, 255, 0]));
    assert.deepEqual(tiles.map((tile) => [tile.x, tile.material]), [[63, 1], [64, 2]]);
    assert.equal(world.tiles.size, 2);
    assert.equal(world.tileAt(64, 0).material, 2);
    assert.equal(world.applyChunk([0, 0, 0]), null);
    assert.equal(world.applyChunkPatch("nope"), null);
});

test("chunk history tiles are built on first read and keep patch-time values", () => {
    const world = shipWorld();
    const entry = world.applyChunkPatch(chunkPatch(0, 0, 0, 0, 1, 0, (x) => [x + 1, 0, 255, 0]));
    assert.equal(world.chunks[0], entry);
    assert.equal(typeof Object.getOwnPropertyDescriptor(entry, "tiles").get, "function");
    assert.deepEqual(Object.keys(entry), ["chunkX", "chunkY", "minX", "minY", "maxX", "maxY", "tiles"]);

    world.applyTile([0, 0, 9, 0, 1, 0]);
    assert.deepEqual(entry.tiles.map((tile) => tile.material), [1, 2]);
    assert.equal(entry.tiles, entry.tiles);
    assert.equal(world.tileAt(0, 0).material, 9);
    assert.equal(JSON.parse(JSON.stringify(entry)).tiles.length, 2);
});

test("tile objects are retained only for repeated reads of unchanged chunks", () => {
    const world = shipWorld();
    world.applyChunk(chunkPatch(0, 0, 0, 0, 1, 0, () => [1, 0, 255, 0]));
    world.applyChunk(chunkPatch(1, 0, 0, 0, 0, 0, () => [2, 0, 255, 0]));
    const at = (tiles, x) => tiles.find((tile) => tile.x === x);

    const first = world.tiles.toArray();
    const second = world.tiles.toArray();
    const third = world.tiles.toArray();
    assert.deepEqual(second, first);
    assert.notEqual(at(second, 0), at(first, 0));
    assert.equal(at(third, 0), at(second, 0));
    assert.equal(at(third, 64), at(second, 64));

    // Writing one chunk rebuilds only that chunk's objects.
    world.applyTile([0, 0, 3, 0, 255, 0]);
    const fourth = world.tiles.toArray();
    assert.equal(at(fourth, 0).material, 3);
    assert.notEqual(at(fourth, 1), at(third, 1));
    assert.equal(at(fourth, 64), at(third, 64));

    world.releaseTileObjects();
    const fifth = world.tiles.toArray();
    assert.deepEqual(fifth, fourth);
    assert.notEqual(at(fifth, 64), at(fourth, 64));

    // A new tileset changes derived fields, so retained objects are dropped.
    world.tiles.toArray();
    const before = world.tiles.toArray();
    world.readMeta({type: 22, world: 7, seed: "seed", is_overworld: true});
    const after = world.tiles.toArray();
    assert.notEqual(at(after, 64), at(before, 64));
    assert.equal(at(after, 64).materialName, world.tileDefinition(2)?.name ?? null);
});

// The cipher is a keystream XOR keyed by the first and last four wire bytes, so
// running a framed plaintext through it yields the matching ciphertext.
function encryptPayload(plain, worldId, seed) {
    const frame = (body) => Uint8Array.from([1, 2, 3, 4, ...body, 5, 6, 7, 8]);
    return frame(decryptPayload(frame(plain), worldId, seed));
}

test("world store applies encrypted tile packets with lazily built update tiles", () => {
    const store = new WorldStore();
    store.apply({type: 22, world: 3, seed: "abc", is_overworld: false});
    const payload = encodeMsgpack({
        0: chunkPatch(0, 0, 0, 0, 1, 1, (x, y) => [1 + x, 0, 250, y]),
        1: [5, 5, 4, 7, 128, 2]
    });
    const update = store.apply({type: 23, world: 3, data: encryptPayload(payload, 3, "abc")});

    assert.equal(update.type, "tiles");
    assert.deepEqual(update.errors, []);
    assert.deepEqual(update.updates.map((item) => item.kind), ["0", "1"]);
    const world = store.worlds.get(3);
    assert.equal(world.tiles.size, 5);
    assert.equal(world.events.at(-1).updates, update.updates);

    const [chunk, single] = update.updates;
    assert.equal(typeof Object.getOwnPropertyDescriptor(chunk, "tiles").get, "function");
    assert.deepEqual(Object.keys(chunk), ["kind", "tiles"]);
    assert.deepEqual(chunk.tiles.map((tile) => [tile.x, tile.y, tile.material, tile.color]), [[0, 0, 1, 0], [1, 0, 2, 0], [0, 1, 1, 1], [1, 1, 2, 1]]);
    assert.equal(single.tile.shapeName, "top-half");
    assert.deepEqual(world.tileAt(5, 5), single.tile);

    // Decryption reuses scratch state; a second world must not see the first's key.
    store.apply({type: 22, world: 4, seed: "other", is_overworld: true});
    store.apply({type: 23, world: 4, data: encryptPayload(encodeMsgpack({1: [1, 1, 2, 0, 9, 9]}), 4, "other")});
    assert.equal(store.worlds.get(4).tileAt(1, 1).hp, 9);
    assert.equal(store.apply({type: 23, world: 3, data: encryptPayload(payload, 3, "abc")}).updates.length, 2);
});

test("world domains expose tile reads", () => {
    const socket = {readyState: 1, addEventListener() {}, send() {}, close() {}};
    const client = DredlessClient.attachWebSocket(socket, {mode: "readonly"});
    assert.equal(client.world(5), null);

    const world = client.worlds.get(5);
    world.readMeta({type: 22, world: 5, seed: "s", is_overworld: false});
    const domain = client.world(5);
    assert.equal(domain.tiles.count, 0);
    assert.deepEqual(domain.tiles.chunks(), []);
    assert.equal(domain.tiles.at(1, 1), null);

    world.applyTile([1, 1, 4, 0, 255, 2]);
    world.applyTile([70, 1, 5, 0, 128, 3]);
    assert.equal(domain.tiles.count, 2);
    assert.equal(domain.tiles.version, world.tileVersion);
    assert.equal(domain.tiles.chunks().length, 2);
    assert.equal(domain.tiles.at(70, 1).material, 5);
    assert.deepEqual(domain.tiles.all().map((tile) => tile.x), [1, 70]);

    const missing = client.world(5).tiles;
    client.worlds.worlds.delete(5);
    assert.equal(missing.count, 0);
    assert.equal(missing.version, 0);
    assert.deepEqual(missing.all(), []);
});
