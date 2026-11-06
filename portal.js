import {createJourney,discover,continueJourney,COMPLETION_TEXT} from './journey-state.mjs';
import {recapFrame,recapDuration} from './recap.mjs';
import {createScrollAtlas} from './scroll-atlas.mjs';
import {createReveal,createTourGlow,createLensSparkles,createSpotlight,REVEAL_SECONDS} from './reveal.mjs?v=20261106-perf2';
import {createGameAudio} from './game-audio.mjs';
import {createInputRouter} from './input-router.mjs';
import {createRoundPicker} from './round-selection.mjs';
import {installFullscreen} from './fullscreen.mjs';
import {createFrameClock,readPerformanceSettings,trackingProfile} from './performance.mjs?v=20261106-perf2';
let framePreferences;try{framePreferences=window.localStorage;}catch{}
const frameSettings=readPerformanceSettings({search:window.location?.search||'',storage:framePreferences}),frameClock=createFrameClock(trackingProfile(frameSettings.profile).renderFps,performance.now());
const audio=createGameAudio();
const inputRouter=createInputRouter();
const W=1280,H=720,VIEW=1646,SCROLL_W=30000,$=id=>document.getElementById(id),chapterPool=window.PORTAL_CHAPTERS;
installFullscreen(document,$('fullscreen'));
let roundStorage;try{roundStorage=window.localStorage;}catch{}
const nextRound=createRoundPicker(chapterPool,{storage:roundStorage});
let chapters=chapterPool;
const canvas=$('stage'),ctx=canvas.getContext('2d'),surface=document.createElement('canvas'),dim=document.createElement('canvas');
for(const c of [surface,dim]){c.width=W;c.height=H;}
const hintSprite=document.createElement('canvas');hintSprite.width=hintSprite.height=48;
{const ink=hintSprite.getContext('2d'),g=ink.createRadialGradient(24,24,0,24,24,24);g.addColorStop(0,'#fff9df');g.addColorStop(.15,'#ffe7a5ee');g.addColorStop(.4,'#f2bc5866');g.addColorStop(1,'#f2bc5800');ink.fillStyle=g;ink.fillRect(0,0,48,48);}
let journey=createJourney(chapters),pointer={x:.5,y:.5,active:false,source:'mouse'},viewX=chapters[0].x,lastInput=0,dwell=0,hover=-1,uiHover='',uiTime=0,frames=0,travel=null,lastHint=0,artReady=false,celebration=null,recap=null,replayFinished=false;
let dimDirty=true,stageDirty=true,cachedView=NaN,lastIntro=-Infinity;
const introCanvas=$('welcomeBackdrop'),introInk=introCanvas.getContext('2d');
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
const totalClues=chapterPool.length*2;
const reward=$('rewardVideo');
let artPan=0,artOverflow=0,hint=null,hintSequence=0,pendingDiscoveries=[];
const playerColors=['#f2d697','#78f0ce'];
const hands=[{x:.5,y:.5,active:false,source:'hand',id:0},{x:.5,y:.5,active:false,source:'hand',id:1}];
const controlStates=new Map();
function controlState(id){if(!controlStates.has(id))controlStates.set(id,{hover:-1,dwell:0,uiHover:'',uiTime:0,searchArmed:true,searchOrigin:null,menuArmed:true,menuOrigin:null});return controlStates.get(id);}
function controllers(){return pointer.source==='mouse'&&pointer.active?[{...pointer,id:'mouse'}]:hands.filter(h=>h.active);}
function clearDwells(armSearch=true){for(const h of [...hands,{...pointer,id:'mouse'}]){const state=controlState(h.id);state.hover=-1;state.dwell=0;state.uiHover='';state.uiTime=0;state.searchArmed=armSearch;state.searchOrigin=pointerClient(h);}dwell=0;hover=-1;uiHover='';uiTime=0;}

function positionPainting(){const r=$('paintingWrap').getBoundingClientRect(),w=parseFloat(canvas.style.width);canvas.style.left=(artOverflow?-artPan:(r.width-w)/2)+'px';}
function layout(){
 const r=$('paintingWrap').getBoundingClientRect(),h=Math.max(10,r.height-40),w=h*16/9,ratio=artOverflow?artPan/artOverflow:.5;
 artOverflow=Math.max(0,w-r.width);artPan=artOverflow*ratio;
 canvas.style.position='absolute';canvas.style.width=w+'px';canvas.style.height=h+'px';canvas.style.top=(r.height-h)/2+'px';positionPainting();
 const m=$('mainView');m.style.setProperty('--artLeft',Math.max(0,(r.width-w)/2)+'px');m.style.setProperty('--artTop',(r.height-h)/2+'px');m.style.setProperty('--artW',Math.min(w,r.width)+'px');m.style.setProperty('--artH',h+'px');
}
new ResizeObserver(layout).observe($('paintingWrap'));layout();
function cacheView(force=false){if(!artReady||(!force&&cachedView===viewX))return;atlas.draw(surface.getContext('2d'),viewX,0,VIEW,926,0,0,W,H);cachedView=viewX;dimDirty=true;stageDirty=true;$('viewMarker').style.left=(viewX/SCROLL_W*100)+'%';$('viewMarker').style.width=(VIEW/SCROLL_W*100)+'%';$('scrollPosition').value=viewX;}
function cacheDim(){if(!dimDirty)return;const d=dim.getContext('2d');d.save();d.filter='grayscale(1) brightness(.58) sepia(.28)';d.drawImage(surface,0,0);d.restore();dimDirty=false;}
const atlas=createScrollAtlas({onUpdate:()=>{artReady=atlas.ready;if(artReady){$('loadingArt').hidden=true;cacheView(true);if(journey.mode==='discovery')detail(chapters[journey.chapter].targets[journey.currentTarget]);}}});
function pointerClient(control=pointer){const r=$('mainView').getBoundingClientRect();return {x:r.left+control.x*r.width,y:r.top+control.y*r.height};}
function paintingPoint(control=pointer){const p=pointerClient(control),r=canvas.getBoundingClientRect();return {x:(p.x-r.left)/r.width,y:(p.y-r.top)/r.height,inside:p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom};}
function input(x,y,active=true,source='hand'){if(!inputRouter.accept(source,active,performance.now()))return false;pointer={x:Math.max(0,Math.min(1,Number(x)||0)),y:Math.max(0,Math.min(1,Number(y)||0)),active:!!active,source};lastInput=performance.now();$('mainView').dataset.inputSource=active?source:'none';$('status').textContent=source==='hand'?(active?'手掌控制':'手掌暫停'):source==='none'?'等待手掌':'滑鼠控制';return true;}
window.portalInput=(x,y,active=true,source='hand')=>{
 if(source==='hand')return handInput([{id:0,x,y,active}]);
 return input(x,y,active,source);
};
function handInput(points){
 const now=performance.now();
 for(const h of hands){const next=points.find(p=>p.id===h.id);Object.assign(h,next?{x:next.x,y:next.y,active:!!next.active,lastInput:now}:{active:false});}
 const lead=hands.find(h=>h.active);
 const accepted=input(lead?.x??.5,lead?.y??.5,!!lead,'hand');
 return accepted;
}
window.portalHands=handInput;
function updateCopy(){
 const c=chapters[journey.chapter],found=journey.found[journey.chapter];$('mainView').dataset.chapter=journey.chapter;
 $('chapterRail').innerHTML=chapters.map((c,i)=>`<li class="${i===journey.chapter?'current':i<journey.chapter?'done':''}" ${i===journey.chapter?'aria-current="step"':''}><b>${i<journey.chapter?'✓':i+1}</b>${c.name}</li>`).join('');
 audio.setChapter(journey.chapter);$('help').textContent=`第 ${journey.chapter+1} 關 · ${c.name} · 搵齊兩件`;
 $('taskTitle').textContent=c.targets.map((t,i)=>(found.includes(i)?'✓ ':'')+t.name).join(' · ');$('taskText').textContent='左右揮手展卷 · 停留兩秒尋寶';
 $('progress').textContent=journey.found.flat().length+' / '+totalClues;
 $('treasureList').innerHTML=c.targets.map((t,i)=>`<span class="treasure ${found.includes(i)?'done':''}" data-treasure="${i}"><b>${found.includes(i)?'✓':'？'}</b>${t.name}</span>`).join('');
 $('back').hidden=true;$('scrollPosition').hidden=true;$('exploreHint').hidden=true;
}
function haltFilm(){reward.pause();reward.removeAttribute('src');reward.load();reward.hidden=true;}
function reset(){hint=null;pendingDiscoveries=[];hintSequence=0;clearDwells();for(const h of hands){const s=controlState(h.id);s.menuOrigin=pointerClient(h);s.menuArmed=false;h.active=false;}chapters=nextRound();lensSparkles.clear();audio.setCelebrating(false);audio.stopNarration();haltFilm();input(.5,.5,false,'none');journey=createJourney(chapters);viewX=chapters[0].x;travel=null;celebration=null;recap=null;replayFinished=false;artPan=artOverflow/2;positionPainting();dwell=0;hover=-1;uiTime=0;uiHover='';$('notice').hidden=true;$('completionGesture').hidden=true;$('rewardMedia').hidden=false;$('travelBanner').hidden=true;$('skipReplay').hidden=true;$('mainView').classList.remove('is-exploring','is-celebrating');$('welcome').hidden=false;lastIntro=-Infinity;cacheView();updateCopy();fitWelcome();}
function detail(target){if(!target)return;const d=$('detailCanvas').getContext('2d'),cx=chapters[journey.chapter].x+target.x*VIEW,cy=target.y*926,cw=500,ch=234;atlas.draw(d,Math.max(0,Math.min(SCROLL_W-cw,cx-cw/2)),Math.max(0,Math.min(926-ch,cy-ch/2)),cw,ch,0,0,640,300);}
function showDiscovery(i){
 if(!discover(journey,chapters,i))return;hint=null;clearDwells(false);lensSparkles.clear();const c=chapters[journey.chapter],t=c.targets[i],n=journey.found[journey.chapter].length;
 $('notice').dataset.phase='discovery';$('notice').style.setProperty('--notice-scale','1');$('completionGesture').hidden=true;
 dwell=0;hover=-1;uiHover='';uiTime=0;updateCopy();detail(t);$('detailCanvas').hidden=false;
 $('discoveryKicker').textContent='發現畫中生活 · '+c.name;$('discoveryCount').textContent=n+' / '+c.targets.length;$('noticeTitle').textContent='搵到'+t.name+'！';$('noticeText').textContent=t.learn;
 $('continue').textContent=n<c.targets.length?'繼續尋找餘下 '+(c.targets.length-n)+' 件':journey.chapter<chapters.length-1?'兩件齊集，前往'+chapters[journey.chapter+1].name+' →':'十個線索齊集，點亮古城';
 $('rewardCaption').textContent=t.filmNote||'原畫細看 · 放大同一個物件';
 if(t.film){reward.src=t.film;reward.currentTime=0;reward.hidden=false;reward.play().catch(()=>{reward.hidden=true;$('rewardCaption').textContent='原畫細看 · 動畫未能播放';});}else haltFilm();
 $('notice').hidden=false;audio.effect('found');audio.narrate(t.id);
}
function finish(){
 audio.setCelebrating(false);journey.mode='complete';replayFinished=true;uiHover='';uiTime=0;dwell=0;input(.5,.5,false,'none');$('skipReplay').hidden=true;$('travelBanner').hidden=true;$('mainView').classList.remove('is-celebrating');$('discoveryKicker').textContent='尋寶清明上河圖 · 主線完成';$('discoveryCount').textContent=totalClues+' / '+totalClues;$('noticeTitle').textContent='十個線索，穿越一卷古城';$('noticeText').textContent=COMPLETION_TEXT;$('continue').textContent='再玩一次 · 返回說明';$('rewardMedia').hidden=true;$('completionGesture').hidden=false;$('notice').dataset.phase='complete';$('notice').hidden=false;$('notice').scrollTop=0;fitCompletion();audio.narrate('complete');
}
function next(){
 audio.stopNarration();haltFilm();$('notice').hidden=true;$('rewardMedia').hidden=false;
 if(journey.mode==='complete'){reset();return;}
 if(pendingDiscoveries.length){journey.mode='search';showDiscovery(pendingDiscoveries.shift());return;}
 clearDwells(false);
 const from=viewX,result=continueJourney(journey,chapters);dwell=0;hover=-1;uiTime=0;uiHover='';
 if(result==='transition'){audio.effect('transition');travel={from,to:chapters[journey.chapter].x,start:performance.now()};$('travelBanner').textContent='沿卷前進 · '+chapters[journey.chapter].name;$('travelBanner').hidden=false;updateCopy();}
 if(result==='complete')beginCelebration();
}
$('reset').onclick=reset;$('continue').onclick=next;
$('getHint').onclick=()=>{
 if(journey.mode!=='search'||!$('welcome').hidden||!$('cameraPanel').hidden||!artReady)return;
 const remaining=chapters[journey.chapter].targets.map((t,i)=>({t,i})).filter(o=>!journey.found[journey.chapter].includes(o.i));
 if(!remaining.length)return;
 const {t,i}=remaining[hintSequence++%remaining.length],art=canvas.getBoundingClientRect(),main=$('mainView').getBoundingClientRect(),button=$('getHint').getBoundingClientRect();
 hint={index:i,start:performance.now(),fromPan:artPan,toPan:Math.max(0,Math.min(artOverflow,t.x*art.width-main.width/2)),from:{x:(button.left+button.width/2-art.left)/art.width*W,y:(button.bottom-art.top)/art.height*H}};
 clearDwells();$('taskText').textContent='跟住金光，照住亮起嘅物件約兩秒';
};
$('skipReplay').onclick=finish;
function mouseInput(e){if(!$('welcome').hidden||!$('cameraPanel').hidden)return;const r=$('mainView').getBoundingClientRect();input((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height,true,'mouse');}
$('mainView').addEventListener('pointermove',mouseInput);$('mainView').addEventListener('pointerdown',mouseInput);
$('mainView').addEventListener('pointerleave',()=>input(.5,.5,false,'mouse'));
// Fit the entire introduction rather than clipping its text or scrolling it.
const introCard=$('welcomeCard');
function fitWelcome(){
 if($('welcome').hidden)return;
 const r=$('welcome').getBoundingClientRect(),w=introCard.offsetWidth,h=introCard.offsetHeight;
 if(!w||!h||!r.width||!r.height)return;
 const scale=Math.min(1,Math.max(1,r.width-24)/w,Math.max(1,r.height-24)/h);
 introCard.style.setProperty('--intro-scale',String(scale));
 $('welcome').dataset.layout=JSON.stringify({scale,width:w*scale,height:h*scale,availableWidth:r.width-24,availableHeight:r.height-24});
}
const introObserver=new ResizeObserver(fitWelcome);introObserver.observe(introCard);introObserver.observe($('welcome'));
document.fonts?.ready.then(fitWelcome);
function fitCompletion(){const n=$('notice'),r=$('mainView').getBoundingClientRect();if(n.hidden||n.dataset.phase!=='complete'||!n.offsetHeight)return;n.style.setProperty('--notice-scale',String(Math.min(1,(r.height-32)/n.offsetHeight,(r.width-32)/n.offsetWidth)));}
const noticeObserver=new ResizeObserver(fitCompletion);noticeObserver.observe($('notice'));noticeObserver.observe($('mainView'));
$('aboutPainting').onclick=()=>{audio.stopNarration();$('welcome').hidden=false;fitWelcome();};
window.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea'))return;if(e.key.toLowerCase()==='r')reset();});
function ring(x,y,p,r=32,color='#f2d697'){ctx.save();ctx.strokeStyle='#07110edd';ctx.lineWidth=10;ctx.beginPath();ctx.arc(x,y,r+7,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.arc(x,y,r+7,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,p));ctx.stroke();ctx.restore();}
// Dwell rings are the final painting layer, above both players' lenses and hints.
function drawDwellRings(){
 for(const control of controllers()){const state=controlState(control.id),p=paintingPoint(control);if(state.hover>=0&&state.dwell>0&&p.inside)ring(p.x*W,p.y*H,state.dwell/1.8,32,playerColors[control.id]||playerColors[0]);}
}
const spotlight=createSpotlight(W,H);
function lens(p,active=pointer.active,color='#efd58d77'){if(active&&p.inside)spotlight.draw(ctx,surface,p.x*W,p.y*H,color);}
function search(dt){
 cacheDim();
 const c=chapters[journey.chapter],found=journey.found[journey.chapter];ctx.drawImage(dim,0,0);
 for(const i of found){const t=c.targets[i];ctx.save();ctx.beginPath();ctx.arc(t.x*W,t.y*H,98,0,Math.PI*2);ctx.clip();ctx.drawImage(surface,0,0);ctx.restore();ctx.fillStyle='#e9d494';ctx.font='23px serif';ctx.fillText('✓',t.x*W-9,t.y*H+8);}
 const artRect=canvas.getBoundingClientRect(),mainRect=$('mainView').getBoundingClientRect(),hits=[];
 hover=-1;dwell=0;
 for(const control of controllers()){
  const p=paintingPoint(control),pc=pointerClient(control),state=controlState(control.id),color=playerColors[control.id]||playerColors[0];
  lens(p,true,color+'88');
  if(state.searchOrigin&&Math.hypot(pc.x-state.searchOrigin.x,pc.y-state.searchOrigin.y)>28)state.searchArmed=true;
  // A visible edge target must remain selectable even on a narrow display.
  const candidates=c.targets.map((t,i)=>({i,t,dist:Math.hypot((p.x-t.x)*W,(p.y-t.y)*H),screenX:artRect.left+t.x*artRect.width})).filter(o=>!found.includes(o.i)&&o.dist<o.t.r*W&&o.screenX>=mainRect.left+12&&o.screenX<=mainRect.right-12).sort((a,b)=>a.dist-b.dist);
  const hit=p.inside&&state.searchArmed&&$('welcome').hidden&&$('cameraPanel').hidden?candidates[0]?.i??-1:-1;
  if(hit!==state.hover){state.hover=hit;state.dwell=0;}else if(hit>=0){state.dwell+=dt;if(state.dwell>=1.8)hits.push(hit);}else state.dwell=0;
  if(state.dwell>dwell||hover<0&&hit>=0){hover=hit;dwell=state.dwell;}
 }
 if(hits.length){const unique=[...new Set(hits)];pendingDiscoveries=unique.slice(1);showDiscovery(unique[0]);return;}
 if(hover>=0){$('taskText').textContent='發現線索！照住停留約兩秒…';lastHint=performance.now();}
 else if(hint)$('taskText').textContent='跟住金光，照住亮起嘅物件約兩秒';
 else if(performance.now()-lastHint>1200)$('taskText').textContent='一人或二人揮手 · 停留兩秒尋寶';
}
function drawHint(now){
 if(!hint||journey.mode!=='search')return;
 const age=(now-hint.start)/1000,t=chapters[journey.chapter].targets[hint.index];
 if(age>=12){hint=null;return;}
 const progress=Math.min(1,age/1.25),ease=progress*progress*(3-2*progress),x=hint.from.x+(t.x*W-hint.from.x)*ease,y=hint.from.y+(t.y*H-hint.from.y)*ease-Math.sin(progress*Math.PI)*100;
 ctx.save();ctx.strokeStyle='#ffe5a0';ctx.fillStyle='#fff3bc';
 if(progress<1){
  for(let i=0;i<7;i++){const q=Math.max(0,progress-i*.025),e=q*q*(3-2*q),px=hint.from.x+(t.x*W-hint.from.x)*e,py=hint.from.y+(t.y*H-hint.from.y)*e-Math.sin(q*Math.PI)*100;ctx.globalAlpha=(1-i/7)*.8;ctx.beginPath();ctx.arc(px,py,5-i*.5,0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;ctx.drawImage(hintSprite,x-24,y-24,48,48);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();
 }else{
  lens({x:t.x,y:t.y,inside:true},true);ctx.globalAlpha=.8;ctx.lineWidth=2;
  const radius=45+6*Math.sin(age*4);ctx.beginPath();ctx.arc(t.x*W,t.y*H,radius,0,Math.PI*2);ctx.stroke();
  for(let i=0;i<6;i++){const a=age*.6+i*Math.PI/3,px=t.x*W+Math.cos(a)*radius,py=t.y*H+Math.sin(a)*radius;ctx.beginPath();ctx.arc(px,py,2.5,0,Math.PI*2);ctx.fill();}
 }
 ctx.restore();
}
function uiDwell(dt){
 const headerIds=['getHint','fullscreen','aboutPainting','reset'];
 const ids=!$('welcome').hidden?['welcomeCamera']:journey.mode==='discovery'||journey.mode==='complete'?['continue','replayNarration',...headerIds]:[...headerIds,'back','skipReplay'];
 for(const id of ids)$(id).style.background='';
 uiHover='';uiTime=0;
 for(const control of controllers()){
  const state=controlState(control.id),pc=pointerClient(control);let hit='';
  if(control.source!=='hand'||!$('cameraPanel').hidden){state.uiHover='';state.uiTime=0;continue;}
  if(!$('welcome').hidden&&!state.menuArmed){if(state.menuOrigin&&Math.hypot(pc.x-state.menuOrigin.x,pc.y-state.menuOrigin.y)>28)state.menuArmed=true;else continue;}
  for(const id of ids){const b=$(id),r=b.getBoundingClientRect();if(!b.disabled&&!b.hidden&&r.width>0&&r.height>0&&pc.x>=r.left&&pc.x<=r.right&&pc.y>=r.top&&pc.y<=r.bottom)hit=id;}
  if(state.uiLatched&&hit!==state.uiLatched)state.uiLatched='';
  if(hit&&state.uiLatched===hit){state.uiHover='';state.uiTime=0;continue;}
  if(hit!==state.uiHover){state.uiHover=hit;state.uiTime=0;}else if(hit)state.uiTime+=dt;
  if(hit&&state.uiTime>=uiTime){uiHover=hit;uiTime=state.uiTime;$(hit).style.background=`linear-gradient(90deg,#8a794b ${Math.min(100,uiTime/1.25*100)}%,#273224 0)`;}
  if(hit&&state.uiTime>=1.25){for(const h of controllers())controlState(h.id).uiLatched=hit;clearDwells();$(hit).click();break;}
 }
}
const reveal=createReveal(W,H),tourGlow=createTourGlow(W,H),lensSparkles=createLensSparkles();
function beginCelebration(){audio.setCelebrating(true);audio.stopNarration();audio.effect('victory');cacheDim();artPan=artOverflow/2;positionPainting();journey.mode='burn';celebration={start:performance.now()};$('notice').hidden=true;$('skipReplay').hidden=false;$('mainView').classList.add('is-celebrating');$('travelBanner').hidden=false;$('travelBanner').textContent='十個線索齊集 · 讓古城甦醒';$('help').textContent='通關時刻';$('taskTitle').textContent='灰幕化成光，古城現真色';$('taskText').textContent='';dwell=0;uiTime=0;uiHover='';}
function drawBurn(now){
 const elapsed=(now-celebration.start)/1000;reveal.draw(ctx,surface,dim,elapsed);
 if(elapsed>=REVEAL_SECONDS){celebration=null;journey.mode='recap';recap={elapsed:0,index:-1};$('help').textContent='全彩回望 · 由城內到城外';$('travelBanner').textContent='回望古城 · 由內到外';}
}
function drawRecap(dt){
 if(!document.hidden)recap.elapsed+=dt;
 const frame=recapFrame(chapters,recap.elapsed);viewX=frame.x;cacheView();ctx.drawImage(surface,0,0);tourGlow.draw(ctx,recap.elapsed);
 if(frame.done){recap=null;finish();return;}
 if(recap.index!==frame.index){recap.index=frame.index;$('taskTitle').textContent=chapters[frame.index].name;$('taskText').textContent='';$('travelBanner').textContent='慢慢回望 · '+chapters[frame.index].name;}
}
const vignetteLayer=document.createElement('canvas');vignetteLayer.width=W;vignetteLayer.height=H;
{const v=vignetteLayer.getContext('2d');for(const [x0,y0,x1,y1,rx,ry,rw,rh]of [[0,0,120,0,0,0,120,H],[W,0,W-120,0,W-120,0,120,H],[0,0,0,65,0,0,W,65],[0,H,0,H-85,0,H-85,W,85]]){const g=v.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,'#070d09');g.addColorStop(.3,'#070d09d9');g.addColorStop(1,'#070d0900');v.fillStyle=g;v.fillRect(rx,ry,rw,rh);}}
function vignette(){ctx.drawImage(vignetteLayer,0,0);}
function drawWelcome(now){if(document.hidden||now-lastIntro<50)return;lastIntro=now;const phase=reducedMotion?0:(now/120000)%2,x=(SCROLL_W-VIEW)*(phase<=1?phase:2-phase);atlas.drawPreview(introInk,x,0,VIEW,926,0,0,introCanvas.width,introCanvas.height);}
document.addEventListener('visibilitychange',()=>frameClock.reset(performance.now()));
function draw(now){
 requestAnimationFrame(draw);const timing=frameClock.step(now,document.hidden);if(!timing)return;const {dt,animationDt}=timing;if(pointer.source==='hand'&&now-lastInput>(window.portalHandTimeout||450))pointer.active=false;for(const h of hands)if(now-(h.lastInput??0)>(window.portalHandTimeout||450))h.active=false;
 const activeIds=new Set(controllers().map(h=>h.id));for(const [id,s]of controlStates)if(!activeIds.has(id)){s.hover=-1;s.dwell=0;s.uiHover='';s.uiTime=0;s.uiLatched='';}
 $('getHint').disabled=journey.mode!=='search'||!$('welcome').hidden||!$('cameraPanel').hidden||!artReady;
 if(hint&&journey.mode==='search'){const t=Math.min(1,(now-hint.start)/750),e=t*t*(3-2*t);artPan=hint.fromPan+(hint.toPan-hint.fromPan)*e;positionPainting();}
 else if(artOverflow&&journey.mode==='search'&&hover<0&&$('welcome').hidden&&$('cameraPanel').hidden){
  const speeds=controllers().map(p=>p.x<.16?-650*(1-p.x/.16):p.x>.84?650*(p.x-.84)/.16:0),speed=speeds.reduce((a,b)=>a+b,0)/Math.max(1,speeds.filter(s=>s!==0).length);
  if(speed){artPan=Math.max(0,Math.min(artOverflow,artPan+speed*dt));positionPainting();}
 }
 const p=paintingPoint();
 if(artReady){
  if(!$('welcome').hidden){drawWelcome(now);if(stageDirty){cacheDim();ctx.drawImage(dim,0,0);vignette();stageDirty=false;}}
  else if(journey.mode==='burn')drawBurn(now);
  else if(journey.mode==='recap')drawRecap(animationDt);
  else if(journey.mode==='transition'&&travel){const t=Math.min(1,(now-travel.start)/3200),ease=t*t*(3-2*t);viewX=travel.from+(travel.to-travel.from)*ease;cacheView();ctx.drawImage(surface,0,0);if(t===1){travel=null;journey.mode='search';$('travelBanner').hidden=true;dwell=0;clearDwells(false);}}
  else if(journey.mode==='search')search(dt);
  else{ctx.drawImage(surface,0,0);ctx.fillStyle='#0005';ctx.fillRect(0,0,W,H);}
  if($('welcome').hidden){if(journey.mode==='search')lensSparkles.draw(ctx,pointer.active&&p.inside?{x:p.x*W,y:p.y*H}:null,now/1000);vignette();drawHint(now);if(journey.mode==='search')drawDwellRings();}
 }
 uiDwell(dt);const main=$('mainView').getBoundingClientRect(),active=controllers();
 for(let i=0;i<2;i++){const control=active[i],cursor=$(i?'handCursor2':'handCursor');cursor.hidden=!control;if(control){const pc=pointerClient(control);cursor.style.transform=`translate3d(${pc.x-main.left}px,${pc.y-main.top}px,0) translate(-50%,-50%)`;cursor.dataset.player=String(control.id==='mouse'?1:control.id+1);cursor.style.setProperty('--player-color',playerColors[control.id]||playerColors[0]);}}
 const percent=Math.round(Math.min(1,uiHover?uiTime/1.25:dwell/1.8)*100);$('dwellPercent').textContent=percent+'%';$('dwellFill').style.width=percent+'%';
 frames++;if(frames%12===0)canvas.dataset.state=JSON.stringify(getState());
}
function getState(){return {players:controllers().map(h=>({id:h.id,x:h.x,y:h.y,active:h.active,dwell:controlState(h.id).dwell})),hint:hint?{index:hint.index,age:(performance.now()-hint.start)/1000}:null,pendingDiscoveries:[...pendingDiscoveries],mode:journey.mode,chapter:journey.chapter,chapterName:chapters[journey.chapter].name,found:journey.found.map(a=>[...a]),total:journey.found.flat().length,totalClues,replayFinished,replaySeconds:recapDuration(chapters),uiHover,uiTime,welcome:!$('welcome').hidden,hover,dwell,pointer:{...pointer},viewX,artPan,artOverflow,artReady,frames,targets:chapters[journey.chapter].targets.map(t=>({id:t.id,x:t.x,y:t.y,r:t.r})),reward:{ready:reward.readyState,error:reward.error?.message||null,src:reward.getAttribute('src')}};}
window.portalGame={getState,reset};reset();requestAnimationFrame(draw);
