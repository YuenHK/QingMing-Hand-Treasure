// Two clues per region, avoiding that region's clues from the previous round.
export const ROUND_STORAGE_KEY='qingming.previous-round-targets.v1';
export function selectRound(pool,previous=[],random=Math.random){
 return pool.map((chapter,index)=>{
  if(chapter.targets.length<2)throw new Error('Each region needs at least two clues');
  const recent=new Set(Array.isArray(previous?.[index])?previous[index]:[]);
  const fresh=chapter.targets.filter(target=>!recent.has(target.id));
  const choices=[...(fresh.length>=2?fresh:chapter.targets)];
  for(let i=choices.length-1;i>0;i--){const j=Math.max(0,Math.min(i,Math.floor(random()*(i+1))));[choices[i],choices[j]]=[choices[j],choices[i]];}
  return {...chapter,targets:choices.slice(0,2)};
 });
}
export function createRoundPicker(pool,{storage,random=Math.random}={}){
 let previous=[];
 try{const saved=JSON.parse(storage?.getItem(ROUND_STORAGE_KEY)||'[]');if(Array.isArray(saved))previous=saved;}catch{}
 return ()=>{
  const chapters=selectRound(pool,previous,random);
  previous=chapters.map(chapter=>chapter.targets.map(target=>target.id));
  try{storage?.setItem(ROUND_STORAGE_KEY,JSON.stringify(previous));}catch{}
  return chapters;
 };
}
