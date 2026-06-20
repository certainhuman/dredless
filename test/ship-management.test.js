import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { WorldStore } from "../src/game/world.js";
import { decodeMsgpack, encodeMsgpack } from "../src/protocol/msgpack.js";
import {
  buildPlayerListMessage,
  buildShipPrivacyMessage,
  buildStarterRecoveryMessage,
  normalizeCaptainSubrankEvent,
  normalizePlayerListEvent,
  normalizePrivacy,
  normalizeShipConfigEvent
} from "../src/protocol/ship-management.js";

function hex(value) {
  return Buffer.from(value).toString("hex");
}

function officialCaptureUrl(name) {
  return new URL(`../captures/official-client/${name}`, import.meta.url);
}

function replayOfficialCapture(name, onPacket = null) {
  const store = new WorldStore();
  const url = officialCaptureUrl(name);
  if (!fs.existsSync(url)) return null;
  const text = fs.readFileSync(url, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch (_) { continue; }
    if (event.event !== "official-ws-frame" || event.direction !== "in" || !event.data?.base64) continue;
    const packet = decodeMsgpack(Buffer.from(event.data.base64, "base64"));
    const update = store.apply(packet);
    if (onPacket) onPacket({ store, packet, update, event });
  }
  return store;
}

test("buildShipPrivacyMessage matches official client privacy captures", () => {
  assert.deepEqual(buildShipPrivacyMessage("public"), { type: 4, act: "set_privacy", arg: 0 });
  assert.deepEqual(buildShipPrivacyMessage("private"), { type: 4, act: "set_privacy", arg: 1 });
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
  assert.deepEqual(buildStarterRecoveryMessage(216), { type: 4, act: "starter_recovery", arg: 216 });
  assert.equal(
    hex(encodeMsgpack(buildStarterRecoveryMessage(216))),
    "83a47479706504a3616374b0737461727465725f7265636f76657279a3617267ccd8",
    "reclaim-starter-helm.jsonl"
  );
});

test("buildPlayerListMessage matches official client ship-management captures", () => {
  assert.deepEqual(buildPlayerListMessage(), { type: 4, act: "player_list", arg: null });
  assert.equal(
    hex(encodeMsgpack(buildPlayerListMessage())),
    "83a47479706504a3616374ab706c617965725f6c697374a3617267c0",
    "open-manage-ship-menu.jsonl"
  );
});

test("ship lockdown countdown is decoded from official model metadata capture", (t) => {
  const values = [];
  const store = replayOfficialCapture("lockdown-counting-down-to-25.jsonl", ({ store }) => {
    const value = store.shipWorld()?.model.shipMetadata()?.lockdownCountdownSeconds;
    if (value != null && values.at(-1) !== value) values.push(value);
  });
  if (!store) {
    t.skip("captures/official-client/lockdown-counting-down-to-25.jsonl is not present");
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
  const ownerOffline = replayOfficialCapture("joining-ship-with-owner-offline.jsonl");
  const oneOfTwoOnline = replayOfficialCapture("joining-ship-with-1-of-2-co-owners-online.jsonl");
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

test("ship-management session submessages normalize public response shapes", () => {
  assert.deepEqual(normalizeShipConfigEvent({
    type: "config",
    config: { privacy: 1, invite_key: "abc" },
    team_id: 2872,
    patron_perks: ["x"]
  }), {
    type: "config",
    privacy: 1,
    privacyName: "private",
    inviteKey: "abc",
    teamId: 2872,
    patronPerks: ["x"]
  });
  assert.deepEqual(normalizeCaptainSubrankEvent({
    type: "captain_subrank",
    subrank: 1,
    enable_cheats: true
  }), {
    type: "captain_subrank",
    subrank: 1,
    enableCheats: true
  });
  assert.deepEqual(normalizePlayerListEvent({
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
        alias_discrims: [],
        extra_aliases: null,
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
      { ref_id: 7, _removed: true }
    ]
  }), {
    type: "player_list",
    ownerCaptainRank: 2,
    shipOwners: [
      {
        refId: 1,
        removed: false,
        discrim: "#Jf01WW",
        discrimColor: 15909921,
        teamRank: 3,
        captainRank: 2,
        isCaptain: true,
        isShipOwner: true,
        time: 39590,
        items: [],
        aliasDiscrims: [],
        extraAliases: null,
        onlineCount: 1
      }
    ],
    players: [
      {
        refId: 1,
        removed: false,
        discrim: "#Jf01WW",
        discrimColor: 15909921,
        teamRank: 3,
        captainRank: 2,
        isCaptain: true,
        isShipOwner: true,
        time: 39590,
        items: [],
        aliasDiscrims: [],
        extraAliases: null,
        onlineCount: 1
      },
      {
        refId: 2,
        removed: false,
        discrim: "#Other",
        discrimColor: 1,
        teamRank: 3,
        captainRank: 3,
        isCaptain: true,
        isShipOwner: false,
        time: 12,
        items: [],
        aliasDiscrims: [],
        extraAliases: null,
        onlineCount: 1
      },
      {
        refId: 7,
        removed: true,
        discrim: null,
        discrimColor: null,
        teamRank: null,
        captainRank: null,
        isCaptain: false,
        isShipOwner: false,
        time: null,
        items: [],
        aliasDiscrims: [],
        extraAliases: null,
        onlineCount: null
      }
    ]
  });
});
