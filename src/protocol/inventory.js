import {itemNameFromId} from "../game/items.js";

export const EquipmentSlot = Object.freeze({
    Head: "head",
    Face: "face",
    Body: "body",
    Back: "back",
    Hands: "hands",
    Feet: "feet"
});

const EQUIPMENT_SLOT_INDEXES = Object.freeze({
    [EquipmentSlot.Head]: 16,
    [EquipmentSlot.Face]: 17,
    [EquipmentSlot.Body]: 18,
    [EquipmentSlot.Back]: 19,
    [EquipmentSlot.Hands]: 20,
    [EquipmentSlot.Feet]: 21
});

const EQUIPMENT_SLOT_NAMES = new Map([
    [16, EquipmentSlot.Head],
    [17, EquipmentSlot.Face],
    [18, EquipmentSlot.Body],
    [19, EquipmentSlot.Back],
    [20, EquipmentSlot.Hands],
    [21, EquipmentSlot.Feet]
]);

const EQUIPMENT_SLOT_VALUES = new Map([
    [EquipmentSlot.Head, 16],
    [EquipmentSlot.Face, 17],
    [EquipmentSlot.Body, 18],
    [EquipmentSlot.Back, 19],
    [EquipmentSlot.Hands, 20],
    [EquipmentSlot.Feet, 21]
]);

function normalizeEquipmentSlot(slot) {
    const normalized = EQUIPMENT_SLOT_VALUES.get(slot);
    if (!EQUIPMENT_SLOT_NAMES.has(normalized)) {
        throw new RangeError(`equipment slot must be an EquipmentSlot value`);
    }
    return normalized;
}

function equipmentSlotName(slot) {
    return EQUIPMENT_SLOT_NAMES.get(Number(slot)) ?? null;
}

function buildInventoryDragCommand(source, target, split = false) {
    return {
        drag: {
            source: normalizeInventoryIndex(source, "source"),
            target: normalizeInventoryIndex(target, "target"),
            split: Boolean(split)
        }
    };
}

function buildEquipItemCommand(source, slot, split = false) {
    return buildInventoryDragCommand(source, normalizeEquipmentSlot(slot), split);
}

function buildUnequipItemCommand(slot, target = 0, split = false) {
    return buildInventoryDragCommand(normalizeEquipmentSlot(slot), target, split);
}

function normalizeInventoryEvent(event) {
    const items = Array.isArray(event?.items) ? event.items : [];
    const counts = Array.isArray(event?.item_counts) ? event.item_counts : [];
    const rawHotbarSize = Number(event?.general_slots ?? 0);
    const hotbarSize = Number.isFinite(rawHotbarSize) && rawHotbarSize > 0 ? Math.trunc(rawHotbarSize) : 0;

    const slotSnapshot = (index, kind) => {
        const count = normalizeCount(counts[index]);
        const itemId = normalizeItemId(items[index], count);
        return {
            index,
            itemId,
            itemName: itemNameFromId(itemId),
            count,
            kind,
            equipmentSlot: equipmentSlotName(index),
            empty: itemId == null || count <= 0
        };
    };

    const slotsByIndex = new Map();
    for (let index = 0; index < hotbarSize; index++) {
        slotsByIndex.set(index, slotSnapshot(index, "hotbar"));
    }
    slotsByIndex.set(EQUIPMENT_SLOT_INDEXES.head, slotSnapshot(EQUIPMENT_SLOT_INDEXES.head, "equipment"));
    slotsByIndex.set(EQUIPMENT_SLOT_INDEXES.face, slotSnapshot(EQUIPMENT_SLOT_INDEXES.face, "equipment"));
    slotsByIndex.set(EQUIPMENT_SLOT_INDEXES.body, slotSnapshot(EQUIPMENT_SLOT_INDEXES.body, "equipment"));
    slotsByIndex.set(EQUIPMENT_SLOT_INDEXES.back, slotSnapshot(EQUIPMENT_SLOT_INDEXES.back, "equipment"));
    slotsByIndex.set(EQUIPMENT_SLOT_INDEXES.hands, slotSnapshot(EQUIPMENT_SLOT_INDEXES.hands, "equipment"));
    slotsByIndex.set(EQUIPMENT_SLOT_INDEXES.feet, slotSnapshot(EQUIPMENT_SLOT_INDEXES.feet, "equipment"));

    const slots = [...slotsByIndex.values()].sort((a, b) => a.index - b.index);
    const hotbar = slots.filter((slot) => slot.kind === "hotbar");
    const equipment = {
        head: slotsByIndex.get(EQUIPMENT_SLOT_INDEXES.head),
        face: slotsByIndex.get(EQUIPMENT_SLOT_INDEXES.face),
        body: slotsByIndex.get(EQUIPMENT_SLOT_INDEXES.body),
        back: slotsByIndex.get(EQUIPMENT_SLOT_INDEXES.back),
        hands: slotsByIndex.get(EQUIPMENT_SLOT_INDEXES.hands),
        feet: slotsByIndex.get(EQUIPMENT_SLOT_INDEXES.feet)
    };

    return {
        type: "inventory",
        filter: event?.filter,
        hotbarSize,
        slots,
        hotbar,
        equipment
    };
}

function normalizeInventoryIndex(value, name) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) throw new RangeError(`${name} must be a non-negative integer inventory slot`);
    return number;
}

function normalizeCount(value) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
}

function normalizeItemId(value, count) {
    if (value == null) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return number === 0 && count === 0 ? null : number;
}

export {
    EQUIPMENT_SLOT_INDEXES,
    buildEquipItemCommand,
    buildInventoryDragCommand,
    buildUnequipItemCommand,
    equipmentSlotName,
    normalizeEquipmentSlot,
    normalizeInventoryEvent
};
