// Share finite budgets between tracking and drawing on fanless Android panels.
export function createTrackingSchedule(android=false){
 let averageMs=0,nextAt=0,width=android?416:480;
 return {
  get width(){return width;},get averageMs(){return averageMs;},
  canSend(now,lastStart){return now>=nextAt&&now-lastStart>=1000/(android?10:15);},
  complete(ms,now,delegate='CPU'){
   averageMs=averageMs?averageMs*.8+ms*.2:ms;
   // Leave CPU time for painting/input even if inference itself is very slow.
   nextAt=now+Math.min(300,Math.max(android?30:12,averageMs*(delegate==='GPU'?.15:.6)));
   if(android){if(averageMs>130)width=320;else if(averageMs<80)width=416;}
  },
  get staleMs(){return Math.min(900,Math.max(450,averageMs*2+150));},
  reset(){averageMs=0;nextAt=0;width=android?416:480;}
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
 let detector,delegate='CPU',fallback=false;
 if(gpu){try{detector=await create('GPU');delegate='GPU';}catch{fallback=true;}}
 if(!detector)detector=await create('CPU');
 return {get delegate(){return delegate;},get fallback(){return fallback;},
  async detect(bitmap,timestamp){
   try{return detector.detectForVideo(bitmap,timestamp);}
   catch(error){if(delegate!=='GPU')throw error;try{detector.close?.();}catch{}delegate='CPU';fallback=true;detector=await create('CPU');return detector.detectForVideo(bitmap,timestamp);}
  },close(){detector.close?.();}
 };
}
