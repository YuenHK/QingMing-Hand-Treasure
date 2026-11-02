// Low-resolution mask and cached glow replace thousands of blurred circles.
export const REVEAL_SECONDS=3;
// Only 28 cached sprites per frame; no per-particle shadow blur or allocations.
export function createTourGlow(width,height,makeCanvas=()=>document.createElement('canvas')){
 const sprite=makeCanvas();sprite.width=sprite.height=48;const ink=sprite.getContext('2d');
 const g=ink.createRadialGradient(24,24,0,24,24,24);g.addColorStop(0,'#fff2c9');g.addColorStop(.12,'#ffe09add');g.addColorStop(.4,'#e7b95855');g.addColorStop(1,'#e7b95800');ink.fillStyle=g;ink.fillRect(0,0,48,48);
 const particles=Array.from({length:28},(_,i)=>({x:((i*.61803398875)%1)*width,phase:(i*.381966)%1,size:12+(i%5)*4,speed:10+(i%7)*2}));
 return {draw(ctx,elapsed){ctx.save();ctx.globalCompositeOperation='lighter';
  for(const p of particles){const phase=(p.phase+elapsed*p.speed/height)%1,x=p.x+Math.sin(elapsed*.4+p.phase*6.28)*20,y=height*(1-phase);ctx.globalAlpha=Math.sin(phase*Math.PI)*(.38+.22*Math.sin(elapsed*1.5+p.phase*6.28)**2);ctx.drawImage(sprite,x-p.size/2,y-p.size/2,p.size,p.size);}
  ctx.restore();
 }};
}
export function createReveal(width,height,makeCanvas=()=>document.createElement('canvas')){
 const mw=120,mh=68,mask=makeCanvas(),glow=makeCanvas(),shade=makeCanvas(),sprite=makeCanvas();
 for(const c of [mask,glow]){c.width=mw;c.height=mh;}shade.width=width;shade.height=height;sprite.width=sprite.height=24;
 const mi=mask.getContext('2d'),gi=glow.getContext('2d'),si=shade.getContext('2d'),pi=sprite.getContext('2d');
 const pixels=mi.createImageData(mw,mh),gold=gi.createImageData(mw,mh),field=new Float32Array(mw*mh);
 const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){const i=y*mw+x;field[i]=Math.hypot((x/mw-.5)*1.3,y/mh-.5)+.07*Math.sin(x*.25)*Math.cos(y*.3);pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=255;gold.data[i*4]=255;gold.data[i*4+1]=205;gold.data[i*4+2]=105;}
 const gradient=pi.createRadialGradient(12,12,0,12,12,12);gradient.addColorStop(0,'#ffe4a5cc');gradient.addColorStop(.35,'#e9bc6a88');gradient.addColorStop(1,'#e9bc6a00');pi.fillStyle=gradient;pi.fillRect(0,0,24,24);
 const sparks=Array.from({length:40},(_,i)=>({x:hash(i,9)*width,y:hash(i,2)*height,at:hash(i,5)*.8,vx:(hash(i,3)-.5)*45,vy:-25-hash(i,4)*55}));
 let last=-Infinity;
 return {draw(ctx,color,dim,elapsed){
  ctx.drawImage(color,0,0);
  const t=Math.max(0,Math.min(1,elapsed/REVEAL_SECONDS));if(t>=1)return;
  if(elapsed-last>=1/30||elapsed<last){
   last=elapsed;const front=t*1.15-.1;
   for(let i=0;i<field.length;i++){const difference=field[i]-front;pixels.data[i*4+3]=Math.max(0,Math.min(255,difference*255*20));gold.data[i*4+3]=Math.max(0,1-Math.abs(difference)/.045)*125;}
   mi.putImageData(pixels,0,0);gi.putImageData(gold,0,0);
   si.clearRect(0,0,width,height);si.globalCompositeOperation='source-over';si.drawImage(dim,0,0);si.globalCompositeOperation='destination-in';si.drawImage(mask,0,0,width,height);si.globalCompositeOperation='source-over';
  }
  ctx.drawImage(shade,0,0);ctx.save();ctx.globalAlpha=.65;ctx.drawImage(glow,0,0,width,height);
  for(const p of sparks){const age=elapsed-p.at*REVEAL_SECONDS;if(age>=0&&age<1){ctx.globalAlpha=(1-age)*.65;ctx.drawImage(sprite,p.x+p.vx*age-12,p.y+p.vy*age-12);}}
  ctx.restore();
 }};
}
