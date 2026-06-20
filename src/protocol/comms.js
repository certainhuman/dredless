const COMMS_MESSAGE_TYPE = 3;

function buildCommsMessage(message = "") {
  return {
    type: COMMS_MESSAGE_TYPE,
    msg: String(message)
  };
}

function normalizeCommsEvent(event) {
  const rawMessages = Array.isArray(event?.msgs_text) ? event.msgs_text : [];
  return {
    ...event,
    entity: event?.ent_id != null && Number.isFinite(Number(event.ent_id)) ? Number(event.ent_id) : null,
    rawMessages,
    messages: rawMessages.map((message) => ({
      raw: message,
      text: flattenRichText(message)
    }))
  };
}

function flattenRichText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flattenRichText).join("");
  if (typeof value === "object") {
    if (Object.hasOwn(value, "c")) return flattenRichText(value.c);
    if (Object.hasOwn(value, "text")) return flattenRichText(value.text);
  }
  return "";
}

export {
  COMMS_MESSAGE_TYPE,
  buildCommsMessage,
  flattenRichText,
  normalizeCommsEvent
};
