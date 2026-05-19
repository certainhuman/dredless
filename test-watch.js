import Dredless from "./src/index.js";
import readline from "node:readline";

const BASE_URL = "https://test.drednot.io";
const ANON_KEY = process.env.DRED_ANON_KEY || "yw1TOG_3K2PoUpEFf5b7ZLjh";
const SERVER_INDEX = Number(process.env.DRED_SERVER ?? 0);
const SHIP_REF = process.env.DRED_SHIP || null;
const REFRESH_MS = Number(process.env.DRED_REFRESH_MS ?? 500);
const MAX_LINES = Number(process.env.DRED_LINES ?? process.stdout.rows ?? 45);
const MAX_WIDTH = Number(process.env.DRED_COLUMNS ?? process.stdout.columns ?? 120);
const USE_ALT_SCREEN = process.env.DRED_ALT_SCREEN !== "0";

const counters = new Map();
const recentPackets = [];
const recentEvents = [];
let client = null;
let session = null;
let phase = "starting";
let status = "initializing";
let renderTimer = null;
let tuiStarted = false;
let inputStarted = false;
let activeTabIndex = 0;
const scrollOffsets = new Map();

const TABS = [
  { key: "overview", label: "Overview", render: renderOverviewTab },
  { key: "packets", label: "Packets", render: renderPacketsTab },
  { key: "worlds", label: "Worlds", render: renderWorldsTab },
  { key: "ship", label: "Ship", render: renderShipTab },
  { key: "machines", label: "Machines", render: renderMachinesTab },
  { key: "entities", label: "Entities", render: renderEntitiesTab },
  { key: "occupancy", label: "Occupancy", render: renderOccupancyTab },
  { key: "tiles", label: "Tiles", render: renderTilesTab },
  { key: "tileset", label: "Tileset", render: renderTilesetTab },
  { key: "messages", label: "Messages", render: renderMessagesTab }
];

function inc(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function pushLimited(list, value, limit = 12) {
  list.push(value);
  if (list.length > limit) list.splice(0, list.length - limit);
}

function text(value) {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); }
  catch (_) { return String(value); }
}

function clip(line) {
  const raw = String(line ?? "");
  if (raw.length <= MAX_WIDTH) return raw;
  return `${raw.slice(0, Math.max(0, MAX_WIDTH - 3))}...`;
}

function add(lines, line = "") {
  lines.push(clip(line));
}

function section(lines, title) {
  add(lines);
  add(lines, title);
  add(lines, "-".repeat(Math.min(title.length, MAX_WIDTH)));
}

function fmtAge(time) {
  if (!time) return "-";
  return `${((Date.now() - time) / 1000).toFixed(1)}s ago`;
}

function packetType(packet) {
  return packet && typeof packet === "object" ? packet.type : typeof packet;
}

function summarizePacket(packet) {
  if (!packet || typeof packet !== "object") return text(packet);
  const parts = [`type=${packet.type}`];
  if (packet.world != null) parts.push(`world=${packet.world}`);
  if (packet.sid != null) parts.push(`sid=${packet.sid}`);
  if (packet.command_number != null) parts.push(`ack=${packet.command_number}`);
  if (packet.submessage != null) parts.push(`sub=${text(packet.submessage).slice(0, 50)}`);
  if (packet.text != null) parts.push(`text=${String(packet.text).replace(/\s+/g, " ").slice(0, 70)}`);
  return parts.join(" ");
}

function summarizeWorld(world) {
  const model = world.model?.snapshot?.() || null;
  const entities = world.entities?.() || [];
  const blocks = world.blocks?.() || [];
  return [
    `world=${world.id}`,
    world.isOverworld ? "overworld" : "ship/sub",
    world.tileset ? `tileset=${world.tileset.atlas}` : null,
    `tiles=${world.tiles?.size ?? 0}`,
    `chunks=${world.chunks?.length ?? 0}`,
    `gen=${model?.generation ?? "-"}`,
    `tables=${model?.tableCount ?? 0}`,
    `entities=${model?.entityCount ?? 0}`,
    `entityViews=${entities.length}`,
    `blocks=${blocks.length}`,
    world.parentWorld != null ? `parent=${world.parentWorld}:${world.parentEntity ?? "-"}` : null,
    world.meta?.removed ? "removed" : null
  ].filter(Boolean).join(" ");
}

function sortedWorlds() {
  if (!client) return [];
  return [...client.worlds.worlds.values()].sort((a, b) => {
    if (a.isOverworld !== b.isOverworld) return a.isOverworld ? -1 : 1;
    return a.id - b.id;
  });
}

function renderInventory(lines) {
  const inventory = client?.inventory;
  if (!inventory) {
    add(lines, "inventory: -");
    return;
  }
  const hotbar = inventory.hotbar.map((slot) => `${slot.index}:${slot.itemId ?? "-"}x${slot.count}`).join(" ");
  add(lines, `inventory filter=${inventory.filter ?? "-"} general=${inventory.general_slots} hotbar ${hotbar || "-"}`);
  add(lines, `equipment back=${slotText(inventory.equipment.back)} hands=${slotText(inventory.equipment.hands)} feet=${slotText(inventory.equipment.feet)}`);
}

function slotText(slot) {
  return slot ? `${slot.itemId ?? "-"}x${slot.count}` : "-";
}

function renderMachines(lines, world) {
  const machines = world?.model?.machines?.();
  if (!machines) {
    add(lines, "machines: -");
    return;
  }
  add(lines, [
    `holders=${machines.itemHolders.length}`,
    `fabricators=${machines.fabricators.length}`,
    `processors=${machines.processors.length}`,
    `cannons=${machines.cannons.length}`,
    `tanks=${machines.fluidTanks.length}`,
    `shields=${machines.shieldGenerators.length}`
  ].join(" "));

  const holders = machines.itemHolders
    .slice()
    .sort((a, b) => Number(b.itemId != null || b.count != null) - Number(a.itemId != null || a.count != null));
  for (const holder of holders) {
    const item = holder.itemName ?? holder.itemId ?? "-";
    const entity = world.entity?.(holder.entity);
    const field = entity?.category === "placed_entity"
      ? "stored"
      : entity?.category === "loose_item"
        ? "item"
        : "holder";
    add(lines, `  holder ent=${holder.entity} ${entity?.label ?? "Holder"} category=${entity?.category ?? "-"} ${field}=${item}x${holder.count ?? "-"}`);
  }
  for (const fab of machines.fabricators) {
    const rows = fab.rows.map((row, index) => `${index}:${row.itemName ?? row.itemId ?? "-"}x${row.count ?? "-"}`).join(" ");
    add(lines, `  fabricator ent=${fab.entity} progress=${fab.progress ?? "-"} rows ${rows}`);
  }
  for (const cannon of machines.cannons) {
    const ammo = cannon.ammoName ?? cannon.ammoItemId ?? "-";
    add(lines, `  cannon ent=${cannon.entity} ammo=${ammo}x${cannon.ammoCount ?? "-"} charge=${cannon.charge ?? "-"} charged=${text(cannon.charged)}`);
  }
  for (const tank of machines.fluidTanks) add(lines, `  tank ent=${tank.entity} amount=${tank.amount ?? "-"}`);
  for (const shield of machines.shieldGenerators) add(lines, `  shield ent=${shield.entity} charge=${shield.charge ?? "-"}`);
}

function renderModel(lines, world) {
  if (!world) {
    add(lines, "current world: -");
    return;
  }
  const model = world.model.snapshot();
  add(lines, summarizeWorld(world));
  const last = model.lastUpdate;
  add(lines, `model last sections=${last?.sectionCount ?? 0} removals=${last?.removals ?? 0} error=${last?.error ?? "-"}`);
  if (last?.sections?.length) {
    add(lines, `sections ${last.sections.slice(0, 8).map((item) => `${item.table}:${item.name || "?"}(${item.records})`).join(" ")}`);
  }
  const transforms = world.model.transforms().slice(0, 8);
  if (transforms.length) {
    for (const item of transforms) {
      add(lines, `  transform ent=${item.entity} x=${num(item.x)} y=${num(item.y)} rot=${num(item.rot)}`);
    }
  } else {
    add(lines, "  transforms: -");
  }
}

function renderTileset(lines, world) {
  const tileset = world?.tileset;
  if (!tileset) {
    add(lines, "tileset: -");
    return;
  }
  add(lines, `atlas=${tileset.atlas} scale=${tileset.scale} tile_width=${tileset.tile_width} tiles=${tileset.tiles.length}`);
  for (const [index, tile] of tileset.tiles.entries()) {
    const bits = [`${index}`, tile.name || null, tile.solid ? "solid" : "open"].filter(Boolean);
    if (tile.destruct_item != null) bits.push(`destruct=${tile.destruct_item}`);
    if (tile.blocks_bullets) bits.push("bullets");
    if (tile.hp != null) bits.push(`hp=${tile.hp}`);
    if (tile.no_build_surface) bits.push("nobuild");
    if (tile.physics?.walkway) bits.push("walkway");
    if (tile.physics?.transparent) bits.push("transparent");
    add(lines, `  ${bits.join(" ")}`);
  }
}

function renderEntities(lines, world) {
  const allEntities = world?.entities?.() || [];
  const entities = allEntities.filter((entity) => entity.category !== "metadata");
  if (!entities.length) {
    add(lines, "entities: -");
    return;
  }
  add(lines, `count=${entities.length} metadataHidden=${allEntities.length - entities.length}`);
  for (const entity of entities) {
    const pos = entity.transform ? `(${num(entity.transform.x)},${num(entity.transform.y)})` : "-";
    const contentBits = [];
    if (entity.contents?.itemHolder && (entity.contents.itemHolder.itemId != null || entity.contents.itemHolder.count != null)) {
      const itemLabel = entity.contents.itemHolder.itemName ?? entity.contents.itemHolder.itemId ?? "-";
      const field = entity.category === "placed_entity"
        ? "stored"
        : entity.category === "loose_item"
          ? "item"
          : "holder";
      contentBits.push(`${field}=${itemLabel}x${entity.contents.itemHolder.count ?? "-"}`);
    }
    if (entity.contents?.health) contentBits.push(entityHpText(entity.contents.health));
    if (entity.contents?.fabricator) contentBits.push(`fab=${entity.contents.fabricator.progress ?? "-"}`);
    if (entity.contents?.cannon) {
      const ammo = entity.contents.cannon.ammoName ?? entity.contents.cannon.ammoItemId ?? "-";
      contentBits.push(`cannon=${ammo}x${entity.contents.cannon.ammoCount ?? "-"} charge=${entity.contents.cannon.charge ?? "-"}`);
    }
    if (entity.contents?.player) {
      if (entity.contents.player.name) contentBits.push(`name=${entity.contents.player.name}`);
      const held = entity.contents.player.heldItemName ?? entity.contents.player.heldItemId ?? "-";
      contentBits.push(`held=${held}`);
    }
    if (entity.contents?.fluidTank) contentBits.push(`tank=${entity.contents.fluidTank.amount ?? "-"}`);
    if (entity.contents?.shieldGenerator) contentBits.push(`shield=${entity.contents.shieldGenerator.charge ?? "-"}`);
    add(lines, `  ent=${entity.entity} ${entity.label} category=${entity.category ?? "-"} pos=${pos} kind=${entity.kind.join(",") || "-"} ${contentBits.join(" ")}`.trim());
  }
}

function renderOccupancy(lines, world) {
  const blocks = (world?.blocks?.() || [])
    .map((block) => ({ ...block, entities: block.entities.filter((entity) => entity.category !== "metadata") }))
    .filter((block) => block.entities.length > 0);
  if (!blocks.length) {
    add(lines, "occupancy: -");
    return;
  }
  add(lines, `count=${blocks.length}`);
  for (const block of blocks) {
    const occupants = block.entities.map((entity) => `${entity.label}#${entity.entity}:${entity.category ?? "-"}`).join(", ");
    add(lines, `  ${block.x},${block.y}: ${occupants}`);
  }
}

function renderTiles(lines, world) {
  const tiles = [...(world?.tiles?.values?.() || [])].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  if (!tiles.length) {
    add(lines, "tiles: -");
    return;
  }
  add(lines, `count=${tiles.length}`);
  for (const tile of tiles) {
    const def = world.tileDefinition?.(tile.material);
    const bits = [
      `${tile.x},${tile.y}`,
      `mat=${tile.material}`,
      def?.name || null,
      `shape=${tile.shape}`,
      tileHpText(tile, def),
      tile.color != null ? `color=${tile.color}` : null,
      def?.solid ? "solid" : "open",
      def?.destruct_item != null ? `item=${def.destruct_item}` : null
    ].filter(Boolean);
    add(lines, `  ${bits.join(" ")}`);
  }
}

function tileHpText(tile, def) {
  const hp = tile.hp ?? tile.integrity;
  if (hp == null) return "hp=-";
  if (def?.hp == null) return `hp=${hp}/255`;
  return `hp=${hp}/255~${Math.round((hp / 255) * def.hp)}/${def.hp}`;
}

function entityHpText(health) {
  const hp = health.hp ?? "-";
  const maxHp = health.maxHp ?? "-";
  const percent = typeof health.ratio === "number" ? ` ${(health.ratio * 100).toFixed(0)}%` : "";
  return `hp=${hp}/${maxHp}${percent}`;
}

function num(value) {
  return typeof value === "number" ? value.toFixed(2) : "-";
}

function currentTab() {
  return TABS[activeTabIndex] || TABS[0];
}

function scrollOffset(tab = currentTab()) {
  return scrollOffsets.get(tab.key) || 0;
}

function setScrollOffset(value, tab = currentTab()) {
  scrollOffsets.set(tab.key, Math.max(0, Math.floor(value)));
}

function switchTab(delta) {
  activeTabIndex = (activeTabIndex + delta + TABS.length) % TABS.length;
}

function setTab(index) {
  if (index >= 0 && index < TABS.length) activeTabIndex = index;
}

function render() {
  if (!process.stdout.isTTY) return;
  const headerLines = [];
  const bodyLines = [];
  const now = new Date();
  const shipWorld = client?.worlds.shipWorld?.();
  const overworld = client?.worlds.overworld?.();
  const context = { now, shipWorld, overworld };
  const tab = currentTab();

  add(headerLines, `dredless live state | ${now.toLocaleTimeString()} | ${phase}`);
  add(headerLines, `status: ${status}`);
  if (client) {
    add(headerLines, [
      `ready=${client.ready}`,
      `connected=${client.connected}`,
      `sid=${client.sid ?? "-"}`,
      `server=${client.serverId}:${client.server?.domain ?? "-"}`,
      `port=${client.netPort}`,
      `packets=${client.packetCount}`,
      `cpu=${client.cpuLoad ?? "-"}`,
      `ack=${client.lastCommandAck ? `${client.lastCommandAck.world}:${client.lastCommandAck.commandNumber}` : "-"}`
    ].join(" "));
  }
  add(headerLines, tabBar());

  tab.render(bodyLines, context);
  const footerLines = 2;
  const helpLines = 1;
  const bodyHeight = Math.max(1, MAX_LINES - headerLines.length - helpLines - footerLines);
  const maxScroll = Math.max(0, bodyLines.length - bodyHeight);
  const offset = Math.min(scrollOffset(tab), maxScroll);
  setScrollOffset(offset, tab);
  add(headerLines, [
    "Tab/Right/]/Left/[ switch",
    "Up/Down scroll",
    "PgUp/PgDn page",
    "Home/End top/bottom",
    "1-9 jump",
    "q/Ctrl+C quit",
    `scroll=${offset}/${maxScroll}`
  ].join(" | "));

  writeScreen([
    ...headerLines,
    ...bodyLines.slice(offset, offset + bodyHeight)
  ]);
}

function tabBar() {
  return TABS
    .map((tab, index) => {
      const label = `${index + 1}:${tab.label}`;
      return index === activeTabIndex ? `[${label}]` : label;
    })
    .join(" ");
}

function renderOverviewTab(lines, { shipWorld, overworld }) {
  section(lines, "Overview");
  section(lines, "Worlds");
  renderWorlds(lines);
  section(lines, "Inventory And UI");
  renderInventoryAndUi(lines);
  section(lines, "Ship World Model");
  renderModel(lines, shipWorld);
  section(lines, "Machines");
  renderMachines(lines, shipWorld);
  section(lines, "Overworld");
  renderOverworld(lines, overworld);
}

function renderPacketsTab(lines) {
  section(lines, "Packets");
  add(lines, [...counters.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([type, count]) => `${type}:${count}`).join(" ") || "-");
  for (const item of recentPackets.slice().reverse()) add(lines, `  ${fmtAge(item.time)} ${item.text}`);
}

function renderWorldsTab(lines) {
  section(lines, "Worlds");
  renderWorlds(lines);
}

function renderWorlds(lines) {
  const worlds = sortedWorlds();
  if (!worlds.length) add(lines, "-");
  for (const world of worlds) add(lines, summarizeWorld(world));
}

function renderShipTab(lines, { shipWorld }) {
  section(lines, "Ship World Model");
  renderModel(lines, shipWorld);
  section(lines, "Entities");
  renderEntities(lines, shipWorld);
}

function renderMachinesTab(lines, { shipWorld }) {
  section(lines, "Machines");
  renderMachines(lines, shipWorld);
}

function renderEntitiesTab(lines, { shipWorld }) {
  section(lines, "Entities");
  renderEntities(lines, shipWorld);
}

function renderOccupancyTab(lines, { shipWorld }) {
  section(lines, "Entity Occupancy");
  renderOccupancy(lines, shipWorld);
}

function renderTilesTab(lines, { shipWorld }) {
  section(lines, "Tiles");
  renderTiles(lines, shipWorld);
}

function renderTilesetTab(lines, { shipWorld }) {
  section(lines, "Tileset");
  renderTileset(lines, shipWorld);
}

function renderMessagesTab(lines) {
  section(lines, "Inventory And UI");
  renderInventoryAndUi(lines);
  section(lines, "Messages");
  renderMessages(lines);
}

function renderInventoryAndUi(lines) {
  renderInventory(lines);
  const panels = [...(client?.puiPanels?.values?.() || [])].slice(-4);
  add(lines, `pui panels=${panels.length} warnings=${client?.warnings.length ?? 0} sfx=${client?.effects.length ?? 0}`);
  for (const panel of panels) add(lines, `  pui ent=${panel.ent_id ?? "-"} type=${panel.data?.type ?? "-"} update=${Boolean(panel.update)}`);
}

function renderOverworld(lines, overworld) {
  if (overworld) {
    add(lines, summarizeWorld(overworld));
    for (const control of overworld.model.shipControls().slice(0, 6)) {
      add(lines, `  ship ent=${control.entity} thrust=(${num(control.thrustX)},${num(control.thrustY)})`);
    }
  } else {
    add(lines, "-");
  }
}

function renderMessages(lines) {
  for (const message of (client?.chat || []).slice(-4).reverse()) add(lines, `chat ${String(message.text ?? text(message)).replace(/\s+/g, " ").slice(0, 100)}`);
  for (const message of (client?.motd || []).slice(-2).reverse()) add(lines, `motd ${String(message.text ?? text(message)).replace(/\s+/g, " ").slice(0, 100)}`);
  for (const event of recentEvents.slice(-5).reverse()) add(lines, `${fmtAge(event.time)} ${event.text}`);
}

function writeScreen(lines) {
  startTui();
  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);
  process.stdout.write([
    ...lines,
    "",
    "Ctrl+C to disconnect."
  ].join("\n"));
}

function startTui() {
  if (tuiStarted || !process.stdout.isTTY) return;
  tuiStarted = true;
  if (USE_ALT_SCREEN) process.stdout.write("\x1b[?1049h");
  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);
  process.stdout.write("\x1b[?25l");
  startInput();
}

function stopTui() {
  if (!tuiStarted || !process.stdout.isTTY) return;
  stopInput();
  process.stdout.write("\x1b[?25h");
  if (USE_ALT_SCREEN) process.stdout.write("\x1b[?1049l");
  tuiStarted = false;
}

function startInput() {
  if (inputStarted || !process.stdin.isTTY) return;
  inputStarted = true;
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("keypress", handleKeypress);
}

function stopInput() {
  if (!inputStarted || !process.stdin.isTTY) return;
  process.stdin.off("keypress", handleKeypress);
  process.stdin.setRawMode?.(false);
  process.stdin.pause();
  inputStarted = false;
}

function handleKeypress(str, key = {}) {
  if (key.ctrl && key.name === "c") {
    shutdown();
    return;
  }
  if (str === "q" || str === "Q") {
    shutdown();
    return;
  }
  if (key.name === "tab" || key.name === "right" || str === "]") switchTab(1);
  else if (key.name === "left" || str === "[") switchTab(-1);
  else if (key.name === "up") setScrollOffset(scrollOffset() - 1);
  else if (key.name === "down") setScrollOffset(scrollOffset() + 1);
  else if (key.name === "pageup") setScrollOffset(scrollOffset() - Math.max(1, MAX_LINES - 8));
  else if (key.name === "pagedown") setScrollOffset(scrollOffset() + Math.max(1, MAX_LINES - 8));
  else if (key.name === "home") setScrollOffset(0);
  else if (key.name === "end") setScrollOffset(Number.MAX_SAFE_INTEGER);
  else if (/^[1-9]$/.test(str || "")) setTab(Number(str) - 1);
  else return;
  render();
}

async function main() {
  renderTimer = setInterval(render, REFRESH_MS);
  renderTimer.unref?.();

  status = "fetching versions";
  render();
  const [noticeVersion, gameVersion] = await Promise.all([
    Dredless.fetchNoticeVersion(BASE_URL),
    Dredless.fetchGameVersion(BASE_URL)
  ]);

  status = `notice=${noticeVersion} game=${gameVersion}`;
  render();
  const servers = await Dredless.fetchServers(BASE_URL);
  const server = servers.find((item) => item.index === SERVER_INDEX) || servers[0];
  if (!server) throw new Error("No drednot servers returned");

  phase = "session";
  status = `creating anon session for ${server.index}:${server.domain}`;
  render();
  session = await Dredless.createAnonSession(ANON_KEY, noticeVersion, BASE_URL);

  phase = "ship";
  status = "fetching ships";
  render();
  const ships = await session.fetchShips(server);
  const ownedShips = ships.filter((ship) => ship.owned);
  const selected = selectShip(ships, ownedShips);

  phase = "joining";
  status = selected ? `joining ${selected.name || selected.hexCode || selected.id}` : "creating unnamed ship";
  render();
  const connection = selected
    ? await session.startConnection(server, selected)
    : await session.startNewShipConnection(server);
  client = new Dredless.DredlessClient(connection);
  bindClient(client);
  await client.waitUntilReady();

  phase = "live";
  status = "connected";
  renderTimer.ref?.();
  render();
}

function selectShip(ships, ownedShips) {
  if (SHIP_REF) {
    const wanted = SHIP_REF.toLowerCase();
    return ships.find((ship) => (
      String(ship.id ?? "").toLowerCase() === wanted ||
      String(ship.hexCode ?? "").toLowerCase() === wanted ||
      String(ship.name ?? "").toLowerCase() === wanted
    )) || { type: "join_or_load", id: SHIP_REF };
  }
  return ownedShips[0] || null;
}

function bindClient(activeClient) {
  activeClient.on("packet", (packet) => {
    inc(counters, packetType(packet));
    pushLimited(recentPackets, { time: Date.now(), text: summarizePacket(packet) });
  });
  activeClient.on("inventory", (inventory) => pushLimited(recentEvents, { time: Date.now(), text: `inventory slots=${inventory.slots.length}` }));
  activeClient.on("pui", (panel) => pushLimited(recentEvents, { time: Date.now(), text: `pui ent=${panel.ent_id ?? "-"} type=${panel.data?.type ?? "-"}` }));
  activeClient.on("tip_warn", (event) => pushLimited(recentEvents, { time: Date.now(), text: `warn ${event.text ?? text(event)}` }));
  activeClient.on("sfx", () => pushLimited(recentEvents, { time: Date.now(), text: "sfx" }));
  activeClient.on("ack", (ack) => pushLimited(recentEvents, { time: Date.now(), text: `ack world=${ack.world} n=${ack.commandNumber}` }));
  activeClient.on("close", () => {
    phase = "closed";
    status = "websocket closed";
    render();
  });
  activeClient.on("error", (error) => {
    status = `error: ${error?.message || text(error)}`;
    render();
  });
}

async function shutdown() {
  phase = "closing";
  status = "disconnecting";
  render();
  clearInterval(renderTimer);
  try { client?.close(); } catch (_) {}
  stopTui();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((error) => {
  clearInterval(renderTimer);
  stopTui();
  console.error(error);
  try { client?.close(); } catch (_) {}
  process.exitCode = 1;
});
