import assert from "node:assert/strict";
import test from "node:test";

import {buildCommandBody, buildCommandDefaults, buildSignedCommandPacket} from "../src/protocol/outbound/commands.js";
import {decodeMsgpack} from "../src/protocol/codec/msgpack.js";

test("held item placement command fields match door placement captures", () => {
    const command = buildCommandDefaults({
        focus_ent: null,
        inv_slot: 2,
        mx: 28.256839752197266,
        my: 5.263635635375977,
        act1: true,
        act1_held: true
    });

    assert.equal(command.type, 0);
    assert.equal(command.focus_ent, null);
    assert.equal(command.inv_slot, 2);
    assert.equal(command.act1, true);
    assert.equal(command.act1_held, true);
    assert.equal(command.act_alt, false);
    assert.equal(command.act_alt_held, false);
});

test("held item rotation command fields match door rotation capture", () => {
    const command = buildCommandDefaults({
        focus_ent: null,
        inv_slot: 2,
        mx: 28.768207550048828,
        my: 5.815912246704102,
        act_alt: true,
        act_alt_held: true
    });

    assert.equal(command.type, 0);
    assert.equal(command.focus_ent, null);
    assert.equal(command.inv_slot, 2);
    assert.equal(command.act1, false);
    assert.equal(command.act1_held, false);
    assert.equal(command.act_alt, true);
    assert.equal(command.act_alt_held, true);
});

test("view dimensions encode zoom state on signed input commands", () => {
    const command = buildCommandDefaults({
        vx: 1282.3951416015625,
        vy: 737.8287963867188,
        scr_w: 2840,
        scr_h: 1634
    });

    assert.equal(command.type, 0);
    assert.equal(command.vx, 1282.3951416015625);
    assert.equal(command.vy, 737.8287963867188);
    assert.equal(command.scr_w, 2840);
    assert.equal(command.scr_h, 1634);
});

test("screen dimensions encode browser viewport size on signed input commands", () => {
    const command = buildCommandDefaults({
        vx: 14.75,
        vy: 8.619000434875488,
        scr_w: 1672,
        scr_h: 977
    });

    assert.equal(command.vx, 14.75);
    assert.equal(command.vy, 8.619000434875488);
    assert.equal(command.scr_w, 1672);
    assert.equal(command.scr_h, 977);
});

// The official client sent n 2-127 as fixint, 128-255 as uint8 and 256+ as
// uint16 (capture of 21 Oct 2026); it counts in a u32. A fixed uint16 sent
// the 65,536th command as n=0 and the server dropped the bot (24 Nov 2026).
test("command numbers use the smallest unsigned format and never wrap", () => {
    const numberBytes = n => {
        const body = buildCommandBody({n});
        const at = body.indexOf(0x6e, body.indexOf(0xa1)) + 1; // after the "n" key
        return {marker: body[at], decoded: decodeMsgpack(body).n};
    };
    for (const [n, marker] of [[1, 0x01], [127, 0x7f], [128, 0xcc], [255, 0xcc], [256, 0xcd],
        [65535, 0xcd], [65536, 0xce], [65537, 0xce], [4294967295, 0xce]]) {
        assert.deepEqual(numberBytes(n), {marker, decoded: n}, `n=${n}`);
    }
    const signed = buildSignedCommandPacket({n: 65536}, 12345);
    assert.equal(decodeMsgpack(signed.subarray(0, signed.length - 32)).n, 65536);
    for (const n of [-1, 1.5, 4294967296]) assert.throws(() => buildCommandBody({n}), RangeError, `n=${n}`);
});
