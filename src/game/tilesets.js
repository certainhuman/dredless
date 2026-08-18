import {
    OFFICIAL_CLIENT_OVERWORLD_MATERIAL_NAMES,
    OFFICIAL_CLIENT_SUBWORLD_MATERIAL_NAMES,
    OFFICIAL_CLIENT_TILESETS
} from "./official-client-data.js";

function cloneFilter(filter) {
    if (!filter) return null;
    return {
        categoryBits: filter.categoryBits ?? 1,
        maskBits: filter.maskBits ?? 65535,
        groupIndex: filter.groupIndex ?? 0
    };
}

function cloneTile(tile) {
    const copy = {solid: Boolean(tile.solid)};
    if (tile.name != null) copy.name = tile.name;
    if (tile.destruct_item != null) copy.destruct_item = tile.destruct_item;
    if (tile.blocks_bullets != null) copy.blocks_bullets = tile.blocks_bullets;
    if (tile.hp != null) copy.hp = tile.hp;
    if (tile.no_build_surface != null) copy.no_build_surface = tile.no_build_surface;
    if (tile.physics != null) {
        copy.physics = {};
        if (tile.physics.friction != null) copy.physics.friction = tile.physics.friction;
        if (tile.physics.restitution != null) copy.physics.restitution = tile.physics.restitution;
        if (tile.physics.transparent != null) copy.physics.transparent = tile.physics.transparent;
        if (tile.physics.walkway != null) copy.physics.walkway = tile.physics.walkway;
        if (tile.physics.filter != null) copy.physics.filter = cloneFilter(tile.physics.filter);
    }
    return copy;
}

export function cloneTileset(tileset) {
    const materialNames = tileset.atlas === "tiles_subworld"
        ? OFFICIAL_CLIENT_SUBWORLD_MATERIAL_NAMES
        : tileset.atlas === "tiles_overworld"
            ? OFFICIAL_CLIENT_OVERWORLD_MATERIAL_NAMES
            : null;
    return {
        scale: tileset.scale,
        atlas: tileset.atlas,
        tile_width: tileset.tile_width,
        tiles: tileset.tiles.map((tile, materialId) => cloneTile({
            ...tile,
            name: materialNames?.get(materialId)
        }))
    };
}

export function getTilesetForWorld(isOverworld) {
    return cloneTileset(isOverworld ? OFFICIAL_CLIENT_TILESETS.overworld : OFFICIAL_CLIENT_TILESETS.subworld);
}
