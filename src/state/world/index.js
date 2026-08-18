import {WorldState} from "./state.js";
import {ModelState} from "../model/index.js";
import {decodeModelPayload} from "../../protocol/inbound/world-payload.js";

export {WorldState};

// Retention limits for per-world history. These arrays previously grew without
// bound for the lifetime of a connection. Pass Infinity to restore that.
const DEFAULT_HISTORY_LIMITS = {
    eventHistory: 200,
    modelPacketHistory: 100,
    chunkHistory: 64
};

function normalizeLimit(value, fallback) {
    if (value === Infinity) return Infinity;
    const limit = Number(value);
    if (!Number.isFinite(limit) || limit < 0) return fallback;
    return Math.floor(limit);
}

function pushBounded(target, value, limit) {
    if (limit === 0) return;
    target.push(value);
    if (target.length > limit) target.splice(0, target.length - limit);
}

export class WorldStore {
    #overworldId = null;
    #shipWorldId = null;

    constructor(limits = {}) {
        this.currentWorldId = null;
        this.worlds = new Map();
        this.historyLimits = {
            eventHistory: normalizeLimit(limits.eventHistory, DEFAULT_HISTORY_LIMITS.eventHistory),
            modelPacketHistory: normalizeLimit(limits.modelPacketHistory, DEFAULT_HISTORY_LIMITS.modelPacketHistory),
            chunkHistory: normalizeLimit(limits.chunkHistory, DEFAULT_HISTORY_LIMITS.chunkHistory)
        };
    }

    get(id) {
        const worldId = Number(id);
        if (!this.worlds.has(worldId)) this.worlds.set(worldId, new WorldState(worldId, this.historyLimits));
        return this.worlds.get(worldId);
    }

    apply(packet) {
        if (!packet || packet.world == null) return null;
        if (packet.type === 22) return this.#applyMeta(packet);
        if (packet.type === 23) return this.#applyTiles(packet);
        if (packet.type === 20) return this.#applyModel(packet);
        if (packet.type === 13) return this.#applyCommsBubble(packet);
        return null;
    }

    snapshot({includeTiles = false, includeModel = false, includeBlocks = false} = {}) {
        return [...this.worlds.values()].map((world) => world.snapshot({includeTiles, includeModel, includeBlocks}));
    }

    ids() {
        return [...this.worlds.keys()];
    }

    // Both resolvers are called on nearly every public read, and each used to
    // spread the whole world map. Cache the resolved id and re-scan only when the
    // cached world no longer satisfies the predicate.
    overworld() {
        const cached = this.#overworldId != null ? this.worlds.get(this.#overworldId) : null;
        if (cached && cached.isOverworld === true) return cached;
        for (const world of this.worlds.values()) {
            if (world.isOverworld === true) {
                this.#overworldId = world.id;
                return world;
            }
        }
        this.#overworldId = null;
        return null;
    }

    shipWorld() {
        if (this.currentWorldId != null) return this.worlds.get(Number(this.currentWorldId)) || null;
        const cached = this.#shipWorldId != null ? this.worlds.get(this.#shipWorldId) : null;
        if (cached && cached.isOverworld === false) return cached;
        for (const world of this.worlds.values()) {
            if (world.isOverworld === false) {
                this.#shipWorldId = world.id;
                return world;
            }
        }
        this.#shipWorldId = null;
        return null;
    }

    currentShipEntity() {
        const shipWorld = this.shipWorld();
        if (!shipWorld || shipWorld.parentWorld == null || shipWorld.parentEntity == null) return null;
        return this.worlds.get(Number(shipWorld.parentWorld))?.entity(shipWorld.parentEntity) || null;
    }

    #applyMeta(packet) {
        if (packet.removed) {
            const world = this.worlds.get(Number(packet.world));
            if (world) world.readMeta(packet);
            this.worlds.delete(Number(packet.world));
            if (this.currentWorldId === Number(packet.world)) this.currentWorldId = null;
            return {type: "world-removed", world: world || null, packet};
        }
        const world = this.get(packet.world);
        world.readMeta(packet);
        if (this.currentWorldId == null && !world.isOverworld) this.currentWorldId = world.id;
        return {type: "world", world};
    }

    #applyTiles(packet) {
        const world = this.get(packet.world);
        const decoded = world.decodeEncrypted(packet.data);
        const updates = [];
        const errors = [];
        if (decoded && typeof decoded === "object") {
            for (const [kind, value] of Object.entries(decoded)) {
                try {
                    if (kind === "0") updates.push({kind, tiles: world.applyChunk(value)});
                    else if (kind === "1") updates.push({kind, tile: world.applyTile(value)});
                    else updates.push({kind, value});
                } catch (error) {
                    errors.push(error);
                    updates.push({kind, value, error: error.message});
                }
            }
        }
        world.recordEvent({type: "tiles", packet, decoded, updates, errors});
        return {type: "tiles", world, decoded, updates, errors};
    }

    #applyModel(packet) {
        const world = this.get(packet.world);
        const result = {
            worldId: packet.world,
            full: Boolean(packet.full),
            events: Array.isArray(packet.events) ? packet.events : [],
            modelData: packet.model_data || null,
            decoded: null,
            model: null,
            commandNumber: typeof packet.command_number === "number" ? packet.command_number : null,
            timing: {
                roundTimeLeft: packet.round_time_left ?? null,
                regenTimeLeft: packet.regen_time_left ?? null,
                removeOnRegen: packet.remove_on_regen ?? null,
                globalEventTime: packet.global_event_time ?? null,
                tickTime: packet.tick_time ?? null,
                tickQuota: packet.tick_quota ?? null,
                cpuLoad: packet.cpu_load ?? null,
                relayTime: packet.relay_time ?? null
            }
        };
        if (packet.model_data && world.seed != null) {
            const previousModel = world.model;
            try {
                if (packet.full) world.model = new ModelState({isOverworld: world.isOverworld});
                result.decoded = decodeModelPayload(packet.model_data, packet.world, world.seed);
                result.model = world.model.apply(result.decoded, {full: Boolean(packet.full)});
                if (result.model?.error && packet.full && previousModel) world.model = previousModel;
            } catch (error) {
                if (packet.full && previousModel) world.model = previousModel;
                result.error = error;
            }
        }
        pushBounded(world.modelPackets, result, world.historyLimits.modelPacketHistory);
        world.recordEvent({type: "model", packet, result});
        world.lastPacket = packet;
        return {type: "model", world, result};
    }

    #applyCommsBubble(packet) {
        const world = this.get(packet.world);
        const bubble = world.addCommsBubble(packet);
        return {type: "comms-bubble", world, packet, bubble};
    }
}
