import {test} from 'node:test';
import assert from 'node:assert/strict';
import {palmControl,smoothPoint,createHandTracker} from '../hand-math.mjs';
function hand(x=.4,y=.5,open=true){const h=Array.from({length:21},()=>({x,y}));h[0].y=y+.1;for(const [tip,pip]of [[8,6],[12,10],[16,14],[20,18]]){h[pip].y=y-.05;h[tip].y=y+(open?-.2:.08);}return h;}
test('mirroring maps physical hand movement to opposite image coordinate',()=>{const a=palmControl(hand(.3)),b=palmControl(hand(.7));assert.ok(a.x>b.x);assert.ok(palmControl(hand(.3),false).x<palmControl(hand(.7),false).x);});
test('working area reaches both edges and clamps out-of-frame coordinates',()=>{assert.equal(palmControl(hand(.02)).x,1);assert.equal(palmControl(hand(.98)).x,0);});
test('open hand runs; closed hand pauses; missing or malformed landmarks stop',()=>{assert.equal(palmControl(hand()).open,true);assert.equal(palmControl(hand(.4,.5,false)).open,false);assert.equal(palmControl(null),null);assert.equal(palmControl([{x:NaN,y:0}]),null);});
test('smoothing reduces jitter, converges, and is frame-rate independent',()=>{let p={x:0,y:0};for(let i=0;i<15;i++)p=smoothPoint(p,{x:1,y:1},1/30);const q=smoothPoint(null,{x:.5,y:.5},.1);assert.ok(p.x>.99&&p.x<=1);assert.deepEqual(q,{x:.5,y:.5});const a=smoothPoint({x:0,y:0},{x:1,y:1},.1),b=smoothPoint(smoothPoint({x:0,y:0},{x:1,y:1},.05),{x:1,y:1},.05);assert.ok(Math.abs(a.x-b.x)<1e-9);});

test('two same-handed visitors keep their slots when detector order changes or one leaves',()=>{
 const tracker=createHandTracker();let out=tracker.update([hand(.3),hand(.7)],0);
 assert.equal(out.length,2);const x0=out[0].x,x1=out[1].x;
 out=tracker.update([hand(.7),hand(.3)],100);
 assert.equal(out[0].x,x0);assert.equal(out[1].x,x1);
 out=tracker.update([hand(.7)],200);assert.equal(out[0].id,1);assert.equal(out[0].x,x1);
 out=tracker.update([hand(.3),hand(.7)],500);assert.deepEqual(out.map(p=>p.id),[0,1]);
 out=tracker.update([hand(.3,.5,false),hand(.7)],600);assert.equal(out[0].open,false);assert.equal(out[1].open,true);
 tracker.clear();assert.deepEqual(tracker.update([],700),[]);
});

test('one hand smoothing never drags the other cursor, and expired slots are reusable',()=>{
 const tracker=createHandTracker();const initial=tracker.update([hand(.2),hand(.8)],0);
 const moved=tracker.update([hand(.25),hand(.8)],50);
 assert.notEqual(moved[0].x,initial[0].x);assert.equal(moved[1].x,initial[1].x);
 tracker.update([],1000);const next=tracker.update([hand(.5)],1100);assert.equal(next.length,1);assert.equal(next[0].id,0);
});
