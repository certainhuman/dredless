const CHAT_MESSAGE_TYPE = 2;

function buildChatMessage(message = "") {
    return {
        type: CHAT_MESSAGE_TYPE,
        msg: String(message)
    };
}

export {
    CHAT_MESSAGE_TYPE,
    buildChatMessage
};
