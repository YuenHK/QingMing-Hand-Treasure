import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installFullscreen} from '../fullscreen.mjs';

function fixture({unsupported=false,reject=false}={}){
 let requests=0,exits=0;const listeners={};
 const button={setAttribute(k,v){this[k]=v;},contains(target){return target===this;}};
 const doc={fullscreenElement:null,fullscreenEnabled:!unsupported,documentElement:{requestFullscreen(){requests++;return reject?Promise.reject(new Error('Denied')):Promise.resolve();}},exitFullscreen(){exits++;doc.fullscreenElement=null;listeners.fullscreenchange();return Promise.resolve();},addEventListener(name,fn){listeners[name]=fn;}};
 installFullscreen(doc,button);
 return {doc,button,listeners,get requests(){return requests;},get exits(){return exits;}};
}
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

test('load and camera dwell never request fullscreen; the first real click does',async()=>{
 const f=fixture();assert.equal(f.requests,0);f.listeners.click({isTrusted:false});assert.equal(f.requests,0);
 f.listeners.click({isTrusted:true});f.listeners.click({isTrusted:true});assert.equal(f.requests,1,'one pending request at a time');await settle();
 f.listeners.click({isTrusted:true});assert.equal(f.requests,1,'automatic entry only happens once');
});
test('explicit button enters, reflects fullscreen state, exits and can re-enter',async()=>{
 const f=fixture(),event={isTrusted:true,target:f.button};
 f.listeners.click(event);assert.equal(f.requests,0,'capture handler leaves the explicit action to the button');
 f.button.onclick(event);await settle();assert.equal(f.requests,1);
 f.doc.fullscreenElement=f.doc.documentElement;f.listeners.fullscreenchange();assert.equal(f.button.textContent,'離開全螢幕');assert.equal(f.button['aria-pressed'],'true');
 f.button.onclick(event);await settle();assert.equal(f.exits,1);assert.equal(f.button.textContent,'全螢幕');
 f.listeners.click({isTrusted:true});assert.equal(f.requests,1,'leaving fullscreen is respected');
 f.button.onclick(event);await settle();assert.equal(f.requests,2);
});
test('synthetic gesture selection does not claim fullscreen permission',()=>{
 const f=fixture();f.button.onclick({isTrusted:false});assert.equal(f.requests,0);
});
test('gesture selection can exit an existing fullscreen session',()=>{
 const f=fixture();f.doc.fullscreenElement=f.doc.documentElement;f.listeners.fullscreenchange();f.button.onclick({isTrusted:false});assert.equal(f.exits,1);assert.equal(f.button.textContent,'全螢幕');
});
test('a gesture without activation shows a clear entry instruction',()=>{
 const f=fixture(),message={hidden:true};installFullscreen(f.doc,f.button,message);f.button.onclick({isTrusted:false});assert.equal(f.requests,0);assert.equal(message.hidden,false);assert.match(message.textContent,/滑鼠.*F11/);
});
test('a denied fullscreen request stays playable and may retry on a later click',async()=>{
 const f=fixture({reject:true});f.listeners.click({isTrusted:true});await settle();assert.equal(f.button.disabled,false);
 f.listeners.click({isTrusted:true});await settle();assert.equal(f.requests,2);
});
test('unsupported browsers disable the action without throwing',()=>{
 const f=fixture({unsupported:true});f.listeners.click({isTrusted:true});f.button.onclick({isTrusted:true});assert.equal(f.requests,0);assert.equal(f.button.disabled,true);
});
