import type { Command } from "../index.js";

export function buildSignedCommandPacket(command: Command, sessionId: number): Uint8Array;
