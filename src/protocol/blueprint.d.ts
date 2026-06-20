export interface BlueprintPlacement {
  x: number;
  y: number;
  width?: number;
  height?: number;
  w?: number;
  h?: number;
  source: string;
}

export interface BlueprintPlacementMessage {
  type: 9;
  x: number;
  y: number;
  w: number;
  h: number;
  source: string;
}

export function buildBlueprintPlacementMessage(placement: BlueprintPlacement): BlueprintPlacementMessage;

export const BLUEPRINT_PLACEMENT_TYPE: 9;
