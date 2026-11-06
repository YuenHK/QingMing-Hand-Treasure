import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFrameClock,createTrackingSchedule,createTrackingEngine} from '../performance.mjs';

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
