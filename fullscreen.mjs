// A real click is required by browsers; camera dwell clicks have no activation.
export function installFullscreen(doc=document,button=doc.getElementById('fullscreen'),message=doc.getElementById?.('fullscreenHint')){
 let pending=false,entered=!!doc.fullscreenElement;
 const supported=typeof doc.documentElement?.requestFullscreen==='function'&&doc.fullscreenEnabled!==false;
 function update(){
  const active=!!doc.fullscreenElement;
  button.textContent=active?'離開全螢幕':'全螢幕';button.disabled=!supported;
  button.setAttribute('aria-pressed',String(active));
  button.title=supported?'點擊進入全螢幕；手勢停留可退出；Esc 亦可退出':'此瀏覽器不支援網頁全螢幕，可試按 F11';
 }
 function request(){
  if(!supported||pending||doc.fullscreenElement)return;
  if(message)message.hidden=true;
  pending=true;
  try{Promise.resolve(doc.documentElement.requestFullscreen({navigationUI:'hide'})).then(()=>{entered=true;},()=>{}).finally(()=>{pending=false;update();});}
  catch{pending=false;update();}
 }
 doc.addEventListener('click',event=>{
  if(!event.isTrusted||entered||button.contains?.(event.target))return;
  request();
 },true);
 doc.addEventListener('fullscreenchange',()=>{if(doc.fullscreenElement)entered=true;if(message)message.hidden=true;update();});
 button.onclick=event=>{
  if(pending)return;
  if(doc.fullscreenElement){try{Promise.resolve(doc.exitFullscreen()).catch(()=>{});}catch{}return;}
  if(!event?.isTrusted){if(message){message.textContent='進入全螢幕：請用滑鼠點一下，或按 F11';message.hidden=false;}return;}
  request();
 };
 update();
}
