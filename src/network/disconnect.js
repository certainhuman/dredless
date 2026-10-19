// Application close codes from the official client's DropReason enum.
export const DropReason = Object.freeze({
    ProtocolError: 4000,
    BadVersion: 4001,
    ConnectLimit: 4002,
    ConnectRate: 4003,
    TeamLimit: 4004,
    FullPlayers: 4005,
    FullTeams: 4006,
    TeamNotAvailable: 4007,
    Kicked: 4008,
    Banned: 4009,
    Idle: 4010,
    ShipDestruct: 4011,
    JoinBlocked: 4012,
    HardBanned: 4013,
    NoLoad: 4014,
    Saved: 4015,
    InvalidInvite: 4016,
    Shutdown: 4017,
    ServerError: 4018,
    GTFO: 4019
});

const reasonNames = new Map(Object.entries(DropReason).map(([name, code]) => [code, name]));
const textDecoder = new TextDecoder();

export function normalizeDisconnect(eventOrCode, reason = "") {
    const event = eventOrCode != null && typeof eventOrCode === "object" ? eventOrCode : null;
    const code = event?.code ?? eventOrCode;
    const rawReason = event?.reason ?? reason;
    let text = "";
    if (typeof rawReason === "string") text = rawReason;
    else if (ArrayBuffer.isView(rawReason)) {
        text = textDecoder.decode(new Uint8Array(rawReason.buffer, rawReason.byteOffset, rawReason.byteLength));
    } else if (rawReason instanceof ArrayBuffer) text = textDecoder.decode(rawReason);
    const normalizedCode = Number.isInteger(code) ? code : 1006;
    return Object.freeze({
        code: normalizedCode,
        name: reasonNames.get(normalizedCode) ?? null,
        reason: text,
        // EventEmitter close callbacks don't report whether the handshake was clean.
        wasClean: typeof event?.wasClean === "boolean" ? event.wasClean : null
    });
}

export class DisconnectError extends Error {
    constructor(disconnect, message = "Disconnected") {
        super(`${message}: ${disconnect.name ?? "Unknown"} (${disconnect.code})${disconnect.reason ? ` — ${disconnect.reason}` : ""}`);
        this.name = "DisconnectError";
        this.disconnect = disconnect;
    }
}
