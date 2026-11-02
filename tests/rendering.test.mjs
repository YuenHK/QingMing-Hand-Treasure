import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createScrollAtlas} from '../scroll-atlas.mjs';
import {createReveal,createTourGlow,createLensSparkles,REVEAL_SECONDS} from '../reveal.mjs';

test('a view crossing a tile boundary stays visible while small textures load',()=>{
 const images=[],draws=[];const makeImage=()=>{const image={naturalWidth:4096,naturalHeight:126};images.push(image);return image;};
 const atlas=createScrollAtlas({makeImage}),ctx={drawImage:(...args)=>draws.push(args)};
 images[0].onload();assert.ok(atlas.draw(ctx,1800,0,1646,926,0,0,1280,720));
 assert.equal(draws.length,1,'the preview draws immediately, without waiting for tiles');
 const left=images.find(i=>i.src==='assets/scroll-tiles/00.jpg'),right=images.find(i=>i.src==='assets/scroll-tiles/01.jpg');
 assert.ok(left&&right);left.onload();right.onload();draws.length=0;
 atlas.draw(ctx,1800,0,1646,926,0,0,1280,720);
 assert.equal(draws.length,3);assert.equal(draws[1][0],left);assert.equal(draws[2][0],right);
 assert.ok(Math.abs(draws[1][5]+draws[1][7]-draws[2][5])<.0001,'adjacent pieces must meet');
 assert.equal(images.some(i=>i.src?.endsWith('qingming_scroll.jpg')),false);
});

test('the reveal keeps a color frame underneath and has a bounded draw budget without shadow blur',()=>{
 const colors=[],buffers=[],writes=[];let calls=0,uploads=0;
 const context=()=>new Proxy({drawImage(image){calls++;colors.push(image);},createImageData:(w,h)=>{buffers.push(w*h);return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){uploads++;},createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>{writes.push([k,v]);o[k]=v;return true;}});
 const effect=createReveal(1280,720,()=>({getContext:context}));const out=context(),color={},dim={};
 calls=0;colors.length=0;effect.draw(out,color,dim,1.5);
 assert.equal(colors[0],color);assert.ok(calls<=45,'no hundreds of individual glow strokes');assert.ok(Math.max(...buffers)<=120*68);
 const previous=uploads;effect.draw(out,color,dim,1.51);assert.equal(uploads,previous,'mask work is capped at 30fps');
 colors.length=0;effect.draw(out,color,dim,REVEAL_SECONDS);assert.deepEqual(colors,[color],'the final frame must never leave a black mask');
 assert.equal(writes.some(([key,value])=>key==='shadowBlur'&&value>0),false);
});

test('tour particles reuse one small sprite and stay within a fixed drawing budget',()=>{
 const canvases=[],draws=[],writes=[];
 const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}}),drawImage(...args){draws.push(args);}}, {get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>{writes.push([k,v]);o[k]=v;return true;}});
 const glow=createTourGlow(1280,720,()=>{const canvas={getContext:()=>ctx};canvases.push(canvas);return canvas;});
 glow.draw(ctx,0);const first=draws.map(d=>d.slice(1));draws.length=0;glow.draw(ctx,20);
 assert.equal(canvases.length,1);assert.equal(canvases[0].width,48);assert.equal(draws.length,28);
 assert.ok(draws.every(d=>d[0]===canvases[0]&&d.slice(1).every(Number.isFinite)));
 assert.notDeepEqual(draws.map(d=>d.slice(1)),first,'golden lights drift during the tour');
 assert.equal(writes.some(([k,v])=>k==='shadowBlur'&&v>0),false);
});

test('lens sparkles stay sparse, fade quickly, and clear between rounds',()=>{
 let draws=0,maximum=0,created=0,lastX=0,lastY=0;
 const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}}),moveTo(x,y){lastX=x;lastY=y;},lineTo(x,y){assert.ok(Math.hypot(x-lastX,y-lastY)<=6.01,'only tiny star arms are drawn, without joining movement points');lastX=x;lastY=y;},drawImage(_image,_x,_y,w,h){draws++;assert.ok(w<=14&&h<=14,'glow stays small enough to preserve artwork detail');assert.ok(ctx.globalAlpha<=.85,'lights remain translucent');}},{get:(o,k)=>o[k]??(()=>{})});
 const trail=createLensSparkles(()=>{created++;return {getContext:()=>ctx};});
 for(let i=0;i<200;i++){draws=0;trail.draw(ctx,{x:i*5,y:100+Math.sin(i)*10},i*.03);maximum=Math.max(maximum,draws);}
 assert.equal(created,1);assert.ok(maximum<=8);assert.ok(maximum>1,'movement produces a few visible stars');
 draws=0;trail.draw(ctx,null,6.1);assert.ok(draws>0,'fresh stars remain briefly visible');
 draws=0;trail.draw(ctx,null,8);assert.equal(draws,0,'old light disappears when input stops');
 trail.draw(ctx,{x:20,y:30},9);trail.clear();draws=0;trail.draw(ctx,null,9.1);assert.equal(draws,0);
 trail.draw(ctx,{x:20,y:30},10);draws=0;trail.draw(ctx,{x:20,y:30},11);assert.equal(draws,0,'a stationary pointer must not keep generating stars');
});
