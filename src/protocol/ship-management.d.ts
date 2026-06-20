export type ShipPrivacy = 0 | 1 | boolean | "public" | "private";

export interface ShipManagementMessage {
  type: 4;
  act: string;
  arg: unknown;
}

export function buildShipManagementMessage(act: string, arg?: unknown): ShipManagementMessage;
export function buildShipPrivacyMessage(privacy: ShipPrivacy): ShipManagementMessage;
export function buildStarterRecoveryMessage(itemId: number): ShipManagementMessage;
export function normalizePrivacy(privacy: ShipPrivacy): 0 | 1;

export const SET_PRIVACY_ACTION: "set_privacy";
export const SHIP_MANAGEMENT_TYPE: 4;
export const STARTER_RECOVERY_ACTION: "starter_recovery";
