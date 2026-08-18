const SIGN_TEXT_COMMAND = "sign_text";
const SignDisplayMode = Object.freeze({
    Always: "always",
    WhenNear: "when-near",
    OnHover: "on-hover"
});
const SIGN_DISPLAY_MODES = new Map([
    [0, SignDisplayMode.Always],
    [1, SignDisplayMode.WhenNear],
    [2, SignDisplayMode.OnHover]
]);
const SIGN_DISPLAY_MODE_VALUES = new Map([
    [SignDisplayMode.Always, 0],
    [SignDisplayMode.WhenNear, 1],
    [SignDisplayMode.OnHover, 2]
]);

function normalizeSignDisplayMode(mode = SignDisplayMode.Always) {
    const normalized = SIGN_DISPLAY_MODE_VALUES.get(mode);
    if (normalized == null) {
        throw new RangeError(`sign display mode must be SignDisplayMode.Always, SignDisplayMode.WhenNear, or SignDisplayMode.OnHover`);
    }
    return normalized;
}

function signDisplayModeName(mode) {
    return SIGN_DISPLAY_MODES.get(mode) ?? null;
}

function buildSignTextMessage(text = "", mode = SignDisplayMode.Always) {
    return {
        type: 5,
        cmd: SIGN_TEXT_COMMAND,
        args: [String(text), normalizeSignDisplayMode(mode)]
    };
}

export {
    SIGN_DISPLAY_MODES,
    SIGN_TEXT_COMMAND,
    SignDisplayMode,
    buildSignTextMessage,
    normalizeSignDisplayMode,
    signDisplayModeName
};
