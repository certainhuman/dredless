export const GravityDirection: {
    readonly Down: "down";
    readonly Up: "up";
    readonly Left: "left";
    readonly Right: "right";
};
export type GravityDirection = typeof GravityDirection[keyof typeof GravityDirection];
export type ShipGravityDirection = GravityDirection | 0 | 1 | 2 | 3;

export type ShipPrivacy = 0 | 1 | boolean | "public" | "private";
export type ShipPlayerRank = 0 | 1 | 3 | "guest" | "crew" | "captain";

export interface CrewLogEntry {
    icon: string | null;
    /** Plain text; formatting, images, badges, and date tokens remain in rawText. */
    text: string;
    rawText: unknown;
    count: number;
    refId: number | null;
    secondaryRefId: number | null;
}

export interface CrewLog {
    /** Retained entries in server order, oldest first; at most 500. */
    entries: CrewLogEntry[];
    /** Entries appended by the latest message, including amended replacements. */
    changes: CrewLogEntry[];
    reset: boolean;
    amend: boolean;
}

export interface ShipManagementMessage {
    type: 4;
    act: string;
    arg: unknown;
    arg2?: unknown;
    rank?: unknown;
}

export interface ShipPatronPerk {
    name: string;
    /** Packed RGB color, as sent by the server. */
    color: number;
    /** Official tiers include bronze, silver, gold, plat, and flux. */
    tier: string;
}

export interface PatronPerksResponse {
    readonly failure: boolean;
}

export interface ShipConfig {
    privacy: number | null;
    privacyName: "public" | "private" | null;
    inviteKey: string | null;
    teamId: number | null;
    patronPerks: ShipPatronPerk[];
}

export interface CaptainSubrank {
    subrank: number | null;
    enableCheats: boolean;
}

export interface PlayerListEntry {
    refId: number | null;
    discrim: string | null;
    discrimColor: number | null;
    teamRank: number | null;
    captainRank: number | null;
    isCaptain: boolean;
    isShipOwner: boolean;
    canBeManaged: boolean;
    time: number | null;
    items: unknown[];
    aliasDiscrims: unknown[];
    extraAliasCount: number;
    onlineCount: number | null;
}

export interface ShipPlayerList {
    ownerCaptainRank: number | null;
    shipOwners: PlayerListEntry[];
    players: PlayerListEntry[];
    changes: PlayerListEntry[];
    removedPlayers: number[];
}

export function buildShipManagementMessage(act: string, arg?: unknown, extra?: Record<string, unknown> | null): ShipManagementMessage;

export function buildShipPrivacyMessage(privacy: ShipPrivacy): ShipManagementMessage;

export function buildShipGravityMessage(direction: ShipGravityDirection): ShipManagementMessage;

export function buildSetPatronPerksMessage(enabled: boolean): ShipManagementMessage;

export function normalizeGravityDirection(direction: ShipGravityDirection): 0 | 1 | 2 | 3;

export function buildStarterRecoveryMessage(itemId: number): ShipManagementMessage;

export function buildPlayerListMessage(): ShipManagementMessage;

export function buildSaveShipMessage(): ShipManagementMessage;

export function buildShipRenameRequestMessage(): ShipManagementMessage;

export function buildShipRenameCommitMessage(name: string, color: string): ShipManagementMessage;

export function buildInviteResetMessage(): ShipManagementMessage;

export function buildSetPlayerRankMessage(refId: number, rank: ShipPlayerRank): ShipManagementMessage;

export function buildKickPlayerMessage(refId: number): ShipManagementMessage;

export function buildBanPlayerMessage(refId: number): ShipManagementMessage;

export function buildUnbanPlayerMessage(refId: number): ShipManagementMessage;

export function buildDemoteSelfMessage(): ShipManagementMessage;

export function normalizePrivacy(privacy: ShipPrivacy): 0 | 1;

export function normalizePlayerRank(rank: ShipPlayerRank): 0 | 1 | 3;

export function normalizeShipConfig(event: unknown): ShipConfig;

export function normalizeCaptainSubrank(event: unknown): CaptainSubrank;

export function normalizeCrewLog(event: unknown, previous?: CrewLog | null): CrewLog;

export function normalizeShipPlayerList(event: unknown, previous?: ShipPlayerList | null, currentCaptainSubrank?: CaptainSubrank | null): ShipPlayerList;

export const CREW_LOG_LENGTH: 500;
export const GRAVITY_ACTION: "gravity";
export const SET_PATRON_PERKS_ACTION: "set_patron_perks";
export const BAN_ACTION: "ban";
export const UNBAN_ACTION: "unban";
export const DEMOTE_SELF_ACTION: "demote_self";
export const KICK_ACTION: "kick";
export const PLAYER_LIST_ACTION: "player_list";
export const SAVE_SHIP_ACTION: "save_team";
export const INVITE_RESET_ACTION: "invite_reset";
export const SET_PRIVACY_ACTION: "set_privacy";
export const SET_RANK_ACTION: "set_rank";
export const SHIP_MANAGEMENT_TYPE: 4;
export const STARTER_RECOVERY_ACTION: "starter_recovery";

export const RENAME_REQUEST_ACTION: "rename_request";
export const RENAME_COMMIT_ACTION: "rename_commit";
