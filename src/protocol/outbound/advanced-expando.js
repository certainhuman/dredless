import {encoder} from "../../constants.js";
import {encodeUnsigned} from "../codec/ui-integer.js";

function number(value, name, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        throw new RangeError(`${name} must be a finite number between ${min} and ${max}`);
    }
    return value;
}

function float(value, name, min, max) {
    const bytes = new Uint8Array(5);
    bytes[0] = 0x88;
    new DataView(bytes.buffer).setFloat32(1, number(value, name, min, max), true);
    return [...bytes];
}

function color(value, name) {
    number(value, name, 0, 0xffffff);
    if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer RGB color`);
    return encodeUnsigned(value);
}

function bool(value, name) {
    if (typeof value !== "boolean") throw new TypeError(`${name} must be a boolean`);
    return value ? 0x8d : 0x8e;
}

function section(name, values) {
    const text = encoder.encode(name);
    return [0x8a, text.length, ...text, 0, 0x90, ...values, 0x91];
}

function message(entity, action, config) {
    number(entity, "entity", 0, 0xffffffff);
    if (!Number.isInteger(entity)) throw new RangeError("entity must be an unsigned 32-bit integer");
    const {
        minWidth = 2, maxWidth = 10, minHeight = 2, maxHeight = 10,
        minEnabled = false, maxEnabled = false, fixedSize = false,
        backgroundColor = 0xdddddd, borderColor = 0x404040, opacity = 1
    } = config;
    // Native ConfigExpandoSize order: min X, max X, min Y, max Y, then flags.
    return Uint8Array.from([0x90, action, ...encodeUnsigned(entity),
        ...section("config_expando_size", [
            ...float(minWidth, "minWidth", 2, 100), ...float(maxWidth, "maxWidth", 2, 100),
            ...float(minHeight, "minHeight", 2, 100), ...float(maxHeight, "maxHeight", 2, 100),
            bool(minEnabled, "minEnabled"), bool(maxEnabled, "maxEnabled"), bool(fixedSize, "fixedSize")
        ]),
        ...section("config_expando_colors", [
            ...color(backgroundColor, "backgroundColor"), ...color(borderColor, "borderColor"),
            ...float(opacity, "opacity", 0, 1)
        ]), 0x91]);
}

export function buildAdvancedExpandoBoxConfigData(entity, config = {}) {
    return message(entity, 0, config);
}

export function buildAdvancedExpandoBoxCopyConfigData(config = {}) {
    return message(11, 1, config);
}

export function buildAdvancedExpandoBoxPasteConfigData(entity, config = {}) {
    return message(entity, 2, config);
}
