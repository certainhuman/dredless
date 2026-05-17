export interface Server {
  index: number;
  domain: string;
  description: string;
  playerCount: number;
  maxPlayerCount: number;
  ping: number | null;
}

export interface Ship {
  id: number | null;
  hexCode: string | null;
  name: string;
  iconUrl: string | null;
  playerCount: number;
  owned: boolean;
  saved: boolean;
  color: string;
  time: number | null;
}

export interface ShipList {
  playerCount?: number;
  maxPlayerCount?: number;
  isMuted?: boolean;
  ships: Ship[];
}

export type ShipSpec =
  | { type: "join_or_load"; id: number | string }
  | { type: "new"; name?: string | null; color?: string | null }
  | { type: "invite"; code: string };

export type ServerRef = number | Server;
export type ShipRef = number | string | Ship | ShipSpec | null;
export interface DragPayload {
  source: number;
  target: number;
  split?: boolean;
}

export interface Command {
  type?: number;
  n?: number | null;
  x?: number;
  y?: number;
  mx?: number;
  my?: number;
  vx?: number;
  vy?: number;
  jump?: boolean;
  jump_held?: boolean;
  drop?: boolean;
  act1?: boolean;
  act1_held?: boolean;
  exit?: boolean;
  act2?: boolean;
  act_alt?: boolean;
  act_alt_held?: boolean;
  wrench_mode?: number;
  turret_mode?: number;
  scr_w?: number;
  scr_h?: number;
  motion?: number;
  focus_ent?: number | null;
  config_ent?: number | null;
  tip_select?: number | null;
  inv_slot?: number;
  blur?: boolean;
  drag?: DragPayload | null;
}

export class Session {
  constructor(gameSession?: string | null, gameVersion?: string | null);

  baseUrl: string;
  cookies: Map<string, string>;
  gameVersion: string | null;
  account: Account | null;
  geoServer: number | null;
  upgraded: boolean;
  isRegistered: boolean;
  showAds: boolean;
  forceTutorial: boolean;
  ban: unknown;

  get gameSession(): string;
  get gameToken(): string;
  get noticeVersion(): number | string | null;
  set noticeVersion(value: number | string | null);

  request(path: string, init?: RequestInit & { body?: BodyInit | Record<string, unknown> | null }): Promise<Response>;
  fetchAccountStatus(): Promise<unknown>;
  fetchShips(server: ServerRef): Promise<Ship[]>;
  fetchShipList(server: ServerRef): Promise<ShipList>;

  startJoinConnection(server: ServerRef, ship?: ShipRef): Promise<Connection>;
  startConnection(server: ServerRef, ship?: ShipRef): Promise<Connection>;
  startNewShipConnection(server: ServerRef, name?: string, color?: string): Promise<Connection>;

  join(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;
  start(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;
  newShip(server: ServerRef, name?: string, color?: string): Promise<DredlessClient>;

  toJSON(): SessionSnapshot;
}

export class AnonSession extends Session {
  constructor(gameSession?: string | null, anonKey?: string | null, gameVersion?: string | null);
  get anonKey(): string;
}

export interface Account {
  name: string;
  color: number;
  game_rank: number;
  user_badges: string[];
  is_registered: boolean;
}

export interface SessionSnapshot {
  baseUrl: string;
  gameSession: string;
  gameToken: string;
  gameVersion: string | null;
  noticeVersion: number | string | null;
  cookies: Record<string, string>;
  account: Account | null;
  geoServer: number | null;
  upgraded: boolean;
  isRegistered: boolean;
  showAds: boolean;
  forceTutorial: boolean;
  ban: unknown;
  anonKey?: string;
}

export class Connection {
  constructor(session: Session, gameToken: string, netPort: number, serverId: number | Server, server?: Server | null);

  session: Session;
  baseUrl: string;
  gameToken: string;
  netPort: number;
  serverId: number;
  server: Server | null;

  toJSON(): ConnectionSnapshot;
}

export interface ConnectionSnapshot {
  baseUrl: string;
  gameToken: string;
  netPort: number;
  serverId: number;
  server: Server | null;
  session: SessionSnapshot;
}

export class DredlessClient {
  constructor(connection: Connection);

  connection: Connection;
  session: Session;
  baseUrl: string;
  serverId: number;
  server: Server | null;
  netPort: number;
  gameToken: string;
  ws: unknown;
  sid: number | null;
  connected: boolean;
  ready: boolean;
  packetCount: number;
  lastPacket: unknown;
  packets: unknown[];
  worlds: WorldStore;
  cpuLoad: number | null;
  inventory: InventoryState | null;
  puiPanels: Map<number, PuiEvent>;
  warnings: unknown[];
  effects: unknown[];
  chat: unknown[];
  motd: unknown[];
  sessionMessages: unknown[];
  outfits: Map<number, unknown>;
  commandAcks: Map<number, number>;
  lastCommandAck: CommandAck | null;
  readyPromise: Promise<this>;
  get packetsRaw(): unknown[];

  waitUntilReady(): Promise<this>;
  send(command: Command): this;
  sendMessage(message: unknown, options?: { afterReady?: boolean }): this;
  sendRaw(message: unknown, options?: { afterReady?: boolean }): this;
  setOutfit(outfit: unknown): this;
  sendFabricatorCommand(itemId: number, count?: number, index?: number): this;
  craftAdd(itemId: number, count?: number, index?: number): this;
  sendUiConfig(data: unknown): this;
  move(x?: number, y?: number, command?: Command): this;
  aim(mx?: number, my?: number, command?: Command): this;
  action(flags?: Command, command?: Command): this;
  selectSlot(invSlot?: number, command?: Command): this;
  drag(source: number, target: number, split?: boolean, command?: Command): this;
  close(code?: number, reason?: string): this;
  disconnect(code?: number, reason?: string): this;
  snapshot(options?: { includeTiles?: boolean; includeModel?: boolean }): ClientSnapshot;
  world(id: number, options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot | null;
  overworld(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot | null;
  shipWorld(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot | null;

  on(type: string, callback: (...args: unknown[]) => void): this;
  off(type: string, callback: (...args: unknown[]) => void): this;
  once(type: string, callback: (...args: unknown[]) => void): this;
}

export interface ClientSnapshot {
  baseUrl: string;
  session: SessionSnapshot;
  connection: ConnectionSnapshot;
  serverId: number;
  server: Server | null;
  netPort: number;
  sid: number | null;
  ready: boolean;
  connected: boolean;
  currentWorldId: number | null;
  worlds: WorldSnapshot[];
  cpuLoad: number | null;
  inventory: InventoryState | null;
  puiPanels: PuiEvent[];
  warnings: unknown[];
  effects: unknown[];
  chat: unknown[];
  motd: unknown[];
  sessionMessages: unknown[];
  outfits: { sid: number; outfit: unknown }[];
  commandAcks: CommandAck[];
  lastCommandAck: CommandAck | null;
  packetCount: number;
  lastPacket: unknown;
}

export interface CommandAck {
  world: number;
  commandNumber: number;
}

export interface InventorySlot {
  index: number;
  itemId: number | null;
  count: number;
  kind: "hotbar" | "equipment";
}

export interface InventoryState {
  type: "inventory";
  filter?: number;
  items: unknown[];
  item_counts: unknown[];
  general_slots: number;
  slots: InventorySlot[];
  hotbar: InventorySlot[];
  equipment: {
    back: InventorySlot | null;
    hands: InventorySlot | null;
    feet: InventorySlot | null;
  };
}

export interface PuiEvent {
  type: "pui";
  filter?: number;
  ent_id?: number;
  update?: boolean;
  data?: unknown;
  world?: number | null;
}

export class WorldStore {
  currentWorldId: number | null;
  worlds: Map<number, WorldState>;

  get(id: number): WorldState;
  apply(packet: unknown): WorldUpdate | null;
  snapshot(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot[];
  ids(): number[];
  overworld(): WorldState | null;
  shipWorld(): WorldState | null;
}

export class WorldState {
  constructor(id: number);

  id: number;
  seed: number | null;
  isOverworld: boolean | null;
  blockWidth: number | null;
  blockHeight: number | null;
  parentWorld: number | null;
  parentEntity: number | null;
  tiles: Map<string, Tile>;
  chunks: unknown[];
  events: unknown[];
  modelPackets: unknown[];
  model: ModelState;
  lastChunkPatch: unknown;
  lastPacket: unknown;
  meta: unknown;

  readMeta(packet: unknown): void;
  decodeEncrypted(data: Uint8Array | ArrayBuffer | number[]): unknown;
  applyTile(value: unknown): Tile | null;
  applyChunk(value: unknown): Tile[] | null;
  setTile(tile: Tile): Tile;
  snapshot(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot;
  table(id: number): Map<number, ModelRecord>;
  record(tableId: number, entityId: number): ModelRecord | null;
}

export interface Tile {
  x: number;
  y: number;
  material: number;
  shape: number;
  integrity: number;
  color: number | null;
}

export interface WorldSnapshot {
  id: number;
  is_overworld: boolean | null;
  seed: number | null;
  block_w: number | null;
  block_h: number | null;
  parent_world: number | null;
  parent_ent: number | null;
  tileCount: number;
  chunkCount: number;
  lastChunkPatch: unknown;
  lastPacket: unknown;
  meta: unknown;
  model: ModelSnapshot;
  transforms: TransformSummary[];
  machines: MachineSummary;
  players: PlayerSummary[];
  shipControls: ShipControlSummary[];
  tiles?: Tile[];
}

export interface WorldUpdate {
  type: string;
  world: WorldState | null;
  packet?: unknown;
  decoded?: unknown;
  updates?: unknown[];
  result?: unknown;
}

export class ModelState {
  generation: number | null;
  tables: Map<number, Map<number, ModelRecord>>;
  removedEntities: number[];
  lastUpdate: unknown;
  errors: unknown[];

  table(id: number): Map<number, ModelRecord>;
  record(tableId: number, entityId: number): ModelRecord | null;
  apply(bytes: Uint8Array | ArrayBuffer | number[]): unknown;
  snapshot(options?: { includeTables?: boolean }): ModelSnapshot;
  tablesSnapshot(): unknown[];
  transforms(): TransformSummary[];
  itemHolders(): ItemHolderSummary[];
  fabricators(): FabricatorSummary[];
  players(): PlayerSummary[];
  shipControls(): ShipControlSummary[];
  machines(): MachineSummary;
}

export type ModelRecord = Record<string, unknown>;

export interface ModelSnapshot {
  generation: number | null;
  tableCount: number;
  entityCount: number;
  removedEntities: number[];
  lastUpdate: unknown;
  errors: unknown[];
  tables: unknown[];
}

export interface TransformSummary {
  entity: number;
  x: number | null;
  y: number | null;
  rot: number | null;
  flags: unknown[];
}

export interface ItemHolderSummary {
  entity: number;
  itemId: number | null;
  count: number | null;
}

export interface FabricatorSummary {
  entity: number;
  state: ModelRecord;
  rows: { itemId: number | null; count: number | null }[];
  progress: number | null;
}

export interface PlayerSummary {
  entity: number;
  name: string | null;
  state: ModelRecord;
}

export interface ShipControlSummary {
  entity: number;
  thrustX: number | null;
  thrustY: number | null;
  state: ModelRecord;
}

export interface MachineSummary {
  itemHolders: ItemHolderSummary[];
  fabricators: FabricatorSummary[];
  processors: { entity: number; state: ModelRecord }[];
  cannons: { entity: number; state: ModelRecord }[];
  fluidTanks: { entity: number; amount: number | null; state: ModelRecord }[];
  shieldGenerators: { entity: number; charge: number | null; state: ModelRecord }[];
}

export function decodeMsgpack(bytes: Uint8Array | ArrayBuffer | number[]): unknown;
export function encodeMsgpack(value: unknown): Uint8Array;
export function buildSignedCommandPacket(command: Command, sessionId: number): Uint8Array;
export function decryptPayload(wireBytes: Uint8Array | ArrayBuffer | number[], worldId: number, seed: number): Uint8Array;
export function decompressLz4Frame(bytes: Uint8Array | ArrayBuffer | number[]): Uint8Array;
export function decodeModelData(bytes: Uint8Array | ArrayBuffer | number[]): unknown;

export function createSession(noticeVersion?: number | null): Promise<Session>;
export function createAnonSession(anonKey?: string | null, noticeVersion?: number | null): Promise<AnonSession>;
export function createAnonToken(noticeVersion?: number | null): Promise<string>;
export function fetchNoticeVersion(): Promise<number>;
export function fetchGameVersion(): Promise<string>;
export function fetchServers(): Promise<Server[]>;
export function fetchShips(session: Session, server: ServerRef): Promise<Ship[]>;
export function fetchShipList(session: Session, server: ServerRef): Promise<ShipList>;
export function join(server: ServerRef, ship?: ShipRef, session?: Session | null): Promise<DredlessClient>;
export function start(server: ServerRef, ship?: ShipRef, session?: Session | null): Promise<DredlessClient>;
export function newShip(server: ServerRef, name?: string, color?: string, session?: Session | null): Promise<DredlessClient>;

export interface DredlessNamespace {
  Session: typeof Session;
  AnonSession: typeof AnonSession;
  Connection: typeof Connection;
  DredlessClient: typeof DredlessClient;
  createSession: typeof createSession;
  createAnonSession: typeof createAnonSession;
  createAnonToken: typeof createAnonToken;
  fetchNoticeVersion: typeof fetchNoticeVersion;
  fetchGameVersion: typeof fetchGameVersion;
  fetchServers: typeof fetchServers;
  fetchShips: typeof fetchShips;
  fetchShipList: typeof fetchShipList;
  join: typeof join;
  start: typeof start;
  newShip: typeof newShip;
  WorldStore: typeof WorldStore;
  WorldState: typeof WorldState;
  ModelState: typeof ModelState;
  decodeMsgpack: typeof decodeMsgpack;
  encodeMsgpack: typeof encodeMsgpack;
  buildSignedCommandPacket: typeof buildSignedCommandPacket;
  decodeModelData: typeof decodeModelData;
  decryptPayload: typeof decryptPayload;
  decompressLz4Frame: typeof decompressLz4Frame;
}

export const Dredless: DredlessNamespace;
export default Dredless;
