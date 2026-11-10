import assert from "node:assert/strict";
import test from "node:test";
import {ModelState} from "../src/state/model/state.js";

function integer(value) {
    let n = Math.abs(value) * 2 + (value < 0 ? 1 : 0);
    const bytes = [];
    do { bytes.push((n % 128) | (n >= 128 ? 128 : 0)); n = Math.floor(n / 128); } while (n);
    return bytes;
}

// Transform section (wire tag 1): entity delta, mask, then x/y deltas in 1/40 units.
function transforms(generation, moves) {
    const bytes = [...integer(generation), ...integer(1)];
    let previous = 0;
    for (const [entity, x, y] of [...moves].sort((a, b) => a[0] - b[0])) {
        bytes.push(...integer(entity - previous), 3, ...integer(x * 40), ...integer(y * 40));
        previous = entity;
    }
    return Uint8Array.from([...bytes, 0, 0]);
}

function removals(generation, entities) {
    const bytes = [...integer(generation), ...integer(57005)];
    let previous = 0;
    for (const entity of entities) {
        bytes.push(...integer(entity - previous));
        previous = entity;
    }
    return Uint8Array.from([...bytes, 0, 0]);
}

function apply(model, bytes, options) {
    const update = model.apply(bytes, options);
    assert.equal(update.error, null);
    return update;
}

const PACKETS = [
    transforms(1, [[1, 0, 0], [2, 5, 0], [3, 9, 9]]),
    transforms(2, [[2, 1, 0]]),
    transforms(3, [[2, 1, 1], [3, -9, 0]]),
    removals(4, [1]),
    transforms(5, [[1, 4, 4], [7, 2, 2]]),
    removals(6, [3]),
    transforms(7, [[2, 1, 0]])
];

function replay(readEvery) {
    const model = new ModelState({isOverworld: false});
    PACKETS.forEach((packet, index) => {
        apply(model, packet, {full: index === 0});
        if (readEvery && index % readEvery === 0) {
            model.entities();
            model.blockAt(0, 0);
        }
    });
    return model;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("derived entity state matches a fresh rebuild however often it is read", () => {
    const untouched = replay(0);
    for (const readEvery of [1, 2, 3, 6]) {
        const model = replay(readEvery);
        assert.deepEqual(plain(model.entities()), plain(untouched.entities()), `readEvery ${readEvery}`);
        assert.deepEqual(plain(model.transforms()), plain(untouched.transforms()));
        assert.deepEqual(plain(model.snapshot().tables), plain(untouched.snapshot().tables));
        assert.deepEqual(plain(model.blocks()), plain(untouched.blocks()));
    }
    assert.deepEqual(untouched.entities().map((entity) => entity.entity), [1, 2, 7]);
    assert.deepEqual(untouched.entity(2).transform, {entity: 2, x: 8, y: 1, rot: null, flags: []});
});

test("point lookups see updates applied since the last read", () => {
    const model = new ModelState({isOverworld: false});
    apply(model, PACKETS[0], {full: true});
    assert.equal(model.entity(2).transform.x, 5);
    const stale = model.entity(2);

    // Several packets with no read in between: only the latest state matters.
    apply(model, PACKETS[1]);
    apply(model, PACKETS[2]);
    assert.equal(model.entity(2).transform.x, 7);
    assert.equal(model.entity(2).transform.y, 1);
    assert.notEqual(model.entity(2), stale);
    assert.equal(model.entity(2), model.entity(2));
    assert.equal(model.entity(1), model.entities().find((entity) => entity.entity === 1));

    apply(model, PACKETS[3]);
    assert.equal(model.entity(1), null);
    assert.deepEqual(model.entities().map((entity) => entity.entity), [2, 3]);

    // Removed, then re-added before anything reads: the entity is present again.
    apply(model, PACKETS[4]);
    assert.deepEqual(model.entity(1).transform, {entity: 1, x: 4, y: 4, rot: null, flags: []});
    assert.equal(model.entity(7).transform.x, 2);
    assert.deepEqual(model.entities().map((entity) => entity.entity), [1, 2, 3, 7]);
    assert.equal(model.snapshot().entityCount, 4);
});

test("block lookups follow entities that moved since the last read", () => {
    const model = new ModelState({isOverworld: false});
    apply(model, PACKETS[0], {full: true});
    assert.deepEqual(model.blockAt(5, 0).entities.map((entity) => entity.entity), [2]);
    apply(model, PACKETS[1]);
    apply(model, PACKETS[2]);
    assert.equal(model.blockAt(5, 0), null);
    assert.deepEqual(model.blockAt(7, 1).entities.map((entity) => entity.entity), [2]);
    apply(model, PACKETS[5]);
    assert.equal(model.blockAt(0, 9), null);
    assert.deepEqual(model.blocks().map((block) => [block.x, block.y]), [[0, 0], [7, 1]]);
});
