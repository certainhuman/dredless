import { DEFAULT_BASE_URL } from "../constants.js";
import { asNumber } from "../runtime.js";
import { HttpClient } from "../net/http.js";

export function createShipSpec(name = "", color = "") {
  return { type: "new", name: String(name ?? ""), color: String(color ?? "") };
}

export function createInviteShipSpec(code) {
  return { type: "invite", code: String(code ?? "") };
}

export function shipRef(ship) {
  if (ship == null) return null;
  if (typeof ship !== "object") return { type: "join_or_load", id: ship };
  if (ship.type) return ship;
  const id = ship.id ?? ship.hexCode ?? ship.hex_code;
  if (id != null) return { type: "join_or_load", id };
  return ship;
}

export const normalizeShipSpec = shipRef;

export function normalizeShip(raw, key = null) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.id ?? key);
  return {
    id: Number.isFinite(id) ? id : null,
    hexCode: raw.hex_code || raw.hexCode || raw.id || key || null,
    name: raw.team_name || "Unknown Ship",
    iconUrl: raw.icon_path || null,
    playerCount: asNumber(raw.player_count, 0),
    owned: Boolean(raw.owned),
    saved: Boolean(raw.saved),
    color: raw.color || "",
    time: asNumber(raw.time, null)
  };
}

function extractShips(data) {
  if (Array.isArray(data)) return data.map((ship, index) => [ship?.id || String(index), ship]);
  if (Array.isArray(data?.ships)) return data.ships.map((ship, index) => [ship?.id || String(index), ship]);
  if (data?.ships && typeof data.ships === "object") return Object.entries(data.ships);
  return [];
}

export async function fetchShips(session, server, baseUrl = session?.baseUrl || DEFAULT_BASE_URL) {
  const data = await fetchShipList(session, server, baseUrl);
  return Array.isArray(data) ? data : Array.isArray(data?.ships) ? data.ships : [];
}

export async function fetchShipList(session, server, baseUrl = session?.baseUrl || DEFAULT_BASE_URL) {
  if (!session) throw new Error("fetchShipList requires a session");
  const serverId = Number(server && typeof server === "object" ? server.index ?? server.id : server ?? session.geoServer ?? 0);
  const data = await new HttpClient({ baseUrl, session }).json(`shiplist?server=${serverId}`, {
    headers: { accept: "application/json" }
  });
  const ships = normalizeShipList(data);
  if (Array.isArray(data)) return { ships };
  if (data && typeof data === "object") {
    return {
      playerCount: asNumber(data.player_count, 0),
      maxPlayerCount: asNumber(data.max_player_count, 0),
      isMuted: Boolean(data.is_muted),
      ships
    };
  }
  return { ships };
}

function normalizeShipList(data) {
  return extractShips(data).map(([key, raw]) => normalizeShip(raw, key)).filter(Boolean);
}
