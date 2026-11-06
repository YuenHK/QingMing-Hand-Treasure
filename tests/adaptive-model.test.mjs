import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModelPolicy,createAdaptiveTracker,createModelMemory} from '../adaptive-model.mjs';

function feed(policy,ms,count=13,hands=2){return Array.from({length:count},()=>policy.observe(ms,hands)).filter(Boolean);}
test('warm-up, missing hands and isolated spikes do not downgrade a fast Full model',()=>{
 const p=createModelPolicy();assert.deepEqual(feed(p,1000,5),[]);
 assert.deepEqual(feed(p,500,20,0),[]);
 for(const ms of [30,30,500,30,30,30,30])assert.equal(p.observe(ms,2),null);
 assert.deepEqual(p.observe(30,2),{type:'choice',model:'full',reason:'measured'});
 assert.deepEqual(feed(p,30,100),[]);
});
test('slow Full becomes Lite once; a later fast Lite cannot oscillate back',()=>{
 const p=createModelPolicy();assert.deepEqual(feed(p,220),[{type:'switch',model:'lite',reason:'full-over-budget'}]);
 assert.deepEqual(feed(p,20),[{type:'choice',model:'lite',reason:'measured'}]);assert.deepEqual(feed(p,20,100),[]);
});
test('a fast Android Lite model can try Full, then keep it or fall back once',()=>{
 for(const [fullMs,expected]of [[60,'choice'],[180,'switch']]){
  const p=createModelPolicy('lite');assert.deepEqual(feed(p,20),[{type:'switch',model:'full',reason:'fast-lite-trial'}]);
  const events=feed(p,fullMs);assert.equal(events[0].type,expected);assert.equal(events[0].model,fullMs<100?'full':'lite');
  if(fullMs>100){feed(p,10);assert.deepEqual(feed(p,10,100),[]);}
 }
});
test('Full can downshift later if the device slows down; fixed models stay fixed',()=>{
 const p=createModelPolicy();feed(p,40);assert.equal(feed(p,250,8).at(-1).model,'lite');
 assert.deepEqual(feed(createModelPolicy('full',false),999,100),[]);
 assert.deepEqual(feed(createModelPolicy('lite',false),1,100),[]);
});
test('a model swap preserves GPU selection, closes the old detector and discards the stale frame',async()=>{
 let clock=0;const created=[],closed=[],changing=[],choices=[];
 const tracker=await createAdaptiveTracker(async(model,options)=>{created.push({model,...options});return {delegate:'GPU',close(){closed.push(model);},async detect(){clock+=model==='full'?220:90;return {landmarks:[[],[]]};}};},{now:()=>clock,onChanging:e=>changing.push(e),onChoice:e=>choices.push(e)});
 let output;for(let i=0;i<13;i++)output=await tracker.detect({},i);
 assert.equal(output.changed,true);assert.equal(output.result,undefined);assert.equal(tracker.model,'lite');
 assert.deepEqual(created,[{model:'full',gpu:true},{model:'lite',gpu:true}]);assert.deepEqual(closed,['full']);assert.equal(changing.length,1);assert.equal(choices.at(-1).model,'lite');
 output=await tracker.detect({},14);assert.equal(output.ms,90);assert.equal(output.result.landmarks.length,2);
});
test('a failed model swap restores the previous model and does not retry in a loop',async()=>{
 let clock=0;const created=[];
 const tracker=await createAdaptiveTracker(async model=>{created.push(model);if(model==='lite')throw Error('Network unavailable');return {delegate:'CPU',close(){},async detect(){clock+=220;return {landmarks:[[]]};}};},{now:()=>clock});
 let output;for(let i=0;i<13;i++)output=await tracker.detect({},i);
 assert.equal(output.reason,'model-load-failed');assert.equal(tracker.model,'full');
 for(let i=0;i<40;i++)await tracker.detect({},i+14);assert.deepEqual(created,['full','lite','full']);
});
test('a CPU fallback is retained when switching models, without retrying GPU drivers',async()=>{
 let clock=0;const options=[];
 const tracker=await createAdaptiveTracker(async(model,opts)=>{options.push(opts.gpu);return {delegate:'CPU',close(){},async detect(){clock+=200;return {landmarks:[[]]};}};},{now:()=>clock});
 for(let i=0;i<13;i++)await tracker.detect({},i);assert.deepEqual(options,[true,false]);
});
test('device memory expires, respects hand count and engine, and tolerates blocked storage',()=>{
 let now=1000;const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const memory=createModelMemory(storage,{},()=>now);assert.equal(memory.read(),null);memory.save('lite');assert.equal(memory.read(),'lite');
 assert.equal(createModelMemory(storage,{engine:'cpu'},()=>now).read(),null);assert.equal(createModelMemory(storage,{numHands:1},()=>now).read(),null);
 now+=7*86400000+1;assert.equal(memory.read(),null);
 const blocked=createModelMemory({getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');}});assert.equal(blocked.read(),null);blocked.save('full');
 for(const value of ['bad JSON','{"model":"other","expires":123456789}','{"model":"lite","expires":"bad"}']){data.set('qingming.auto-model.v1:auto:2:balanced',value);assert.equal(memory.read(),null);}
});

test('a stalled model download times out, restores tracking and disposes a late detector',async()=>{
 let clock=0,finishLoad,lateClosed=false;
 const tracker=await createAdaptiveTracker(async model=>{
  if(model==='lite')return new Promise(resolve=>{finishLoad=resolve;});
  return {delegate:'GPU',close(){},async detect(){clock+=220;return {landmarks:[[]]};}};
 },{now:()=>clock,switchTimeoutMs:5});
 let output;for(let i=0;i<13;i++)output=await tracker.detect({},i);
 assert.equal(output.reason,'model-load-failed');assert.equal(tracker.model,'full');
 finishLoad({close(){lateClosed=true;}});await new Promise(setImmediate);assert.equal(lateClosed,true);
});
