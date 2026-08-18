export interface NavigationUnitConfig {
    destination: number;
    page?: number;
    warp?: boolean | "start" | "idle" | "cancel";
    autoWarpOnShieldFailure?: boolean;
    autoWarpOnNoCaptains?: boolean;
}

export const PusherMode: {
    readonly Push: "push";
    readonly Pull: "pull";
    readonly DoNothing: "do-nothing";
};
export type PusherMode = typeof PusherMode[keyof typeof PusherMode];
export const LoaderPosition: {
    readonly TopLeft: "top-left";
    readonly TopMiddle: "top-middle";
    readonly TopRight: "top-right";
    readonly MiddleLeft: "middle-left";
    readonly MiddleRight: "middle-right";
    readonly BottomLeft: "bottom-left";
    readonly BottomMiddle: "bottom-middle";
    readonly BottomRight: "bottom-right";
};
export type LoaderPosition = typeof LoaderPosition[keyof typeof LoaderPosition];
export const LoaderFilterMode: {
    readonly AllowAll: "allow-all";
    readonly BlockFilter: "block-filter";
    readonly AllowFilter: "allow-filter";
    readonly BlockAll: "block-all";
};
export type LoaderFilterMode = typeof LoaderFilterMode[keyof typeof LoaderFilterMode];
export const LoaderPriority: {
    readonly Low: "low";
    readonly Normal: "normal";
    readonly High: "high";
};
export type LoaderPriority = typeof LoaderPriority[keyof typeof LoaderPriority];
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
export const FixedAngleDirection: {
    readonly Right: "right";
    readonly Up: "up";
    readonly Left: "left";
    readonly Down: "down";
};
export type FixedAngleDirection = typeof FixedAngleDirection[keyof typeof FixedAngleDirection];

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
export const FIXED_ANGLE_VALUES: Map<FixedAngleDirection, 0 | 1 | 2 | 3>;
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
