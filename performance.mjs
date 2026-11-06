// Share finite budgets between tracking and drawing on fanless Android panels.
export function trackingProfile(profile='balanced',android=false){
 if(profile==='smooth')return {name:'雙人流暢',numHands:2,width:256,fps:6,cameraWidth:320,cameraHeight:240,cameraFps:12,previewFps:8,renderFps:20};
 if(profile==='single')return {name:'單人省電',numHands:1,width:256,fps:10,cameraWidth:320,cameraHeight:240,cameraFps:12,previewFps:8,renderFps:20};
 return {name:'雙人標準',numHands:2,width:android?416:480,fps:android?10:15,cameraWidth:640,cameraHeight:480,cameraFps:android?20:24,previewFps:android?12:15,renderFps:30};
}
export function readPerformanceSettings({search='',storage}={}){
 let saved={};try{saved=JSON.parse(storage?.getItem('qingming.performance.v2')||'{}')||{};}catch{}
 const query=new URLSearchParams(search),profile=query.get('performance')||saved.profile,engine=query.get('engine')||saved.engine;
 return {profile:['smooth','single'].includes(profile)?profile:'balanced',engine:engine==='cpu'?'cpu':'auto',diagnostics:query.get('diagnostics')==='1'};
}
export function createFrameCapture(makeCanvas=()=>document.createElement('canvas'),makeBitmap=source=>createImageBitmap(source)){
 const canvas=makeCanvas(),ink=canvas.getContext('2d',{alpha:false});
 return {async capture(video,width){
  const height=Math.max(1,Math.round(width*(video.videoHeight||480)/(video.videoWidth||640)));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  ink.drawImage(video,0,0,width,height);
  return makeBitmap(canvas);
 },get size(){return [canvas.width,canvas.height];}};
}
export function createTrackingSchedule(android=false,profile='balanced'){
 const config=trackingProfile(profile,android);let averageMs=0,nextAt=0,width=config.width;
 return {
  get width(){return width;},get averageMs(){return averageMs;},
  canSend(now,lastStart){return now>=nextAt&&now-lastStart>=1000/config.fps;},
  complete(ms,now,delegate='CPU'){
   averageMs=averageMs?averageMs*.8+ms*.2:ms;
   // Leave CPU time for painting/input even if inference itself is very slow.
   nextAt=now+Math.min(300,Math.max(android?30:12,averageMs*(delegate==='GPU'?.15:.6)));
   if(android&&profile==='balanced'){if(averageMs>130)width=320;else if(averageMs<80)width=416;}
  },
  get staleMs(){return Math.min(900,Math.max(450,averageMs*2+150));},
  reset(){averageMs=0;nextAt=0;width=config.width;}
 };
}
export function createFrameClock(fps=30,start=0){
 let last=start;
 return {step(now,hidden=false){
  if(hidden){last=now;return null;}
  const elapsed=Math.max(0,now-last);if(elapsed<1000/fps-.5)return null;
  last=now;return {dt:Math.min(.1,elapsed/1000),animationDt:Math.min(.25,elapsed/1000)};
 },reset(now){last=now;}};
}
// GPU is attempted once. Unsupported drivers or a lost context fall back to CPU.
export async function createTrackingEngine(create,{gpu=true}={}){
 let detector,delegate='CPU',fallback=false,reason='',gpuFrames=0,slowSamples=[],pendingCPU=false;
 if(gpu){try{detector=await create('GPU');delegate='GPU';}catch{fallback=true;reason='gpu-unavailable';}}
 if(!detector)detector=await create('CPU');
 async function switchCPU(why){try{detector.close?.();}catch{}delegate='CPU';fallback=true;reason=why;detector=await create('CPU');pendingCPU=false;}
 return {get delegate(){return delegate;},get fallback(){return fallback;},get reason(){return reason;},
  observeLatency(ms){
   if(delegate!=='GPU'||!Number.isFinite(ms)||++gpuFrames<=5)return;
   slowSamples.push(ms);if(slowSamples.length>8)slowSamples.shift();
   if(slowSamples.length===8){const sorted=[...slowSamples].sort((a,b)=>a-b);if((sorted[3]+sorted[4])/2>120)pendingCPU=true;}
  },
  async detect(bitmap,timestamp){
   if(pendingCPU)await switchCPU('slow-gpu');
   try{return detector.detectForVideo(bitmap,timestamp);}
   catch(error){if(delegate!=='GPU')throw error;await switchCPU('gpu-error');return detector.detectForVideo(bitmap,timestamp);}
  },close(){detector.close?.();}
 };
}
