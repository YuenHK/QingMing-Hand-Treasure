import {FilesetResolver, HandLandmarker} from './vendor/mediapipe/vision_bundle.mjs';
import {createTrackingEngine,trackingModel} from './performance.mjs?v=20261106-lite1';
let detector;
let initializing;
let model;
async function initialize(options) {
  const files = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href, true);
  model = trackingModel(options.model);
  detector = await createTrackingEngine(delegate=>HandLandmarker.createFromOptions(files, {
    baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/'+model.file,import.meta.url).href,delegate},
    runningMode:'VIDEO',numHands:options.numHands===1?1:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
  }),{gpu:options.gpu!==false&&typeof OffscreenCanvas==='function'});
}
self.onmessage = async ({data}) => {
  try {
    if(data.type==='init') {
      initializing ||= initialize(data); await initializing;
      self.postMessage({type:'ready',model:model.id,delegate:detector.delegate,fallback:detector.fallback});
    } else if(data.type==='frame') {
      const start=performance.now();
      const result=await detector.detect(data.bitmap,data.timestamp);
      const ms=performance.now()-start;
      self.postMessage({type:'result',model:model.id,hands:result.landmarks,ms,delegate:detector.delegate,fallback:detector.fallback,reason:detector.reason});
    }
  } catch(error) {
    self.postMessage({type:'error',message:error.message||String(error)});
  } finally {data.bitmap?.close();}
};
