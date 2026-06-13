export interface NavigationUnitConfig {
  destination: number;
  page?: number;
  warp?: boolean | "start" | "idle" | "cancel";
  autoWarpOnShieldFailure?: boolean;
  autoWarpOnNoCaptains?: boolean;
}

export function buildNavigationUnitConfigData(entity: number, config: NavigationUnitConfig): Uint8Array;

export const NAV_UNIT_COMMAND: "config_nav_unit";
export const NAV_UNIT_FALSE: 0x8d;
export const NAV_UNIT_TRUE: 0x8e;
