export interface NavigationUnitConfig {
    destination: number;
    page?: number;
    warp?: boolean | "start" | "idle" | "cancel";
    autoWarpOnShieldFailure?: boolean;
    autoWarpOnNoCaptains?: boolean;
}

export type PusherMode = 0 | 1 | 2 | "push" | "pull" | "do-nothing" | "doNothing" | "none";
export type LoaderPosition =
    0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
    "top-left" | "topLeft" | "top-middle" | "topMiddle" | "top-right" | "topRight" |
    "middle-left" | "middleLeft" | "center-left" | "centerLeft" |
    "middle-right" | "middleRight" | "center-right" | "centerRight" |
    "bottom-left" | "bottomLeft" | "bottom-middle" | "bottomMiddle" | "bottom-right" | "bottomRight";
export type LoaderPriority = -1 | 0 | 1 | "low" | "normal" | "medium" | "high";
export type LoaderFilterMode =
    0
    | 1
    | 2
    | 3
    | "allow-all"
    | "allowAll"
    | "block-filter"
    | "blockFilter"
    | "allow-filter"
    | "allowFilter"
    | "block-all"
    | "blockAll";
export type ClipboardTarget =
    number
    | "loader"
    | "loader-config"
    | "loaderConfig"
    | "hatch"
    | "cargo-hatch"
    | "cargoHatch"
    | "ejector"
    | "cargo-ejector"
    | "cargoEjector"
    | "expando"
    | "expando-box"
    | "expandoBox"
    | "generator"
    | "shield-generator"
    | "shieldGenerator"
    | "navigation"
    | "navigation-unit"
    | "navigationUnit"
    | "nav"
    | "nav-unit"
    | "navUnit";
export type FixedAngleDirection = 0 | 1 | 2 | 3 | "right" | "up" | "left" | "down";

export interface PusherConfig {
    mode?: PusherMode;
    filteredMode?: PusherMode;
    angle?: number;
    speed?: number;
    filterInventory?: boolean;
    length?: number;
}

export interface LoaderConfig {
    pick?: LoaderPosition;
    place?: LoaderPosition;
    priority?: LoaderPriority;
    stack?: number;
    cycle?: number;
    requireOutput?: boolean;
    waitForStack?: boolean;
}

export interface LoaderFullConfig extends LoaderConfig {
    filterMode?: LoaderFilterMode;
    filterSlots?: Array<number | null | undefined>;
}

export function buildNavigationUnitConfigData(entity: number, config: NavigationUnitConfig): Uint8Array;

export function buildNavigationUnitClipboardConfigData(config: NavigationUnitConfig): Uint8Array;

export function buildNavigationUnitPasteConfigData(entity: number, config: NavigationUnitConfig): Uint8Array;

export function buildGeneratorMazePuzzleData(entity: number, solution: string | number): Uint8Array;

export function buildCargoHatchFilterConfigData(entity: number, filterMode?: LoaderFilterMode): Uint8Array;

export function buildCargoHatchFilterItemsData(entity: number, filterSlots?: Array<number | null | undefined>): Uint8Array;

export function buildCargoHatchFullConfigData(entity: number, config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): Uint8Array;

export function buildCargoHatchCopyConfigData(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): Uint8Array;

export function buildClipboardConfigData(target: ClipboardTarget, commandName: string, values?: Iterable<number>): Uint8Array;

export function buildClipboardFixedAngleData(target: ClipboardTarget, direction: FixedAngleDirection): Uint8Array;

export function buildGeneratorClipboardDirectionData(direction: FixedAngleDirection): Uint8Array;

export function buildCargoEjectorDirectionData(entity: number, direction: FixedAngleDirection): Uint8Array;

export function buildCargoEjectorPasteConfigData(entity: number, direction: FixedAngleDirection): Uint8Array;

export function buildCargoEjectorCopyConfigData(direction: FixedAngleDirection): Uint8Array;

export function buildCargoEjectorClipboardDirectionData(direction: FixedAngleDirection): Uint8Array;

export function buildExpandoClipboardAngleData(angle: number): Uint8Array;

export function buildLoaderClipboardConfigData(config?: LoaderConfig): Uint8Array;

export function buildLoaderConfigData(entity: number, config?: LoaderConfig): Uint8Array;

export function buildLoaderCopyConfigData(config?: LoaderFullConfig): Uint8Array;

export function buildLoaderFilterConfigData(entity: number, filterMode?: LoaderFilterMode): Uint8Array;

export function buildLoaderFilterItemsData(entity: number, filterSlots?: Array<number | null | undefined>): Uint8Array;

export function buildLoaderFullConfigData(entity: number, config?: LoaderFullConfig): Uint8Array;

export function buildPusherConfigData(entity: number, config?: PusherConfig): Uint8Array;

export function buildPusherFilterItemsData(entity: number, filterSlots?: Array<number | null | undefined>): Uint8Array;

export const CLIPBOARD_ACTION: 1;
export const CLIPBOARD_ANGLE_COMMAND: "angle";
export const CLIPBOARD_FIXED_ANGLE_COMMAND: "angle_fixed";
export const CLIPBOARD_TARGET_VALUES: Map<string, number>;
export const FIXED_ANGLE_VALUES: Map<string, 0 | 1 | 2 | 3>;
export const GENERATOR_MAZE_PUZZLE_COMMAND: "maze_puzzle";
export const LOADER_CONFIG_COMMAND: "config_loader";
export const LOADER_FALSE: 0x8e;
export const LOADER_FILTER_CONFIG_COMMAND: "filter_config";
export const LOADER_FILTER_ITEMS_COMMAND: "filter_items";
export const LOADER_TRUE: 0x8d;
export const NAV_UNIT_COMMAND: "config_nav_unit";
export const NAV_UNIT_FALSE: 0x8d;
export const NAV_UNIT_TRUE: 0x8e;
export const PUSHER_CONFIG_COMMAND: "config_pusher";
export const PUSHER_FILTER_ITEMS_COMMAND: "filter_items";
