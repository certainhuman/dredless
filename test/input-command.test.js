import assert from "node:assert/strict";
import test from "node:test";

import {buildCommandDefaults} from "../src/protocol/outbound/commands.js";

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
