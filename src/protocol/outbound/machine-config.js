import {encoder} from "../../constants.js";

function uint32(value, name) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new RangeError(`${name} must be an unsigned 32-bit integer`);
    }
    return value;
}

function encodeUnsigned(value) {
    if (value < 64) return [value];
    if (value < 256) return [0x80, value];
    if (value < 65536) return [0x81, value & 255, value >>> 8];
    return [0x82, value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24];
}

function encodeFloat(value, name, max) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
        throw new RangeError(`${name} must be a finite number between 0 and ${max}`);
    }
    const number = Math.fround(value);
    if (Number.isInteger(number)) {
        if (number < 64) return [number];
        if (number < 128) return [0x84, number];
        return [0x85, number & 255, number >>> 8];
    }
    const bytes = new Uint8Array(5);
    bytes[0] = 0x88;
    new DataView(bytes.buffer).setFloat32(1, number, true);
    return [...bytes];
}

function section(name, values) {
    const bytes = encoder.encode(name);
    return [0x8a, bytes.length, ...bytes, 0, 0x90, ...values, 0x91];
}

function message(target, action, sections) {
    return Uint8Array.from([0x90, action, ...encodeUnsigned(uint32(target, "target")), ...sections.flat(), 0x91]);
}

export function normalizeRankMask({allowedRanks, rankMask} = {}) {
    if (allowedRanks !== undefined && rankMask !== undefined) {
        throw new TypeError("provide allowedRanks or rankMask, not both");
    }
    if (rankMask !== undefined) {
        const value = uint32(rankMask, "rankMask");
        if (value > 7 && value !== 0xffffffff) throw new RangeError("rankMask must be 0–7 or 0xffffffff");
        return value;
    }
    if (allowedRanks === undefined) return 4;
    if (allowedRanks === "all") return 0xffffffff;
    if (!Array.isArray(allowedRanks)) throw new TypeError('allowedRanks must be an array of rank names or "all"');
    let mask = 0;
    for (const rank of allowedRanks) {
        const bit = {guest: 1, crew: 2, captain: 4}[rank];
        if (typeof rank !== "string" || !["guest", "crew", "captain"].includes(rank)) throw new RangeError(`unsupported rank: ${rank}`);
        mask |= bit;
    }
    return mask;
}

function rankSection(config) {
    return section("filter_ranks", encodeUnsigned(normalizeRankMask(config)));
}

function launcherSection({angle = 0, power = 30} = {}) {
    return section("config_item_launcher", [...encodeFloat(angle, "angle", 360), ...encodeFloat(power, "power", 30)]);
}

function doorSections(config = {}, clipboard = false) {
    if (!clipboard && config.orientation !== undefined) {
        throw new TypeError("door orientation is only available for placement/clipboard configuration");
    }
    const sections = [rankSection(config)];
    if (clipboard) {
        const orientation = config.orientation ?? "vertical";
        if (orientation !== "vertical" && orientation !== "horizontal") {
            throw new RangeError('orientation must be "vertical" or "horizontal"');
        }
        sections.unshift(section("angle_symmetric", [orientation === "horizontal" ? 1 : 0]));
    }
    return sections;
}

export function buildLauncherConfigData(entity, config = {}) {
    return message(entity, 0, [launcherSection(config)]);
}
export function buildLauncherCopyConfigData(config = {}) {
    return message(8, 1, [launcherSection(config)]);
}
export function buildLauncherPasteConfigData(entity, config = {}) {
    return message(entity, 2, [launcherSection(config)]);
}
export function buildDoorConfigData(entity, config = {}) {
    return message(entity, 0, doorSections(config));
}
export function buildDoorCopyConfigData(config = {}) {
    return message(10, 1, doorSections(config, true));
}
export function buildDoorPasteConfigData(entity, config = {}) {
    return message(entity, 2, doorSections(config, true));
}
export function buildSpawnPointConfigData(entity, config = {}) {
    return message(entity, 0, [rankSection(config)]);
}
export function buildSpawnPointCopyConfigData(config = {}) {
    return message(9, 1, [rankSection(config)]);
}
export function buildSpawnPointPasteConfigData(entity, config = {}) {
    return message(entity, 2, [rankSection(config)]);
}
