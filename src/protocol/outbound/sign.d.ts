export const SignDisplayMode: {
    readonly Always: "always";
    readonly WhenNear: "when-near";
    readonly OnHover: "on-hover";
};
export type SignDisplayMode = typeof SignDisplayMode[keyof typeof SignDisplayMode];

export interface SignTextMessage {
    type: 5;
    cmd: "sign_text";
    args: [string, 0 | 1 | 2];
}

export function buildSignTextMessage(text?: string, mode?: SignDisplayMode): SignTextMessage;
export function normalizeSignDisplayMode(mode?: SignDisplayMode): 0 | 1 | 2;
export function signDisplayModeName(mode: number): SignDisplayMode | null;
export const SIGN_TEXT_COMMAND: "sign_text";
export const SIGN_DISPLAY_MODES: Map<0 | 1 | 2, SignDisplayMode>;
