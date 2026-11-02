import {createJourney,discover,continueJourney,COMPLETION_TEXT} from './journey-state.mjs';
import {recapFrame,recapDuration} from './recap.mjs';
import {createScrollAtlas} from './scroll-atlas.mjs';
import {createReveal,createTourGlow,createLensSparkles,REVEAL_SECONDS} from './reveal.mjs';
import {createGameAudio} from './game-audio.mjs';
import {createInputRouter} from './input-router.mjs';
import {createRoundPicker} from './round-selection.mjs';
const audio=createGameAudio();
const inputRouter=createInputRouter();
const W=1280,H=720,VIEW=1646,SCROLL_W=30000,$=id=>document.getElementById(id),chapterPool=window.PORTAL_CHAPTERS;
let roundStorage;try{roundStorage=window.localStorage;}catch{}
const nextRound=createRoundPicker(chapterPool,{storage:roundStorage});
let chapters=chapterPool;
const canvas=$('stage'),ctx=canvas.getContext('2d'),surface=document.createElement('canvas'),dim=document.createElement('canvas'),scratch=document.createElement('canvas');
for(const c of [surface,dim,scratch]){c.width=W;c.height=H;}
let journey=createJourney(chapters),pointer={x:.5,y:.5,active:false,source:'mouse'},viewX=chapters[0].x,last=performance.now(),lastInput=0,dwell=0,hover=-1,uiHover='',uiTime=0,frames=0,travel=null,searchArmed=true,searchOrigin=null,lastHint=0,artReady=false,celebration=null,recap=null,replayFinished=false;
let dimDirty=true,stageDirty=true,cachedView=NaN,lastIntro=-Infinity,menuArmed=false,menuOrigin=null;
const introCanvas=$('welcomeBackdrop'),introInk=introCanvas.getContext('2d');
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
const totalClues=chapterPool.length*2;
const reward=$('rewardVideo');
let artPan=0,artOverflow=0;
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
function pointerClient(){const r=$('mainView').getBoundingClientRect();return {x:r.left+pointer.x*r.width,y:r.top+pointer.y*r.height};}
function paintingPoint(){const p=pointerClient(),r=canvas.getBoundingClientRect();return {x:(p.x-r.left)/r.width,y:(p.y-r.top)/r.height,inside:p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom};}
function input(x,y,active=true,source='hand'){if(!inputRouter.accept(source,active,performance.now()))return false;pointer={x:Math.max(0,Math.min(1,Number(x)||0)),y:Math.max(0,Math.min(1,Number(y)||0)),active:!!active,source};lastInput=performance.now();$('mainView').dataset.inputSource=active?source:'none';$('status').textContent=source==='hand'?(active?'手掌控制':'手掌暫停'):source==='none'?'等待手掌':'滑鼠控制';return true;}
window.portalInput=input;
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
function reset(){chapters=nextRound();lensSparkles.clear();audio.setCelebrating(false);audio.stopNarration();haltFilm();menuOrigin=pointerClient();menuArmed=false;input(.5,.5,false,'none');journey=createJourney(chapters);viewX=chapters[0].x;travel=null;celebration=null;recap=null;replayFinished=false;artPan=artOverflow/2;positionPainting();dwell=0;hover=-1;uiTime=0;uiHover='';searchArmed=true;$('notice').hidden=true;$('completionGesture').hidden=true;$('rewardMedia').hidden=false;$('travelBanner').hidden=true;$('skipReplay').hidden=true;$('mainView').classList.remove('is-exploring','is-celebrating');$('welcome').hidden=false;lastIntro=-Infinity;cacheView();updateCopy();fitWelcome();}
function detail(target){if(!target)return;const d=$('detailCanvas').getContext('2d'),cx=chapters[journey.chapter].x+target.x*VIEW,cy=target.y*926,cw=500,ch=234;atlas.draw(d,Math.max(0,Math.min(SCROLL_W-cw,cx-cw/2)),Math.max(0,Math.min(926-ch,cy-ch/2)),cw,ch,0,0,640,300);}
function showDiscovery(i){
 if(!discover(journey,chapters,i))return;lensSparkles.clear();const c=chapters[journey.chapter],t=c.targets[i],n=journey.found[journey.chapter].length;
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
 const from=viewX,result=continueJourney(journey,chapters);dwell=0;hover=-1;uiTime=0;uiHover='';searchOrigin=pointerClient();searchArmed=false;
 if(result==='transition'){audio.effect('transition');travel={from,to:chapters[journey.chapter].x,start:performance.now()};$('travelBanner').textContent='沿卷前進 · '+chapters[journey.chapter].name;$('travelBanner').hidden=false;updateCopy();}
 if(result==='complete')beginCelebration();
}
$('reset').onclick=reset;$('continue').onclick=next;
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
function ring(x,y,p,r=32){ctx.save();ctx.strokeStyle='#f2d697';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.lineWidth=6;ctx.beginPath();ctx.arc(x,y,r+7,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,p));ctx.stroke();ctx.restore();}
function lens(p){if(!pointer.active||!p.inside)return;const x=p.x*W,y=p.y*H,r=116,fx=scratch.getContext('2d');fx.clearRect(0,0,W,H);fx.drawImage(surface,0,0);fx.globalCompositeOperation='destination-in';const g=fx.createRadialGradient(x,y,r*.6,x,y,r*1.35);g.addColorStop(0,'#fff');g.addColorStop(1,'#fff0');fx.fillStyle=g;fx.fillRect(0,0,W,H);fx.globalCompositeOperation='source-over';ctx.drawImage(scratch,0,0);ctx.strokeStyle='#efd58d77';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}
function search(dt,p){
 cacheDim();
 const c=chapters[journey.chapter],found=journey.found[journey.chapter];ctx.drawImage(dim,0,0);
 for(const i of found){const t=c.targets[i];ctx.save();ctx.beginPath();ctx.arc(t.x*W,t.y*H,98,0,Math.PI*2);ctx.clip();ctx.drawImage(surface,0,0);ctx.restore();ctx.fillStyle='#e9d494';ctx.font='23px serif';ctx.fillText('✓',t.x*W-9,t.y*H+8);}
 lens(p);const pc=pointerClient();if(searchOrigin&&Math.hypot(pc.x-searchOrigin.x,pc.y-searchOrigin.y)>28)searchArmed=true;
 const artRect=canvas.getBoundingClientRect(),mainRect=$('mainView').getBoundingClientRect(),margin=Math.min(90,mainRect.width*.16);
 const candidates=c.targets.map((t,i)=>({i,t,dist:Math.hypot((p.x-t.x)*W,(p.y-t.y)*H),screenX:artRect.left+t.x*artRect.width})).filter(o=>!found.includes(o.i)&&o.dist<o.t.r*W&&o.screenX>=mainRect.left+margin&&o.screenX<=mainRect.right-margin).sort((a,b)=>a.dist-b.dist);
 const hit=pointer.active&&p.inside&&searchArmed&&$('welcome').hidden&&$('cameraPanel').hidden?candidates[0]?.i??-1:-1;
 if(hit!==hover){hover=hit;dwell=0;}else if(hit>=0){dwell+=dt;ring(p.x*W,p.y*H,dwell/1.8);if(dwell>=1.8)showDiscovery(hit);}else dwell=0;
 if(hit>=0&&journey.mode==='search'){const t=c.targets[hit];$('taskText').textContent='發現線索！照住停留約兩秒…';lastHint=performance.now();}
 else if(performance.now()-lastHint>1200&&journey.mode==='search')$('taskText').textContent='左右揮手展卷 · 停留兩秒尋寶';
}
function uiDwell(dt){
 let hit='';const pc=pointerClient();if(pointer.source!=='hand'||!$('cameraPanel').hidden){uiHover='';uiTime=0;return;}
 if(!$('welcome').hidden&&!menuArmed){if(pointer.active&&menuOrigin&&Math.hypot(pc.x-menuOrigin.x,pc.y-menuOrigin.y)>28)menuArmed=true;else{uiHover='';uiTime=0;return;}}
 const ids=!$('welcome').hidden?['welcomeCamera']:journey.mode==='discovery'||journey.mode==='complete'?['continue','replayNarration']:['reset','aboutPainting','back','skipReplay'];
 for(const id of ids){const b=$(id),r=b.getBoundingClientRect(),visible=!b.disabled&&r.width>0&&r.height>0;if(pointer.active&&visible&&pc.x>=r.left&&pc.x<=r.right&&pc.y>=r.top&&pc.y<=r.bottom)hit=id;else b.style.background='';}
 if(hit!==uiHover){uiHover=hit;uiTime=0;}else if(hit){uiTime+=dt;$(hit).style.background=`linear-gradient(90deg,#8a794b ${Math.min(100,uiTime/1.25*100)}%,#273224 0)`;if(uiTime>=1.25){uiTime=0;uiHover='';$(hit).click();}}
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
document.addEventListener('visibilitychange',()=>{last=performance.now();});
function draw(now){
 const rawDt=Math.max(0,(now-last)/1000),dt=Math.min(.06,rawDt),animationDt=Math.min(.25,rawDt);last=now;if(pointer.source==='hand'&&now-lastInput>450)pointer.active=false;
 if(artOverflow&&journey.mode==='search'&&pointer.active&&hover<0&&$('welcome').hidden&&$('cameraPanel').hidden){const speed=pointer.x<.16?-650*(1-pointer.x/.16):pointer.x>.84?650*(pointer.x-.84)/.16:0;if(speed){artPan=Math.max(0,Math.min(artOverflow,artPan+speed*dt));positionPainting();}}
 const p=paintingPoint();
 if(artReady){
  if(!$('welcome').hidden){drawWelcome(now);if(stageDirty){cacheDim();ctx.drawImage(dim,0,0);vignette();stageDirty=false;}}
  else if(journey.mode==='burn')drawBurn(now);
  else if(journey.mode==='recap')drawRecap(animationDt);
  else if(journey.mode==='transition'&&travel){const t=Math.min(1,(now-travel.start)/3200),ease=t*t*(3-2*t);viewX=travel.from+(travel.to-travel.from)*ease;cacheView();ctx.drawImage(surface,0,0);if(t===1){travel=null;journey.mode='search';$('travelBanner').hidden=true;dwell=0;searchOrigin=pointerClient();searchArmed=false;}}
  else if(journey.mode==='search')search(dt,p);
  else{ctx.drawImage(surface,0,0);ctx.fillStyle='#0005';ctx.fillRect(0,0,W,H);}
  if($('welcome').hidden){if(journey.mode==='search')lensSparkles.draw(ctx,pointer.active&&p.inside?{x:p.x*W,y:p.y*H}:null,now/1000);vignette();}
 }
 uiDwell(dt);const pc=pointerClient(),main=$('mainView').getBoundingClientRect();$('handCursor').hidden=!pointer.active;$('handCursor').style.transform=`translate3d(${pc.x-main.left}px,${pc.y-main.top}px,0) translate(-50%,-50%)`;
 const percent=Math.round(Math.min(1,uiHover?uiTime/1.25:dwell/1.8)*100);$('dwellPercent').textContent=percent+'%';$('dwellFill').style.width=percent+'%';
 frames++;if(frames%12===0)canvas.dataset.state=JSON.stringify(getState());requestAnimationFrame(draw);
}
function getState(){return {mode:journey.mode,chapter:journey.chapter,chapterName:chapters[journey.chapter].name,found:journey.found.map(a=>[...a]),total:journey.found.flat().length,totalClues,replayFinished,replaySeconds:recapDuration(chapters),uiHover,uiTime,welcome:!$('welcome').hidden,hover,dwell,pointer:{...pointer},viewX,artPan,artOverflow,artReady,frames,targets:chapters[journey.chapter].targets.map(t=>({id:t.id,x:t.x,y:t.y,r:t.r})),reward:{ready:reward.readyState,error:reward.error?.message||null,src:reward.getAttribute('src')}};}
window.portalGame={getState,reset};reset();requestAnimationFrame(draw);
