const SHIP_MANAGEMENT_TYPE = 4;
const SET_PRIVACY_ACTION = "set_privacy";
const STARTER_RECOVERY_ACTION = "starter_recovery";

function requireNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return number;
}

function normalizePrivacy(value) {
  if (value === true || value === 1 || value === "private") return 1;
  if (value === false || value === 0 || value === "public") return 0;
  throw new RangeError(`privacy must be 0, 1, true, false, "public", or "private"`);
}

export function buildShipManagementMessage(act, arg = null) {
  if (typeof act !== "string" || !act) throw new TypeError(`act must be a non-empty string`);
  return { type: SHIP_MANAGEMENT_TYPE, act, arg };
}

export function buildShipPrivacyMessage(privacy) {
  return buildShipManagementMessage(SET_PRIVACY_ACTION, normalizePrivacy(privacy));
}

export function buildStarterRecoveryMessage(itemId) {
  return buildShipManagementMessage(STARTER_RECOVERY_ACTION, requireNonNegativeInteger(itemId, "itemId"));
}

export {
  SET_PRIVACY_ACTION,
  SHIP_MANAGEMENT_TYPE,
  STARTER_RECOVERY_ACTION,
  normalizePrivacy
};
