import { DEFAULT_BASE_URL } from "../constants.js";
import { asNumber, normalizeBaseUrl } from "../runtime.js";
import { HttpClient } from "../net/http.js";

export class ShipService {
  constructor(session, { baseUrl = session?.baseUrl || DEFAULT_BASE_URL } = {}) {
    if (!session) throw new Error("ShipService requires a session");
    this.session = session;
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async list(serverId = this.session.geoServer ?? 0) {
    const data = await new HttpClient({ baseUrl: this.baseUrl, session: this.session }).json(`shiplist?server=${Number(serverId)}`, {
      headers: { accept: "application/json" }
    });
    return extractShips(data).map(([key, raw]) => normalizeShip(raw, key)).filter(Boolean);
  }
}

export function newShip(name = "", color = "") {
  return { type: "new", name: String(name ?? ""), color: String(color ?? "") };
}

export function shipRef(ship) {
  if (ship == null) return null;
  if (typeof ship !== "object") return { type: "join_or_load", id: ship };
  if (ship.type) return ship;
  const id = ship.id ?? ship.hexCode ?? ship.hex_code ?? ship.raw?.id ?? ship.raw?.hex_code;
  if (id != null) return { type: "join_or_load", id };
  return ship;
}

export const createShip = newShip;
export const createShipSpec = newShip;
export const normalizeShipSpec = shipRef;

export function normalizeShip(raw, key = null) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.id ?? key);
  return {
    id: Number.isFinite(id) ? id : null,
    hexCode: raw.hex_code || raw.hexCode || raw.id || key || null,
    name: raw.team_name || raw.teamName || raw.ship_name || raw.name || "Unknown Ship",
    imgUrl: raw.icon_path || raw.iconPath || raw.icon || null,
    playerCount: asNumber(raw.player_count ?? raw.playerCount, 0),
    owned: Boolean(raw.owned),
    saved: Boolean(raw.saved),
    color: raw.color || "",
    time: raw.time ?? null,
    raw
  };
}

function extractShips(data) {
  if (Array.isArray(data)) return data.map((ship, index) => [ship?.hex_code || ship?.id || String(index), ship]);
  if (Array.isArray(data?.ships)) return data.ships.map((ship, index) => [ship?.hex_code || ship?.id || String(index), ship]);
  if (data?.ships && typeof data.ships === "object") return Object.entries(data.ships);
  if (Array.isArray(data?.owned)) return data.owned.map((ship, index) => [ship?.hex_code || ship?.id || String(index), ship]);
  if (data?.owned && typeof data.owned === "object") return Object.entries(data.owned);
  return [];
}

export async function listShips({ session, serverId = null, baseUrl = session?.baseUrl || DEFAULT_BASE_URL } = {}) {
  return new ShipService(session, { baseUrl }).list(serverId ?? session?.geoServer ?? 0);
}
