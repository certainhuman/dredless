const BLUEPRINT_PLACEMENT_TYPE = 9;

function requireFiniteNumber(value, name) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`${name} must be a finite number`);
    return number;
}

function requirePositiveInteger(value, name) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) throw new RangeError(`${name} must be a positive integer`);
    return number;
}

function normalizeBlueprintDimension(placement, publicName, protocolName) {
    const value = placement[publicName] ?? placement[protocolName];
    return requirePositiveInteger(value, publicName);
}

function buildBlueprintPlacementMessage(placement = {}) {
    const source = placement.source;
    if (typeof source !== "string" || !source) throw new TypeError("source must be a non-empty blueprint string");
    return {
        type: BLUEPRINT_PLACEMENT_TYPE,
        x: requireFiniteNumber(placement.x, "x"),
        y: requireFiniteNumber(placement.y, "y"),
        w: normalizeBlueprintDimension(placement, "width", "w"),
        h: normalizeBlueprintDimension(placement, "height", "h"),
        source
    };
}

export {
    BLUEPRINT_PLACEMENT_TYPE,
    buildBlueprintPlacementMessage
};
