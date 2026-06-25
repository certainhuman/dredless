import { ITEM_SCHEMA } from "./item-schema.js";

const ITEM_TYPE_NAMES = new Map(ITEM_SCHEMA.map((item) => [Number(item.id), item.name]));
const ITEM_EQUIPMENT_SLOTS = new Map(ITEM_SCHEMA.flatMap((item) => {
  const slot = equipmentSlotFromDescription(item.desc);
  return slot ? [[Number(item.id), slot]] : [];
}));

function equipmentSlotFromDescription(description) {
  const match = String(description || "").match(/\bEquipment \((Head|Face|Body|Back|Hands|Feet)\)/i);
  return match ? match[1].toLowerCase() : null;
}

export function itemNameFromId(itemId) {
  return itemId == null ? null : ITEM_TYPE_NAMES.get(Number(itemId)) || null;
}

export function itemEquipmentSlotFromId(itemId) {
  return itemId == null ? null : ITEM_EQUIPMENT_SLOTS.get(Number(itemId)) || null;
}
