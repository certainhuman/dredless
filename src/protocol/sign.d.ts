export type SignDisplayMode =
    0
    | 1
    | 2
    | "always"
    | "when-near"
    | "whenNear"
    | "near"
    | "on-hover"
    | "onHover"
    | "hover";

export interface SignTextMessage {
    type: 5;
    cmd: "sign_text";
    args: [string, 0 | 1 | 2];
}

export function buildSignTextMessage(text?: string, mode?: SignDisplayMode): SignTextMessage;

export function normalizeSignDisplayMode(mode?: SignDisplayMode): 0 | 1 | 2;

export function signDisplayModeName(mode: number): "always" | "when-near" | "on-hover" | null;

export const SIGN_TEXT_COMMAND: "sign_text";
export const SIGN_DISPLAY_MODES: Map<0 | 1 | 2, "always" | "when-near" | "on-hover">;
