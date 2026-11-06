import {FilesetResolver, HandLandmarker} from './vendor/mediapipe/vision_bundle.mjs';
let detector;
let initializing;
async function initialize() {
  const files = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href, true);
  detector = await HandLandmarker.createFromOptions(files, {
    baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/hand_landmarker.task',import.meta.url).href,delegate:'CPU'},
    runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
  });
}
self.onmessage = async ({data}) => {
  try {
    if(data.type==='init') {
      initializing ||= initialize(); await initializing;
      self.postMessage({type:'ready'});
    } else if(data.type==='frame') {
      const start=performance.now();
      const result=detector.detectForVideo(data.bitmap,data.timestamp);
      self.postMessage({type:'result',hands:result.landmarks,ms:performance.now()-start});
    }
  } catch(error) {
    self.postMessage({type:'error',message:error.message||String(error)});
  } finally {data.bitmap?.close();}
};
