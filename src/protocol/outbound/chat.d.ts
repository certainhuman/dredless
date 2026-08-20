export interface ChatMessage {
    type: 2;
    msg: string;
}

export function buildChatMessage(message?: string): ChatMessage;

export const CHAT_MESSAGE_TYPE: 2;
