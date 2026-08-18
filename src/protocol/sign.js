const SIGN_TEXT_COMMAND = "sign_text";
const SIGN_DISPLAY_MODES = new Map([
    [0, "always"],
    [1, "when-near"],
    [2, "on-hover"]
]);
const SIGN_DISPLAY_MODE_VALUES = new Map([
    ["always", 0],
    ["when-near", 1],
    ["whenNear", 1],
    ["near", 1],
    ["on-hover", 2],
    ["onHover", 2],
    ["hover", 2]
]);

function normalizeSignDisplayMode(mode = 0) {
    const normalized = typeof mode === "string" ? SIGN_DISPLAY_MODE_VALUES.get(mode) : Number(mode);
    if (normalized == null || !SIGN_DISPLAY_MODES.has(normalized)) {
        throw new RangeError(`sign display mode must be 0, 1, 2, "always", "when-near", or "on-hover"`);
    }
    return normalized;
}

function signDisplayModeName(mode) {
    return SIGN_DISPLAY_MODES.get(mode) ?? null;
}

function buildSignTextMessage(text = "", mode = 0) {
    return {
        type: 5,
        cmd: SIGN_TEXT_COMMAND,
        args: [String(text), normalizeSignDisplayMode(mode)]
    };
}

export {
    SIGN_DISPLAY_MODES,
    SIGN_TEXT_COMMAND,
    buildSignTextMessage,
    normalizeSignDisplayMode,
    signDisplayModeName
};
