import assert from "node:assert/strict";
import test from "node:test";

import {DredlessClient} from "../src/client/index.js";
import {Connection} from "../src/network/connection.js";
import {buildCommandDefaults} from "../src/protocol/outbound/commands.js";
import {
    buildEquipItemCommand,
    buildInventoryDragCommand,
    buildUnequipItemCommand,
    EquipmentSlot,
    equipmentSlotName,
    normalizeEquipmentSlot,
    normalizeInventoryEvent
} from "../src/protocol/outbound/inventory.js";

function sampleInventory() {
    return normalizeInventoryEvent({
        type: "inventory",
        filter: 100011240,
        general_slots: 5,
        items: [0, 109, null, null, null, null, 1, null, null, null, null, null, null, null, null, null, 313, 320, null, 0, 112, 0],
        item_counts: [0, 1, null, null, null, null, 4, null, null, null, null, null, null, null, null, null, 1, 1, null, 0, 1, 0]
    });
}

function createInventoryClient() {
    const session = {
        baseUrl: "https://drednot.io",
        cookies: new Map(),
        toJSON() {
            return {test: true};
        }
    };
    const client = new DredlessClient(new Connection(session, "token", 1, 0, {domain: "localhost"}), {connect: false});
    const sent = [];
    client.inventoryState = sampleInventory();
    client.send = (command = {}) => {
        sent.push(command);
        return client;
    };
    return {client, sent};
}

test("client starts with an empty normalized inventory", () => {
    const session = {
        baseUrl: "https://drednot.io",
        cookies: new Map(),
        toJSON() {
            return {test: true};
        }
    };
    const client = new DredlessClient(new Connection(session, "token", 1, 0, {domain: "localhost"}), {connect: false});
    const inventory = client.inventory.state();

    assert.equal(inventory.type, "inventory");
    assert.equal(inventory.hotbarSize, 5);
    assert.equal(inventory.hotbar.length, 5);
    assert.equal(inventory.slots.length, 11);
    assert.equal(inventory.equipment.head.empty, true);
    assert.equal(inventory.equipment.feet.empty, true);
});

test("equipment drag commands match official client captures", () => {
    assert.deepEqual(buildEquipItemCommand(0, "head"), {
        drag: {source: 0, target: 16, split: false}
    });
    assert.deepEqual(buildEquipItemCommand(1, "face"), {
        drag: {source: 1, target: 17, split: false}
    });
    assert.deepEqual(buildEquipItemCommand(0, "back"), {
        drag: {source: 0, target: 19, split: false}
    });
    assert.deepEqual(buildEquipItemCommand(0, "hands"), {
        drag: {source: 0, target: 20, split: false}
    });
    assert.deepEqual(buildEquipItemCommand(0, "feet"), {
        drag: {source: 0, target: 21, split: false}
    });
    assert.deepEqual(buildUnequipItemCommand("hands", 0), {
        drag: {source: 20, target: 0, split: false}
    });
});

test("inventory drag commands are signed input command payload fields", () => {
    const command = buildCommandDefaults(buildInventoryDragCommand(0, 21));

    assert.equal(command.type, 0);
    assert.deepEqual(command.drag, {source: 0, target: 21, split: false});
    assert.equal(command.act1, false);
    assert.equal(command.act2, false);
});

test("EquipmentSlot enum values normalize to absolute inventory slot indexes", () => {
    assert.equal(normalizeEquipmentSlot(EquipmentSlot.Head), 16);
    assert.equal(normalizeEquipmentSlot(EquipmentSlot.Face), 17);
    assert.equal(normalizeEquipmentSlot(EquipmentSlot.Body), 18);
    assert.equal(normalizeEquipmentSlot(EquipmentSlot.Back), 19);
    assert.equal(normalizeEquipmentSlot(EquipmentSlot.Hands), 20);
    assert.equal(normalizeEquipmentSlot(EquipmentSlot.Feet), 21);
    assert.equal(equipmentSlotName(16), EquipmentSlot.Head);
    assert.equal(equipmentSlotName(17), EquipmentSlot.Face);
    assert.equal(equipmentSlotName(18), EquipmentSlot.Body);
    assert.equal(equipmentSlotName(19), EquipmentSlot.Back);
    assert.equal(equipmentSlotName(20), EquipmentSlot.Hands);
    assert.equal(equipmentSlotName(21), EquipmentSlot.Feet);
    assert.throws(() => normalizeEquipmentSlot(16), /EquipmentSlot/);
    assert.throws(() => normalizeEquipmentSlot("hat"), /EquipmentSlot/);
    assert.throws(() => normalizeEquipmentSlot("neck"), /EquipmentSlot/);
});

test("normalizeInventoryEvent exposes normalized slots without raw protocol arrays", () => {
    const inventory = sampleInventory();

    assert.equal(inventory.type, "inventory");
    assert.equal(inventory.filter, 100011240);
    assert.equal(inventory.hotbarSize, 5);
    assert.equal(inventory.hotbar.length, 5);
    assert.equal(inventory.slots[0].itemId, null);
    assert.equal(inventory.slots[0].itemName, null);
    assert.equal(inventory.slots[0].empty, true);
    assert.equal(inventory.slots[1].itemId, 109);
    assert.equal(inventory.slots[1].itemName, "Speed Skates");
    assert.deepEqual(inventory.slots.map((slot) => slot.index), [0, 1, 2, 3, 4, 16, 17, 18, 19, 20, 21]);
    assert.equal(inventory.equipment.head.itemId, 313);
    assert.equal(inventory.equipment.head.itemName, "Lesser Cap");
    assert.equal(inventory.equipment.head.equipmentSlot, "head");
    assert.equal(inventory.equipment.face.itemId, 320);
    assert.equal(inventory.equipment.face.itemName, "Goblin Mask");
    assert.equal(inventory.equipment.face.equipmentSlot, "face");
    assert.equal(inventory.equipment.body.itemId, null);
    assert.equal(inventory.equipment.body.equipmentSlot, "body");
    assert.equal(inventory.equipment.back.itemId, null);
    assert.equal(inventory.equipment.hands.itemId, 112);
    assert.equal(inventory.equipment.hands.itemName, "Construction Gauntlets");
    assert.equal(inventory.equipment.hands.count, 1);
    assert.equal(inventory.equipment.hands.equipmentSlot, "hands");
    assert.equal(inventory.equipment.feet.empty, true);
    assert.equal("items" in inventory, false);
    assert.equal("item_counts" in inventory, false);
    assert.equal("general_slots" in inventory, false);
    assert.equal("storage" in inventory, false);
});

test("inventory domain exposes slot handles and find helpers", () => {
    const {client} = createInventoryClient();
    const inventory = client.inventory;

    assert.equal(inventory.state(), client.inventoryState);
    assert.equal(inventory.hotbarSize(), 5);
    assert.equal(inventory.allSlots().length, 11);
    assert.equal(inventory.hotbarSlots().length, 5);
    assert.equal(inventory.equipmentSlots().head.index, 16);
    assert.equal(inventory.equipmentSlots().face.index, 17);
    assert.equal(inventory.equipmentSlots().body.index, 18);
    assert.equal(inventory.equipmentSlots().hands.index, 20);

    const skates = inventory.slot(1);
    assert.equal(skates.exists(), true);
    assert.equal(skates.kind, "hotbar");
    assert.equal(skates.itemId, 109);
    assert.equal(skates.itemName, "Speed Skates");
    assert.equal(skates.empty, false);
    assert.deepEqual(skates.snapshot(), client.inventoryState.hotbar[1]);
    assert.equal(Object.isFrozen(skates.snapshot()), true);

    assert.equal(inventory.slot("hands").itemId, 112);
    assert.equal(inventory.findItem(109).index, 1);
    assert.equal(inventory.slot(6).exists(), false);
    assert.throws(() => inventory.findItems(1, {area: "storage"}), /Unknown inventory area/);
    assert.equal(inventory.findItem(313, {area: "equipment"}).index, 16);
    assert.equal(inventory.findItem(320, {area: "equipment"}).index, 17);
    assert.equal(inventory.findItem(112, {area: "equipment"}).index, 20);
    assert.equal(inventory.firstEmpty({area: "hotbar"}).index, 0);
    assert.throws(() => inventory.findItems(1, {area: "invalid"}), /Unknown inventory area/);
});

test("inventory slot refs send expected movement, equipment, and selection commands", () => {
    const {client, sent} = createInventoryClient();
    const inventory = client.inventory;

    inventory.move(0, 4);
    inventory.move(inventory.slot(1), inventory.slot(2).snapshot(), {split: true});
    inventory.equip(0, "head");
    inventory.equip(1, "face");
    inventory.equip(0, "feet");
    inventory.unequip("hands", 0);
    inventory.slot(1).moveTo("back");
    inventory.slot(1).equip("hands");
    inventory.slot("hands").unequip(3);
    inventory.slot(1).equip();
    inventory.slot(1).equip({split: true});
    inventory.select(inventory.slot(1));
    inventory.slot(6).select();
    client.player.selectSlot(2);

    assert.deepEqual(sent.map((command) => command.drag), [
        {source: 0, target: 4, split: false},
        {source: 1, target: 2, split: true},
        {source: 0, target: 16, split: false},
        {source: 1, target: 17, split: false},
        {source: 0, target: 21, split: false},
        {source: 20, target: 0, split: false},
        {source: 1, target: 19, split: false},
        {source: 1, target: 20, split: false},
        {source: 20, target: 3, split: false},
        {source: 1, target: 21, split: false},
        {source: 1, target: 21, split: true},
        undefined,
        undefined,
        undefined
    ]);
    assert.deepEqual(sent.slice(-3).map((command) => command.inv_slot), [1, 6, 2]);
    assert.throws(() => inventory.slot(1).unequip(0), /not an equipment slot/);
    assert.throws(() => inventory.slot(0).equip(), /empty/);
});
