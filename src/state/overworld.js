export const OVERWORLD_ZONES = Object.freeze([
    Object.freeze({baseId: 0, key: "freeport", name: "Freeport", tiered: false, navDestination: false}),
    Object.freeze({baseId: 10, key: "hummingbird", name: "Hummingbird", tiered: false, navDestination: true}),
    Object.freeze({baseId: 20, key: "finch", name: "Finch", tiered: true, navDestination: true}),
    Object.freeze({baseId: 30, key: "sparrow", name: "Sparrow", tiered: true, navDestination: true}),
    Object.freeze({baseId: 40, key: "raven", name: "Raven", tiered: false, navDestination: true}),
    Object.freeze({baseId: 50, key: "falcon", name: "Falcon", tiered: false, navDestination: true}),
    Object.freeze({baseId: 60, key: "combat-arena", name: "Combat Arena", tiered: false, navDestination: true}),
    Object.freeze({baseId: 66, key: "mosaic", name: "Mosaic", tiered: false, navDestination: false})
]);

const OVERWORLD_ZONE_BY_BASE_ID = new Map(OVERWORLD_ZONES.map((zone) => [zone.baseId, zone]));
const NAVIGATION_ZONE_BY_BASE_ID = new Map(OVERWORLD_ZONES
    .filter((zone) => zone.navDestination)
    .map((zone) => [zone.baseId, zone]));

function romanNumeral(value) {
    const numerals = [
        [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
        [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
        [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
    ];
    let remaining = Math.max(1, Math.trunc(Number(value) || 1));
    let out = "";
    for (const [amount, label] of numerals) {
        while (remaining >= amount) {
            out += label;
            remaining -= amount;
        }
    }
    return out;
}

export function overworldZoneFromBaseId(baseId) {
    const id = Number(baseId);
    return Number.isInteger(id) ? OVERWORLD_ZONE_BY_BASE_ID.get(id) || null : null;
}

export function navigationZoneFromBaseId(baseId) {
    const id = Number(baseId);
    return Number.isInteger(id) ? NAVIGATION_ZONE_BY_BASE_ID.get(id) || null : null;
}

export function overworldZoneFromId(overworldId) {
    const id = Number(overworldId);
    if (!Number.isInteger(id) || id < 0) return null;
    const exactZone = overworldZoneFromBaseId(id);
    if (exactZone) return overworldZoneSummary(exactZone, id, 0);
    const baseId = Math.floor(id / 10) * 10;
    const zone = overworldZoneFromBaseId(baseId);
    if (!zone?.tiered) return null;
    const layer = id - baseId;
    return overworldZoneSummary(zone, id, layer);
}

function overworldZoneSummary(zone, id, layer) {
    return {
        id,
        baseId: zone.baseId,
        layer,
        key: zone.key,
        name: zone.name,
        tiered: zone.tiered,
        displayName: zone.tiered ? `${zone.name} ${romanNumeral(layer + 1)}` : zone.name
    };
}

export function navigationDestinationFromEncodedValue(value) {
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    const baseId = value + 1;
    return navigationZoneFromBaseId(baseId) ? baseId : null;
}
