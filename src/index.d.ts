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
export type ShipPrivacy = 0 | 1 | boolean | "public" | "private";
export type ShipPlayerRank = 0 | 1 | 3 | "guest" | "crew" | "captain";
export type SignDisplayMode = 0 | 1 | 2 | "always" | "when-near" | "whenNear" | "near" | "on-hover" | "onHover" | "hover";
export type EquipmentSlot = 19 | 20 | 21 | "back" | "hand" | "hands" | "foot" | "feet";
export type ReadWorldScope = "ship" | "current" | "overworld" | number;

export interface ShipConfigEvent {
  type: "config";
  privacy: number | null;
  privacyName: "public" | "private" | null;
  inviteKey: string | null;
  teamId: number | null;
  patronPerks: unknown[];
}

export interface CaptainSubrankEvent {
  type: "captain_subrank";
  subrank: number | null;
  enableCheats: boolean;
}

export interface PlayerListEntry {
  refId: number | null;
  removed: boolean;
  discrim: string | null;
  discrimColor: number | null;
  teamRank: number | null;
  captainRank: number | null;
  isCaptain: boolean;
  isShipOwner: boolean;
  time: number | null;
  items: unknown[];
  aliasDiscrims: unknown[];
  extraAliases: unknown;
  onlineCount: number | null;
}

export interface PlayerListEvent {
  type: "player_list";
  ownerCaptainRank: number | null;
  shipOwners: PlayerListEntry[];
  players: PlayerListEntry[];
  changes: PlayerListEntry[];
  removedPlayers: PlayerListEntry[];
}

export interface ShipReadOptions {
  includeWorld?: boolean;
  includeTiles?: boolean;
  includeModel?: boolean;
  sort?: "distance" | null;
}
export interface DragPayload {
  source: number;
  target: number;
  split?: boolean;
}

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

export interface ShipManagementMessage {
  type: 4;
  act: string;
  arg: unknown;
  rank?: unknown;
}

export interface SignTextMessage {
  type: 5;
  cmd: "sign_text";
  args: [string, 0 | 1 | 2];
}

export interface CommsMessage {
  type: 3;
  msg: string;
}

export interface NormalizedCommsMessage {
  raw: unknown;
  text: string;
}

export interface CommsEvent {
  type: "comms";
  filter?: number;
  ent_id: number | null;
  entity: number | null;
  msgs_text: unknown[];
  rawMessages: unknown[];
  messages: NormalizedCommsMessage[];
  update?: boolean;
  world?: number | null;
}

export interface InventoryDragCommand {
  drag: {
    source: number;
    target: number;
    split: boolean;
  };
}

export type PusherMode = 0 | 1 | 2 | "push" | "pull" | "do-nothing" | "doNothing" | "none";
export type LoaderPosition =
  0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
  "top-left" | "topLeft" | "top-middle" | "topMiddle" | "top-right" | "topRight" |
  "middle-left" | "middleLeft" | "center-left" | "centerLeft" |
  "middle-right" | "middleRight" | "center-right" | "centerRight" |
  "bottom-left" | "bottomLeft" | "bottom-middle" | "bottomMiddle" | "bottom-right" | "bottomRight";
export type LoaderPriority = -1 | 0 | 1 | "low" | "normal" | "medium" | "high";
export type LoaderFilterMode = 0 | 1 | 2 | 3 | "allow-all" | "allowAll" | "block-filter" | "blockFilter" | "allow-filter" | "allowFilter" | "block-all" | "blockAll";
export type ClipboardTarget = number | "loader" | "loader-config" | "loaderConfig" | "hatch" | "cargo-hatch" | "cargoHatch" | "ejector" | "cargo-ejector" | "cargoEjector" | "expando" | "expando-box" | "expandoBox" | "generator" | "shield-generator" | "shieldGenerator" | "navigation" | "navigation-unit" | "navigationUnit" | "nav" | "nav-unit" | "navUnit";
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
  startInviteConnection(server: ServerRef, code: string): Promise<Connection>;

  join(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;
  start(server: ServerRef, ship?: ShipRef): Promise<DredlessClient>;
  newShip(server: ServerRef, name?: string, color?: string): Promise<DredlessClient>;
  invite(server: ServerRef, code: string): Promise<DredlessClient>;
  startInvite(server: ServerRef, code: string): Promise<DredlessClient>;

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
  net: ClientNetDomain;
  debug: ClientDebugDomain;
  player: PlayerDomain;
  inventory: InventoryDomain;
  management: ShipManagementDomain;
  readyPromise: Promise<this>;

  waitUntilReady(): Promise<this>;
  close(code?: number, reason?: string): this;
  disconnect(code?: number, reason?: string): this;
  currentShip(): ShipDomain | null;
  ship(): ShipDomain | null;
  overworld(): OverworldDomain | null;
  world(id: number): WorldDomain | null;
  shipWorld(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot | null;
  state(options?: { includeTiles?: boolean; includeModel?: boolean }): ClientSnapshot;

  on(type: string, callback: (...args: unknown[]) => void): this;
  off(type: string, callback: (...args: unknown[]) => void): this;
  once(type: string, callback: (...args: unknown[]) => void): this;
}

export interface ClientNetDomain {
  connected: boolean;
  ready: boolean;
  sid: number | null;
  packetCount: number;
  lastPacket: unknown;
  send(command?: Command): DredlessClient;
  sendMessage(message: unknown, options?: { afterReady?: boolean }): DredlessClient;
  sendRaw(message: unknown, options?: { afterReady?: boolean }): DredlessClient;
  sendEntityCommand(cmd: string, args?: unknown[]): DredlessClient;
  sendUiConfig(data: unknown): DredlessClient;
  sendBlueprintPlacement(placement: BlueprintPlacement): DredlessClient;
  setOutfit(outfit: unknown): DredlessClient;
}

export interface ClientDebugDomain {
  packets(): unknown[];
  decodeErrors(): unknown[];
  worldStore(): WorldStore;
  modelTable(worldId: number, tableId: number): Map<number, ModelRecord>;
  modelRecord(worldId: number, tableId: number, entityId: number): ModelRecord | null;
  puiPanels(): PuiEvent[];
  commsPanels(): CommsEvent[];
}

export interface PlayerDomain {
  move(vector?: { x?: number; y?: number }, command?: Command): DredlessClient;
  aim(point?: { x?: number; y?: number; mx?: number; my?: number }, command?: Command): DredlessClient;
  action(flags?: Command, command?: Command): DredlessClient;
  useEntity(entity: number | EntityHandle | EntitySummary, options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
  useHeldItem(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
  placeHeldItem(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
  placeBlueprint(placement: BlueprintPlacement, options?: { invSlot?: number; hold?: boolean; mx?: number; my?: number }, command?: Command): DredlessClient;
  rotateHeldItem(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
  selectSlot(invSlot?: number, command?: Command): DredlessClient;
  inputSettings(): CurrentInputSettings;
  setInputSettings(settings?: InputSettings, options?: { send?: boolean }): DredlessClient;
  setView(width: number, height: number, options?: { send?: boolean }): DredlessClient;
  setScreenSize(width: number, height: number, options?: { send?: boolean }): DredlessClient;
  setWrenchMode(mode: WrenchMode, options?: { send?: boolean }): DredlessClient;
  setTurretMode(mode: TurretMode, options?: { send?: boolean }): DredlessClient;
}

export interface ShipManagementDomain {
  requestPlayerList(): DredlessClient;
  resetInvite(): DredlessClient;
  setPrivacy(privacy: ShipPrivacy): DredlessClient;
  recoverStarterItem(itemId: number): DredlessClient;
  setPlayerRank(refId: number, rank: ShipPlayerRank): DredlessClient;
  promotePlayerToCaptain(refId: number): DredlessClient;
  demotePlayerToCrew(refId: number): DredlessClient;
  demotePlayerToGuest(refId: number): DredlessClient;
  kickPlayer(refId: number): DredlessClient;
  banPlayer(refId: number): DredlessClient;
  demoteSelf(): DredlessClient;
  config(): ShipConfigEvent | null;
  captainSubrank(): CaptainSubrankEvent | null;
  playerList(): PlayerListEvent | null;
}
export interface InventoryDomain {
  current(): InventoryState | null;
  slots(): InventorySlot[];
  hotbar(): InventorySlot[];
  equipment(): InventoryState["equipment"];
  drag(source: number, target: number, options?: { split?: boolean }, command?: Command): DredlessClient;
  move(source: number, target: number, options?: { split?: boolean }, command?: Command): DredlessClient;
  equip(source: number, equipmentSlot: EquipmentSlot, options?: { split?: boolean }, command?: Command): DredlessClient;
  unequip(equipmentSlot: EquipmentSlot, target?: number, options?: { split?: boolean }, command?: Command): DredlessClient;
}

export interface WorldDomain {
  id: number | null;
  entities: EntityCollection;
  machines: MachineCollection;
  players: PlayerCollection;
  blocks: BlockCollection;
  materials: MaterialCollection;
  exists(): boolean;
  snapshot(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot | null;
}

export interface ShipDomain extends WorldDomain {
  metadata: ShipWorldMetadataSummary | null;
  entity(): EntityHandle | null;
  overworldEntity: EntityHandle | null;
}

export interface OverworldDomain extends WorldDomain {
  ships(options?: ShipReadOptions): ShipHandle[];
  shipByHex(hexCode: string, options?: ShipReadOptions): ShipHandle | null;
  shipByEntity(entity: number | EntityHandle | EntitySummary, options?: ShipReadOptions): ShipHandle | null;
}

export interface EntityCollection {
  all(): EntityHandle[];
  raw(): EntitySummary[];
  get(entity: number | EntityHandle | EntitySummary): EntityHandle;
}

export interface PlayerCollection { all(): PlayerSummary[]; }
export interface BlockCollection { all(): BlockSummary[]; at(x: number, y: number): BlockSummary | null; }
export interface MaterialCollection { all(): MaterialSummary[]; }

export interface MachineCollection {
  summary(): MachineSummary;
  loaders(): LoaderHandle[];
  loader(entity: number | EntityHandle | EntitySummary): LoaderHandle;
  pushers(): PusherHandle[];
  pusher(entity: number | EntityHandle | EntitySummary): PusherHandle;
  launchers(): LauncherHandle[];
  launcher(entity: number | EntityHandle | EntitySummary): LauncherHandle;
  navigationUnits(): NavigationUnitHandle[];
  navigationUnit(entity?: number | EntityHandle | EntitySummary | null): NavigationUnitHandle | null;
  fabricators(): FabricatorHandle[];
  fabricator(entity: number | EntityHandle | EntitySummary): FabricatorHandle;
  commsStations(): CommsStationHandle[];
  commsStation(entity?: number | EntityHandle | EntitySummary | null): CommsStationHandle | null;
  signs(): SignHandle[];
  sign(entity: number | EntityHandle | EntitySummary): SignHandle;
  generators(): GeneratorHandle[];
  generator(entity: number | EntityHandle | EntitySummary): GeneratorHandle;
  cargoHatches(): CargoHatchHandle[];
  cargoHatch(entity: number | EntityHandle | EntitySummary): CargoHatchHandle;
  cargoEjector(entity: number | EntityHandle | EntitySummary): CargoEjectorHandle;
}

export interface EntityHandle {
  entity: number;
  id: number;
  position: TransformSummary | null;
  health: HealthSummary | null;
  contents: EntityContentsSummary | null;
  exists(): boolean;
  snapshot(): EntitySummary | null;
  use(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient;
}

export interface MachineHandle extends EntityHandle { open(options?: { invSlot?: number; hold?: boolean }, command?: Command): DredlessClient; }

export interface LoaderHandle extends MachineHandle {
  summary(): LoaderSummary | null;
  configure(config?: LoaderConfig): DredlessClient;
  configureFull(config?: LoaderFullConfig): DredlessClient;
  copy(config?: LoaderFullConfig): DredlessClient;
  setPickPlace(pick: LoaderPosition, place: LoaderPosition, config?: LoaderConfig): DredlessClient;
  setPriority(priority: LoaderPriority, config?: LoaderConfig): DredlessClient;
  setStack(stack: number, config?: LoaderConfig): DredlessClient;
  setCycle(cycle: number, config?: LoaderConfig): DredlessClient;
  setRequireOutput(requireOutput: boolean, config?: LoaderConfig): DredlessClient;
  setWaitForStack(waitForStack: boolean, config?: LoaderConfig): DredlessClient;
  setFilterMode(filterMode: LoaderFilterMode): DredlessClient;
  setFilterItems(filterSlots?: Array<number | null | undefined>): DredlessClient;
  pick: number | undefined;
  place: number | undefined;
  priority: number | undefined;
  stack: number | undefined;
  cycle: number | undefined;
  requireOutput: boolean | undefined;
  waitForStack: boolean | undefined;
  filterMode: number | undefined;
  filterSlots: Array<number | null>;
}

export interface PusherHandle extends MachineHandle {
  summary(): PusherSummary | null;
  beam: PusherBeamSummary | null;
  configure(config?: PusherConfig): DredlessClient;
  setAngle(angle: number, config?: PusherConfig): DredlessClient;
  setSpeed(speed: number, config?: PusherConfig): DredlessClient;
  setLength(length: number, config?: PusherConfig): DredlessClient;
  setMode(mode: PusherMode, config?: PusherConfig): DredlessClient;
  setFilteredMode(mode: PusherMode, config?: PusherConfig): DredlessClient;
  setFilterInventory(filterInventory: boolean, config?: PusherConfig): DredlessClient;
  setFilterItems(filterSlots?: Array<number | null | undefined>): DredlessClient;
  angle: number | undefined;
  speed: number | undefined;
  length: number | undefined;
  mode: number | undefined;
  filteredMode: number | undefined;
}

export interface LauncherHandle extends MachineHandle {
  summary(): LauncherSummary | null;
  setAngle(angle: number): DredlessClient;
  setPower(power: number): DredlessClient;
  angleDegrees: number | undefined;
  angleRadians: number | undefined;
  angleRaw: number | null | undefined;
}

export interface NavigationUnitHandle extends MachineHandle {
  summary(): NavigationUnitSummary | null;
  configure(config?: NavigationUnitConfig): DredlessClient;
  copy(config?: NavigationUnitConfig): DredlessClient;
  paste(config?: NavigationUnitConfig): DredlessClient;
  setDestination(destination: number, config?: NavigationUnitConfig): DredlessClient;
  setAutoWarp(config?: NavigationUnitConfig): DredlessClient;
  startWarp(config?: NavigationUnitConfig): DredlessClient;
  cancelWarp(config?: NavigationUnitConfig): DredlessClient;
  destination: number | undefined;
  autoWarpOnShieldFailure: boolean | undefined;
  autoWarpOnNoCaptains: boolean | undefined;
  warp: string | undefined;
}

export interface FabricatorHandle extends MachineHandle {
  panel(): PuiEvent | null;
  add(itemId: number, count?: number, index?: number): DredlessClient;
  sub(itemId: number, count?: number, index?: number): DredlessClient;
  clearQueue(): DredlessClient;
  toggleRepeat(): DredlessClient;
  lockResource(row: number): DredlessClient;
  unlockResource(row: number): DredlessClient;
  eject(row: number): DredlessClient;
}

export interface CommsStationHandle extends MachineHandle {
  summary(): CommsStationSummary | null;
  panel(): CommsEvent | null;
  sendMessage(message?: string): DredlessClient;
}
export interface SignHandle extends MachineHandle {
  summary(): SignSummary | null;
  setText(text?: string, mode?: SignDisplayMode): DredlessClient;
  text: string | undefined;
  mode: number | undefined;
}

export interface GeneratorHandle extends MachineHandle {
  summary(): ShieldGeneratorSummary | null;
  solvePuzzle(solution: string | number): DredlessClient;
}

export interface CargoHatchHandle extends MachineHandle {
  summary(): CargoHatchSummary | null;
  configure(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): DredlessClient;
  copy(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): DredlessClient;
  paste(config?: Pick<LoaderFullConfig, "filterMode" | "filterSlots">): DredlessClient;
  setFilterMode(filterMode: LoaderFilterMode): DredlessClient;
  setFilterItems(filterSlots?: Array<number | null | undefined>): DredlessClient;
}

export interface CargoEjectorHandle extends MachineHandle {
  setDirection(direction: FixedAngleDirection): DredlessClient;
  copy(direction?: FixedAngleDirection): DredlessClient;
  paste(direction?: FixedAngleDirection): DredlessClient;
}

export interface ShipHandle {
  entity: number;
  name: string | null;
  hexCode: string | null;
  distance: number | null;
  worldId: number | null;
  hasWorldData: boolean;
  world(): WorldDomain | null;
  snapshot(): ShipReadSummary;
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
  commsPanels: CommsEvent[];
  currentCommsPanel: CommsEvent | null;
  warnings: unknown[];
  effects: unknown[];
  chat: unknown[];
  motd: unknown[];
  sessionMessages: unknown[];
  scannerResults: ScannerResult[];
  lastScannerResult: ScannerResult | null;
  shipConfig: ShipConfigEvent | null;
  captainSubrank: CaptainSubrankEvent | null;
  playerList: PlayerListEvent | null;
  outfits: { sid: number; outfit: unknown }[];
  commandAcks: CommandAck[];
  lastCommandAck: CommandAck | null;
  decodeErrors: unknown[];
  packetCount: number;
  lastPacket: unknown;
}

export interface CommandAck {
  world: number;
  commandNumber: number;
}

export interface ScannerResult {
  kind: "manifest" | "bom" | "unknown";
  sid: number | null;
  shipHex: string | null;
  shipName: string | null;
  blocks: Record<string, number> | null;
  objects: Record<string, number> | null;
  inventories: Record<string, number> | null;
  materials: Record<string, number> | null;
}

export interface NavigationUnitConfig {
  destination?: number;
  page?: number;
  warp?: boolean | "start" | "idle" | "cancel";
  autoWarpOnShieldFailure?: boolean;
  autoWarpOnNoCaptains?: boolean;
}

export type WrenchMode = 0 | 1 | 2 | "drop-all-items" | "grab-primary-items" | "grab-all-items";
export type TurretMode = 0 | 1 | "continuous-fire" | "volley-fire";

export interface InputSettings {
  wrenchMode?: WrenchMode;
  wrench_mode?: WrenchMode;
  turretMode?: TurretMode;
  turret_mode?: TurretMode;
  viewWidth?: number;
  viewHeight?: number;
  screenWidth?: number;
  screenHeight?: number;
  vx?: number;
  vy?: number;
  scr_w?: number;
  scr_h?: number;
}

export interface CurrentInputSettings {
  wrenchMode: 0 | 1 | 2;
  wrenchModeName: "drop-all-items" | "grab-primary-items" | "grab-all-items" | null;
  turretMode: 0 | 1;
  turretModeName: "continuous-fire" | "volley-fire" | null;
  viewWidth: number | null;
  viewHeight: number | null;
  screenWidth: number | null;
  screenHeight: number | null;
}

export interface InventorySlot {
  index: number;
  itemId: number | null;
  count: number;
  kind: "hotbar" | "inventory" | "equipment";
  equipmentSlot: "back" | "hands" | "feet" | null;
}

export interface InventoryState {
  type: "inventory";
  filter?: number;
  items: unknown[];
  item_counts: unknown[];
  general_slots: number;
  slots: InventorySlot[];
  hotbar: InventorySlot[];
  inventory: InventorySlot[];
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

export interface EntityContentsSummary {
  itemHolder?: ItemHolderSummary;
  expandoBox?: ExpandoBoxSummary;
  hoverOutline?: HoverOutlineSummary;
  blueprintPreview?: BlueprintPreviewSummary;
  itemCrate?: ItemCrateSummary;
  health?: HealthSummary;
  bot?: BotSummary;
  fabricator?: FabricatorSummary;
  processor?: { entity: number; state: ModelRecord };
  cannon?: CannonSummary;
  thruster?: ThrusterSummary;
  pusher?: PusherSummary;
  pusherBeam?: PusherBeamSummary;
  launcher?: LauncherSummary;
  loader?: LoaderSummary;
  cargoHatch?: CargoHatchSummary;
  navigationUnit?: NavigationUnitSummary;
  commsStation?: CommsStationSummary;
  fluidTank?: { entity: number; amount: number | null; state: ModelRecord };
  shieldGenerator?: ShieldGeneratorSummary;
  shieldProjector?: ShieldProjectorSummary;
  helm?: HelmSummary;
  player?: PlayerSummary;
  shipControl?: ShipControlSummary;
  sign?: SignSummary;
  spawnPoint?: SpawnPointSummary;
  door?: DoorSummary;
}

export interface EntitySummary {
  entity: number;
  category: "placed_entity" | "loose_item" | "untyped_holder" | "metadata" | "player" | "ship_control" | "blueprint_preview" | "entity";
  typeId: number | null;
  typeName: string | null;
  markerTypeId: number | null;
  markerTypeName: string | null;
  label: string;
  kind: string[];
  transform: TransformSummary | null;
  footprint: { width: number; height: number; source: "type" | "marker" | "heuristic" | "default" | "crate" | "huge_thruster" | "hover_outline" };
  contents: EntityContentsSummary | null;
  occupies: { x: number; y: number }[];
  tables: { tableId: number; name: string | null; record: ModelRecord }[];
}

export interface BlockSummary {
  x: number;
  y: number;
  entities: EntitySummary[];
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
  currentShipEntity(): EntitySummary | null;
}

export class WorldState {
  constructor(id: number);

  id: number;
  seed: number | null;
  isOverworld: boolean | null;
  tileset: Tileset | null;
  blockWidth: number | null;
  blockHeight: number | null;
  parentWorld: number | null;
  parentEntity: number | null;
  tiles: Map<string, Tile>;
  chunks: unknown[];
  events: unknown[];
  modelPackets: unknown[];
  commsBubbles: CommsBubbleSummary[];
  model: ModelState;
  lastChunkPatch: unknown;
  lastPacket: unknown;
  meta: unknown;

  readMeta(packet: unknown): void;
  addCommsBubble(packet: unknown): CommsBubbleSummary;
  decodeEncrypted(data: Uint8Array | ArrayBuffer | number[]): unknown;
  applyTile(value: unknown): Tile | null;
  applyChunk(value: unknown): Tile[] | null;
  setTile(tile: Tile): Tile;
  normalizeTile(tile: Tile): Tile;
  materials(): MaterialSummary[];
  snapshot(options?: { includeTiles?: boolean; includeModel?: boolean }): WorldSnapshot;
  table(id: number): Map<number, ModelRecord>;
  record(tableId: number, entityId: number): ModelRecord | null;
  tileDefinition(material: number): TileDefinition | null;
  entity(entityId: number): EntitySummary | null;
  entities(): EntitySummary[];
  blocks(): BlockSummary[];
}

export interface Tile {
  x: number;
  y: number;
  material: number;
  materialName?: string | null;
  shape: number;
  shapeName?: string | null;
  hp: number;
  /** @deprecated Use hp. This is the raw 0-255 HP fraction byte, not absolute integrity. */
  integrity: number;
  color: number | null;
  solid?: boolean | null;
  maxHp?: number | null;
  hpRatio?: number | null;
  hpValue?: number | null;
}

export interface MaterialSummary {
  material: number;
  name: string | null;
  count: number;
  solid: boolean | null;
  hp: number | null;
}

export interface TilePhysics {
  filter?: {
    categoryBits: number;
    maskBits: number;
    groupIndex: number;
  };
  transparent?: boolean;
  walkway?: boolean;
  restitution?: number;
  friction?: number;
}

export interface TileDefinition {
  name?: string;
  solid: boolean;
  destruct_item?: number;
  blocks_bullets?: boolean;
  hp?: number;
  no_build_surface?: boolean;
  physics?: TilePhysics;
}

export interface Tileset {
  scale: number;
  atlas: string;
  tile_width: number;
  tiles: TileDefinition[];
}

export interface WorldSnapshot {
  id: number;
  is_overworld: boolean | null;
  overworldZone: OverworldZoneSummary | null;
  shipMetadata: ShipWorldMetadataSummary | null;
  tileset: Tileset | null;
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
  materials: MaterialSummary[];
  model: ModelSnapshot;
  entities: EntitySummary[];
  blocks: BlockSummary[];
  transforms: TransformSummary[];
  machines: MachineSummary;
  players: PlayerSummary[];
  shipControls: ShipControlSummary[];
  commsBubbles: CommsBubbleSummary[];
  tiles?: Tile[];
}

export interface OverworldZoneSummary {
  id: number;
  baseId: number;
  layer: number;
  key: string;
  name: string;
  tiered: boolean;
  displayName: string;
}

export interface ShipWorldMetadataSummary {
  name: string | null;
  color: number | null;
  colorCss: string | null;
  width: number | null;
  height: number | null;
  lockdownTimerSeconds: number | null;
  lockdownCountdownSeconds: number | null;
  onlineShipOwnerCount: number | null;
  requiredShipOwnerCount: number | null;
  allShipOwnersOnline: boolean | null;
  lockdownEngaged: boolean | null;
  lockdownState: ModelRecord;
  shipState: ModelRecord;
}

export interface WorldUpdate {
  type: string;
  world: WorldState | null;
  packet?: unknown;
  bubble?: CommsBubbleSummary;
  decoded?: unknown;
  updates?: unknown[];
  result?: unknown;
}

export interface CommsBubbleSummary {
  sequence: number;
  worldId: number;
  entity: number | null;
  modelId: number | null;
  message: string;
  color: number | null;
  colorCss: string | null;
  durationSeconds: number | null;
  raw: unknown;
}

export class ModelState {
  generation: number | null;
  tables: Map<number, Map<number, ModelRecord>>;
  removedEntities: number[];
  lastUpdate: unknown;
  errors: unknown[];

  table(id: number): Map<number, ModelRecord>;
  record(tableId: number, entityId: number): ModelRecord | null;
  entity(entityId: number): EntitySummary | null;
  entities(): EntitySummary[];
  blocks(): BlockSummary[];
  apply(bytes: Uint8Array | ArrayBuffer | number[]): unknown;
  snapshot(options?: { includeTables?: boolean }): ModelSnapshot;
  tablesSnapshot(): unknown[];
  transforms(): TransformSummary[];
  itemHolders(): ItemHolderSummary[];
  fabricators(): FabricatorSummary[];
  players(): PlayerSummary[];
  shipControls(): ShipControlSummary[];
  shipMetadata(): ShipWorldMetadataSummary | null;
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
  entities: EntitySummary[];
  blocks: BlockSummary[];
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
  itemName: string | null;
  count: number | null;
}

export interface ItemCrateSummary {
  entity: number;
  itemId: number | null;
  itemName: string | null;
  count: number | null;
  width: number | null;
  height: number | null;
  itemState: ModelRecord;
  sizeState: ModelRecord;
}

export interface ExpandoBoxSummary {
  entity: number;
  itemId: number | null;
  itemName: string | null;
  count: number | null;
  width: number | null;
  height: number | null;
  rawWidth: number | null;
  rawHeight: number | null;
  itemState: ModelRecord;
  sizeState: ModelRecord;
}

export interface HoverOutlineSummary {
  entity: number;
  width: number | null;
  height: number | null;
  rawWidth: number | null;
  rawHeight: number | null;
  state: ModelRecord;
}

export interface HealthSummary {
  entity: number;
  hp: number | null;
  maxHp: number | null;
  ratio: number | null;
  state: ModelRecord;
}

export interface BotSummary {
  entity: number;
  className: string;
  identifier: string;
  typeA: number | null;
  typeB: number | null;
}

export interface FabricatorSummary {
  entity: number;
  state: ModelRecord;
  rows: { itemId: number | null; itemName: string | null; count: number | null }[];
  progress: number | null;
}

export interface CannonSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  ammoItemId: number | null;
  ammoName: string | null;
  ammoCount: number;
  aim: number | null;
  recoil: number | null;
  recoil2: number | null;
  recoils: [number | null, number | null];
  charge: number | null;
  charged: boolean | null;
  spin: number | null;
  coolingCellCount: number;
  state: ModelRecord;
}

export interface ThrusterSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  facing: number;
  facingName: "bottom" | "top" | "right" | "left" | "bottom-right" | "bottom-left" | "top-right" | "top-left" | null;
  fuel: number | null;
  state: ModelRecord;
}

export interface LoaderSummary {
  entity: number;
  pick: number | null;
  pickName: string | null;
  place: number | null;
  placeName: string | null;
  priority: number | null;
  priorityName: string | null;
  requireOutput: boolean | null;
  waitForStack: boolean | null;
  stack: number | null;
  cycle: number | null;
  filterMode: number | null;
  filterModeName: string | null;
  filterSlots: (number | null)[] | null;
  state: ModelRecord;
  filterState: ModelRecord;
  filterSlotsState: ModelRecord;
}

export interface CargoHatchSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  filterMode: number;
  filterModeName: string | null;
  filterSlots: (number | null)[] | null;
  filterState: ModelRecord;
  filterSlotsState: ModelRecord;
}

export interface LauncherSummary {
  entity: number;
  angleRaw: number | null;
  angleRadians: number | null;
  angleDegrees: number | null;
  state: ModelRecord;
}

export interface NavigationUnitSummary {
  entity: number;
  destination: number;
  destinationName: string | null;
  autoWarpOnShieldFailure: boolean | null;
  autoWarpOnNoCaptains: boolean | null;
  state: ModelRecord;
}

export interface PusherSummary {
  entity: number;
  mode: number;
  modeName: string | null;
  filteredMode: number;
  filteredModeName: string | null;
  angle: number | null;
  speed: number;
  length: number;
  filterInventory: boolean;
  filterSlots: (number | null)[] | null;
  state: ModelRecord;
  filterSlotsState: ModelRecord;
}

export interface PusherBeamSummary {
  entity: number;
  active: boolean;
  mode: number;
  modeName: string | null;
  lengthRaw: number;
  length: number;
  state: ModelRecord;
}

export interface CommsStationSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  charges: number | null;
  maxCharges: number;
  chargeRatio: number | null;
  occupied: boolean;
  state: ModelRecord;
}

export interface SignSummary {
  entity: number;
  text: string;
  displayMode: number;
  displayModeName: string | null;
  state: ModelRecord;
}

export interface SpawnPointSummary {
  entity: number;
  rank: number;
  rankName: string | null;
  state: ModelRecord;
}

export interface DoorSummary {
  entity: number;
  rank: number;
  rankName: string | null;
  open: boolean;
  rankState: ModelRecord;
  state: ModelRecord;
}

export interface ShieldProjectorSummary {
  entity: number;
  active: boolean;
  state: ModelRecord;
}

export interface ShieldGeneratorSummary {
  entity: number;
  charge: number;
  maxCharge: number;
  chargeRatio: number | null;
  efficiencyPercent: number | null;
  efficiency: number | null;
  storedItemId: number | null;
  storedItemName: string | null;
  storedItemCount: number | null;
  hasShieldCore: boolean;
  boostState: number;
  boostStateName: string | null;
  boostTimer: number;
  boostActive: boolean;
  puzzleSeed: number | null;
  puzzleSolution: string | null;
  state: ModelRecord;
  itemState: ModelRecord;
  boostStateRaw: ModelRecord;
}

export interface GeneratorMazeCellWalls {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface GeneratorMazeCell {
  x: number;
  y: number;
  value: number;
  hex: string;
  digit: number;
  walls: GeneratorMazeCellWalls;
  backtrackDirection: number;
  marker: number;
}

export interface GeneratorMaze {
  seed: number;
  width: number;
  height: number;
  cells: GeneratorMazeCell[];
  rows: GeneratorMazeCell[][];
  solution: string;
}

export interface HelmSummary {
  entity: number;
  typeId: number;
  typeName: string | null;
  occupied: boolean;
}

export interface PlayerSummary {
  entity: number;
  name: string | null;
  heldItemId: number | null;
  heldItemName: string | null;
  repairTargetDistance: number | null;
  repairTargetAngle: number | null;
  teamRank: number | null;
  teamRankName: string | null;
  gameRank: number | null;
  gameRankName: string | null;
  patronTier: "bronze" | "silver" | "gold" | "plat" | "flux" | null;
  piloting: boolean;
  muted: boolean;
  actionPreview: PlayerActionPreviewSummary | null;
  state: ModelRecord;
}

export interface PlayerActionPreviewSummary {
  entity: number;
  active: boolean;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  progress: number | null;
  color: number | null;
  colorCss: string | null;
  actionName: "place" | "break" | "blueprint" | null;
  blueprintId: number | null;
  blueprintItems: BlueprintPreviewSummary[];
  state: ModelRecord;
}

export interface BlueprintPreviewSummary {
  entity: number;
  itemId: number;
  itemName: string | null;
  bits: number;
  rawBits: number | null;
  placementOffsets: number[];
  placementCount: number;
  placements: {
    offset: number;
    x: number | null;
    y: number | null;
    itemId: number;
    itemName: string | null;
  }[];
  x: number | null;
  y: number | null;
  rot: number | null;
  state: ModelRecord;
}

export interface ShipControlSummary {
  entity: number;
  name: string | null;
  hexCode: string | null;
  shipWorldId: number | null;
  color: number | null;
  colorCss: string | null;
  thrustX: number | null;
  thrustY: number | null;
  value52: number | null;
  value84: number | null;
  value96: number | null;
  shield: ShipShieldSummary | null;
  warp: ShipWarpSummary | null;
  state: ModelRecord;
}

export interface ShipReadSummary {
  entity: number;
  name: string | null;
  hexCode: string | null;
  color: number | null;
  colorCss: string | null;
  position: { x: number | null; y: number | null; rot: number | null } | null;
  distance: number | null;
  footprint: EntitySummary["footprint"];
  label: string;
  kind: string[];
  thrust: { x: number | null; y: number | null };
  shield: ShipShieldSummary | null;
  warp: ShipWarpSummary | null;
  worldId: number | null;
  hasWorldData: boolean;
  world: WorldSnapshot | null;
  control: ShipControlSummary;
  entitySummary: EntitySummary;
}

export interface ShipShieldSummary {
  maxHp: number | null;
  baseHp: number | null;
  activeTankHp: number | null;
  inactiveTankHp: number | null;
  tankValues: number[];
}

export interface ShipWarpSummary {
  active: boolean;
  ticks: number;
  elapsedSeconds: number;
  durationSeconds: number;
  remainingSeconds: number;
}

export interface MachineSummary {
  itemHolders: ItemHolderSummary[];
  health: HealthSummary[];
  fabricators: FabricatorSummary[];
  processors: { entity: number; state: ModelRecord }[];
  cannons: CannonSummary[];
  thrusters: ThrusterSummary[];
  pushers: PusherSummary[];
  pusherBeams: PusherBeamSummary[];
  launchers: LauncherSummary[];
  loaders: LoaderSummary[];
  cargoHatches: CargoHatchSummary[];
  navigationUnits: NavigationUnitSummary[];
  commsStations: CommsStationSummary[];
  fluidTanks: { entity: number; amount: number | null; state: ModelRecord }[];
  shieldGenerators: ShieldGeneratorSummary[];
  shieldProjectors: ShieldProjectorSummary[];
  expandoBoxes: ExpandoBoxSummary[];
}

export function decodeMsgpack(bytes: Uint8Array | ArrayBuffer | number[]): unknown;
export function encodeMsgpack(value: unknown): Uint8Array;
export function buildCommsMessage(message?: string): CommsMessage;
export function normalizeCommsEvent(event: unknown): CommsEvent;
export function flattenRichText(value: unknown): string;
export function buildSignedCommandPacket(command: Command, sessionId: number): Uint8Array;
export function buildInventoryDragCommand(source: number, target: number, split?: boolean): InventoryDragCommand;
export function buildEquipItemCommand(source: number, slot: EquipmentSlot, split?: boolean): InventoryDragCommand;
export function buildUnequipItemCommand(slot: EquipmentSlot, target?: number, split?: boolean): InventoryDragCommand;
export function normalizeEquipmentSlot(slot: EquipmentSlot): 19 | 20 | 21;
export function equipmentSlotName(slot: number): "back" | "hands" | "feet" | null;
export function normalizeInventoryEvent(event: unknown): InventoryState;
export function buildShipManagementMessage(act: string, arg?: unknown, extra?: Record<string, unknown> | null): ShipManagementMessage;
export function buildShipPrivacyMessage(privacy: ShipPrivacy): ShipManagementMessage;
export function buildStarterRecoveryMessage(itemId: number): ShipManagementMessage;
export function buildPlayerListMessage(): ShipManagementMessage;
export function buildInviteResetMessage(): ShipManagementMessage;
export function buildSetPlayerRankMessage(refId: number, rank: ShipPlayerRank): ShipManagementMessage;
export function buildKickPlayerMessage(refId: number): ShipManagementMessage;
export function buildBanPlayerMessage(refId: number): ShipManagementMessage;
export function buildDemoteSelfMessage(): ShipManagementMessage;
export function normalizePrivacy(privacy: ShipPrivacy): 0 | 1;
export function normalizePlayerRank(rank: ShipPlayerRank): 0 | 1 | 3;
export function normalizeShipConfigEvent(event: unknown): ShipConfigEvent;
export function normalizeCaptainSubrankEvent(event: unknown): CaptainSubrankEvent;
export function normalizePlayerListEvent(event: unknown, previous?: PlayerListEvent | null): PlayerListEvent;
export function buildSignTextMessage(text?: string, mode?: SignDisplayMode): SignTextMessage;
export function normalizeSignDisplayMode(mode?: SignDisplayMode): 0 | 1 | 2;
export function signDisplayModeName(mode: number): "always" | "when-near" | "on-hover" | null;
export function buildNavigationUnitConfigData(entity: number, config: NavigationUnitConfig & { destination: number }): Uint8Array;
export function buildNavigationUnitClipboardConfigData(config: NavigationUnitConfig & { destination: number }): Uint8Array;
export function buildNavigationUnitPasteConfigData(entity: number, config: NavigationUnitConfig & { destination: number }): Uint8Array;
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
export function generateGeneratorMaze(seed: number): GeneratorMaze;
export function solveGeneratorMazeSeed(seed: number): string;
export function maybeSolveGeneratorMazeSeed(seed: number | null | undefined): string | null;
export function decryptPayload(wireBytes: Uint8Array | ArrayBuffer | number[], worldId: number, seed: number): Uint8Array;
export function decompressLz4Frame(bytes: Uint8Array | ArrayBuffer | number[]): Uint8Array;
export function decodeModelData(bytes: Uint8Array | ArrayBuffer | number[]): unknown;

export function createSession(noticeVersion?: number | null): Promise<Session>;
export function createAnonSession(anonKey?: string | null, noticeVersion?: number | null, baseUrl?: string): Promise<AnonSession>;
export function createAnonToken(noticeVersion?: number | null, baseUrl?: string): Promise<string>;
export function fetchNoticeVersion(): Promise<number>;
export function fetchGameVersion(): Promise<string>;
export function fetchServers(): Promise<Server[]>;
export function fetchShips(session: Session, server: ServerRef): Promise<Ship[]>;
export function fetchShipList(session: Session, server: ServerRef): Promise<ShipList>;
export function join(server: ServerRef, ship?: ShipRef, session?: Session | null): Promise<DredlessClient>;
export function start(server: ServerRef, ship?: ShipRef, session?: Session | null): Promise<DredlessClient>;
export function newShip(server: ServerRef, name?: string, color?: string, session?: Session | null): Promise<DredlessClient>;
export function invite(server: ServerRef, code: string, session?: Session | null): Promise<DredlessClient>;
export function startInvite(server: ServerRef, code: string, session?: Session | null): Promise<DredlessClient>;
export function buildBlueprintPlacementMessage(placement: BlueprintPlacement): BlueprintPlacementMessage;

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
  invite: typeof invite;
  startInvite: typeof startInvite;
}

export const Dredless: DredlessNamespace;
export default Dredless;






