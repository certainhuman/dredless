export type EquipmentSlot = 19 | 20 | 21 | "back" | "hand" | "hands" | "foot" | "feet";

export interface InventoryDragCommand {
  drag: {
    source: number;
    target: number;
    split: boolean;
  };
}

export interface InventorySlot {
  index: number;
  itemId: number | null;
  count: number;
  kind: "hotbar" | "inventory" | "equipment";
  equipmentSlot: "back" | "hands" | "feet" | null;
}

export interface InventoryState {
  type: "inventory";
  filter?: number;
  items: unknown[];
  item_counts: unknown[];
  general_slots: number;
  slots: InventorySlot[];
  hotbar: InventorySlot[];
  inventory: InventorySlot[];
  equipment: {
    back: InventorySlot | null;
    hands: InventorySlot | null;
    feet: InventorySlot | null;
  };
}

export function normalizeEquipmentSlot(slot: EquipmentSlot): 19 | 20 | 21;
export function equipmentSlotName(slot: number): "back" | "hands" | "feet" | null;
export function buildInventoryDragCommand(source: number, target: number, split?: boolean): InventoryDragCommand;
export function buildEquipItemCommand(source: number, slot: EquipmentSlot, split?: boolean): InventoryDragCommand;
export function buildUnequipItemCommand(slot: EquipmentSlot, target?: number, split?: boolean): InventoryDragCommand;
export function normalizeInventoryEvent(event: unknown): InventoryState;

export const EQUIPMENT_SLOT_INDEXES: Readonly<{
  back: 19;
  hands: 20;
  feet: 21;
}>;
