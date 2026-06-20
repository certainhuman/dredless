import assert from "node:assert/strict";
import test from "node:test";

import { buildCommandDefaults } from "../src/protocol/commands.js";
import {
  buildEquipItemCommand,
  buildInventoryDragCommand,
  buildUnequipItemCommand,
  equipmentSlotName,
  normalizeEquipmentSlot,
  normalizeInventoryEvent
} from "../src/protocol/inventory.js";

test("equipment drag commands match official client captures", () => {
  assert.deepEqual(buildEquipItemCommand(0, "back"), {
    drag: { source: 0, target: 19, split: false }
  });
  assert.deepEqual(buildEquipItemCommand(0, "hands"), {
    drag: { source: 0, target: 20, split: false }
  });
  assert.deepEqual(buildEquipItemCommand(0, "feet"), {
    drag: { source: 0, target: 21, split: false }
  });
  assert.deepEqual(buildUnequipItemCommand("hands", 0), {
    drag: { source: 20, target: 0, split: false }
  });
});

test("inventory drag commands are signed input command payload fields", () => {
  const command = buildCommandDefaults(buildInventoryDragCommand(0, 21));

  assert.equal(command.type, 0);
  assert.deepEqual(command.drag, { source: 0, target: 21, split: false });
  assert.equal(command.act1, false);
  assert.equal(command.act2, false);
});

test("equipment slot aliases normalize to absolute inventory slot indexes", () => {
  assert.equal(normalizeEquipmentSlot("back"), 19);
  assert.equal(normalizeEquipmentSlot("hand"), 20);
  assert.equal(normalizeEquipmentSlot("hands"), 20);
  assert.equal(normalizeEquipmentSlot("foot"), 21);
  assert.equal(normalizeEquipmentSlot("feet"), 21);
  assert.equal(equipmentSlotName(19), "back");
  assert.equal(equipmentSlotName(20), "hands");
  assert.equal(equipmentSlotName(21), "feet");
  assert.throws(() => normalizeEquipmentSlot("head"), /equipment slot/);
});

test("normalizeInventoryEvent exposes equipment and hides empty 0/0 slots", () => {
  const inventory = normalizeInventoryEvent({
    type: "inventory",
    filter: 100011240,
    general_slots: 5,
    items: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0, 112, 0],
    item_counts: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0, 1, 0]
  });

  assert.equal(inventory.hotbar.length, 5);
  assert.equal(inventory.hotbar[0].itemId, null);
  assert.equal(inventory.equipment.back?.itemId, null);
  assert.equal(inventory.equipment.hands?.itemId, 112);
  assert.equal(inventory.equipment.hands?.count, 1);
  assert.equal(inventory.equipment.hands?.equipmentSlot, "hands");
  assert.equal(inventory.equipment.feet?.itemId, null);
});
