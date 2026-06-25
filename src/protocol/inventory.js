import { itemNameFromId } from "../game/items.js";

const EQUIPMENT_SLOT_INDEXES = Object.freeze({
  head: 16,
  face: 17,
  back: 19,
  hands: 20,
  feet: 21
});

const EQUIPMENT_SLOT_NAMES = new Map([
  [16, "head"],
  [17, "face"],
  [19, "back"],
  [20, "hands"],
  [21, "feet"]
]);

const EQUIPMENT_SLOT_VALUES = new Map([
  ["head", 16],
  ["hat", 16],
  ["face", 17],
  ["mask", 17],
  ["back", 19],
  ["hand", 20],
  ["hands", 20],
  ["feet", 21],
  ["foot", 21]
]);

function normalizeEquipmentSlot(slot) {
  const normalized = typeof slot === "string" ? EQUIPMENT_SLOT_VALUES.get(slot) : Number(slot);
  if (!EQUIPMENT_SLOT_NAMES.has(normalized)) {
    throw new RangeError(`equipment slot must be "head", "face", "back", "hands", "feet", 16, 17, 19, 20, or 21`);
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
  slotsByIndex.set(EQUIPMENT_SLOT_INDEXES.back, slotSnapshot(EQUIPMENT_SLOT_INDEXES.back, "equipment"));
  slotsByIndex.set(EQUIPMENT_SLOT_INDEXES.hands, slotSnapshot(EQUIPMENT_SLOT_INDEXES.hands, "equipment"));
  slotsByIndex.set(EQUIPMENT_SLOT_INDEXES.feet, slotSnapshot(EQUIPMENT_SLOT_INDEXES.feet, "equipment"));

  const slots = [...slotsByIndex.values()].sort((a, b) => a.index - b.index);
  const hotbar = slots.filter((slot) => slot.kind === "hotbar");
  const equipment = {
    head: slotsByIndex.get(EQUIPMENT_SLOT_INDEXES.head),
    face: slotsByIndex.get(EQUIPMENT_SLOT_INDEXES.face),
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
