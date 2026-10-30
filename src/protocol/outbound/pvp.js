const TARGETED_KINDS = new Set(["Join", "Invite", "Kick", "JoinCancel", "InviteCancel"]);

function requireHexCode(value) {
    if (typeof value !== "string") throw new TypeError("hexCode must be a ship hex code string");
    const hexCode = value.trim();
    if (!/^[0-9a-f]+$/i.test(hexCode)) throw new RangeError("hexCode must contain hexadecimal digits");
    return hexCode;
}

export function buildPvpPartyMessage(kind, hexCode) {
    if (kind === "NewTeam" || kind === "Leave") {
        if (hexCode !== undefined) throw new TypeError(`${kind} does not take a ship hex code`);
        return {type: 10, info: {kind}};
    }
    if (!TARGETED_KINDS.has(kind)) throw new RangeError("unsupported PvP party command kind");
    return {type: 10, info: {kind, hex: requireHexCode(hexCode)}};
}

export function buildCreatePvpPartyMessage() {
    return buildPvpPartyMessage("NewTeam");
}

export function buildLeavePvpPartyMessage() {
    return buildPvpPartyMessage("Leave");
}

export function buildJoinPvpPartyMessage(hexCode) {
    return buildPvpPartyMessage("Join", hexCode);
}

export function buildInvitePvpPartyMessage(hexCode) {
    return buildPvpPartyMessage("Invite", hexCode);
}

export function buildKickPvpPartyMessage(hexCode) {
    return buildPvpPartyMessage("Kick", hexCode);
}

export function buildCancelPvpPartyJoinMessage(hexCode) {
    return buildPvpPartyMessage("JoinCancel", hexCode);
}

export function buildCancelPvpPartyInviteMessage(hexCode) {
    return buildPvpPartyMessage("InviteCancel", hexCode);
}
