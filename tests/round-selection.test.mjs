import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectRound,createRoundPicker,ROUND_STORAGE_KEY} from '../round-selection.mjs';

const pool=Array.from({length:5},(_,chapter)=>({name:'region '+chapter,x:chapter*2000,targets:Array.from({length:6},(_,target)=>({id:`${chapter}-${target}`,name:'clue '+target}))}));
const ids=round=>round.map(chapter=>chapter.targets.map(target=>target.id));
function rng(){let seed=17483;return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

test('each round has five regions and two distinct clues per region without mutating the pool',()=>{
 const original=JSON.stringify(pool),round=selectRound(pool,[],rng());
 assert.equal(round.length,5);assert.equal(round.flatMap(c=>c.targets).length,10);
 for(const c of round)assert.equal(new Set(c.targets.map(t=>t.id)).size,2);
 assert.equal(JSON.stringify(pool),original);
});
test('successive rounds avoid all previous clues and use the entire thirty-clue pool',()=>{
 const random=rng(),seen=new Set();let previous=[];
 for(let n=0;n<100;n++){const round=selectRound(pool,previous,random);for(let c=0;c<5;c++)for(const t of round[c].targets){assert.ok(!previous[c]?.includes(t.id));seen.add(t.id);}previous=ids(round);}
 assert.equal(seen.size,30);
});
test('a page reload uses the saved previous round to avoid repetition',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
 const first=createRoundPicker(pool,{storage,random:rng()})();assert.ok(data.has(ROUND_STORAGE_KEY));
 const afterReload=createRoundPicker(pool,{storage,random:rng()})();
 for(let c=0;c<5;c++)assert.ok(afterReload[c].targets.every(t=>!ids(first)[c].includes(t.id)));
});
test('unavailable or corrupt local storage still allows fresh rounds',()=>{
 for(const storage of [{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},{getItem:()=>'{broken',setItem(){}}]){
  const pick=createRoundPicker(pool,{storage,random:rng()}),first=ids(pick()),second=ids(pick());
  for(let c=0;c<5;c++)assert.ok(second[c].every(id=>!first[c].includes(id)));
 }
});
