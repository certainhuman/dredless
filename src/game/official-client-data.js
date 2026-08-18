export const OFFICIAL_CLIENT_SNAPSHOT = {
    capturedAt: "2026-05-17",
    gameVersion: "Fri May 8 09:43:31 PM MDT 2026 / 92e9666650b250eae8968a40ff4f3a04c257f2e6",
    moduleTable: "drednot-official-client/latest-captured-module-table.js",
    wasmGlue: "/x/wasm.2cc626268724032ec685dd97023d77da.js",
    wasm: "/x/4719d471af3e158f9fc6c69af872fe1c.wasm",
    sourceModules: {
        tilesets: 89,
        physicsFilters: 42,
        itemIds: 78
    }
};

export const OFFICIAL_CLIENT_ITEM_ID = {
    BLOCK: 232,
    BLOCK_HYPER_RUBBER: 233,
    BLOCK_ICE_GLASS: 234,
    BLOCK_LADDER: 235,
    BLOCK_WALKWAY: 236,
    BLOCK_ITEM_NET: 237,
    PAINT: 239,
    BLOCK_ANNIHILATOR: 254,
    BLOCK_LOGISTICS_RAIL: 262
};

export const OFFICIAL_CLIENT_FILTERS = {
    DEFAULT_FILTER: {categoryBits: 1, maskBits: 65535, groupIndex: 0},
    NOCOLLIDE_FILTER: {categoryBits: 0, maskBits: 65535, groupIndex: 0},
    FILTER_BLOCK_WALKWAY: {categoryBits: 28, maskBits: 28, groupIndex: 0},
    FILTER_BLOCK_ITEM_NET: {categoryBits: 1, maskBits: 1, groupIndex: 0},
    FILTER_BLOCK_GLASS: {categoryBits: 1, maskBits: 65535, groupIndex: 0}
};

export const OFFICIAL_CLIENT_SUBWORLD_MATERIAL_NAMES = new Map([
    [0, "Nothing"],
    [1, "Ship Border Corner"],
    [2, "Ship Border Edge Horizontal"],
    [3, "Ship Border Edge Vertical"],
    [4, "Iron Block"],
    [5, "Ladder"],
    [6, "Walkway"],
    [7, "Item Net"],
    [8, "Iron Block"],
    [9, "Iron Block"],
    [10, "Iron Block"],
    [11, "Iron Block"],
    [12, "Paint"],
    [13, "Hyper Rubber Block"],
    [14, "Hyper Ice Block"],
    [15, "Annihilator Tile"],
    [16, "Logistics Rail"]
]);

export const OFFICIAL_CLIENT_OVERWORLD_MATERIAL_NAMES = new Map([
    [0, "Air"],
    [1, "Wall"],
    [2, "Unbreakable"],
    [3, "Treasure"],
    [4, "Blank"],
    [5, "Flux"],
    [6, "Sleeping Bot"],
    [7, "Bot Red"],
    [8, "Strong Wall"],
    [9, "Rock"],
    [10, "Rock Metal"],
    [11, "Rock Flux"],
    [12, "Vault"],
    [13, "Vault Locked"]
]);

const I = OFFICIAL_CLIENT_ITEM_ID;
const F = OFFICIAL_CLIENT_FILTERS;

// Copied from official client module 89. The official damage_f callbacks are
// behavior, not static tile metadata, so they are intentionally omitted here.
export const OFFICIAL_CLIENT_TILESETS = {
    overworld: {
        scale: 8,
        atlas: "tiles_overworld",
        tile_width: 64,
        tiles: [
            {solid: false},
            {solid: true, hp: 999},
            {solid: true},
            {solid: true, hp: 1999},
            {solid: true, hp: 999},
            {solid: true, hp: 1999},
            {solid: true, hp: 1},
            {solid: false},
            {solid: true, hp: 1999},
            {solid: true, hp: 199},
            {solid: true, hp: 199},
            {solid: true, hp: 199},
            {solid: true, hp: 999},
            {solid: true}
        ]
    },
    subworld: {
        scale: 1,
        atlas: "tiles_subworld",
        tile_width: 40,
        tiles: [
            {solid: false},
            {solid: true},
            {solid: true},
            {solid: true},
            {solid: true, destruct_item: I.BLOCK, blocks_bullets: true, hp: 199},
            {solid: false, destruct_item: I.BLOCK_LADDER, hp: 1},
            {
                solid: true,
                destruct_item: I.BLOCK_WALKWAY,
                hp: 1,
                physics: {
                    filter: F.FILTER_BLOCK_WALKWAY,
                    transparent: true,
                    walkway: true
                }
            },
            {
                solid: true,
                destruct_item: I.BLOCK_ITEM_NET,
                hp: 1,
                physics: {
                    filter: F.FILTER_BLOCK_ITEM_NET,
                    transparent: true
                },
                no_build_surface: true
            },
            {solid: true, destruct_item: I.BLOCK, blocks_bullets: true, hp: 199},
            {solid: true, destruct_item: I.BLOCK, blocks_bullets: true, hp: 199},
            {solid: true, destruct_item: I.BLOCK, blocks_bullets: true, hp: 199},
            {solid: true, destruct_item: I.BLOCK, blocks_bullets: true, hp: 199},
            {solid: false, destruct_item: I.PAINT, hp: 1},
            {
                solid: true,
                blocks_bullets: true,
                destruct_item: I.BLOCK_HYPER_RUBBER,
                hp: 599,
                physics: {restitution: 0.9}
            },
            {
                solid: true,
                blocks_bullets: true,
                destruct_item: I.BLOCK_ICE_GLASS,
                hp: 199,
                physics: {
                    friction: 0,
                    filter: F.FILTER_BLOCK_GLASS,
                    transparent: true
                }
            },
            {solid: false, destruct_item: I.BLOCK_ANNIHILATOR, hp: 1},
            {solid: false, destruct_item: I.BLOCK_LOGISTICS_RAIL, hp: 1}
        ]
    }
};
