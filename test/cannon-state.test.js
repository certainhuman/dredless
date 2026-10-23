import assert from 'node:assert/strict';
import test from 'node:test';
import {ModelState} from '../src/state/model/state.js';
import {summarizeCannon} from '../src/state/model/decoder.js';
function integer(value){let n=Math.abs(value)*2+(value<0?1:0);const bytes=[];do{bytes.push((n%128)|(n>=128?128:0));n=Math.floor(n/128);}while(n);return bytes;}
function apply(model,mask,values,generation=1){const bytes=[...integer(generation),...integer(137),...integer(1)];let n=mask;do{bytes.push((n%128)|(n>=128?128:0));n=Math.floor(n/128);}while(n);bytes.push(...values.flatMap(integer),0,0);const update=model.apply(Uint8Array.from(bytes));assert.equal(update.error,null);return model.record(54,1);}
test('cannon deltas start with extended barrels and capacity 16',()=>{
 const model=new ModelState();let record=apply(model,0,[]);
 assert.equal(record.q36,50);assert.equal(record.q48,50);assert.equal(record.q44,16);
 record=apply(model,112,[-8,-10,-25],2);
 assert.equal(record.q44,8);assert.equal(record.q36,40);assert.equal(record.q48,25);
 const summary=summarizeCannon(1,record,226);
 assert.equal(summary.recoil,40);assert.equal(summary.recoil2,25);
 record=apply(model,96,[10,25],3);
 assert.equal(record.q36,50);assert.equal(record.q48,50);assert.equal(record.q44,8);
});
test('an explicit zero recoil delta keeps the starter barrel visible',()=>{
 const record=apply(new ModelState(),32,[0]);assert.equal(record.q36/50,1);
});
