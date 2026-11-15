import assert from "node:assert/strict";
import test from "node:test";
import {DredlessClient, ModelState, buildAdvancedExpandoBoxConfigData,
    buildAdvancedExpandoBoxCopyConfigData, buildAdvancedExpandoBoxPasteConfigData} from "../src/index.js";
import {decodeMsgpack} from "../src/protocol/codec/msgpack.js";
import {itemNameFromId} from "../src/state/items.js";

function unsigned(value) {
    const bytes = [];
    do {bytes.push(value % 128 | (value >= 128 ? 128 : 0)); value = Math.floor(value / 128);} while (value);
    return bytes;
}
const integer = value => unsigned(Math.abs(value) * 2 + (value < 0 ? 1 : 0));
const section = (tag, entity, mask, values = []) => [
    ...integer(tag), ...integer(entity), ...unsigned(mask), ...values.flat(), 0
];
function apply(model, ...sections) {
    const result = model.apply(Uint8Array.from([...integer(1), ...sections.flat(), 0]));
    assert.equal(result.error, null);
}
function populate(model) {
    apply(model,
        section(43, 300, 1, [integer(266)]), section(164, 300, 0),
        section(134, 300, 3, [integer(50), integer(40)]),
        section(173, 300, 127, [unsigned(3), ...[15,300,20,500].map(integer)]),
        section(174, 300, 7, [integer(0x123456 - 0xdddddd), integer(0xabcdef - 0x404040), integer(-75)]));
}
const expected = {
    minWidth: 3.5, maxWidth: 40, minHeight: 4, maxHeight: 60,
    minEnabled: true, maxEnabled: true, fixedSize: false,
    backgroundColor: 0x123456, borderColor: 0xabcdef, opacity: 0.25
};

test("new items are named and advanced boxes expose size limits, colors and opacity", () => {
    assert.equal(itemNameFromId(266), "Advanced Expando Box (Packaged)");
    assert.equal(itemNameFromId(267), "Advanced Logistics Controller");
    const model = new ModelState();
    populate(model);
    const entity = model.entity(300);
    assert.equal(entity.typeId, 266);
    assert.equal(entity.typeName, "Advanced Expando Box (Packaged)");
    assert.equal(entity.contents.expandoBox.advanced, true);
    assert.equal(entity.contents.expandoBox.width, 5);
    assert.equal(entity.contents.expandoBox.height, 4);
    assert.deepEqual(entity.contents.expandoBox.config, expected);
    assert.equal(model.machines().expandoBoxes.length, 1);
    apply(model, section(173, 300, 64, [unsigned(1)]), section(174, 300, 4, [integer(25)]));
    assert.equal(model.entity(300).contents.expandoBox.config.fixedSize, true);
    assert.equal(model.entity(300).contents.expandoBox.config.opacity, 0.5);
    assert.equal(model.entity(300).contents.expandoBox.config.minWidth, 3.5);
});

test("advanced expando defaults work with only the replicated type marker", () => {
    const model = new ModelState();
    apply(model, section(43, 1, 1, [integer(266)]));
    const box = model.entity(1).contents.expandoBox;
    assert.equal(box.advanced, true);
    assert.equal(box.config.minWidth, 2);
    assert.equal(box.config.maxHeight, 10);
    assert.equal(box.config.backgroundColor, 0xdddddd);
    assert.equal(box.config.opacity, 1);
});

// Frozen native-format vectors: floats are little endian; each section closes
// independently. The official WASM parser accepts these and retains both sections.
const text = value => [138, value.length, ...new TextEncoder().encode(value), 0, 144];
const payload = [
    ...text("config_expando_size"),
    136,0,0,96,64, 136,0,0,32,66, 136,0,0,128,64, 136,0,0,112,66,
    141,141,142,145,
    ...text("config_expando_colors"),
    130,86,52,18,0, 130,239,205,171,0, 136,0,0,128,62,145,145
];
test("advanced configuration, clipboard and paste match native-format vectors", () => {
    assert.deepEqual([...buildAdvancedExpandoBoxConfigData(999, expected)], [144,0,129,231,3,...payload]);
    assert.deepEqual([...buildAdvancedExpandoBoxCopyConfigData(expected)], [144,1,11,...payload]);
    assert.deepEqual([...buildAdvancedExpandoBoxPasteConfigData(65536, expected)], [144,2,130,0,0,1,0,...payload]);
    for (const key of ["minWidth", "maxWidth", "minHeight", "maxHeight"]) {
        for (const value of [1.9,100.1,NaN,Infinity,"4",null]) {
            assert.throws(() => buildAdvancedExpandoBoxConfigData(1, {[key]:value}), RangeError);
        }
    }
    for (const config of [{opacity:-1},{opacity:1.1},{backgroundColor:-1},
        {borderColor:0x1000000},{backgroundColor:1.5},{minEnabled:1},{fixedSize:null}]) {
        assert.throws(() => buildAdvancedExpandoBoxConfigData(1,config));
    }
    for (const id of [-1,1.5,0x100000000]) assert.throws(() => buildAdvancedExpandoBoxConfigData(id));
});

test("advanced box handles preserve observed settings across partial configure/copy/paste", () => {
    const messages = [];
    const client = DredlessClient.attachWebSocket({readyState:1,addEventListener(){},
        send:bytes=>messages.push(decodeMsgpack(bytes))}, {mode:"observe",ready:true});
    client.worlds.currentWorldId = 1;
    const world = client.worlds.get(1);
    populate(world.model);
    const box = client.currentShip().machines.expandoBox(300);
    assert.equal(box.configure({opacity:0, minWidth:undefined}),client);
    assert.deepEqual(messages.pop(), {type:8,data:buildAdvancedExpandoBoxConfigData(300,{...expected,opacity:0})});
    box.copy();
    assert.deepEqual(messages.pop(), {type:8,data:buildAdvancedExpandoBoxCopyConfigData(expected)});
    box.paste({fixedSize:true});
    assert.deepEqual(messages.pop(), {type:8,data:buildAdvancedExpandoBoxPasteConfigData(300,{...expected,fixedSize:true})});
    // The basic box still exposes its inventory and dimensions, without advanced controls.
    apply(world.model, section(43, 301, 1, [integer(240)]), section(134, 301, 3, [integer(20),integer(20)]));
    const basic = client.currentShip().machines.expandoBox(301);
    assert.equal(basic.state.advanced,false);
    assert.equal(basic.state.config,null);
    assert.throws(()=>basic.configure({opacity:0}),/Advanced Expando Box/);
});
