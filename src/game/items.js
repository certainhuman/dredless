import fs from "node:fs";

const itemSchema = JSON.parse(fs.readFileSync(new URL("../../spec/item_schema.json", import.meta.url), "utf8"));
const ITEM_TYPE_NAMES = new Map(itemSchema.map((item) => [Number(item.id), item.name]));

export function itemNameFromId(itemId) {
  return itemId == null ? null : ITEM_TYPE_NAMES.get(Number(itemId)) || null;
}