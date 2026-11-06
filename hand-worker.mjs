import {FilesetResolver, HandLandmarker} from './vendor/mediapipe/vision_bundle.mjs';
import {createTrackingEngine} from './performance.mjs';
let detector;
let initializing;
async function initialize() {
  const files = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href, true);
  detector = await createTrackingEngine(delegate=>HandLandmarker.createFromOptions(files, {
    baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/hand_landmarker.task',import.meta.url).href,delegate},
    runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
  }),{gpu:typeof OffscreenCanvas==='function'});
}
self.onmessage = async ({data}) => {
  try {
    if(data.type==='init') {
      initializing ||= initialize(); await initializing;
      self.postMessage({type:'ready',delegate:detector.delegate,fallback:detector.fallback});
    } else if(data.type==='frame') {
      const start=performance.now();
      const result=await detector.detect(data.bitmap,data.timestamp);
      self.postMessage({type:'result',hands:result.landmarks,ms:performance.now()-start,delegate:detector.delegate,fallback:detector.fallback});
    }
  } catch(error) {
    self.postMessage({type:'error',message:error.message||String(error)});
  } finally {data.bitmap?.close();}
};
