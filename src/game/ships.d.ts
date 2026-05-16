export {
  fetchShips,
  fetchShipList,
  type Ship,
  type ShipList,
  type ShipRef,
  type ShipSpec
} from "../index.js";

export function createShipSpec(name?: string, color?: string): ShipSpec;
