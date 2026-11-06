// Pure coordinate/gesture logic shared by the camera controller and checks.
export const clamp = x => Math.max(0, Math.min(1, x));
export function palmControl(points, mirror = true, reach = .15) {
  if (!points || points.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const palm = [0, 5, 9, 13, 17].reduce((p, i) => ({x:p.x+points[i].x/5,y:p.y+points[i].y/5}), {x:0,y:0});
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const fingers = [[8,6],[12,10],[16,14],[20,18]].filter(([tip,pip]) => distance(points[tip],points[0]) > distance(points[pip],points[0])*1.12).length;
  return {x:clamp(((mirror?1-palm.x:palm.x)-reach)/(1-2*reach)), y:clamp((palm.y-reach)/(1-2*reach)), open:fingers>=2, fingers};
}
export function smoothPoint(previous, next, dt) {
  if (!previous) return {x:next.x,y:next.y};
  const alpha = 1-Math.exp(-Math.min(.2,dt)/.085);
  return {x:previous.x+(next.x-previous.x)*alpha,y:previous.y+(next.y-previous.y)*alpha};
}

// Match by screen position, not left/right handedness: two visitors may both
// use their right hand. Keep an absent slot briefly to avoid stealing its ID.
export function createHandTracker(){
 let slots=[null,null];
 return {clear(){slots=[null,null];},update(hands,now,mirror=true,reach=.15){
  const detections=hands.slice(0,2).map(points=>({points,control:palmControl(points,mirror,reach)})).filter(d=>d.control);
  slots=slots.map(s=>s&&now-s.seen<=900?s:null);
  let best=null;
  for(const assignment of detections.length===2?[[0,1],[1,0]]:detections.length===1?[[0],[1]]:[[]]){
   const cost=assignment.reduce((sum,slot,i)=>sum+(slots[slot]?Math.hypot(slots[slot].raw.x-detections[i].control.x,slots[slot].raw.y-detections[i].control.y):.65),0);
   if(!best||cost<best.cost)best={assignment,cost};
  }
  const output=[];
  for(let i=0;i<detections.length;i++){
   const id=best.assignment[i],d=detections[i],previous=slots[id],dt=previous?(now-previous.seen)/1000:.1;
   const position=smoothPoint(previous?.position,d.control,dt);
   slots[id]={raw:d.control,position,seen:now};output.push({id,points:d.points,...d.control,...position});
  }
  return output.sort((a,b)=>a.id-b.id);
 }};
}
