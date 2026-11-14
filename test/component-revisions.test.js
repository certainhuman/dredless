import assert from 'node:assert/strict';
import test from 'node:test';
import {ModelState} from '../src/state/model/state.js';
const integer=value=>{let n=Math.abs(value)*2+(value<0?1:0);const bytes=[];do{bytes.push((n%128)|(n>=128?128:0));n=Math.floor(n/128);}while(n);return bytes;};
const section=(tag,id,mask,...values)=>[...integer(tag),...integer(id),mask,...values.flatMap(integer),0];
const apply=(model,...sections)=>model.apply(Uint8Array.from([...integer(1),...sections.flat(),0]));
test('record revisions track in-place edits across repeated wire generations and removals',()=>{
 const m=new ModelState();assert.equal(m.revision,0);assert.equal(m.recordRevision(null),0);
 apply(m,section(1,1,1,40),section(1,2,1,80));const a=m.record(0,1),b=m.record(0,2);assert.equal(m.recordRevision(a),1);assert.equal(m.recordRevision(b),1);
 apply(m,section(1,1,1,40));assert.equal(m.generation,1);assert.equal(m.revision,2);assert.equal(m.record(0,1),a);assert.equal(m.recordRevision(a),2);assert.equal(m.recordRevision(b),1);
 apply(m,[...integer(57005),...integer(1),0]);assert.equal(m.record(0,1),null);
 apply(m,section(1,1,1,120));assert.notEqual(m.record(0,1),a);assert.equal(m.recordRevision(m.record(0,1)),4);assert.equal(m._derived,null);
});
test('partially decoded records receive a revision even when a following value fails',()=>{
 const m=new ModelState();apply(m,section(1,1,1,40));const record=m.record(0,1);
 const result=m.apply(Uint8Array.from([...integer(1),...integer(1),...integer(1),3,...integer(40)]));assert(result.error);assert.equal(m.record(0,1),record);assert.equal(m.recordRevision(record),2);assert.equal(m._derived,null);
});
test('navigation getter preserves tracked destination across flag-only updates without summaries',()=>{
 const m=new ModelState();apply(m,section(43,261,1,261),section(168,261,1,-6000));const expected=m.navigationDestination(261);assert.equal(m._derived,null);
 apply(m,section(168,261,16,1));assert.equal(m.navigationDestination(261),expected);assert.equal(m._derived,null);
 assert.equal(m.navigationDestination(261),m.entity(261).contents.navigationUnit.destination);
});

test('component entity index tracks removals, same-packet recreation and partial rows',()=>{
 const m=new ModelState();apply(m,section(1,2,1,80),section(1,1,1,40));assert.deepEqual([...m.componentEntityIds()],[1,2]);assert.equal(m.entityRevision(1),1);
 apply(m,section(1,2,1,40));assert.equal(m.entityRevision(1),1);assert.equal(m.entityRevision(2),2);
 apply(m,[...integer(57005),...integer(1),0]);assert.deepEqual([...m.componentEntityIds()],[2]);assert.equal(m.entityRevision(1),0);
 apply(m,section(1,1,1,120),[...integer(57005),...integer(1),0],section(1,1,1,160));assert.deepEqual([...m.componentEntityIds()],[1,2]);assert.equal(m.entityRevision(1),4);assert.equal(m.record(0,1).q20,160);
 const result=m.apply(Uint8Array.from([...integer(1),...integer(1),...integer(3),3,...integer(40)]));assert(result.error);assert.deepEqual([...m.componentEntityIds()],[1,2,3]);assert.equal(m.entityRevision(3),5);assert.equal(m._derived,null);
});
