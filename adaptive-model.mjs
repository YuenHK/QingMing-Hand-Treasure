// Use measured inference time, not a device name, to settle on a model.
// Full gets a 100ms budget; Lite must be consistently under 35ms before a
// single Full trial. Five warm-up frames and an eight-frame median reject spikes.
export function createModelPolicy(initial='full',automatic=true){
 let model=initial,warmup=5,samples=[],reported=false,lockedLite=false,stopped=!automatic;
 function change(next,reason){model=next;warmup=5;samples=[];reported=false;return {type:'switch',model,reason};}
 return {stop(){stopped=true;},observe(ms,hands){
  if(stopped||!Number.isFinite(ms)||ms<=0)return null;
  if(warmup>0){warmup--;return null;}
  if(!hands){samples=[];return null;}
  samples.push(ms);if(samples.length>8)samples.shift();if(samples.length<8)return null;
  const sorted=[...samples].sort((a,b)=>a-b),median=(sorted[3]+sorted[4])/2;
  if(model==='full'&&median>100){lockedLite=true;return change('lite','full-over-budget');}
  if(!reported){
   reported=true;
   if(model==='lite'&&!lockedLite&&median<35)return change('full','fast-lite-trial');
   return {type:'choice',model,reason:'measured'};
  }
  return null;
 }};
}

// Camera and game remain running while only the worker's detector is replaced.
export async function createAdaptiveTracker(create,{initial='full',automatic=true,gpu=true,now=()=>performance.now(),onChanging=()=>{},onChoice=()=>{},switchTimeoutMs=15000}={}){
 let model=initial,engine=await create(model,{gpu});const policy=createModelPolicy(model,automatic);
 async function replace(next,options){
  let expired=false,timer;
  const pending=Promise.resolve().then(()=>create(next,options));
  pending.then(detector=>{if(expired){try{detector.close();}catch{}}},()=>{});
  try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Model switch timed out'));},switchTimeoutMs);})]);}
  finally{clearTimeout(timer);}
 }

 return {get model(){return model;},get delegate(){return engine.delegate;},get fallback(){return engine.fallback;},get reason(){return engine.reason;},
  async detect(bitmap,timestamp){
   const start=now(),result=await engine.detect(bitmap,timestamp),ms=now()-start;
   const decision=policy.observe(ms,result.landmarks?.length||0);
   if(decision?.type==='choice')onChoice(decision);
   if(decision?.type!=='switch')return {result,ms,changed:false};
   const previous=model,useGPU=engine.delegate==='GPU'&&gpu;
   onChanging({from:previous,to:decision.model,reason:decision.reason});try{engine.close();}catch{}
   try{engine=await replace(decision.model,{gpu:useGPU});model=decision.model;}
   catch(error){
    // Restore a working detector if the other asset cannot load. Do not loop.
    policy.stop();engine=await replace(previous,{gpu:useGPU});model=previous;
    return {changed:true,reason:'model-load-failed'};
   }
   if(decision.reason==='full-over-budget')onChoice({model,reason:decision.reason});
   // Discard the old frame rather than moving a cursor using stale landmarks.
   return {changed:true,reason:decision.reason};
  },close(){engine.close();}
 };
}

export function createModelMemory(storage,{engine='auto',numHands=2,profile='balanced'}={},now=()=>Date.now()){
 const key=`qingming.auto-model.v1:${engine}:${numHands}:${profile}`;
 return {read(){try{const v=JSON.parse(storage?.getItem(key)||'null');return v&&['lite','full'].includes(v.model)&&Number.isFinite(v.expires)&&v.expires>now()&&v.expires<=now()+7*86400000?v.model:null;}catch{return null;}},
  save(model){if(!['lite','full'].includes(model))return;try{storage?.setItem(key,JSON.stringify({model,expires:now()+7*86400000}));}catch{}}
 };
}
