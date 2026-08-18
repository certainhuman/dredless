import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {WorldStore} from "../src/state/world/index.js";
import {decodeMsgpack, encodeMsgpack} from "../src/protocol/codec/msgpack.js";
import {
    buildBanPlayerMessage,
    buildDemoteSelfMessage,
    buildInviteResetMessage,
    buildKickPlayerMessage,
    buildPlayerListMessage,
    buildSetPlayerRankMessage,
    buildShipPrivacyMessage,
    buildStarterRecoveryMessage,
    normalizeCaptainSubrank,
    normalizePlayerRank,
    normalizePrivacy,
    normalizeShipConfig,
    normalizeShipPlayerList
} from "../src/protocol/outbound/ship-management.js";

function hex(value) {
    return Buffer.from(value).toString("hex");
}

function officialCaptureUrl(name) {
    return new URL(`./fixtures/${name}`, import.meta.url);
}

function replayOfficialCapture(name, onPacket = null) {
    const store = new WorldStore();
    const url = officialCaptureUrl(name);
    if (!fs.existsSync(url)) return null;
    const text = fs.readFileSync(url, "utf8");
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let event;
        try {
            event = JSON.parse(line);
        } catch (_) {
            continue;
        }
        if (event.event !== "official-ws-frame" || event.direction !== "in" || !event.data?.base64) continue;
        const packet = decodeMsgpack(Buffer.from(event.data.base64, "base64"));
        const update = store.apply(packet);
        if (onPacket) onPacket({store, packet, update, event});
    }
    return store;
}

test("buildShipPrivacyMessage matches official client privacy captures", () => {
    assert.deepEqual(buildShipPrivacyMessage("public"), {type: 4, act: "set_privacy", arg: 0});
    assert.deepEqual(buildShipPrivacyMessage("private"), {type: 4, act: "set_privacy", arg: 1});
    assert.equal(
        hex(encodeMsgpack(buildShipPrivacyMessage("public"))),
        "83a47479706504a3616374ab7365745f70726976616379a361726700",
        "change-ship-privacy-to-public.jsonl"
    );
    assert.equal(
        hex(encodeMsgpack(buildShipPrivacyMessage("private"))),
        "83a47479706504a3616374ab7365745f70726976616379a361726701",
        "change-ship-privacy-to-private.jsonl"
    );
});

test("buildStarterRecoveryMessage matches official client recovery captures", () => {
    assert.deepEqual(buildStarterRecoveryMessage(216), {type: 4, act: "starter_recovery", arg: 216});
    assert.equal(
        hex(encodeMsgpack(buildStarterRecoveryMessage(216))),
        "83a47479706504a3616374b0737461727465725f7265636f76657279a3617267ccd8",
        "reclaim-starter-helm.jsonl"
    );
});

test("buildPlayerListMessage matches official client ship-management captures", () => {
    assert.deepEqual(buildPlayerListMessage(), {type: 4, act: "player_list", arg: null});
    assert.equal(
        hex(encodeMsgpack(buildPlayerListMessage())),
        "83a47479706504a3616374ab706c617965725f6c697374a3617267c0",
        "open-manage-ship-menu.jsonl"
    );
});

test("buildInviteResetMessage matches official client invite reset capture", () => {
    assert.deepEqual(buildInviteResetMessage(), {type: 4, act: "invite_reset", arg: null});
    assert.equal(
        hex(encodeMsgpack(buildInviteResetMessage())),
        "83a47479706504a3616374ac696e766974655f7265736574a3617267c0",
        "reset-invite.jsonl"
    );
});


test("build crew-management messages match official client captures", () => {
    assert.deepEqual(buildSetPlayerRankMessage(10, "captain"), {type: 4, act: "set_rank", arg: 10, rank: 3});
    assert.deepEqual(buildSetPlayerRankMessage(10, "crew"), {type: 4, act: "set_rank", arg: 10, rank: 1});
    assert.deepEqual(buildSetPlayerRankMessage(10, "guest"), {type: 4, act: "set_rank", arg: 10, rank: 0});
    assert.deepEqual(buildKickPlayerMessage(10), {type: 4, act: "kick", arg: 10});
    assert.deepEqual(buildBanPlayerMessage(10), {type: 4, act: "ban", arg: 10});
    assert.deepEqual(buildDemoteSelfMessage(), {type: 4, act: "demote_self", arg: null});
    assert.equal(
        hex(encodeMsgpack(buildSetPlayerRankMessage(10, "captain"))),
        "84a47479706504a3616374a87365745f72616e6ba36172670aa472616e6b03",
        "promote-player-to-captain.jsonl"
    );
    assert.equal(
        hex(encodeMsgpack(buildSetPlayerRankMessage(10, "crew"))),
        "84a47479706504a3616374a87365745f72616e6ba36172670aa472616e6b01",
        "demote-player-to-crew.jsonl"
    );
    assert.equal(
        hex(encodeMsgpack(buildSetPlayerRankMessage(10, "guest"))),
        "84a47479706504a3616374a87365745f72616e6ba36172670aa472616e6b00",
        "demote-player-to-guest.jsonl"
    );
    assert.equal(hex(encodeMsgpack(buildKickPlayerMessage(10))), "83a47479706504a3616374a46b69636ba36172670a", "kick-player.jsonl");
    assert.equal(hex(encodeMsgpack(buildBanPlayerMessage(10))), "83a47479706504a3616374a362616ea36172670a", "ban-player.jsonl");
    assert.equal(hex(encodeMsgpack(buildDemoteSelfMessage())), "83a47479706504a3616374ab64656d6f74655f73656c66a3617267c0", "demote-self.jsonl");
});

test("ship lockdown countdown is decoded from official model metadata capture", (t) => {
    const values = [];
    const store = replayOfficialCapture("ship-management-lockdown-countdown.jsonl", ({store}) => {
        const value = store.shipWorld()?.model.shipMetadata()?.lockdownCountdownSeconds;
        if (value != null && values.at(-1) !== value) values.push(value);
    });
    if (!store) {
        t.skip("test/fixtures/ship-management-lockdown-countdown.jsonl is not present");
        return;
    }

    assert.deepEqual(values, [30, 29, 28, 27, 26, 25]);
    const shipWorld = store.shipWorld().snapshot();
    assert.equal(shipWorld.shipMetadata.name, "Corvera");
    assert.equal(shipWorld.shipMetadata.width, 34);
    assert.equal(shipWorld.shipMetadata.height, 25);
    assert.equal(shipWorld.shipMetadata.lockdownTimerSeconds, 25);
    assert.equal(shipWorld.shipMetadata.lockdownCountdownSeconds, 25);
    assert.equal(shipWorld.shipMetadata.onlineShipOwnerCount, 1);
    assert.equal(shipWorld.shipMetadata.requiredShipOwnerCount, 1);
    assert.equal(shipWorld.shipMetadata.allShipOwnersOnline, true);
    assert.equal(shipWorld.shipMetadata.lockdownEngaged, true);
});

test("ship lockdown metadata decodes owner counts from official captures", (t) => {
    const ownerOffline = replayOfficialCapture("ship-management-owner-offline.jsonl");
    const oneOfTwoOnline = replayOfficialCapture("ship-management-co-owner-count.jsonl");
    if (!ownerOffline || !oneOfTwoOnline) {
        t.skip("official owner-lockdown captures are not present");
        return;
    }

    const offlineMetadata = ownerOffline.shipWorld().snapshot().shipMetadata;
    assert.equal(offlineMetadata.lockdownTimerSeconds, 30);
    assert.equal(offlineMetadata.requiredShipOwnerCount, 1);
    assert.equal(offlineMetadata.onlineShipOwnerCount, null);
    assert.equal(offlineMetadata.allShipOwnersOnline, null);
    assert.equal(offlineMetadata.width, 11);
    assert.equal(offlineMetadata.height, 8);

    const partialMetadata = oneOfTwoOnline.shipWorld().snapshot().shipMetadata;
    assert.equal(partialMetadata.lockdownTimerSeconds, 30);
    assert.equal(partialMetadata.requiredShipOwnerCount, 2);
    assert.equal(partialMetadata.onlineShipOwnerCount, 1);
    assert.equal(partialMetadata.allShipOwnersOnline, false);
    assert.equal(partialMetadata.width, 11);
    assert.equal(partialMetadata.height, 8);
});

test("normalizePrivacy accepts public API aliases", () => {
    assert.equal(normalizePrivacy("public"), 0);
    assert.equal(normalizePrivacy(false), 0);
    assert.equal(normalizePrivacy(0), 0);
    assert.equal(normalizePrivacy("private"), 1);
    assert.equal(normalizePrivacy(true), 1);
    assert.equal(normalizePrivacy(1), 1);
    assert.throws(() => normalizePrivacy("friends"), /privacy/);
});

test("normalizePlayerRank accepts observed public API aliases", () => {
    assert.equal(normalizePlayerRank("guest"), 0);
    assert.equal(normalizePlayerRank("crew"), 1);
    assert.equal(normalizePlayerRank("captain"), 3);
    assert.equal(normalizePlayerRank(0), 0);
    assert.equal(normalizePlayerRank(1), 1);
    assert.equal(normalizePlayerRank(3), 3);
    assert.throws(() => normalizePlayerRank("banned"), /rank/);
});


test("normalizeShipPlayerList treats captain_rank zero as non-captain", () => {
    const event = normalizeShipPlayerList({
        type: "player_list",
        player_list: [
            {
                ref_id: 1,
                discrim: "#Owner",
                team_rank: 3,
                captain_rank: 1,
                items: [],
                alias_discrims: [],
                online_count: 1
            },
            {
                ref_id: 10,
                discrim: "#Crew",
                team_rank: 1,
                captain_rank: 0,
                items: [],
                alias_discrims: [],
                online_count: 1
            },
            {
                ref_id: 11,
                discrim: "#Guest",
                team_rank: 0,
                captain_rank: 0,
                items: [],
                alias_discrims: [],
                online_count: 0
            }
        ]
    });
    assert.equal(event.ownerCaptainRank, 1);
    assert.deepEqual(event.shipOwners.map((player) => player.refId), [1]);
    assert.equal(event.players[1].isCaptain, false);
    assert.equal(event.players[1].isShipOwner, false);
    assert.equal(event.players[2].isCaptain, false);
    assert.equal(event.players[2].isShipOwner, false);
});

test("normalizeShipPlayerList merges player_list deltas into previous state", () => {
    const initial = normalizeShipPlayerList({
        type: "player_list",
        player_list: [
            {
                ref_id: 1,
                discrim: "#Jf01WW",
                team_rank: 3,
                captain_rank: 1,
                time: 60234,
                items: [],
                alias_discrims: [["#OGP12v", 7288814]],
                online_count: 1
            },
            {ref_id: 9, _removed: true},
            {
                ref_id: 10,
                discrim: "#OGP12v",
                team_rank: 1,
                captain_rank: 0,
                time: 1664,
                items: [],
                alias_discrims: [["#Jf01WW", 15909921]],
                online_count: 0
            },
            {
                ref_id: 11,
                discrim: "Nemo",
                team_rank: 0,
                captain_rank: 0,
                time: 23,
                items: [],
                alias_discrims: [],
                online_count: 0
            }
        ]
    });
    const updated = normalizeShipPlayerList({
        type: "player_list",
        player_list: [
            {
                ref_id: 1,
                discrim: "#Jf01WW",
                team_rank: 3,
                captain_rank: 1,
                time: 60276,
                items: [],
                alias_discrims: [["#OGP12v", 7288814], ["#uSWhVm", 9372709]],
                online_count: 1
            },
            {ref_id: 9, _removed: true},
            {
                ref_id: 12,
                discrim: "#uSWhVm",
                team_rank: 1,
                captain_rank: 0,
                time: 8,
                items: [],
                alias_discrims: [["#Jf01WW", 15909921], ["#OGP12v", 7288814]],
                online_count: 1
            }
        ]
    }, initial);

    assert.deepEqual(updated.players.map((player) => player.refId), [1, 12, 10, 11]);
    assert.deepEqual(updated.changes.map((player) => player.refId), [1, 12]);
    assert.deepEqual(updated.removedPlayers, [9]);
    assert.equal("removed" in updated.players[0], false);
    assert.equal("removed" in updated.changes[0], false);
    assert.equal(updated.players.find((player) => player.refId === 10)?.discrim, "#OGP12v");
    assert.equal(updated.players.find((player) => player.refId === 11)?.discrim, "Nemo");
});

test("ship-management session submessages normalize public response shapes", () => {
    assert.deepEqual(normalizeShipConfig({
        config: {privacy: 1, invite_key: "9L0w0DNi9FEyN2kIeHI_1y3m"},
        team_id: 2872,
        patron_perks: ["x"]
    }), {
        privacy: 1,
        privacyName: "private",
        inviteKey: "9L0w0DNi9FEyN2kIeHI_1y3m",
        teamId: 2872,
        patronPerks: ["x"]
    });
    assert.deepEqual(normalizeCaptainSubrank({
        subrank: 1,
        enable_cheats: true
    }), {
        subrank: 1,
        enableCheats: true
    });
    const playerList = normalizeShipPlayerList({
        type: "player_list",
        player_list: [
            {
                discrim: "#Jf01WW",
                discrim_color: 15909921,
                team_rank: 3,
                captain_rank: 2,
                time: 39590,
                items: [],
                ref_id: 1,
                alias_discrims: [["#Alias", 123]],
                extra_aliases: 2,
                online_count: 1
            },
            {
                discrim: "#Other",
                discrim_color: 1,
                team_rank: 3,
                captain_rank: 3,
                time: 12,
                items: [],
                ref_id: 2,
                alias_discrims: [],
                extra_aliases: null,
                online_count: 1
            },
            {ref_id: 7, _removed: true}
        ]
    });
    assert.equal(playerList.ownerCaptainRank, 2);
    assert.deepEqual(playerList.shipOwners.map((player) => player.refId), [1]);
    assert.deepEqual(playerList.players.map((player) => player.refId), [1, 2]);
    assert.deepEqual(playerList.changes.map((player) => player.refId), [1, 2]);
    assert.deepEqual(playerList.removedPlayers, [7]);
    assert.equal(playerList.players[0].isShipOwner, true);
    assert.equal(playerList.players[1].isShipOwner, false);
    assert.deepEqual(playerList.players[0].aliasDiscrims, [["#Alias", 123]]);
    assert.equal(playerList.players[0].extraAliasCount, 2);
    assert.equal(playerList.players[1].extraAliasCount, 0);
});

test("normalizeShipPlayerList marks entries manageable by current captain rank", () => {
    const playerList = normalizeShipPlayerList({
        type: "player_list",
        player_list: [
            {
                ref_id: 1,
                discrim: "#Owner",
                team_rank: 3,
                captain_rank: 1,
                items: [],
                alias_discrims: [],
                online_count: 1
            },
            {
                ref_id: 2,
                discrim: "#Same",
                team_rank: 3,
                captain_rank: 2,
                items: [],
                alias_discrims: [],
                online_count: 1
            },
            {
                ref_id: 3,
                discrim: "#Lower",
                team_rank: 3,
                captain_rank: 3,
                items: [],
                alias_discrims: [],
                online_count: 1
            },
            {
                ref_id: 4,
                discrim: "#Crew",
                team_rank: 1,
                captain_rank: 0,
                items: [],
                alias_discrims: [],
                online_count: 1
            },
            {
                ref_id: 5,
                discrim: "#Guest",
                team_rank: 0,
                captain_rank: 0,
                items: [],
                alias_discrims: [],
                online_count: 1
            },
            {ref_id: 6, _removed: true}
        ]
    }, null, {subrank: 2});

    assert.deepEqual(playerList.players.map((player) => [player.refId, player.canBeManaged]), [
        [1, false],
        [2, false],
        [3, true],
        [4, true],
        [5, true]
    ]);
    assert.deepEqual(playerList.changes.map((player) => [player.refId, player.canBeManaged]), [
        [1, false],
        [2, false],
        [3, true],
        [4, true],
        [5, true]
    ]);
    assert.deepEqual(playerList.removedPlayers, [6]);

    const noCaptain = normalizeShipPlayerList({
        type: "player_list",
        player_list: [
            {ref_id: 4, discrim: "#Crew", team_rank: 1, captain_rank: 0, items: [], alias_discrims: [], online_count: 1}
        ]
    });
    assert.equal(noCaptain.players[0].canBeManaged, false);
});
