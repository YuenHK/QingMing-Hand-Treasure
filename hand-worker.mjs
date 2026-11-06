import {FilesetResolver, HandLandmarker} from './vendor/mediapipe/vision_bundle.mjs';
import {createTrackingEngine} from './performance.mjs?v=20261106-perf2';
let detector;
let initializing;
async function initialize(options) {
  const files = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href, true);
  detector = await createTrackingEngine(delegate=>HandLandmarker.createFromOptions(files, {
    baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/hand_landmarker.task',import.meta.url).href,delegate},
    runningMode:'VIDEO',numHands:options.numHands===1?1:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
  }),{gpu:options.gpu!==false&&typeof OffscreenCanvas==='function'});
}
self.onmessage = async ({data}) => {
  try {
    if(data.type==='init') {
      initializing ||= initialize(data); await initializing;
      self.postMessage({type:'ready',delegate:detector.delegate,fallback:detector.fallback});
    } else if(data.type==='frame') {
      const start=performance.now();
      const result=await detector.detect(data.bitmap,data.timestamp);
      const ms=performance.now()-start;detector.observeLatency(ms);
      self.postMessage({type:'result',hands:result.landmarks,ms,delegate:detector.delegate,fallback:detector.fallback,reason:detector.reason});
    }
  } catch(error) {
    self.postMessage({type:'error',message:error.message||String(error)});
  } finally {data.bitmap?.close();}
};
