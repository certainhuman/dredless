export const EquipmentSlot: {
    readonly Head: "head";
    readonly Face: "face";
    readonly Body: "body";
    readonly Back: "back";
    readonly Hands: "hands";
    readonly Feet: "feet";
};
export type EquipmentSlot = typeof EquipmentSlot[keyof typeof EquipmentSlot];

export interface InventoryDragCommand {
    drag: {
        source: number;
        target: number;
        split: boolean;
    };
}

export interface InventorySlotSnapshot {
    index: number;
    itemId: number | null;
    itemName: string | null;
    count: number;
    kind: "hotbar" | "equipment";
    equipmentSlot: "head" | "face" | "body" | "back" | "hands" | "feet" | null;
    empty: boolean;
}

export interface InventoryState {
    type: "inventory";
    filter?: number;
    hotbarSize: number;
    slots: InventorySlotSnapshot[];
    hotbar: InventorySlotSnapshot[];
    equipment: {
        head: InventorySlotSnapshot;
        face: InventorySlotSnapshot;
        body: InventorySlotSnapshot;
        back: InventorySlotSnapshot;
        hands: InventorySlotSnapshot;
        feet: InventorySlotSnapshot;
    };
}

export function normalizeEquipmentSlot(slot: EquipmentSlot): 16 | 17 | 18 | 19 | 20 | 21;

export function equipmentSlotName(slot: number): "head" | "face" | "body" | "back" | "hands" | "feet" | null;

export function buildInventoryDragCommand(source: number, target: number, split?: boolean): InventoryDragCommand;

export function buildEquipItemCommand(source: number, slot: EquipmentSlot, split?: boolean): InventoryDragCommand;

export function buildUnequipItemCommand(slot: EquipmentSlot, target?: number, split?: boolean): InventoryDragCommand;

export function normalizeInventoryEvent(event: unknown): InventoryState;

export const EQUIPMENT_SLOT_INDEXES: Readonly<{
    head: 16;
    face: 17;
    body: 18;
    back: 19;
    hands: 20;
    feet: 21;
}>;
