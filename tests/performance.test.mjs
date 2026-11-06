import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFrameClock,createTrackingSchedule,createTrackingEngine,trackingProfile,trackingModel,readPerformanceSettings,createFrameCapture} from '../performance.mjs';

test('a 4K webcam is downsampled before a bitmap is transferred to the worker',async()=>{
 const draws=[],canvas={getContext:()=>({drawImage(...args){draws.push(args);}})},bitmap={};let source;
 const capture=createFrameCapture(()=>canvas,async input=>{source=input;return bitmap;});
 const video={videoWidth:3840,videoHeight:2160};assert.equal(await capture.capture(video,256),bitmap);
 assert.deepEqual(capture.size,[256,144]);assert.equal(source,canvas);assert.deepEqual(draws[0],[video,0,0,256,144]);
});

test('smooth mode keeps two players and single mode is an explicit choice',()=>{
 const smooth=trackingProfile('smooth',true),single=trackingProfile('single',true);
 assert.equal(smooth.numHands,2);assert.equal(smooth.width,256);assert.equal(smooth.cameraWidth,320);assert.equal(smooth.fps,6);assert.equal(single.numHands,1);
 const schedule=createTrackingSchedule(true,'smooth');schedule.complete(200,1000,'CPU');assert.equal(schedule.width,256);assert.equal(schedule.canSend(1100,1000),false);assert.equal(schedule.canSend(1250,1000),true);
});
test('diagnostic URLs override saved settings without changing or requiring local storage',()=>{
 const storage={getItem:()=>JSON.stringify({profile:'single',engine:'cpu'})};
 assert.deepEqual(readPerformanceSettings({search:'?diagnostics=1&performance=smooth&engine=auto',storage}),{profile:'smooth',engine:'auto',model:'auto',diagnostics:true});
 assert.equal(readPerformanceSettings({storage}).profile,'single');
 assert.deepEqual(readPerformanceSettings({search:'?performance=invalid&engine=invalid',storage:{getItem(){throw Error('Blocked');}}}),{profile:'balanced',engine:'auto',model:'auto',diagnostics:false});
});

test('high refresh panels render at most thirty times a second without speeding up time',()=>{
 const clock=createFrameClock();let draws=0,elapsed=0;
 for(let i=1;i<=240;i++){const frame=clock.step(i*1000/120);if(frame){draws++;elapsed+=frame.animationDt;}}
 assert.equal(draws,60);assert.ok(Math.abs(elapsed-2)<.001);
 clock.step(10000,true);assert.equal(clock.step(10001),null,'background time does not jump the tour');
});
test('slow CPU tracking yields time, reduces Android input pixels and still accepts the next frame',()=>{
 const schedule=createTrackingSchedule(true);assert.equal(schedule.width,416);schedule.complete(200,1000,'CPU');
 assert.equal(schedule.width,320);assert.equal(schedule.canSend(1050,800),false);assert.equal(schedule.canSend(1200,800),true);assert.ok(schedule.staleMs>=550);
 schedule.reset();assert.equal(schedule.width,416);assert.equal(schedule.averageMs,0);
});
test('tracking budgets preserve a maximum rate even with very fast GPU inference',()=>{
 const schedule=createTrackingSchedule(true);schedule.complete(5,1000,'GPU');assert.equal(schedule.canSend(1060,1000),false);assert.equal(schedule.canSend(1100,1000),true);
});
test('GPU detector is preferred and receives both hands options from its factory',async()=>{
 const delegates=[];const engine=await createTrackingEngine(async delegate=>{delegates.push(delegate);return {detectForVideo:()=>({landmarks:[[],[]]})};});
 assert.deepEqual(delegates,['GPU']);assert.equal(engine.delegate,'GPU');assert.equal((await engine.detect({},1)).landmarks.length,2);
});
test('unsupported GPU and runtime context loss each fall back once to CPU',async()=>{
 let calls=[];let engine=await createTrackingEngine(async delegate=>{calls.push(delegate);if(delegate==='GPU')throw Error('Unsupported');return {detectForVideo:()=>({landmarks:[]})};});
 assert.deepEqual(calls,['GPU','CPU']);assert.equal(engine.delegate,'CPU');assert.equal(engine.fallback,true);
 calls=[];let closed=false;engine=await createTrackingEngine(async delegate=>{calls.push(delegate);return {close(){closed=true;},detectForVideo(){if(delegate==='GPU')throw Error('Context lost');return {landmarks:[]};}};});
 await engine.detect({},1);await engine.detect({},2);assert.deepEqual(calls,['GPU','CPU']);assert.equal(closed,true);
});
test('CPU failures propagate rather than repeatedly loading models',async()=>{
 let count=0;const engine=await createTrackingEngine(async()=>{count++;return {detectForVideo(){throw Error('Model failure');}};},{gpu:false});
 await assert.rejects(engine.detect({},1),/Model failure/);assert.equal(count,1);
});

test('successful GPU inference stays on GPU even when latency is high',async()=>{
 const delegates=[];let closed=false;const engine=await createTrackingEngine(async delegate=>{delegates.push(delegate);return {close(){closed=true;},detectForVideo:()=>({landmarks:[]})};});
 // Regression: this device measured GPU 220ms versus CPU 533ms. High GPU
 // latency alone must never be taken as evidence that CPU would be faster.
 for(let i=0;i<30;i++){engine.observeLatency?.(i<5?1000:220);await engine.detect({},i+1);}
 assert.equal(engine.delegate,'GPU');assert.deepEqual(delegates,['GPU']);assert.equal(closed,false);
});
test('an explicit CPU selection never initializes a GPU detector',async()=>{
 const delegates=[];const engine=await createTrackingEngine(async delegate=>{delegates.push(delegate);return {detectForVideo:()=>({landmarks:[]})};},{gpu:false});
 assert.equal(engine.delegate,'CPU');await engine.detect({},1);assert.deepEqual(delegates,['CPU']);
});

test('Android auto uses Lite, while explicit model and CPU choices stay independent',()=>{
 assert.equal(trackingModel('auto',true).id,'lite');assert.equal(trackingModel('auto',false).id,'full');
 assert.equal(trackingModel('full',true).file,'hand_landmarker.task');assert.equal(trackingModel('lite',false).file,'hand_landmarker_lite.task');
 const storage={getItem:()=>JSON.stringify({model:'full',engine:'cpu'})};
 assert.equal(readPerformanceSettings({storage}).model,'full');
 assert.deepEqual(readPerformanceSettings({search:'?model=lite&engine=auto',storage}),{profile:'balanced',engine:'auto',model:'lite',diagnostics:false});
 assert.equal(readPerformanceSettings({search:'?model=../../other.task'}).model,'auto');
});
