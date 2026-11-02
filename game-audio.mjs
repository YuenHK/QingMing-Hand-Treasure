// Original pentatonic score: synthesized locally, with no external music files.
export function createGameAudio(){
 const $=id=>document.getElementById(id),voice=$('narrationAudio');
 const narration=true;
 let context,musicGain,effectGain,master,timer,nextBeat=0,beat=0,chapter=0,started=false,music=true,current='',speaking=false,token=0,celebrating=false;
 const celebrationMelody=[0,4,7,12,9,7,4,7,9,12,16,14,12,9,7,4];
 const melodies=[[0,null,4,7,null,9,7,4,2,null,4,null,0,null,-3,null],[4,null,7,9,null,12,9,7,4,2,null,0,2,null,4,null],[7,4,null,2,0,null,4,7,9,null,7,4,2,null,0,null],[0,null,2,null,4,7,null,4,2,null,-3,null,0,null,2,null],[12,null,9,7,4,null,7,9,12,null,14,12,9,null,7,null]];
 function report(status){
  $('audioControls').dataset.state=JSON.stringify({started,context:context?.state||'idle',music,narration,speaking,current,chapter,celebrating,musicTarget:music?(speaking?.6:1.2):0});
  if(status)$('narrationStatus').textContent=status;
 }
 function mix(){if(musicGain)musicGain.gain.setTargetAtTime(music?(speaking?.6:1.2):0,context.currentTime,.22);report();}
 function tone(semitone,when,length,volume=.15,bus=musicGain,flute=false){
  if(!context||context.state!=='running')return;
  const frequency=293.665*Math.pow(2,semitone/12),envelope=context.createGain();
  envelope.gain.setValueAtTime(.0001,when);envelope.gain.exponentialRampToValueAtTime(volume,when+(flute?.12:.008));envelope.gain.exponentialRampToValueAtTime(.0001,when+length);envelope.connect(bus);
  for(const [multiple,weight] of (flute?[[1,.8],[2,.12]]:[[1,.7],[2,.22],[3,.08]])){
   const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=frequency*multiple;gain.gain.value=weight;oscillator.connect(gain).connect(envelope);oscillator.start(when);oscillator.stop(when+length+.03);
  }
 }
 function schedule(){
  if(!context||context.state!=='running'||document.hidden)return;
  if(nextBeat<context.currentTime-.2)nextBeat=context.currentTime+.05;
  while(nextBeat<context.currentTime+.45){
   const bar=Math.floor(beat/16),i=beat%16,note=(celebrating?celebrationMelody:melodies[chapter%melodies.length])[i];
   if(note!==null)tone(note,nextBeat,celebrating?1.6:2.6,i%4===0?.22:.15);
   if(i%8===0)tone([0,-5,-3,-5][bar%4]-12,nextBeat,celebrating?1.9:3.4,.16);
   if(celebrating&&i%8===4)tone(note+12,nextBeat,1.2,.06);
   else if(i===4&&bar%2===1)tone([12,9,7,14][bar%4],nextBeat,2,.045,musicGain,true);
   nextBeat+=celebrating?.32:.48;beat++;
  }
 }
 async function start(){
  if(started){if(context?.state==='suspended'&&!document.hidden)await context.resume();return;}
  try{
   if(!context){context=new (window.AudioContext||window.webkitAudioContext)();
   master=context.createGain();master.gain.value=.85;const limiter=context.createDynamicsCompressor();master.connect(limiter).connect(context.destination);
   musicGain=context.createGain();musicGain.gain.value=.001;musicGain.connect(master);effectGain=context.createGain();effectGain.gain.value=.4;effectGain.connect(master);}
   await context.resume();if(started)return;started=true;nextBeat=context.currentTime+.05;mix();schedule();timer=setInterval(schedule,200);report('搵到物件，自動廣東話講解');
  }catch{report('聲音未能啟動，可輕按畫面重試');}
 }
 function stopNarration(){token++;voice.pause();voice.currentTime=0;speaking=false;mix();report('搵到物件，自動廣東話講解');}
 async function narrate(id){
  stopNarration();current=id;
  const request=token;voice.src='assets/narration/'+id+'.mp3';voice.volume=1;speaking=true;mix();report('廣東話講解中…');
  try{await voice.play();if(request!==token)return;report('廣東話講解中…');}
  catch{if(request!==token)return;speaking=false;mix();report('按「再聽一次」播放廣東話');}
 }
 voice.addEventListener('ended',()=>{speaking=false;mix();report('講解完畢 · 可以繼續尋寶');});
 voice.addEventListener('error',()=>{speaking=false;mix();report('講解未能載入，請按「再聽一次」');});
 function effect(kind){
  if(!started||!context||context.state!=='running')return;
  const notes=kind==='found'?[12,16,19]:kind==='transition'?[0,2,4,7,9]:[0,4,7,12,16,19,24];
  notes.forEach((n,i)=>tone(n,context.currentTime+.02+i*(kind==='victory'?.19:.12),kind==='victory'?2.8:1.5,.3,effectGain));
 }
 $('musicToggle').onclick=async()=>{await start();music=!music;$('musicToggle').textContent=music?'配樂：開':'配樂：關';$('musicToggle').setAttribute('aria-pressed',String(music));mix();};
 $('replayNarration').onclick=async()=>{await start();if(current)narrate(current);};
 $('welcomeCamera').addEventListener('click',start);
 for(const name of ['pointerdown','keydown'])document.addEventListener(name,event=>{if(event.isTrusted)start();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopNarration();context?.suspend();}else if(started){context.resume().then(()=>{nextBeat=context.currentTime+.05;schedule();report();}).catch(()=>report('輕按畫面恢復配樂'));}});
 window.addEventListener('pagehide',()=>{clearInterval(timer);voice.pause();context?.close();});
 report('搵到物件，自動廣東話講解');
 start();
 return {start,narrate,stopNarration,effect,setChapter(value){chapter=value;report();},setCelebrating(value){value=!!value;if(value===celebrating)return;celebrating=value;beat=0;if(context)nextBeat=context.currentTime+.05;report();}};
}
