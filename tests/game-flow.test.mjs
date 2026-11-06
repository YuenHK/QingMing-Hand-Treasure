// Exercise the real camera controller and game together, using a deterministic
// camera/AI adapter and DOM. No real camera frames are recorded by this test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('single and cooperative controls, clue guidance, complete journey and hand restart work together',async()=>{
 let clock=0,id=0,stopped=false,grayFilters=0;const frames=new Map(),elements=new Map(),paintOperations=[];
 const context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>{if(k==='filter'&&String(v).includes('grayscale'))grayFilters++;o[k]=v;return true;}});
 const stageContext=new Proxy(context,{get:(o,k)=>k==='drawImage'?()=>paintOperations.push({kind:'image'}):k==='arc'?(x,y,r)=>paintOperations.push({kind:'arc',x,y,r}):o[k]});
 class Element{
  constructor(id=''){this.id=id;this.hidden=false;this.style={setProperty(){}};this.dataset={};this.attributes={};this.listeners={};this.classList={add(){},remove(){}};this.width=640;this.height=480;this.readyState=2;this.currentTime=0;this.value='';this.children=[];}
  getContext(){return this.id==='stage'?stageContext:context;}addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];}append(v){this.children.push(v);}replaceChildren(...children){this.children=children;}
  click(){if(this.disabled)return;this.onclick?.();for(const fn of this.listeners.click||[])fn({isTrusted:false});}
  play(){return Promise.resolve();}pause(){}load(){}
  getBoundingClientRect(){
   let r={left:0,top:0,width:1280,height:720};
   if(this.id==='stage')r={left:parseFloat(this.style.left)||0,top:parseFloat(this.style.top)||0,width:parseFloat(this.style.width)||1280,height:parseFloat(this.style.height)||720};
   else if(this.id==='welcomeCamera')r={left:320,top:590,width:640,height:60};
   else if(this.id==='continue')r={left:340,top:610,width:600,height:60};
   else if(this.id==='getHint')r={left:1050,top:30,width:100,height:40};
   else if(!['mainView','paintingWrap'].includes(this.id))r={left:0,top:0,width:0,height:0};
   if(this.hidden)r.width=r.height=0;
   return {...r,right:r.left+r.width,bottom:r.top+r.height};
  }
 }
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const e=new Element(tag[1]);e.hidden=/\bhidden(?:\s|>)/.test(tag[0]);elements.set(e.id,e);}
 const get=id=>{assert.ok(elements.has(id),`DOM is missing #${id}`);return elements.get(id);};
 globalThis.document={getElementById:get,createElement:()=>new Element(),hidden:false,addEventListener(){}};
 globalThis.window={isSecureContext:true,addEventListener(){}};
 globalThis.performance={now:()=>clock};
 globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=n=>frames.delete(n);
 globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){this.fn();}};
 globalThis.Image=class{set src(v){queueMicrotask(()=>this.onload?.());}};
 globalThis.Option=class{};globalThis.createImageBitmap=async()=>({close(){}});
 const track={stop(){stopped=true;},getSettings:()=>({deviceId:'test-camera'})};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getVideoTracks:()=>[track]}),enumerateDevices:async()=>[]}}});
 let ai;
 globalThis.Worker=class{constructor(){ai=this;}postMessage(message){if(message.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}terminate(){}send(points){this.onmessage({data:{type:'result',hands:Array.isArray(points?.[0])?points:points?[points]:[],ms:4}});}};
 await import('../chapters.js');await import('../portal.js');await import('../camera.mjs');
 for(let i=0;i<15;i++)await Promise.resolve();
 assert.equal(get('welcome').hidden,false);assert.equal(get('liveTag').textContent,'LIVE',get('cameraStatus').textContent);assert.equal(get('welcomeCamera').disabled,false);
 function hand(x,y){const rawX=1-(.15+x*.7),rawY=.15+y*.7-.02;const points=Array.from({length:21},()=>({x:rawX,y:rawY}));points[0].y+=.1;for(const [tip,pip]of [[8,6],[12,10],[16,14],[20,18]]){points[pip].y-=.05;points[tip].y-=.2;}return points;}
 function advance(seconds,points){for(let i=0;i<Math.ceil(seconds/.05);i++){paintOperations.length=0;clock+=50;if(typeof points==='function')points();else if(points)ai.send(points);const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(clock);}}
 advance(1.6,hand(.5,620/720));
 assert.equal(get('welcome').hidden,true,'hand dwell must start on the intro itself');
 assert.equal(get('handCursor').hidden,false);assert.equal(get('handOverlay').dataset.landmarks,21);
 const state=()=>window.portalGame.getState();
 // Reproduce a visible target inside the former excluded 90px edge band.
 const edge=state().targets[0],source=window.PORTAL_CHAPTERS[0].targets.find(t=>t.id===edge.id),originalX=source.x;source.x=.04;
 const edgeRect=get('stage').getBoundingClientRect(),edgeX=edgeRect.left+source.x*edgeRect.width;
 assert.ok(edgeX<90&&edgeX>12);
 advance(2.1,()=>window.portalHands([{id:0,x:edgeX/1280,y:(edgeRect.top+source.y*edgeRect.height)/720,active:true}]));
 assert.equal(state().mode,'discovery','a visible edge target must be selectable');source.x=originalX;
 get('reset').click();get('welcomeCamera').click();advance(.1);
 advance(.2,[hand(.2,.3),hand(.8,.3)]);
 assert.equal(state().players.length,2,'camera delivers two independently active controls');
 assert.equal(get('handOverlay').dataset.landmarks,42);assert.equal(get('handCursor2').hidden,false);
 advance(.2,[hand(.8,.3)]);assert.equal(state().players.length,1,'one hand disappearing must not stop its partner');
 window.portalInput(.02,.02,true,'mouse');advance(.2,[hand(.2,.3),hand(.8,.3)]);assert.equal(state().players[0].id,'mouse','mouse priority still overrides both hands');
 window.portalInput(.5,.5,false,'mouse');
 // Different players cannot contribute time to each other's button dwell.
 advance(1,()=>window.portalHands([{id:0,x:1100/1280,y:50/720,active:true}]));
 advance(.5,()=>window.portalHands([{id:1,x:1100/1280,y:50/720,active:true}]));assert.equal(state().hint,null);
 advance(.9,()=>window.portalHands([{id:1,x:1100/1280,y:50/720,active:true}]));assert.ok(state().hint,'player two can dwell-select the hint button');
 const latchedHint=state().hint.index;advance(2,()=>window.portalHands([{id:1,x:1100/1280,y:50/720,active:true}]));assert.equal(state().hint.index,latchedHint,'holding the button must not repeatedly restart its flight');
 advance(.1,()=>window.portalHands([]));
 get('getHint').click();advance(1.5);
 assert.ok(state().hint,'the clue flight does not auto-award a treasure');assert.equal(state().total,0);
 const hintIndex=state().hint.index;get('getHint').click();advance(.1);assert.notEqual(state().hint.index,hintIndex,'a second clue can point to the other remaining object');
 advance(12.1);assert.equal(state().hint,null,'a clue marker expires without awarding an object');
 get('getHint').click();advance(.8);
 // Feed exact controls to test same-frame cooperative selection independently
 // of smoothing: both discoveries must be kept and narrated in sequence.
 const controls=state().targets.map((t,id)=>{const r=get('stage').getBoundingClientRect();return {id,x:(r.left+t.x*r.width)/1280,y:(r.top+t.y*r.height)/720,active:true};});
 advance(.7,()=>window.portalHands(controls));
 const rings=paintOperations.map((o,i)=>({...o,index:i})).filter(o=>o.kind==='arc'&&o.r===39);
 assert.ok(rings.length>=2,'both players see their dwell progress');
 assert.equal(paintOperations.slice(rings[0].index+1).some(o=>o.kind==='image'),false,'no lens, hint reveal or vignette may paint over a dwell ring');
 advance(.1,()=>window.portalHands([]));
 advance(.9,()=>window.portalHands([controls[0]]));advance(.1,()=>window.portalHands([]));advance(1,()=>window.portalHands([controls[0]]));assert.equal(state().mode,'search','missing hands must reset partial object dwell');
 advance(.1,()=>window.portalHands([]));
 advance(2.1,()=>window.portalHands(controls));assert.equal(state().mode,'discovery');assert.equal(state().total,1);assert.equal(state().pendingDiscoveries.length,1);
 assert.equal(state().hint,null,'discovery clears its marker');
 get('continue').click();assert.equal(state().mode,'discovery');assert.equal(state().total,2,'the partner clue is shown before travelling');
 get('continue').click();advance(3.4);assert.equal(state().chapter,1);
 window.portalGame.reset();get('welcomeCamera').click();advance(.1);
 const firstRoundGateIds=state().targets.map(t=>t.id);
 for(let chapter=0;chapter<5;chapter++){
  for(let target=0;target<2;target++){
   window.portalInput(.02,.98,true,'mouse');advance(.1);
   const t=state().targets[target],r=get('stage').getBoundingClientRect();
   window.portalInput((r.left+t.x*r.width)/1280,(r.top+t.y*r.height)/720,true,'mouse');advance(2);
   assert.equal(state().mode,'discovery',`chapter ${chapter}, clue ${target}`);
   get('continue').click();if(target===1&&chapter<4)advance(3.4);
  }
 }
 assert.equal(state().total,10);assert.equal(state().mode,'burn');advance(3.05);
 assert.equal(state().mode,'recap');assert.equal(state().replaySeconds,48);
 assert.equal(JSON.parse(get('audioControls').dataset.state).celebrating,true,'celebratory music lasts through the tour');
 const replayFilterCount=grayFilters;
 document.hidden=true;advance(20);document.hidden=false;
 advance(47.5);assert.equal(state().mode,'recap','background time must not skip the tour');
 window.portalInput(.02,.98,true,'mouse');advance(.7);assert.equal(state().mode,'complete');
 assert.equal(grayFilters,replayFilterCount,'the color tour must not rebuild grayscale frames');
 assert.equal(JSON.parse(get('audioControls').dataset.state).celebrating,false,'completion dialog returns to calm music');
 assert.match(get('continue').textContent,/再玩一次/);assert.doesNotMatch(get('noticeText').textContent,/自由|漫遊/);
 advance(1.8,hand(.5,640/720));assert.equal(state().mode,'search');assert.equal(state().chapter,0);assert.equal(state().total,0);
 assert.equal(get('welcome').hidden,false,'replay starts at the instructions');assert.ok(state().targets.every(t=>!firstRoundGateIds.includes(t.id)),'replay must draw new objects');assert.equal(stopped,false,'restart must retain the live camera');
 advance(.8,hand(.5,640/720));assert.equal(get('welcome').hidden,false,'holding the same hand must not skip the instructions');
 advance(.4,hand(.2,.4));advance(1.8,hand(.5,620/720));assert.equal(get('welcome').hidden,true,'new round can start with a deliberate hand movement');
});
