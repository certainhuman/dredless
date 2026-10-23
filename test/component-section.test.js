import assert from 'node:assert/strict';
import test from 'node:test';
import {ModelState} from '../src/state/model/state.js';
function integer(value){let n=Math.abs(value)*2+(value<0?1:0);const bytes=[];do{bytes.push((n%128)|(n>=128?128:0));n=Math.floor(n/128);}while(n);return bytes;}
function unsigned(value){const bytes=[];do{bytes.push((value%128)|(value>=128?128:0));value=Math.floor(value/128);}while(value);return bytes;}
const section=(tag,entity,mask,values=[])=>[...integer(tag),...integer(entity),...unsigned(mask),...values.flatMap(integer),0];
function apply(model,generation,...sections){const result=model.apply(Uint8Array.from([...integer(generation),...sections.flat(),0]));assert.equal(result.error,null);return result;}
test('wire 95 consumes three numeric fields and applies its scale default once',()=>{
 const model=new ModelState();
 apply(model,1,section(95,1,0));assert.equal(model.record(32,1).q28,10);
 apply(model,2,section(95,1,7,[12,34,56]));
 assert.equal(model.record(32,1).q20,12);assert.equal(model.record(32,1).q24,34);assert.equal(model.record(32,1).q28,66);
 apply(model,3,section(95,1,7,[-2,-4,-57]));
 assert.equal(model.record(32,1).q20,10);assert.equal(model.record(32,1).q24,30);assert.equal(model.record(32,1).q28,9);
});
test('wire 95 does not swallow a following projectile despawn',()=>{
 const model=new ModelState();const projectile=588184,other=588182;
 apply(model,1,section(1,projectile,3,[10706,116181]),section(87,projectile,0));
 assert.equal(model.projectiles().length,1);assert(model.entity(projectile));
 // Reduced from capture 11, packet 1486: tag 95, mask 4, delta -1,
 // followed immediately by the entity-removal section.
 const result=apply(model,2,section(95,other,4,[-1]),[...integer(57005),...integer(projectile),0]);
 assert.deepEqual(result.sections[0].records,[{entity:other,mask:4}]);
 assert.deepEqual(result.removals,[projectile]);
 assert.equal(model.record(32,other).q28,9);
 assert.equal(model.record(24,projectile),null);assert.equal(model.record(0,projectile),null);
 assert.equal(model.entity(projectile),null);assert.equal(model.projectiles().length,0);
 assert.deepEqual(model.entities().map(e=>e.entity),[other]);
});
