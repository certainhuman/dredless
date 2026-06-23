export type ShipPrivacy = 0 | 1 | boolean | "public" | "private";
export type ShipPlayerRank = 0 | 1 | 3 | "guest" | "crew" | "captain";

export interface ShipManagementMessage {
  type: 4;
  act: string;
  arg: unknown;
  rank?: unknown;
}

export interface ShipConfigEvent {
  type: "config";
  privacy: number | null;
  privacyName: "public" | "private" | null;
  inviteKey: string | null;
  teamId: number | null;
  patronPerks: unknown[];
}

export interface CaptainSubrankEvent {
  type: "captain_subrank";
  subrank: number | null;
  enableCheats: boolean;
}

export interface PlayerListEntry {
  refId: number | null;
  removed: boolean;
  discrim: string | null;
  discrimColor: number | null;
  teamRank: number | null;
  captainRank: number | null;
  isCaptain: boolean;
  isShipOwner: boolean;
  time: number | null;
  items: unknown[];
  aliasDiscrims: unknown[];
  extraAliases: unknown;
  onlineCount: number | null;
}

export interface PlayerListEvent {
  type: "player_list";
  ownerCaptainRank: number | null;
  shipOwners: PlayerListEntry[];
  players: PlayerListEntry[];
  changes: PlayerListEntry[];
  removedPlayers: PlayerListEntry[];
}

export function buildShipManagementMessage(act: string, arg?: unknown, extra?: Record<string, unknown> | null): ShipManagementMessage;
export function buildShipPrivacyMessage(privacy: ShipPrivacy): ShipManagementMessage;
export function buildStarterRecoveryMessage(itemId: number): ShipManagementMessage;
export function buildPlayerListMessage(): ShipManagementMessage;
export function buildInviteResetMessage(): ShipManagementMessage;
export function buildSetPlayerRankMessage(refId: number, rank: ShipPlayerRank): ShipManagementMessage;
export function buildKickPlayerMessage(refId: number): ShipManagementMessage;
export function buildBanPlayerMessage(refId: number): ShipManagementMessage;
export function buildDemoteSelfMessage(): ShipManagementMessage;
export function normalizePrivacy(privacy: ShipPrivacy): 0 | 1;
export function normalizePlayerRank(rank: ShipPlayerRank): 0 | 1 | 3;
export function normalizeShipConfigEvent(event: unknown): ShipConfigEvent;
export function normalizeCaptainSubrankEvent(event: unknown): CaptainSubrankEvent;
export function normalizePlayerListEvent(event: unknown, previous?: PlayerListEvent | null): PlayerListEvent;

export const BAN_ACTION: "ban";
export const DEMOTE_SELF_ACTION: "demote_self";
export const KICK_ACTION: "kick";
export const PLAYER_LIST_ACTION: "player_list";
export const INVITE_RESET_ACTION: "invite_reset";
export const SET_PRIVACY_ACTION: "set_privacy";
export const SET_RANK_ACTION: "set_rank";
export const SHIP_MANAGEMENT_TYPE: 4;
export const STARTER_RECOVERY_ACTION: "starter_recovery";
