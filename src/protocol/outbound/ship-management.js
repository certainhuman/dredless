const SHIP_MANAGEMENT_TYPE = 4;
const SET_PRIVACY_ACTION = "set_privacy";
const STARTER_RECOVERY_ACTION = "starter_recovery";
const PLAYER_LIST_ACTION = "player_list";
const INVITE_RESET_ACTION = "invite_reset";
const SET_RANK_ACTION = "set_rank";
const KICK_ACTION = "kick";
const BAN_ACTION = "ban";
const DEMOTE_SELF_ACTION = "demote_self";

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

function normalizePlayerRef(value) {
    return requireNonNegativeInteger(value, "refId");
}

function normalizePlayerRank(value) {
    if (value === 0 || value === "guest") return 0;
    if (value === 1 || value === "crew") return 1;
    if (value === 3 || value === "captain") return 3;
    throw new RangeError(`rank must be 0, 1, 3, "guest", "crew", or "captain"`);
}

export function buildShipManagementMessage(act, arg = null, extra = null) {
    if (typeof act !== "string" || !act) throw new TypeError(`act must be a non-empty string`);
    const message = {type: SHIP_MANAGEMENT_TYPE, act, arg};
    if (extra && typeof extra === "object") Object.assign(message, extra);
    return message;
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

export function buildSetPlayerRankMessage(refId, rank) {
    return buildShipManagementMessage(SET_RANK_ACTION, normalizePlayerRef(refId), {rank: normalizePlayerRank(rank)});
}

export function buildKickPlayerMessage(refId) {
    return buildShipManagementMessage(KICK_ACTION, normalizePlayerRef(refId));
}

export function buildBanPlayerMessage(refId) {
    return buildShipManagementMessage(BAN_ACTION, normalizePlayerRef(refId));
}

export function buildDemoteSelfMessage() {
    return buildShipManagementMessage(DEMOTE_SELF_ACTION);
}

export function normalizeShipConfig(event = {}) {
    const source = event && typeof event === "object" ? event : {};
    const config = source.config && typeof source.config === "object" ? source.config : {};
    return {
        privacy: config.privacy ?? null,
        privacyName: config.privacy === 0 ? "public" : config.privacy === 1 ? "private" : null,
        inviteKey: config.invite_key ?? null,
        teamId: source.team_id ?? null,
        patronPerks: Array.isArray(source.patron_perks) ? source.patron_perks.slice() : []
    };
}

export function normalizeCaptainSubrank(event = {}) {
    const source = event && typeof event === "object" ? event : {};
    return {
        subrank: source.subrank ?? null,
        enableCheats: Boolean(source.enable_cheats)
    };
}

export function normalizeShipPlayerList(event = {}, previous = null, currentCaptainSubrank = null) {
    const source = event && typeof event === "object" ? event : {};
    const changes = Array.isArray(source.player_list) ? source.player_list.map(normalizePlayerListChange) : [];
    const removedPlayers = changes
        .filter((change) => change.remove && Number.isFinite(Number(change.refId)))
        .map((change) => Number(change.refId));
    const changedPlayers = changes.filter((change) => !change.remove).map(({remove: _remove, ...change}) => change);
    const players = mergePlayerListChanges(previous?.players, changes);
    const ownerCaptainRank = ownerRankForPlayers(players);
    applyPlayerControlState(players, currentCaptainSubrank);
    applyPlayerControlState(changedPlayers, currentCaptainSubrank);
    return {
        ownerCaptainRank,
        shipOwners: players.filter((player) => player.isShipOwner),
        players,
        changes: changedPlayers,
        removedPlayers
    };
}

function mergePlayerListChanges(previousPlayers, changes) {
    if (!Array.isArray(previousPlayers) || !previousPlayers.length) return changes.filter((change) => !change.remove).map(({
                                                                                                                               remove: _remove,
                                                                                                                               ...player
                                                                                                                           }) => ({...player}));

    const existing = new Map();
    for (const player of previousPlayers) {
        if (player?.refId == null) continue;
        existing.set(player.refId, {...player, isShipOwner: false});
    }

    const changedRefs = new Set();
    const merged = [];
    for (const change of changes) {
        if (change.refId == null) {
            if (!change.remove) {
                const {remove: _remove, ...player} = change;
                merged.push({...player, isShipOwner: false});
            }
            continue;
        }
        changedRefs.add(change.refId);
        if (change.remove) {
            existing.delete(change.refId);
            continue;
        }
        const {remove: _remove, ...changePlayer} = change;
        const player = {...(existing.get(change.refId) || {}), ...changePlayer, isShipOwner: false};
        existing.set(change.refId, player);
        merged.push(player);
    }

    for (const player of previousPlayers) {
        if (player?.refId == null || changedRefs.has(player.refId)) continue;
        const retained = existing.get(player.refId);
        if (retained) merged.push(retained);
    }
    return merged;
}

function normalizePlayerListChange(entry = {}) {
    const source = entry && typeof entry === "object" ? entry : {};
    if (source._removed) return {refId: source.ref_id ?? null, remove: true};
    return {
        refId: source.ref_id ?? null,
        remove: false,
        discrim: source.discrim ?? null,
        discrimColor: source.discrim_color ?? null,
        teamRank: source.team_rank ?? null,
        captainRank: source.captain_rank ?? null,
        isCaptain: Number(source.captain_rank) > 0,
        isShipOwner: false,
        canBeManaged: false,
        time: source.time ?? null,
        items: Array.isArray(source.items) ? source.items.slice() : [],
        aliasDiscrims: Array.isArray(source.alias_discrims) ? source.alias_discrims.slice() : [],
        extraAliasCount: normalizeNonNegativeNumber(source.extra_aliases),
        onlineCount: source.online_count ?? null
    };
}

function normalizeNonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function ownerRankForPlayers(players) {
    const ranks = players
        .filter((player) => Number(player.captainRank) > 0)
        .map((player) => Number(player.captainRank))
        .filter(Number.isFinite);
    if (!ranks.length) return null;
    const ownerRank = Math.min(...ranks);
    for (const player of players) player.isShipOwner = Number(player.captainRank) === ownerRank;
    return ownerRank;
}

function applyPlayerControlState(players, currentCaptainSubrank) {
    const currentRank = currentCaptainRank(currentCaptainSubrank);
    for (const player of players) player.canBeManaged = playerCanBeManagedBy(player, currentRank);
}

function currentCaptainRank(currentCaptainSubrank) {
    const rank = Number(currentCaptainSubrank?.subrank);
    return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function playerCanBeManagedBy(player, currentRank) {
    if (!Number.isFinite(currentRank) || !player) return false;
    const targetCaptainRank = Number(player.captainRank);
    if (Number.isFinite(targetCaptainRank) && targetCaptainRank > 0) return currentRank < targetCaptainRank;
    const targetTeamRank = Number(player.teamRank);
    return targetTeamRank === 0 || targetTeamRank === 1;
}

export {
    BAN_ACTION,
    DEMOTE_SELF_ACTION,
    INVITE_RESET_ACTION,
    KICK_ACTION,
    PLAYER_LIST_ACTION,
    SET_PRIVACY_ACTION,
    SET_RANK_ACTION,
    SHIP_MANAGEMENT_TYPE,
    STARTER_RECOVERY_ACTION,
    normalizePlayerRank,
    normalizePrivacy
};
