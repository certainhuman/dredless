// Compact unsigned integers used by the UI command format (little endian).
export function encodeUnsigned(value) {
    if (value < 64) return [value];
    if (value < 256) return [0x80, value];
    if (value < 65536) return [0x81, value & 255, value >>> 8];
    return [0x82, value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24];
}
