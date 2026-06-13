export interface NavigationUnitConfig {
  destination: number;
  page?: number;
  warp?: boolean | "start" | "idle" | "cancel";
  autoWarpOnShieldFailure?: boolean;
  autoWarpOnNoCaptains?: boolean;
}

export type PusherMode = 0 | 1 | 2 | "push" | "pull" | "do-nothing" | "doNothing" | "none";

export interface PusherConfig {
  mode?: PusherMode;
  filteredMode?: PusherMode;
  angle?: number;
  speed?: number;
  filterInventory?: boolean;
  length?: number;
}

export function buildNavigationUnitConfigData(entity: number, config: NavigationUnitConfig): Uint8Array;
export function buildGeneratorMazePuzzleData(entity: number, solution: string | number): Uint8Array;
export function buildPusherConfigData(entity: number, config?: PusherConfig): Uint8Array;
export function buildPusherFilterItemsData(entity: number, filterSlots?: Array<number | null | undefined>): Uint8Array;

export const GENERATOR_MAZE_PUZZLE_COMMAND: "maze_puzzle";
export const NAV_UNIT_COMMAND: "config_nav_unit";
export const NAV_UNIT_FALSE: 0x8d;
export const NAV_UNIT_TRUE: 0x8e;
export const PUSHER_CONFIG_COMMAND: "config_pusher";
export const PUSHER_FILTER_ITEMS_COMMAND: "filter_items";
