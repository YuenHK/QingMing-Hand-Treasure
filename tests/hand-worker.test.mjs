// Run the actual worker/controller protocol with a deterministic SDK adapter.
// The real Full/Lite models are separately exercised by tests/hand-check.html.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('worker switches slow Full to Lite, keeps two hands/GPU and resumes without a stale result',async()=>{
 const oldSelf=globalThis.self,oldPerformance=globalThis.performance,oldCanvas=globalThis.OffscreenCanvas;
 const fixture={clock:0,created:[],closed:[]},messages=[];globalThis.qingmingWorkerFixture=fixture;
 globalThis.performance={now:()=>fixture.clock};globalThis.OffscreenCanvas=class{};
 globalThis.self={postMessage:message=>messages.push(message)};
 try{
  const sdk=`export const FilesetResolver={forVisionTasks:async()=>({wasmLoaderPath:'data:text/javascript,export default function ModuleFactory(){}'})};
   export const HandLandmarker={createFromOptions:async(files,options)=>{
    if(typeof self.ModuleFactory!=='function')throw Error('ModuleFactory not set.');self.ModuleFactory=undefined;
    const s=globalThis.qingmingWorkerFixture,model=options.baseOptions.modelAssetPath.includes('_lite.')?'lite':'full';s.created.push({model,options});
    return {close(){s.closed.push(model);},detectForVideo(){s.clock+=model==='full'?220:95;return {landmarks:[Array(21).fill({x:.2,y:.3}),Array(21).fill({x:.8,y:.3})]};}};
   }};`;
  const url=new URL('../hand-worker.mjs',import.meta.url);
  let source=readFileSync(url,'utf8');
  source=source.replace("'./vendor/mediapipe/vision_bundle.mjs'",JSON.stringify('data:text/javascript,'+encodeURIComponent(sdk)))
   .replace(/from '(\.\/[^']+)'/g,(_,name)=>'from '+JSON.stringify(new URL(name,url).href))
   .replaceAll('import.meta.url',JSON.stringify(url.href));
  await import('data:text/javascript,'+encodeURIComponent(source));
  await self.onmessage({data:{type:'init',model:'full',automatic:true,numHands:2,gpu:true}});
  assert.equal(messages.at(-1).type,'ready');assert.equal(messages.at(-1).model,'full');
  let closed=0;for(let i=0;i<13;i++)await self.onmessage({data:{type:'frame',bitmap:{close(){closed++;}},timestamp:i+1}});
  assert.equal(messages.filter(m=>m.type==='result').length,12,'the frame used to decide a switch is discarded');
  assert.equal(messages.at(-1).type,'model-ready');assert.equal(messages.at(-1).model,'lite');
  assert.deepEqual(messages.filter(m=>m.type==='model-changing').map(m=>[m.from,m.to]),[['full','lite']]);
  assert.deepEqual(fixture.created.map(m=>[m.model,m.options.numHands,m.options.baseOptions.delegate]),[['full',2,'GPU'],['lite',2,'GPU']]);
  assert.deepEqual(fixture.closed,['full']);assert.equal(closed,13);
  await self.onmessage({data:{type:'frame',bitmap:{close(){closed++;}},timestamp:14}});
  const result=messages.at(-1);assert.equal(result.type,'result');assert.equal(result.model,'lite');assert.equal(result.ms,95);assert.equal(result.hands.length,2);assert.equal(result.delegate,'GPU');assert.equal(closed,14);
 }finally{globalThis.self=oldSelf;globalThis.performance=oldPerformance;globalThis.OffscreenCanvas=oldCanvas;delete globalThis.qingmingWorkerFixture;}
});
