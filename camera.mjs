import {palmControl,smoothPoint} from './hand-math.mjs';
const $=id=>document.getElementById(id);
const video=$('cameraVideo'),overlay=$('handOverlay'),ink=overlay.getContext('2d');
const reality=$('liveCameraCanvas'),liveInk=reality.getContext('2d'),positionCanvas=$('palmMap'),mapInk=positionCanvas.getContext('2d');
let lastPreview=0,previewFrames=0,trail=[];
new ResizeObserver(()=>{const r=positionCanvas.getBoundingClientRect();if(!r.width||!r.height)return;const w=Math.round(r.width*2),h=Math.round(r.height*2);if(positionCanvas.width!==w||positionCanvas.height!==h){positionCanvas.width=w;positionCanvas.height=h;trail=[];}}).observe(positionCanvas);
const connections=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
let stream,worker,busy=false,frameId=0,lastFrame=0,lastVideoTime=-1,position=null,lastResult=0,generation=0;
let mode='mouse',ready=false,mirror=true,reach=.15,starting=false,cancelModel=null,lastMotion=0;
const diagnostics={state:'idle',frames:0,hands:0,ms:0,error:null};
function status(text,state) {
  $('cameraStatus').textContent=text;diagnostics.state=state;
  $('cameraPill').textContent=text;$('cameraPill').dataset.state=state;
  $('pipelineMessage').textContent=text;
  $('welcomeHandStatus').textContent=text;
  $('cameraPanel').dataset.diagnostics=JSON.stringify(diagnostics);
}
function deactivate(){window.portalInput(.5,.5,false,'hand');position=null;}
function telemetry(point,active=false){
  const mouseOwns=$('mainView').dataset.inputSource==='mouse';
  $('aiLive').dataset.active=String(active);$('aiGesture').textContent=point?(point.open?'張開手掌':'合起手掌'):'等待手掌';
  $('landmarkCount').textContent=point?'已找到 21 個關鍵點':'未偵測到手掌';
  $('controlCommand').textContent=mouseOwns?'滑鼠控制光圈':active?'光圈移動中':'光圈暫停';
  if(point){for(const [key,value]of [['X',point.x],['Y',point.y]]){$('position'+key).value=value;$('position'+key+'Text').textContent=Math.round(value*100)+'%';}}
  else{$('positionXText').textContent='—';$('positionYText').textContent='—';$('positionX').value=0;$('positionY').value=0;}
  if(!active){$('directionArrow').textContent='○';$('directionText').textContent=point?(point.open?'設定中':'合起暫停'):'等待手掌';}
  if(mouseOwns){$('directionArrow').textContent='↖';$('directionText').textContent='滑鼠接手';}
  drawPosition(point,active);
}
function drawPosition(point,active){
  const w=positionCanvas.width,h=positionCanvas.height;mapInk.fillStyle='#101e18';mapInk.fillRect(0,0,w,h);mapInk.strokeStyle='#53674744';mapInk.lineWidth=.65;
  for(let i=1;i<4;i++){mapInk.beginPath();mapInk.moveTo(i*w/4,0);mapInk.lineTo(i*w/4,h);mapInk.moveTo(0,i*h/4);mapInk.lineTo(w,i*h/4);mapInk.stroke();}
  mapInk.fillStyle='#859c75';mapInk.font='17px sans-serif';mapInk.fillText('左',8,24);mapInk.fillText('右',w-26,24);
  if(!point){trail=[];return;}
  if(active){trail.push({x:point.x,y:point.y});if(trail.length>28)trail.shift();}
  if(trail.length>1){
    const first=trail[0],last=trail.at(-1),fade=mapInk.createLinearGradient(first.x*w,first.y*h,last.x*w,last.y*h);
    fade.addColorStop(0,'#a3c5820a');fade.addColorStop(1,'#d8dda884');
    mapInk.strokeStyle=fade;mapInk.lineWidth=1.15;mapInk.lineCap='round';mapInk.lineJoin='round';mapInk.beginPath();mapInk.moveTo(first.x*w,first.y*h);
    for(let i=1;i<trail.length-1;i++){const a=trail[i],b=trail[i+1];mapInk.quadraticCurveTo(a.x*w,a.y*h,(a.x+b.x)*w/2,(a.y+b.y)*h/2);}
    mapInk.lineTo(last.x*w,last.y*h);mapInk.stroke();
  }
  const x=point.x*w,y=point.y*h;mapInk.strokeStyle=active?'#eddf9b':'#9d9e78';mapInk.lineWidth=1.1;mapInk.beginPath();mapInk.arc(x,y,11,0,Math.PI*2);mapInk.stroke();mapInk.fillStyle=mapInk.strokeStyle;mapInk.beginPath();mapInk.arc(x,y,3.5,0,Math.PI*2);mapInk.fill();
}
function drawReality(now){
  if(now-lastPreview<33||video.readyState<2||document.hidden)return;lastPreview=now;
  const w=reality.width,h=reality.height,scale=Math.min(w/video.videoWidth,h/video.videoHeight),dw=video.videoWidth*scale,dh=video.videoHeight*scale;
  liveInk.fillStyle='#0e1711';liveInk.fillRect(0,0,w,h);liveInk.save();if(mirror){liveInk.translate(w,0);liveInk.scale(-1,1);}liveInk.drawImage(video,(w-dw)/2,(h-dh)/2,dw,dh);liveInk.restore();
  previewFrames++;$('liveFrameLabel').textContent='即時影像 · '+previewFrames+' 幀';reality.dataset.frames=previewFrames;
}
function direction(next,previous){
  const dx=previous?next.x-previous.x:0,dy=previous?next.y-previous.y:0;
  if(Math.hypot(dx,dy)>.008){const i=(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8;$('directionArrow').textContent=['→','↘','↓','↙','←','↖','↑','↗'][i];$('directionText').textContent=['向右','向右下','向下','向左下','向左','向左上','向上','向右上'][i];lastMotion=performance.now();}
  else if(performance.now()-lastMotion>450){$('directionArrow').textContent='◎';$('directionText').textContent='停留選取';}
}
function drawHand(points) {
  ink.clearRect(0,0,overlay.width,overlay.height);
  overlay.dataset.landmarks=points?.length||0;
  if(!points)return;
  const scale=Math.min(overlay.width/(video.videoWidth||640),overlay.height/(video.videoHeight||480)),dw=(video.videoWidth||640)*scale,dh=(video.videoHeight||480)*scale;
  const xy=p=>[(overlay.width-dw)/2+(mirror?1-p.x:p.x)*dw,(overlay.height-dh)/2+p.y*dh];
  ink.save();ink.shadowColor='#07110ed0';ink.shadowBlur=3;ink.strokeStyle='#00e676';ink.lineWidth=2.7;ink.lineCap='round';ink.lineJoin='round';
  for(const chain of connections){ink.beginPath();chain.forEach((i,j)=>ink[j?'lineTo':'moveTo'](...xy(points[i])));ink.stroke();}
  ink.fillStyle='#39ff6a';for(const p of points){ink.beginPath();ink.arc(...xy(p),3.6,0,Math.PI*2);ink.fill();}
  const palm=[0,5,9,13,17].reduce((p,i)=>({x:p.x+points[i].x/5,y:p.y+points[i].y/5}),{x:0,y:0});
  ink.strokeStyle='#6cff99';ink.lineWidth=2.5;ink.beginPath();ink.arc(...xy(palm),14,0,Math.PI*2);ink.stroke();ink.restore();
}
function result(data) {
  busy=false;diagnostics.frames++;diagnostics.ms=Math.round(data.ms);diagnostics.hands=data.landmarks?1:0;
  const now=performance.now(),point=palmControl(data.landmarks,mirror,reach);
  drawHand(data.landmarks);
  if(mode!=='hand')return;
  if(!point){deactivate();telemetry(null);status('舉起手掌，放入鏡頭畫面','searching');return;}
  if(!point.open){deactivate();telemetry(point);status('手掌合起：暫停 · 張開繼續','paused');return;}
  const previous=position;position=smoothPoint(position,point,lastResult?(now-lastResult)/1000:.1);lastResult=now;
  const canControl=$('cameraPanel').hidden;
  const accepted=window.portalInput(position.x,position.y,canControl,'hand');
  telemetry({...point,...position},canControl&&accepted);if(canControl&&accepted)direction(position,previous);
  if(canControl&&!accepted){$('directionArrow').textContent='↖';$('directionText').textContent='滑鼠接手';$('controlCommand').textContent='滑鼠控制光圈';}
  status(canControl?(accepted?'手掌追蹤中 · 滑鼠亦可隨時接手':'滑鼠優先 · 停低約三秒恢復手勢'):'設定中 · 關閉設定繼續遊戲','tracking');
}
function model() {
  return new Promise((resolve,reject)=>{
    worker=new Worker(new URL('./hand-worker.mjs',import.meta.url),{type:'module'});
    const timer=setTimeout(()=>reject(new Error('追蹤模型載入逾時，請重新試一次。')),45000);
    cancelModel=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
    worker.onmessage=({data})=>{
      if(data.type==='ready'){clearTimeout(timer);cancelModel=null;ready=true;resolve();}
      if(data.type==='result')result(data);
      if(data.type==='error'){clearTimeout(timer);reject(new Error(data.message));if(ready)fail(new Error(data.message));}
    };
    worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message||'追蹤模型未能啟動'));if(ready)fail(new Error('追蹤模型停止，請重新啟動鏡頭。'));};
    worker.postMessage({type:'init'});
  });
}
async function pump(now) {
  frameId=requestAnimationFrame(pump);
  if(mode==='hand')drawReality(now);
  if(mode!=='hand'||!ready||busy||document.hidden||video.readyState<2||now-lastFrame<65||video.currentTime===lastVideoTime)return;
  busy=true;lastFrame=now;lastVideoTime=video.currentTime;
  const current=generation;
  try {
    const bitmap=await createImageBitmap(video,{resizeWidth:640,resizeQuality:'low'});
    if(current!==generation||!worker){bitmap.close();busy=false;return;}
    worker.postMessage({type:'frame',bitmap,timestamp:now},[bitmap]);
  } catch(error){busy=false;fail(error);}
}
function stop() {
  generation++;starting=false;cancelModel?.();cancelModel=null;cancelAnimationFrame(frameId);worker?.terminate();worker=null;ready=false;busy=false;
  stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;drawHand(null);deactivate();telemetry(null);
  liveInk.clearRect(0,0,reality.width,reality.height);$('liveFrameLabel').textContent='鏡頭未啟動';previewFrames=0;
  $('liveTag').textContent='OFF';
  $('cameraStart').disabled=false;$('cameraStart').textContent='啟動鏡頭';$('cameraStop').hidden=true;
  $('cameraPlaceholder').hidden=false;$('cameraPicker').hidden=true;mode='mouse';window.portalControlMode='mouse';
  $('welcomeCamera').disabled=false;$('welcomeCamera').textContent='開啟鏡頭，揮手入畫';
}
function fail(error) {
  stop();diagnostics.error=error.message;
  const messages={NotAllowedError:'未獲鏡頭許可。請按網址旁嘅鏡頭圖示允許，再重新啟動。',NotFoundError:'搵唔到鏡頭，請接駁 USB 鏡頭後重試。',NotReadableError:'鏡頭可能被其他程式使用，請關閉其他視像程式後重試。',OverconstrainedError:'此鏡頭未能使用目前設定，請揀另一個鏡頭。',SecurityError:'瀏覽器未能使用鏡頭，請用 Chrome 或 Edge 開本機網址。'};
  status(messages[error.name]||('鏡頭未能啟動：'+error.message),'error');
}
async function start(deviceId) {
  if(starting)return;stop();starting=true;const token=generation;mode='loading';window.portalControlMode='loading';
  $('cameraStart').disabled=true;$('cameraStart').textContent='正在啟動…';status('正在啟動鏡頭及手掌追蹤…','loading');diagnostics.error=null;
  $('welcomeCamera').disabled=true;$('welcomeCamera').textContent='正在啟動鏡頭…';
  try {
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('鏡頭需要 HTTPS 或本機網址，請用新版 Chrome／Edge 開啟遊戲。');
    const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30},...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:'user'})}});
    if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;
    video.srcObject=stream;await video.play();
    $('liveTag').textContent='LIVE';
    if(token!==generation)return;
    await model();
    if(token!==generation)return;
    mode='hand';window.portalControlMode='hand';lastVideoTime=-1;lastResult=0;
    $('welcomeCamera').disabled=false;$('welcomeCamera').textContent='揮手入畫 · 停留開始';
    $('cameraStart').disabled=false;$('cameraStart').textContent='重新啟動';$('cameraStop').hidden=false;$('cameraPlaceholder').hidden=true;$('cameraPanel').hidden=true;
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    $('cameraSelect').replaceChildren(...devices.map((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||`鏡頭 ${i+1}`;return o;}));
    $('cameraSelect').value=stream.getVideoTracks()[0].getSettings().deviceId||'';$('cameraPicker').hidden=devices.length<2;
    const track=stream.getVideoTracks()[0];track.onended=()=>{if(mode==='hand')fail(new Error('鏡頭已中斷，請重新啟動。'));};
    status('鏡頭已就緒，請舉起張開嘅手掌','searching');frameId=requestAnimationFrame(pump);
  } catch(error){if(token===generation&&error.name!=='AbortError')fail(error);} finally {if(token===generation)starting=false;}
}
$('cameraStart').onclick=()=>start();
$('cameraStop').onclick=()=>{stop();status('已關閉鏡頭 · 可用滑鼠試玩','idle');};
$('mouseMode').onclick=()=>{$('welcome').hidden=true;$('cameraPanel').hidden=true;status('滑鼠同手勢都可操作，移動滑鼠即可接手',mode==='hand'?'tracking':'idle');};
$('welcomeCamera').onclick=()=>{if(mode==='hand'){$('welcome').hidden=true;$('cameraPanel').hidden=true;return;}start();};
$('quickCamera').onclick=()=>{$('cameraPanel').hidden=false;start();};
$('cameraClose').onclick=()=>{$('cameraPanel').hidden=true;};
$('cameraSelect').onchange=e=>start(e.target.value);
$('mirror').onchange=e=>{mirror=e.target.checked;video.style.transform=mirror?'scaleX(-1)':'none';position=null;};
$('reach').oninput=e=>{reach=Number(e.target.value);position=null;};
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='c'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.target.matches('input,select,textarea'))$('cameraPanel').hidden=!$('cameraPanel').hidden;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)deactivate();});
window.addEventListener('pagehide',stop);
window.portalControlMode='mouse';drawHand(null);telemetry(null);status('鏡頭未啟動','idle');
start();
