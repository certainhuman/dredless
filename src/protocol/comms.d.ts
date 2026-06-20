export interface CommsMessage {
  type: 3;
  msg: string;
}

export interface NormalizedCommsMessage {
  raw: unknown;
  text: string;
}

export interface CommsEvent {
  type: "comms";
  filter?: number;
  ent_id: number | null;
  entity: number | null;
  msgs_text: unknown[];
  rawMessages: unknown[];
  messages: NormalizedCommsMessage[];
  update?: boolean;
}

export function buildCommsMessage(message?: string): CommsMessage;
export function normalizeCommsEvent(event: unknown): CommsEvent;
export function flattenRichText(value: unknown): string;

export const COMMS_MESSAGE_TYPE: 3;
