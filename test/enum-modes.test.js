import assert from "node:assert/strict";
import test from "node:test";

import {
    FixedAngleDirection,
    LoaderFilterMode,
    LoaderPosition,
    LoaderPriority,
    PusherMode,
    buildGeneratorClipboardDirectionData,
    buildLoaderConfigData,
    buildLoaderFilterConfigData,
    buildPusherConfigData
} from "../src/protocol/ui-config.js";

test("UI configuration helpers accept enum values", () => {
    assert.doesNotThrow(() => buildPusherConfigData(1, {
        mode: PusherMode.Push,
        filteredMode: PusherMode.DoNothing
    }));
    assert.doesNotThrow(() => buildLoaderConfigData(1, {
        pick: LoaderPosition.TopLeft,
        place: LoaderPosition.BottomRight,
        priority: LoaderPriority.High
    }));
    assert.doesNotThrow(() => buildLoaderFilterConfigData(1, LoaderFilterMode.AllowFilter));
    assert.doesNotThrow(() => buildGeneratorClipboardDirectionData(FixedAngleDirection.Right));
});

test("UI configuration helpers reject numeric and legacy mode inputs", () => {
    assert.throws(() => buildPusherConfigData(1, {mode: 0}), /mode/);
    assert.throws(() => buildPusherConfigData(1, {mode: "none"}), /mode/);
    assert.throws(() => buildLoaderConfigData(1, {pick: 0, place: LoaderPosition.BottomRight}), /pick/);
    assert.throws(() => buildLoaderFilterConfigData(1, 2), /filterMode/);
    assert.throws(() => buildLoaderConfigData(1, {priority: 0}), /priority/);
    assert.throws(() => buildLoaderConfigData(1, {priority: "medium"}), /priority/);
    assert.throws(() => buildGeneratorClipboardDirectionData(0), /direction/);
});