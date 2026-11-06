import {FilesetResolver, HandLandmarker} from './vendor/mediapipe/vision_bundle.mjs';
import {createTrackingEngine,trackingModel} from './performance.mjs?v=20261106-auto2';
import {createAdaptiveTracker} from './adaptive-model.mjs?v=20261106-auto2';
let tracker,initializing;
async function initialize(options) {
 const files=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href,true);
 // The pinned SDK consumes ModuleFactory. ESM imports are cached, so restore
 // the loader's exported factory before each model / delegate creation.
 const {default:moduleFactory}=await import(files.wasmLoaderPath);
 tracker=await createAdaptiveTracker((model,{gpu})=>createTrackingEngine(delegate=>{
  self.ModuleFactory=moduleFactory;
  return HandLandmarker.createFromOptions(files,{
  baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/'+trackingModel(model).file,import.meta.url).href,delegate},
  runningMode:'VIDEO',numHands:options.numHands===1?1:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
 });},{gpu}),{
  initial:trackingModel(options.model).id,automatic:options.automatic===true,gpu:options.gpu!==false&&typeof OffscreenCanvas==='function',
  onChanging:change=>self.postMessage({type:'model-changing',...change}),
  onChoice:choice=>self.postMessage({type:'model-choice',...choice})
 });
}
function state(){return {model:tracker.model,delegate:tracker.delegate,fallback:tracker.fallback,reason:tracker.reason};}
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   initializing ||= initialize(data);await initializing;self.postMessage({type:'ready',...state()});
  }else if(data.type==='frame'){
   const detection=await tracker.detect(data.bitmap,data.timestamp);
   if(detection.changed)self.postMessage({type:'model-ready',selectionReason:detection.reason,...state()});
   else self.postMessage({type:'result',hands:detection.result.landmarks,ms:detection.ms,...state()});
  }
 }catch(error){self.postMessage({type:'error',message:error.message||String(error)});}
 finally{data.bitmap?.close();}
};
