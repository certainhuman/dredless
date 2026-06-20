const SHIP_MANAGEMENT_TYPE = 4;
const SET_PRIVACY_ACTION = "set_privacy";
const STARTER_RECOVERY_ACTION = "starter_recovery";
const PLAYER_LIST_ACTION = "player_list";
const INVITE_RESET_ACTION = "invite_reset";

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

export function buildPlayerListMessage() {
  return buildShipManagementMessage(PLAYER_LIST_ACTION);
}

export function buildInviteResetMessage() {
  return buildShipManagementMessage(INVITE_RESET_ACTION);
}

export function normalizeShipConfigEvent(event = {}) {
  const source = event && typeof event === "object" ? event : {};
  const config = source.config && typeof source.config === "object" ? source.config : {};
  return {
    type: "config",
    privacy: config.privacy ?? null,
    privacyName: config.privacy === 0 ? "public" : config.privacy === 1 ? "private" : null,
    inviteKey: config.invite_key ?? null,
    teamId: source.team_id ?? null,
    patronPerks: Array.isArray(source.patron_perks) ? source.patron_perks.slice() : []
  };
}

export function normalizeCaptainSubrankEvent(event = {}) {
  const source = event && typeof event === "object" ? event : {};
  return {
    type: "captain_subrank",
    subrank: source.subrank ?? null,
    enableCheats: Boolean(source.enable_cheats)
  };
}

export function normalizePlayerListEvent(event = {}) {
  const source = event && typeof event === "object" ? event : {};
  const players = Array.isArray(source.player_list) ? source.player_list.map(normalizePlayerListEntry) : [];
  const ownerCaptainRank = ownerRankForPlayers(players);
  return {
    type: "player_list",
    ownerCaptainRank,
    shipOwners: players.filter((player) => player.isShipOwner),
    players
  };
}

function normalizePlayerListEntry(entry = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  return {
    refId: source.ref_id ?? null,
    removed: Boolean(source._removed),
    discrim: source.discrim ?? null,
    discrimColor: source.discrim_color ?? null,
    teamRank: source.team_rank ?? null,
    captainRank: source.captain_rank ?? null,
    isCaptain: source.captain_rank != null,
    isShipOwner: false,
    time: source.time ?? null,
    items: Array.isArray(source.items) ? source.items.slice() : [],
    aliasDiscrims: Array.isArray(source.alias_discrims) ? source.alias_discrims.slice() : [],
    extraAliases: source.extra_aliases ?? null,
    onlineCount: source.online_count ?? null
  };
}

function ownerRankForPlayers(players) {
  const ranks = players
    .filter((player) => !player.removed && player.captainRank != null)
    .map((player) => Number(player.captainRank))
    .filter(Number.isFinite);
  if (!ranks.length) return null;
  const ownerRank = Math.min(...ranks);
  for (const player of players) player.isShipOwner = !player.removed && Number(player.captainRank) === ownerRank;
  return ownerRank;
}

export {
  INVITE_RESET_ACTION,
  PLAYER_LIST_ACTION,
  SET_PRIVACY_ACTION,
  SHIP_MANAGEMENT_TYPE,
  STARTER_RECOVERY_ACTION,
  normalizePrivacy
};
