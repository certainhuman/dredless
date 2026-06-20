const EQUIPMENT_SLOT_INDEXES = Object.freeze({
  back: 19,
  hands: 20,
  feet: 21
});

const EQUIPMENT_SLOT_NAMES = new Map([
  [19, "back"],
  [20, "hands"],
  [21, "feet"]
]);

const EQUIPMENT_SLOT_VALUES = new Map([
  ["back", 19],
  ["hand", 20],
  ["hands", 20],
  ["feet", 21],
  ["foot", 21]
]);

function normalizeEquipmentSlot(slot) {
  const normalized = typeof slot === "string" ? EQUIPMENT_SLOT_VALUES.get(slot) : Number(slot);
  if (!EQUIPMENT_SLOT_NAMES.has(normalized)) {
    throw new RangeError(`equipment slot must be "back", "hands", "feet", 19, 20, or 21`);
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
  const generalSlots = Number(event?.general_slots ?? 0);
  const length = Math.max(items.length, counts.length, generalSlots, EQUIPMENT_SLOT_INDEXES.feet + 1);
  const slots = [];
  for (let index = 0; index < length; index++) {
    const count = normalizeCount(counts[index]);
    slots.push({
      index,
      itemId: normalizeItemId(items[index], count),
      count,
      kind: EQUIPMENT_SLOT_NAMES.has(index) ? "equipment" : index < generalSlots ? "hotbar" : "inventory",
      equipmentSlot: equipmentSlotName(index)
    });
  }
  return {
    ...event,
    general_slots: generalSlots,
    slots,
    hotbar: slots.slice(0, generalSlots),
    inventory: slots.filter((slot) => slot.kind === "inventory"),
    equipment: {
      back: slots[EQUIPMENT_SLOT_INDEXES.back] || null,
      hands: slots[EQUIPMENT_SLOT_INDEXES.hands] || null,
      feet: slots[EQUIPMENT_SLOT_INDEXES.feet] || null
    }
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
