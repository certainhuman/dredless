import * as modelDecoder from "./model-decoder.js";
import {LoaderConfigTracker} from "./loader-config.js";
import {navigationDestinationFromEncodedValue} from "./overworld.js";

const {
    ModelReader,
    numericFields,
    TWO_FIELD_SPEC,
    LABEL_STATE_SPEC,
    SIMPLE_LABEL_STATE_SPEC,
    peekStreamInt,
    nextValueLooksLikeTextBlob,
    MODEL_TABLE_SPECS,
    TABLE_78_NUMERIC_FIELDS,
    WIRE_TAG_TABLES,
    MASK_ONLY_TABLES,
    ENTITY_FOOTPRINTS,
    PLACED_ENTITY_TYPE_IDS,
    FabricatorType,
    FABRICATOR_TYPES,
    HELM_TYPE_IDS,
    COMMS_STATION_TYPE_ID,
    COMMS_STATION_MAX_CHARGES,
    CARGO_HATCH_TYPE_IDS,
    THRUSTER_TYPE_IDS,
    EXPANDO_BOX_TYPE_ID,
    ITEM_LAUNCHER_TYPE_ID,
    LOADER_TYPE_ID,
    NAVIGATION_UNIT_TYPE_ID,
    entityTypeIdFromRecord,
    CANNON_AMMO_COLOR_ITEM_IDS,
    CANNON_TYPE_IDS,
    THRUSTER_FACING_NAMES,
    DEFAULT_OVERWORLD_WARP_DURATION_SECONDS,
    OVERWORLD_WARP_TICKS_PER_SECOND,
    MARKER_TYPE_IDS,
    TEAM_RANK_NAMES,
    PLAYER_SHIP_RANKS,
    PUSHER_MODE_NAMES,
    SIGN_DISPLAY_MODE_NAMES,
    SHIELD_GENERATOR_BOOST_STATE_NAMES,
    NAVIGATION_DEFAULT_DESTINATION,
    navigationDestinationName,
    isNavigationDestination,
    numberOrNull,
    qKey,
    blobKey,
    cloneRecord,
    firstRecord,
    TABLE_78_FIELD_BITS,
    table78DeltaRecord,
    isSemanticLoaderDelta,
    decodeText,
    entityNameFromType,
    markerTypeIdForTables,
    itemSummary,
    summarizeItemHolder,
    boundedProgress,
    summarizeFabricator,
    summarizeCargoEjector,
    summarizeCannon,
    summarizeThruster,
    summarizeHelm,
    navigationDestinationFromRecord,
    summarizeNavigationUnit,
    summarizeCommsStation,
    summarizeHealth,
    summarizeBot,
    isBoulderBotExclusion,
    botClassFromState,
    isCowardBossState,
    isOrangeFoolBotState,
    isZombieBossBotState,
    isRedSentryBotState,
    isBlueRusherBotState,
    isRedSniperBotState,
    isYellowHunterBotState,
    isAquaShielderBotState,
    isLazerEnthusiastBotState,
    isYellowMineGuardBotState,
    isShieldHelperBotState,
    isShieldMasterBotState,
    botIdentifierFromState,
    summarizeShieldGenerator,
    summarizeShipControl,
    summarizeShipSize,
    summarizeShipWorldMetadata,
    summarizeItemCrate,
    scaledSizeSummary,
    summarizeExpandoBox,
    summarizeHoverOutline,
    summarizeMapMarker,
    summarizeDockingSpring,
    summarizeHugeThruster,
    summarizeLoader,
    summarizeCargoHatch,
    summarizePusher,
    summarizePusherBeam,
    normalizeDegrees,
    summarizeItemLauncher,
    summarizeSign,
    summarizeShieldProjector,
    summarizeSpawnPoint,
    summarizeDoor,
    enumValueName,
    colorToCss,
    previewActionName,
    bitOffsets,
    summarizeBlueprintPreview,
    summarizePlayerPreview,
    summarizePlayer,
    patronTierName,
    mergeContents,
    MAX_HOVER_OUTLINE_FOOTPRINT_CELLS,
    entityFootprint,
    entityLabel,
    entityCategory,
    BLOCK_KEY_OFFSET,
    BLOCK_KEY_STRIDE,
    blockKey,
    EMPTY_TABLE,
    MAX_RETAINED_REMOVALS,
    MAX_RETAINED_ERRORS,
    pushCapped,
    defineLazyProperty,
} = modelDecoder;

export class ModelState {
    #loaderConfig = new LoaderConfigTracker();
    #blueprintItems = null;
    #helmOccupied = new Map();
    #commsStationOccupied = new Map();
    #navigationUnitAutoWarp = new Map();

    constructor({isOverworld = null} = {}) {
        this.isOverworld = isOverworld == null ? null : Boolean(isOverworld);
        this.generation = null;
        this.tables = new Map();
        this.removedEntities = [];
        this.lastUpdate = null;
        this.errors = [];
        // Retained arrays are capped; the totals remain exact.
        this.totalRemovedCount = 0;
        this.totalErrorCount = 0;
        this._derived = null;
    }

    setWorldKind(isOverworld) {
        const next = isOverworld == null ? null : Boolean(isOverworld);
        if (this.isOverworld === next) return;
        this.isOverworld = next;
        this.#invalidateDerived();
    }

    table(id) {
        // Shared empty map: #summarizeEntity performs ~32 record() lookups per
        // entity, most against absent tables, and each miss used to allocate.
        return this.tables.get(Number(id)) || EMPTY_TABLE;
    }

    record(tableId, entityId) {
        return this.table(tableId).get(Number(entityId)) || null;
    }

    entity(entityId) {
        const id = Number(entityId);
        if (!Number.isFinite(id)) return null;
        return this.#derivedState().entitiesById.get(id) || null;
    }

    entities() {
        return this.#derivedState().entities.slice();
    }

    blocks() {
        this.#derivedState();
        return this.#derivedBlocks().slice();
    }

    // O(1) point lookup. Callers previously had to materialise and scan the whole
    // block list to answer this.
    blockAt(x, y) {
        this.#derivedState();
        return this.#blocksIndex().get(blockKey(x, y)) || null;
    }

    apply(bytes, {full = false} = {}) {
        this.#blueprintItems = null;
        const reader = new ModelReader(bytes);
        const update = {
            generation: null,
            full: Boolean(full),
            changedEntities: new Set(),
            sections: [],
            removals: [],
            unknownTags: [],
            error: null
        };

        try {
            update.generation = reader.readStreamInt();
            this.generation = update.generation;

            while (reader.remaining > 0) {
                if (reader.trailingZeroOnly()) break;
                let tag;
                try {
                    tag = reader.readStreamInt();
                } catch (error) {
                    throw new Error(`model section tag offset ${reader.offset}: ${error.message}`);
                }
                if (tag === 0) break;
                if (tag === 57005) {
                    update.removals.push(...this.#readRemovals(reader));
                    continue;
                }

                const tableId = WIRE_TAG_TABLES.get(tag);
                if (tableId == null) {
                    update.unknownTags.push({tag, offset: reader.offset});
                    // Some live captures end with a terminal, empty section tag we do not
                    // yet have a table mapping for. If the rest of the packet is just
                    // zero terminators, keep the decoded sections and stop cleanly rather
                    // than turning the whole frame into a decode error.
                    if (reader.trailingZeroOnly()) break;
                    throw new Error(`unsupported model_data section tag ${tag}`);
                }

                const section = this.#readSection(reader, tag, tableId);
                update.sections.push(section);
                for (const record of section.records) update.changedEntities.add(record.entity);
            }
        } catch (error) {
            update.error = error;
            this.totalErrorCount += 1;
            pushCapped(this.errors, {message: error.message, generation: update.generation}, MAX_RETAINED_ERRORS);
        }

        this.#remapIndexedLoaderConfig(update);
        this.#updateLoaderConfig(update);
        this.#updateNavigationUnitAutoWarp(update);
        this.#updateHelmOccupancy(update);
        this.#updateCommsStationOccupancy(update);
        this.lastUpdate = update;
        this.#updateDerived(update);
        return update;
    }

    // `blocks` is opt-in: materialising and sorting the per-cell index is the most
    // expensive part of a snapshot, and most callers never read it. Mirrors how
    // `includeTiles` already works on WorldState.snapshot().
    snapshot({includeTables = false, includeBlocks = false} = {}) {
        const derived = this.#derivedState();
        return {
            generation: this.generation,
            tableCount: this.tables.size,
            entityCount: derived.entityCount,
            removedEntities: this.removedEntities.slice(-50),
            lastUpdate: this.lastUpdate ? summarizeUpdate(this.lastUpdate) : null,
            errors: this.errors.slice(-10),
            entities: derived.entities.slice(),
            blocks: includeBlocks ? this.#derivedBlocks().slice() : undefined,
            transforms: derived.transforms.slice(),
            players: derived.players.slice(),
            shipControls: derived.shipControls.slice(),
            machines: this.#machinesSnapshot(derived.machines),
            tables: includeTables ? this.tablesSnapshot() : derived.tableSummaries.slice()
        };
    }

    tablesSnapshot() {
        return [...this.tables.entries()].map(([id, records]) => ({
            id,
            name: MODEL_TABLE_SPECS.get(id)?.name || null,
            records: [...records.entries()].map(([entity, record]) => ({entity, ...cloneRecord(record)}))
        }));
    }

    transforms() {
        return this.#derivedState().transforms.slice();
    }

    itemHolders() {
        return this.#records(6).map((entry) => summarizeItemHolder(entry.entity, entry));
    }

    fabricators() {
        return this.#records(53).map((entry) => summarizeFabricator(entry.entity, entry, this.record(6, entry.entity), this.record(7, entry.entity)));
    }

    players() {
        return this.#derivedState().players.slice();
    }

    shipControls() {
        return this.#derivedState().shipControls.slice();
    }

    shipMetadata() {
        if (this.isOverworld) return null;
        const lockdownRecord = firstRecord(this.table(11));
        const shipRecord = firstRecord(this.table(16), (record) => record?.blob20 && typeof record?.q32 === "number" && typeof record?.q36 === "number");
        return summarizeShipWorldMetadata(lockdownRecord, shipRecord);
    }

    machines() {
        return this.#machinesSnapshot(this.#derivedState().machines);
    }

    #machinesSnapshot(machines) {
        return {
            itemHolders: machines.itemHolders.slice(),
            fabricators: machines.fabricators.slice(),
            cargoEjectors: machines.cargoEjectors.slice(),
            cannons: machines.cannons.slice(),
            thrusters: machines.thrusters.slice(),
            pushers: machines.pushers.slice(),
            pusherBeams: machines.pusherBeams.slice(),
            launchers: machines.launchers.slice(),
            health: machines.health.slice(),
            loaders: machines.loaders.slice(),
            cargoHatches: machines.cargoHatches.slice(),
            navigationUnits: machines.navigationUnits.slice(),
            commsStations: machines.commsStations.slice(),
            fluidTanks: machines.fluidTanks.slice(),
            shieldGenerators: machines.shieldGenerators.slice(),
            shieldProjectors: machines.shieldProjectors.slice(),
            helms: machines.helms.slice(),
            signs: machines.signs.slice(),
            spawnPoints: machines.spawnPoints.slice(),
            doors: machines.doors.slice(),
            expandoBoxes: machines.expandoBoxes.slice()
        };
    }

    #invalidateDerived() {
        this._derived = null;
    }

    #updateDerived(update) {
        if (!this._derived) return;
        if (!update.removals.length && !update.changedEntities.size) return;

        for (const section of update.sections) {
            for (const record of section.records || []) this.#addDerivedEntityTable(record.entity, section.table);
        }

        if (update.sections.some((section) => section.table === 12)) {
            for (const entityId of this.table(55).keys()) update.changedEntities.add(entityId);
        }
        for (const entityId of update.removals) this.#removeDerivedEntity(entityId);
        for (const entityId of update.changedEntities) this.#refreshDerivedEntity(entityId);
        this._derived.summariesDirty = true;
        this._derived.tableSummariesDirty = true;
    }

    #updateLoaderConfig(update) {
        const seenEntities = new Set();
        for (const section of update.sections || []) {
            if (section.table !== 78) continue;
            for (const changed of section.records || []) {
                if (changed.indexedLoaderConfig) {
                    this.#loaderConfig.updateIndexedSnapshotRecord(null, changed.entity, changed.record, changed.mask, changed.cumulativeRecord, changed.configEntity);
                    continue;
                }
                const typeId = entityTypeIdFromRecord(this.record(7, changed.entity));
                this.#loaderConfig.updateRecord(null, changed.entity, changed.record ?? this.record(78, changed.entity), changed.mask, changed.previous, {
                    repeatedInUpdate: seenEntities.has(changed.entity),
                    allowSparseBaseline: typeId === LOADER_TYPE_ID,
                    repeatedInSection: changed.repeatedInSection,
                    semanticSnapshot: Boolean(update.full),
                    semanticDelta: isSemanticLoaderDelta(changed, update.full),
                    deltaRecord: table78DeltaRecord(changed)
                });
                seenEntities.add(changed.entity);
            }
        }
    }

    #remapIndexedLoaderConfig(update) {
        if (!update.full || update.error) return;
        const rows = [];
        for (const section of update.sections || []) {
            if (section.table !== 78) continue;
            for (const changed of section.records || []) rows.push(changed);
        }
        if (!rows.length) return;

        const loaderIds = [...this.table(7).entries()]
            .filter(([, record]) => entityTypeIdFromRecord(record) === LOADER_TYPE_ID)
            .map(([entity]) => entity)
            .sort((a, b) => a - b);
        if (loaderIds.length !== rows.length) return;
        if (rows.every((row, index) => row.entity === loaderIds[index])) return;

        const remappedTable = new Map();
        for (const [index, changed] of rows.entries()) {
            const rawRecord = table78DeltaRecord(changed);
            changed.configEntity = changed.entity;
            changed.entity = loaderIds[index];
            changed.cumulativeRecord = cloneRecord(changed.record || {});
            changed.record = cloneRecord(rawRecord);
            delete changed.previous;
            changed.indexedLoaderConfig = true;
            remappedTable.set(changed.entity, cloneRecord(rawRecord));
            update.changedEntities.add(changed.entity);
        }
        this.tables.set(78, remappedTable);
    }

    #updateNavigationUnitAutoWarp(update) {
        const trackedBeforeUpdate = new Set(this.#navigationUnitAutoWarp.keys());
        const initializedThisUpdate = new Set();

        for (const section of update.sections || []) {
            if (section.table !== 78) continue;
            for (const changed of section.records || []) {
                const typeId = entityTypeIdFromRecord(this.record(7, changed.entity));
                if (typeId !== NAVIGATION_UNIT_TYPE_ID) continue;

                const record = this.record(78, changed.entity);
                if (!record) continue;

                if (!trackedBeforeUpdate.has(changed.entity)) {
                    if (initializedThisUpdate.has(changed.entity)) continue;
                    const q32Destination = navigationDestinationFromEncodedValue(record.q32);
                    const q36Destination = navigationDestinationFromEncodedValue(record.q36);
                    const q24Destination = navigationDestinationFromEncodedValue(record.q24);
                    const q20Destination = navigationDestinationFromEncodedValue(record.q20);
                    const q32DestinationRow = (changed.mask & 9) === 9 && record.q20 === 0 && record.q24 == null && q32Destination != null;
                    const destinationBase = q32DestinationRow
                        ? q32Destination
                        : (changed.mask & 17) === 17 && record.q20 === 0 && record.q24 == null && record.q32 == null && q36Destination != null
                            ? q36Destination
                            : record.q20 === 0 && q24Destination != null
                                ? q24Destination
                                : null;
                    const q36DestinationRow = destinationBase === q36Destination && q36Destination != null;
                    const pureDestinationRow = changed.mask === 1 && q20Destination != null;
                    const noCaptainsOnlyRow = changed.mask === 16 && record.q36 === 0;
                    this.#navigationUnitAutoWarp.set(changed.entity, {
                        destination: navigationDestinationFromRecord(record, changed.mask),
                        destinationBase,
                        shieldFailure: pureDestinationRow || q36DestinationRow || noCaptainsOnlyRow ? true : q32DestinationRow ? false : record.q32 == null ? (record.q24 == null ? null : true) : false,
                        noCaptains: q32DestinationRow && changed.mask === 9
                            ? true
                            : pureDestinationRow ? true
                                : noCaptainsOnlyRow ? false
                                    : q36DestinationRow ? false : record.q36 == null ? (record.q24 == null ? null : true) : false
                    });
                    initializedThisUpdate.add(changed.entity);
                    continue;
                }

                const current = this.#navigationUnitAutoWarp.get(changed.entity);
                if (!current) continue;
                const q32Destination = navigationDestinationFromEncodedValue(record.q32);
                const q36Destination = navigationDestinationFromEncodedValue(record.q36);
                const q20Destination = navigationDestinationFromEncodedValue(record.q20);
                const q32DestinationRow = (changed.mask & 9) === 9 && record.q20 === 0 && record.q24 == null && q32Destination != null;
                const q36DestinationRow = (changed.mask & 17) === 17 && record.q20 === 0 && record.q24 == null && record.q32 == null && q36Destination != null;
                const baselineRow = (changed.mask & 27) === 27 && record.q20 === 0 && record.q24 != null && record.q32 != null && record.q36 != null;
                if (q32DestinationRow) {
                    current.destination = q32Destination;
                    current.destinationBase = q32Destination;
                    current.shieldFailure = false;
                    if (record.q36 != null) current.noCaptains = record.q36 !== 0;
                    else if (changed.mask === 9) current.noCaptains = true;
                    continue;
                }
                if (q36DestinationRow) {
                    current.destination = q36Destination;
                    current.destinationBase = q36Destination;
                    continue;
                }
                if (baselineRow) {
                    current.shieldFailure = false;
                    current.noCaptains = record.q36 !== 0;
                    continue;
                }
                if (changed.mask === 1) {
                    const relativeDestination = current.destinationBase == null || typeof record.q20 !== "number"
                        ? null
                        : current.destinationBase + record.q20;
                    current.destination = q20Destination ?? (isNavigationDestination(relativeDestination) ? relativeDestination : current.destination);
                } else if ((changed.mask & 1) && record.q20 != null && record.q20 !== 0) {
                    current.destination = q20Destination ?? (isNavigationDestination(record.q20) ? record.q20 : current.destination);
                }
                if (changed.mask & 8) current.shieldFailure = !current.shieldFailure;
                if (changed.mask & 16) current.noCaptains = !current.noCaptains;
            }
        }
    }

    #updateHelmOccupancy(update) {
        const table7 = update.sections.find((section) => section.table === 7);
        if (!table7) return;

        const changedPilotState = new Map();
        for (const section of update.sections) {
            if (section.table !== 55) continue;
            for (const changed of section.records) {
                if (!(changed.mask & 16)) continue;
                const player = this.record(55, changed.entity);
                changedPilotState.set(changed.entity, Boolean(player?.q107));
            }
        }

        const activePilotCount = [...this.table(55).values()].filter((record) => record?.q107).length;
        for (const changed of table7.records) {
            const record = this.record(7, changed.entity);
            const typeId = entityTypeIdFromRecord(record);
            if (!HELM_TYPE_IDS.has(typeId)) continue;

            if (activePilotCount > 0 && record?.q20 === 0 && HELM_TYPE_IDS.has(Number(record?.q32))) {
                this.#helmOccupied.set(changed.entity, true);
            }

            if (!(changed.mask & 8) || changedPilotState.size === 0) continue;
            this.#helmOccupied.set(changed.entity, [...changedPilotState.values()].some(Boolean));
        }
    }

    #updateCommsStationOccupancy(update) {
        const table7 = update.sections.find((section) => section.table === 7);
        if (!table7) return;

        for (const changed of table7.records) {
            const record = this.record(7, changed.entity);
            const typeId = entityTypeIdFromRecord(record);
            if (typeId !== COMMS_STATION_TYPE_ID) continue;

            const hasAbsoluteTypeState = update.full || (changed.mask & 1);
            if (hasAbsoluteTypeState && record?.q20 === 0 && Number(record?.q32) === COMMS_STATION_TYPE_ID) {
                this.#commsStationOccupied.set(changed.entity, true);
                continue;
            }

            if (hasAbsoluteTypeState && Number(record?.q20) === COMMS_STATION_TYPE_ID) {
                this.#commsStationOccupied.set(changed.entity, false);
            }

            if (changed.mask & 8) {
                this.#commsStationOccupied.set(changed.entity, !this.#commsStationOccupied.get(changed.entity));
            }
        }
    }

    #derivedState() {
        if (this._derived) {
            this.#ensureDerivedSummaries();
            return this._derived;
        }

        const entityIds = [];
        const seenEntities = new Set();
        const entityTableIds = new Map();
        const tableSummaries = [];

        for (const [tableId, records] of this.tables.entries()) {
            const name = MODEL_TABLE_SPECS.get(tableId)?.name || null;
            tableSummaries.push({id: tableId, name, count: records.size});
            for (const entity of records.keys()) {
                if (!entityTableIds.has(entity)) entityTableIds.set(entity, []);
                entityTableIds.get(entity).push(tableId);
                if (!seenEntities.has(entity)) {
                    seenEntities.add(entity);
                    entityIds.push(entity);
                }
            }
        }

        entityIds.sort((a, b) => a - b);
        const entities = entityIds.map((entityId) => this.#summarizeEntity(entityId, this.#tableRowsForEntity(entityId)));
        const entitiesById = new Map(entities.map((entity) => [entity.entity, entity]));

        this._derived = {
            entityCount: entityIds.length,
            entityIds,
            entityTableIds,
            entitiesById,
            blocksByKey: null,
            blocks: null,
            blocksDirty: true,
            tableSummaries,
            summariesDirty: true,
            tableSummariesDirty: false
        };
        this.#refreshDerivedSummaries();
        return this._derived;
    }

    #tableRowsForEntity(entityId) {
        const rows = [];
        const tableIds = this._derived?.entityTableIds?.get(entityId) || this.tables.keys();
        for (const tableId of tableIds) {
            const record = this.tables.get(tableId)?.get(entityId);
            if (record) rows.push({tableId, name: MODEL_TABLE_SPECS.get(tableId)?.name || null, record});
        }
        return rows;
    }

    #addDerivedEntityTable(entityId, tableId) {
        const derived = this._derived;
        if (!derived) return;
        let tableIds = derived.entityTableIds.get(entityId);
        if (!tableIds) {
            tableIds = [];
            derived.entityTableIds.set(entityId, tableIds);
        }
        if (!tableIds.includes(tableId)) insertSorted(tableIds, tableId);
    }

    #removeDerivedEntity(entityId) {
        const derived = this._derived;
        const old = derived.entitiesById.get(entityId);
        if (old) this.#removeEntityFromDerivedBlocks(derived, old);
        derived.entitiesById.delete(entityId);
        derived.entityTableIds.delete(entityId);
        const index = derived.entityIds.indexOf(entityId);
        if (index >= 0) derived.entityIds.splice(index, 1);
        derived.entityCount = derived.entityIds.length;
    }

    #refreshDerivedEntity(entityId) {
        const rows = this.#tableRowsForEntity(entityId);
        if (!rows.length) {
            this.#removeDerivedEntity(entityId);
            return;
        }

        const derived = this._derived;
        const old = derived.entitiesById.get(entityId);
        if (old) this.#removeEntityFromDerivedBlocks(derived, old);

        const next = this.#summarizeEntity(entityId, rows);
        derived.entitiesById.set(entityId, next);
        if (!derived.entityIds.includes(entityId)) insertSorted(derived.entityIds, entityId);
        this.#addEntityToDerivedBlocks(derived, next);
        derived.entityCount = derived.entityIds.length;
    }

    #tableSummaries() {
        return [...this.tables.entries()].map(([id, records]) => ({
            id,
            name: MODEL_TABLE_SPECS.get(id)?.name || null,
            count: records.size
        }));
    }

    // The per-cell block index is the most expensive derived product to build --
    // it walks every occupied cell of every entity. Most consumers never ask for
    // blocks, so it is constructed on first use rather than during the rebuild.
    #blocksIndex() {
        const derived = this._derived;
        if (derived.blocksByKey) return derived.blocksByKey;
        const blocks = new Map();
        for (const entityId of derived.entityIds) {
            const entity = derived.entitiesById.get(entityId);
            if (entity) this.#addEntityToBlockMap(blocks, entity);
        }
        derived.blocksByKey = blocks;
        derived.blocksDirty = true;
        return blocks;
    }

    #addEntityToDerivedBlocks(derived, entity) {
        // Nothing to maintain until something has asked for the index; it will be
        // built from current entities on demand.
        if (!derived.blocksByKey) return;
        this.#addEntityToBlockMap(derived.blocksByKey, entity);
        derived.blocksDirty = true;
    }

    #addEntityToBlockMap(blocks, entity) {
        if (!entity.transform || !Number.isFinite(entity.transform.x) || !Number.isFinite(entity.transform.y)) return;
        const footprint = entity.footprint || {width: 1, height: 1};
        const startX = Math.floor(entity.transform.x);
        const startY = Math.floor(entity.transform.y);
        for (let dx = 0; dx < footprint.width; dx++) {
            for (let dy = 0; dy < footprint.height; dy++) {
                const x = startX + dx;
                const y = startY + dy;
                const key = blockKey(x, y);
                let block = blocks.get(key);
                if (block === undefined) {
                    block = {x, y, entities: []};
                    blocks.set(key, block);
                }
                block.entities.push(entity);
            }
        }
    }

    #removeEntityFromDerivedBlocks(derived, entity) {
        if (!derived.blocksByKey) return;
        const id = entity.entity;
        for (const cell of entity.occupies || []) {
            const key = blockKey(cell.x, cell.y);
            const block = derived.blocksByKey.get(key);
            if (!block) continue;
            // Splice in place rather than allocating a filtered array per cell.
            const list = block.entities;
            for (let i = list.length - 1; i >= 0; i--) {
                if (list[i].entity === id) list.splice(i, 1);
            }
            if (!list.length) derived.blocksByKey.delete(key);
            derived.blocksDirty = true;
        }
    }

    #ensureDerivedSummaries() {
        const derived = this._derived;
        if (!derived) return;
        if (derived.tableSummariesDirty) {
            derived.tableSummaries = this.#tableSummaries();
            derived.tableSummariesDirty = false;
        }
        if (derived.summariesDirty) this.#refreshDerivedSummaries();
    }

    #refreshDerivedSummaries() {
        const derived = this._derived;
        const entities = derived.entityIds.map((entityId) => derived.entitiesById.get(entityId)).filter(Boolean);
        const machines = {
            itemHolders: [],
            fabricators: [],
            cargoEjectors: [],
            cannons: [],
            thrusters: [],
            pushers: [],
            pusherBeams: [],
            launchers: [],
            health: [],
            loaders: [],
            cargoHatches: [],
            navigationUnits: [],
            commsStations: [],
            fluidTanks: [],
            shieldGenerators: [],
            shieldProjectors: [],
            helms: [],
            signs: [],
            spawnPoints: [],
            doors: [],
            expandoBoxes: []
        };
        const players = [];
        const shipControls = [];
        const transforms = [];

        for (const entity of entities) {
            if (entity.transform) transforms.push(entity.transform);
            const contents = entity.contents;
            if (!contents) continue;
            if (contents.itemHolder) machines.itemHolders.push(contents.itemHolder);
            if (contents.fabricator) machines.fabricators.push(contents.fabricator);
            if (contents.cargoEjector) machines.cargoEjectors.push(contents.cargoEjector);
            if (contents.cannon) machines.cannons.push(contents.cannon);
            if (contents.thruster) machines.thrusters.push(contents.thruster);
            if (contents.pusher) machines.pushers.push(contents.pusher);
            if (contents.pusherBeam) machines.pusherBeams.push(contents.pusherBeam);
            if (contents.launcher) machines.launchers.push(contents.launcher);
            if (contents.health) machines.health.push(contents.health);
            if (contents.loader) machines.loaders.push(contents.loader);
            if (contents.cargoHatch) machines.cargoHatches.push(contents.cargoHatch);
            if (contents.navigationUnit) machines.navigationUnits.push(contents.navigationUnit);
            if (contents.commsStation) machines.commsStations.push(contents.commsStation);
            if (contents.fluidTank) machines.fluidTanks.push(contents.fluidTank);
            if (contents.shieldGenerator) machines.shieldGenerators.push(contents.shieldGenerator);
            if (contents.shieldProjector) machines.shieldProjectors.push(contents.shieldProjector);
            if (contents.helm) machines.helms.push(contents.helm);
            if (contents.sign) machines.signs.push(contents.sign);
            if (contents.spawnPoint) machines.spawnPoints.push(contents.spawnPoint);
            if (contents.door) machines.doors.push(contents.door);
            if (contents.expandoBox) machines.expandoBoxes.push(contents.expandoBox);
            if (contents.player) players.push(contents.player);
            if (contents.shipControl) shipControls.push(contents.shipControl);
        }

        derived.entities = entities;
        derived.transforms = transforms;
        derived.players = players;
        derived.shipControls = shipControls;
        derived.machines = machines;
        derived.summariesDirty = false;
    }

    // The sorted block list is the single most expensive derived product (a sort
    // over every occupied cell in the world). Build it only when a caller actually
    // asks for blocks, rather than as a side effect of every summary refresh.
    #derivedBlocks() {
        const derived = this._derived;
        const index = this.#blocksIndex();
        if (derived.blocksDirty || !derived.blocks) {
            derived.blocks = [...index.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x));
            derived.blocksDirty = false;
        }
        return derived.blocks;
    }

    // Identical for every entity in a refresh pass, but was rebuilt inside each
    // #summarizeEntity call -- O(entities x table12). Table 12 only changes during
    // apply(), which clears this cache.
    #blueprintPreviewItems() {
        if (this.#blueprintItems) return this.#blueprintItems;
        const items = [];
        for (const [entity, record] of this.table(12)) {
            const summary = summarizeBlueprintPreview(entity, record, this.record(0, entity));
            if (summary) items.push(summary);
        }
        this.#blueprintItems = items;
        return items;
    }

    #summarizeEntity(entityId, tableRows = []) {
        // tableRows already lists exactly the tables this entity appears in -- the
        // same source the public `tables` field is built from. Reading through it
        // avoids ~32 lookups against tables the entity is not in.
        const byTable = new Map();
        for (const row of tableRows) byTable.set(row.tableId, row.record);
        const rec = (tableId) => byTable.get(tableId) ?? null;
        const transformRecord = rec(0);
        const itemHolderRecord = rec(6);
        const healthRecord = rec(5);
        const fabricatorRecord = rec(53);
        const cargoEjectorRecord = rec(49);
        const cannonRecord = rec(54);
        const pusherRecord = rec(72);
        const pusherBeamRecord = rec(42);
        const launcherRecord = rec(44);
        const loaderRecord = rec(78);
        const loaderFilterRecord = rec(76);
        const loaderFilterSlotsRecord = rec(77);
        const commsStationRecord = rec(39);
        const fluidTankRecord = rec(60);
        const shieldRecord = rec(61);
        const shieldGeneratorBoostRecord = rec(75);
        const shieldProjectorRecord = rec(62);
        const playerRecord = rec(55);
        const shipControlRecord = rec(20);
        const signRecord = rec(41);
        const spawnPointRecord = rec(8);
        const doorRecord = rec(47);
        const thrusterRecord = rec(50);
        const labelRecord = rec(9);
        const zoneLabelRecord = rec(25);
        const dockingSpringRecord = rec(26);
        const hugeThrusterRecord = rec(23);
        const bodyStateRecord = rec(1);
        const typeRecord = rec(7);
        const crateSizeRecord = rec(3);
        const blueprintPreviewRecord = rec(12);
        const expandoSizeRecord = rec(51);
        const crateItemRecord = rec(19);
        const markerTableIds = [73].filter((tableId) => this.record(tableId, entityId));
        const markerTypeId = markerTypeIdForTables(markerTableIds);
        const markerTypeName = entityNameFromType(markerTypeId);
        const looseItemMarker = Boolean(rec(37));
        const dynamicBody = bodyStateRecord?.q20 === -4;
        const typeId = entityTypeIdFromRecord(typeRecord);
        const itemHolder = summarizeItemHolder(entityId, itemHolderRecord);
        const isExpandoBox = typeId === EXPANDO_BOX_TYPE_ID || markerTypeId === EXPANDO_BOX_TYPE_ID;
        const health = summarizeHealth(entityId, healthRecord);
        const fabricator = summarizeFabricator(entityId, fabricatorRecord, itemHolderRecord, typeRecord);
        const cargoEjector = summarizeCargoEjector(entityId, typeId, cargoEjectorRecord);
        const cannon = summarizeCannon(entityId, cannonRecord, typeId);
        const thruster = summarizeThruster(entityId, typeId, thrusterRecord);
        const pusher = summarizePusher(entityId, pusherRecord, loaderFilterSlotsRecord);
        const pusherBeam = summarizePusherBeam(entityId, pusherBeamRecord);
        const launcher = summarizeItemLauncher(entityId, typeId, launcherRecord);
        const loader = (typeId === LOADER_TYPE_ID || (typeId == null && (loaderRecord || loaderFilterRecord || loaderFilterSlotsRecord)))
            ? summarizeLoader(entityId, loaderRecord, loaderFilterRecord, loaderFilterSlotsRecord, this.#loaderConfig, typeId === LOADER_TYPE_ID, itemHolderRecord)
            : null;
        const cargoHatch = summarizeCargoHatch(entityId, typeId, loaderFilterRecord, loaderFilterSlotsRecord, rec(45));
        const navigationUnit = summarizeNavigationUnit(entityId, typeId, loaderRecord, this.#navigationUnitAutoWarp.get(entityId));
        const fluidTank = fluidTankRecord ? {
            entity: entityId,
            amount: fluidTankRecord.q24 ?? null,
            state: cloneRecord(fluidTankRecord)
        } : null;
        const shieldGenerator = typeId === 256 ? summarizeShieldGenerator(entityId, shieldRecord, itemHolderRecord, shieldGeneratorBoostRecord) : null;
        const shieldProjector = typeId === 257 ? summarizeShieldProjector(entityId, shieldProjectorRecord) : null;
        const blueprintPreview = summarizeBlueprintPreview(entityId, blueprintPreviewRecord, transformRecord);
        const player = summarizePlayer(entityId, playerRecord, rec(14), this.#blueprintPreviewItems());
        const shipControl = summarizeShipControl(entityId, shipControlRecord);
        const helm = summarizeHelm(entityId, typeId, this.#helmOccupied.get(entityId));
        const commsStation = summarizeCommsStation(entityId, typeId, commsStationRecord, this.#commsStationOccupied.get(entityId));
        const sign = typeId === 218 ? summarizeSign(entityId, signRecord) : null;
        const spawnPoint = typeId === 219 ? summarizeSpawnPoint(entityId, spawnPointRecord) : null;
        const door = typeId === 220 ? summarizeDoor(entityId, spawnPointRecord, doorRecord) : null;
        const shipSize = shipControl && this.isOverworld ? summarizeShipSize(entityId, rec(3)) : null;
        const hoverOutline = summarizeHoverOutline(entityId, crateSizeRecord);
        const expandoBox = isExpandoBox ? summarizeExpandoBox(entityId, itemHolderRecord, expandoSizeRecord) : null;
        const mapMarker = this.isOverworld ? summarizeMapMarker(entityId, labelRecord, zoneLabelRecord, crateSizeRecord) : null;
        const dockingSpring = this.isOverworld
            ? summarizeDockingSpring(entityId, dockingSpringRecord, bodyStateRecord, crateSizeRecord)
            : null;
        const hugeThruster = this.isOverworld
            ? summarizeHugeThruster(entityId, hugeThrusterRecord, crateSizeRecord)
            : null;
        const itemCrate = this.isOverworld && !rec(2) && !rec(18) && health && crateSizeRecord
            ? summarizeItemCrate(entityId, crateSizeRecord, crateItemRecord, healthRecord)
            : null;
        const bot = this.isOverworld
            ? summarizeBot(entityId, {
                health,
                table2Record: rec(2),
                smallRecord: crateSizeRecord,
                combatRecord: rec(18),
                motionRecord: crateItemRecord,
                table10Record: rec(10),
                table51Record: rec(51),
                itemCrate,
                player,
                shipControl
            })
            : null;
        const transform = transformRecord ? {
            entity: entityId,
            x: numberOrNull(transformRecord.q20, 40),
            y: numberOrNull(transformRecord.q24, 40),
            rot: numberOrNull(transformRecord.q28, 127.324),
            flags: [transformRecord.q33, transformRecord.q34, transformRecord.q35].filter((value) => value != null)
        } : null;
        const contents = mergeContents({
            itemHolder, expandoBox, hoverOutline, itemCrate, mapMarker, dockingSpring,
            hugeThruster, blueprintPreview, health, bot, fabricator, cargoEjector,
            cannon, thruster, pusher, pusherBeam, launcher, loader, cargoHatch,
            navigationUnit, commsStation, fluidTank, shieldGenerator, shieldProjector,
            helm, player, shipControl, sign, spawnPoint, door, shipSize
        });
        const footprint = entityFootprint({
            entity: entityId,
            typeId,
            markerTypeId,
            itemHolder,
            expandoBox,
            hoverOutline,
            itemCrate,
            hugeThruster,
            fabricator,
            cargoEjector,
            cannon,
            thruster,
            pusher,
            launcher,
            loader,
            cargoHatch,
            navigationUnit,
            commsStation,
            fluidTank,
            shieldGenerator,
            shieldProjector,
            helm,
            player,
            shipControl
        });
        const typeName = entityNameFromType(typeId);
        const category = entityCategory({
            typeId,
            markerTypeId,
            looseItemMarker,
            dynamicBody,
            transform,
            itemHolder,
            itemCrate,
            mapMarker,
            dockingSpring,
            hugeThruster,
            blueprintPreview,
            fabricator,
            cargoEjector,
            cannon,
            pusher,
            launcher,
            loader,
            cargoHatch,
            navigationUnit,
            commsStation,
            fluidTank,
            shieldGenerator,
            shieldProjector,
            helm,
            player,
            shipControl
        });
        const summary = {
            entity: entityId,
            category,
            typeId,
            typeName,
            markerTypeId,
            markerTypeName,
            label: entityLabel({
                category,
                typeId,
                typeName,
                markerTypeName,
                mapMarker,
                dockingSpring,
                hugeThruster,
                blueprintPreview,
                expandoBox,
                hoverOutline,
                itemHolder,
                itemCrate,
                fabricator,
                cargoEjector,
                cannon,
                thruster,
                pusher,
                pusherBeam,
                launcher,
                loader,
                cargoHatch,
                navigationUnit,
                fluidTank,
                shieldGenerator,
                shieldProjector,
                player,
                shipControl,
                sign,
                spawnPoint,
                door,
                isOverworld: this.isOverworld
            }),
            kind: [
                transform ? "transform" : null,
                dynamicBody ? "dynamic_body" : null,
                itemHolder ? "item_holder" : null,
                health ? "health" : null,
                bot ? "bot" : null,
                itemCrate ? "item_crate" : null,
                expandoBox ? "expando_box" : null,
                hoverOutline ? "hover_outline" : null,
                mapMarker ? "map_marker" : null,
                dockingSpring ? "docking_spring" : null,
                hugeThruster ? "huge_thruster" : null,
                blueprintPreview ? "blueprint_preview" : null,
                markerTableIds.length ? "marker" : null,
                looseItemMarker ? "loose_item_marker" : null,
                fabricator ? "fabricator" : null,
                cargoEjector ? "cargo_ejector" : null,
                cannon ? "cannon" : null,
                thruster ? "thruster" : null,
                pusher ? "pusher" : null,
                pusherBeam ? "pusher_beam" : null,
                launcher ? "launcher" : null,
                loader ? "loader" : null,
                cargoHatch ? "cargo_hatch" : null,
                navigationUnit ? "navigation_unit" : null,
                commsStation ? "comms_station" : null,
                fluidTank ? "fluid_tank" : null,
                shieldGenerator ? "shield_generator" : null,
                shieldProjector ? "shield_projector" : null,
                helm ? "helm" : null,
                player ? "player" : null,
                shipControl ? "ship_control" : null,
                sign ? "sign" : null,
                spawnPoint ? "spawn_point" : null,
                door ? "door" : null,
                shipControl && this.isOverworld ? "overworld_ship" : null
            ].filter(Boolean),
            transform,
            footprint,
            contents,
            tables: tableRows.map(({tableId, name, record}) => ({
                tableId,
                name,
                record: cloneRecord(record)
            }))
        };
        // Lazy: most entities are never asked for their occupied cells, and a large
        // footprint materialises hundreds of objects per refresh. Defined as an
        // enumerable memoising accessor so spread, JSON and structuredClone all see
        // the same array they saw before.
        defineLazyProperty(summary, "occupies", transform ? () => this.#occupiedBlocks(transform, footprint) : () => []);
        return summary;
    }

    #occupiedBlocks(transform, footprint) {
        const startX = Math.floor(transform.x ?? 0);
        const startY = Math.floor(transform.y ?? 0);
        const cells = [];
        for (let dx = 0; dx < footprint.width; dx++) {
            for (let dy = 0; dy < footprint.height; dy++) {
                cells.push({x: startX + dx, y: startY + dy});
            }
        }
        return cells;
    }

    #records(tableId) {
        return [...this.table(tableId).entries()].map(([entity, record]) => ({entity, ...record}));
    }

    #readRemovals(reader) {
        const removals = [];
        let entity = 0;
        while (reader.remaining > 0) {
            const delta = reader.readStreamInt();
            if (delta === 0) break;
            entity += delta;
            removals.push(entity);
            // Delete only from tables the entity actually appears in when the derived
            // index is available; fall back to a full scan otherwise.
            const known = this._derived?.entityTableIds?.get(entity);
            if (known) {
                for (const tableId of known) this.tables.get(tableId)?.delete(entity);
            } else {
                for (const records of this.tables.values()) records.delete(entity);
            }
            this.#loaderConfig.delete(null, entity);
            this.#helmOccupied.delete(entity);
            this.#commsStationOccupied.delete(entity);
            this.#navigationUnitAutoWarp.delete(entity);
        }
        this.totalRemovedCount += removals.length;
        for (const id of removals) pushCapped(this.removedEntities, id, MAX_RETAINED_REMOVALS);
        return removals;
    }

    #readSection(reader, tag, tableId) {
        const spec = MODEL_TABLE_SPECS.get(tableId);
        return this.#readSectionRecords(reader, tag, tableId, spec);
    }

    #readSectionRecords(reader, tag, tableId, spec) {
        const section = {tag, table: tableId, name: spec?.name || null, records: []};
        let entity = 0;
        const seenEntities = tableId === 78 ? new Set() : null;
        while (reader.remaining > 0) {
            const recordOffset = reader.offset;
            let delta;
            try {
                delta = reader.readStreamInt();
            } catch (error) {
                throw new Error(`model table ${tableId} tag ${tag} record offset ${recordOffset}: ${error.message}`);
            }
            if (delta === 0) break;
            entity += delta;
            let mask;
            try {
                mask = reader.readUnsigned();
            } catch (error) {
                throw new Error(`model table ${tableId} tag ${tag} entity ${entity} mask offset ${reader.offset}: ${error.message}`);
            }
            const record = this.#getRecord(tableId, entity);
            const previous = tableId === 78 ? cloneRecord(record) : null;
            record.lastMask = mask;

            try {
                if (spec) this.#applyRecordSpec(reader, record, mask, spec);
                else if (!MASK_ONLY_TABLES.has(tableId)) throw new Error(`missing model table spec ${tableId}`);
            } catch (error) {
                throw new Error(`model table ${tableId} tag ${tag} entity ${entity} mask ${mask} offset ${reader.offset}: ${error.message}`);
            }

            const changed = {entity, mask};
            if (previous) changed.previous = previous;
            if (seenEntities?.has(entity)) changed.repeatedInSection = true;
            seenEntities?.add(entity);
            if (tableId === 78) changed.record = cloneRecord(record);
            section.records.push(changed);
        }
        return section;
    }

    #getRecord(tableId, entity) {
        if (!this.tables.has(tableId)) this.tables.set(tableId, new Map());
        const records = this.tables.get(tableId);
        if (!records.has(entity)) records.set(entity, {});
        return records.get(entity);
    }

    #applyRecordSpec(reader, record, mask, spec) {
        if (typeof spec.read === "function") {
            spec.read(reader, record, mask);
            if (spec.scale) record.scaled = spec.scale(record);
            return;
        }

        const hasPacked = Boolean(
            (spec.packedMask && (mask & spec.packedMask)) ||
            spec.packedBits?.some((item) => mask & item.bit)
        );
        let packed = null;
        if (hasPacked && spec.packedBeforeValues) packed = reader.readUnsigned();

        let packedIndex = 0;
        if (spec.orderedValues) {
            for (const item of spec.orderedItems) {
                if (!(mask & item.bit)) continue;
                if (item.kind === "blob") record[item.key] = reader.readBlob();
                else record[item.key] = (record[item.key] || 0) + reader.readFieldDelta();
            }
        } else {
            for (const blob of spec.blobs || []) {
                if (mask & blob.bit) record[blob.key] = reader.readBlob();
            }
        }

        if (hasPacked && !spec.packedBeforeValues) packed = reader.readUnsigned();

        for (const item of spec.packedBits || []) {
            if (mask & item.bit) record[item.key] = (packed >> packedIndex++) & 1;
        }

        if (packed != null && spec.packedOffsetKeys) {
            for (const key of spec.packedOffsetKeys) {
                record[key] = (packed >> packedIndex++) & 1;
            }
        }

        if (!spec.orderedValues) {
            for (const field of spec.fields || []) {
                if (!(mask & field.bit)) continue;
                record[field.key] = (record[field.key] || 0) + reader.readFieldDelta();
            }
        }

        if (spec.scale) record.scaled = spec.scale(record);
    }
}

function summarizeUpdate(update) {
    return {
        generation: update.generation,
        sectionCount: update.sections.length,
        removals: update.removals.length,
        unknownTags: update.unknownTags,
        error: update.error?.message || null,
        sections: update.sections.map((section) => ({
            tag: section.tag,
            table: section.table,
            name: section.name,
            records: section.records.length
        }))
    };
}

function insertSorted(values, value) {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (values[mid] < value) low = mid + 1;
        else high = mid;
    }
    values.splice(low, 0, value);
}

export function decodeModelData(bytes) {
    const state = new ModelState();
    return state.apply(bytes);
}
