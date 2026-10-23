import './style.css';
import { BlackHoleRenderer,type Quality } from './renderer.ts';
import { DEFAULT_SETTINGS,PARAMETER_RANGES,advanceClock,appendObservation,clamp,createObservation,gravitationalScale,normalizeSettings,readObservations,type Clock,type Observation,type Settings } from './model.ts';
import { Soundscape } from './sound.ts';
import { LightStudio,type StudioEvent } from './studio.ts';
import { VisorHud,type Tool } from './hud.ts';
import { JourneyView } from './journey-view.ts';
import { ArtworkView } from './artwork-view.ts';
import { PngUrls } from './png.ts';
import { FRAME_BUDGET_MS } from './quality.ts';
const $=<T extends HTMLElement>(selector:string):T=>{const element=document.querySelector<T>(selector);if(!element) throw new Error(`缺少界面元素 ${selector}`);return element;};
const icons:Record<string,string>={
  journal:'<path d="M5 3h13a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2V3Z"/><path d="M5 16h15M9 7h7M9 10h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  orbit:'<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="5"/>',
  pen:'<path d="m5 19 3-8L18 2l4 4-10 9-7 4Z"/><path d="m8 11 4 4m-8 7 3-3M2 22h7"/>',
  trace:'<circle cx="5" cy="18" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 18c17 0-4-13 10-13M3 5h4m-2-2v4m12 11h4m-2-2v4"/>',
  time:'<path d="M5 6H1V2m1 4a10 10 0 1 1-1 9"/><path d="M12 6v6l4 3"/>',
  matrix:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  pin:'<path d="m8 3 8 0-2 6 3 4H7l3-4-2-6ZM12 13v8"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 5 11 7-11 7V5Z"/>',
  aperture:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m7.5 4.3 4.5 4.7m7.7-1.5L15 12m1.5 7.7L12 15m-7.7 1.5L9 12"/>',
  expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  sound:'<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
};
const svg=(name:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]??''}</svg>`;
document.querySelectorAll<HTMLElement>('[data-icon]').forEach(element=>{element.innerHTML=svg(element.dataset.icon!);});
const canvas=$<HTMLCanvasElement>('#universe'),status=$('#render-status'),sound=new Soundscape();
const journal=$<HTMLDialogElement>('#journal'),about=$<HTMLDialogElement>('#about');
const artwork=new ArtworkView(()=>sound.chime(),()=>canvas.focus({preventScroll:true}));
let settings:Settings={...DEFAULT_SETTINGS},view:Settings={...settings};
let clock:Clock={realSeconds:0,physicalSeconds:0,phase:34};
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer:BlackHoleRenderer,studio:LightStudio|undefined,activeTool:Tool='observe';
let journey:JourneyView|undefined;
let renderingFailed=false;
let toastTimeout=0;let observations:Observation[]=[];
const journalKey='blackhole-nightshift.observations.v1';
const journalUrls=new PngUrls();
function toast(message:string,duration=5000) {$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=window.setTimeout(()=>{$('#toast').hidden=true;},duration);}
try {const saved=localStorage.getItem(journalKey);if(saved) observations=readObservations(JSON.parse(saved));}
catch {toast('本地手记暂时无法读取。你仍可继续观测，并下载新的留帧。');}
const hud=new VisorHud(tool=>{
  const previous=activeTool;activeTool=tool;
  if(tool==='observe'&&journey?.active) journey.cancel(false);
  if(!$('#comparison').hidden && tool!=='observe') endComparison();
  // Entering image comparison changes the input tool, not the exposure/filter.
  if(tool!==previous && studio && $('#comparison').hidden) {if(tool==='trace' && studio.strokes.length) studio.setSignalView(true);else if(tool==='observe') {studio.setSignalView(false);studio.showAllSignals();}}
},panel=>{if(panel==='trace'||panel==='time') studio?.refreshGeometry();});
const controlKeys=['mass','inclination','distance','accretion','speed'] as const;
for(const key of controlKeys) {const input=$<HTMLInputElement>(`#${key}`);input.min=String(PARAMETER_RANGES[key][0]);input.max=String(PARAMETER_RANGES[key][1]);}
function syncControls() {
  for(const key of controlKeys) {const input=$<HTMLInputElement>(`#${key}`);input.value=String(settings[key]);input.style.setProperty('--value',`${(settings[key]-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);}
  $('#mass-value').textContent=settings.mass.toFixed(2);$('#inclination-value').textContent=`${Math.round(settings.inclination)}°`;
  $('#distance-value').textContent=`${(settings.distance*4.3/settings.mass).toFixed(1)} r_s`;
  $('#accretion-value').textContent=settings.accretion.toFixed(2);$('#speed-value').textContent=`${Math.round(settings.speed)}×`;
  $('#scale-note').textContent=`r_s ${Math.round(gravitationalScale(settings.mass).radiusKm/10000).toLocaleString('zh-CN')} 万 km`;
  $('#light-delay').setAttribute('aria-checked',String(settings.lightDelay));
  document.querySelectorAll<HTMLElement>('[data-palette]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.palette)===settings.palette)));
}
function updatePause() {
  const button=$('#pause-button');button.setAttribute('aria-label',paused?'继续演化':'暂停演化');button.title=`${paused?'继续':'暂停'}演化 · 空格`;
  button.setAttribute('aria-pressed',String(paused));button.innerHTML=`<span data-icon="${paused?'play':'pause'}">${svg(paused?'play':'pause')}</span><span class="dock-label">${paused?'继续':'暂停'}</span>`;
}
function seek(phase:number,value:boolean) {clock.phase=phase;paused=value;renderer?.invalidateSignals();updatePause();}
const VIEWPOINTS={edge:{inclination:82,azimuth:0.25,distance:27},over:{inclination:32,azimuth:0.5,distance:32},under:{inclination:135,azimuth:-0.3,distance:30}};
function prepareReadingView(azimuth=view.azimuth):Settings {
  settings={...settings,inclination:VIEWPOINTS.over.inclination,azimuth,distance:clamp(30*settings.mass/4.3,...PARAMETER_RANGES.distance)};
  view={...settings};
  seek(clock.phase,true);syncControls();canvas.focus({preventScroll:true});return {...settings};
}
for(const key of controlKeys) $<HTMLInputElement>(`#${key}`).addEventListener('input',event=>{settings=normalizeSettings({...settings,[key]:Number((event.target as HTMLInputElement).value)});syncControls();});
document.querySelectorAll<HTMLElement>('[data-palette]').forEach(button=>button.addEventListener('click',()=>{settings.palette=Number(button.dataset.palette);syncControls();}));
document.querySelectorAll<HTMLElement>('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  settings={...settings,...VIEWPOINTS[button.dataset.view as keyof typeof VIEWPOINTS]};syncControls();hud.announce('观测位置正在改变。你写下的光仍在同一片流场里。','VIEWPOINT SHIFT',4500);
}));
$('#light-delay').addEventListener('click',()=>{settings.lightDelay=!settings.lightDelay;if(!settings.lightDelay) journey?.cancel(false);syncControls();hud.announce(settings.lightDelay?'保留光程差：每条光路携带自己的发光时刻。':'同时发光对照：各像使用统一发光时刻。','LIGHT TIME');});
$('#delay-info').addEventListener('click',()=>toast('较长的光路携带更早的盘面状态。关闭光程差可与统一发光时刻对照。',7000));
$('#pause-button').addEventListener('click',()=>{hud.closeCommands();paused=!paused;updatePause();});
$('#reset-button').addEventListener('click',()=>{settings={...DEFAULT_SETTINGS};syncControls();hud.setMode('observe');hud.announce('观测参数已复位。你的信号和留帧仍然保留。','OBSERVATION RESET');});
$('.identity').addEventListener('click',event=>{event.preventDefault();hud.setMode('observe');});
$('#quality').addEventListener('change',event=>renderer?.setQuality((event.target as HTMLSelectElement).value as Quality));
async function toggleSound() {
  try {const enabled=await sound.toggle();for(const id of ['#sound-button','#journey-sound']) {$(id).setAttribute('aria-pressed',String(enabled));$(id).setAttribute('aria-label',enabled?'关闭数据声场':'开启数据声场');}$('#sound-label').textContent=enabled?'声场开启':'声场关闭';$('#journey-sound-label').textContent=enabled?'声音开启':'声音关闭';if(enabled) toast('数据声场已开启。声音回应参数，并非真空中的声音。');}
  catch {toast('此浏览器暂时无法开启声场，视觉观测可继续。');}
}
for(const id of ['#sound-button','#journey-sound']) $(id).addEventListener('click',()=>void toggleSound());
function immersive(value:boolean) {if(value) journey?.cancel(false);document.body.classList.toggle('immersive',value);$('#leave-immersive').hidden=!value;$('#interface').toggleAttribute('inert',value);if(value) hud.hidePointer();}
$('#immersive-button').addEventListener('click',()=>immersive(true));$('#leave-immersive').addEventListener('click',()=>immersive(false));
document.addEventListener('keydown',event=>{
  if(renderingFailed) return;
  if(journal.open||about.open||artwork.open) return;
  if(event.key==='Escape') {if(hud.commandsOpen) {hud.closeCommands(true);return;}const panelWasOpen=hud.hasPanel;hud.close(true);if(!panelWasOpen) journey?.cancel();immersive(false);endComparison();return;}
  if((event.target as Element).matches('input,select,textarea')) return;
  if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())) {event.preventDefault();if(event.key.toLowerCase()==='y'||event.shiftKey) studio?.redo();else studio?.undo();return;}
  if(event.ctrlKey||event.metaKey||event.altKey) return;
  if(event.code==='Space'&&!(event.target as Element).closest('button,a,summary')) {event.preventDefault();paused=!paused;updatePause();}
  const key=event.key.toLowerCase();
  if(key==='1') hud.setMode('observe',true,true);if(key==='2') hud.setMode('paint',true,true);if(key==='3') hud.setMode('trace',true,true);
  if(key==='h') hud.toggleCommands(undefined,undefined,true);
  if(key==='r') hud.toggle('time',true);if(key==='m') hud.toggle('telemetry',true);
  if(key==='i') immersive(!document.body.classList.contains('immersive'));
  if(key==='n') $('#journal-button').click();if(key==='c') $('#capture-button').click();
  if(key==='g') journey?.start();
  if(event.key==='ArrowLeft'||event.key==='ArrowRight') {event.preventDefault();studio?.scrubBy(event.key==='ArrowLeft'?-2:2);}
});
type Drag={x:number;y:number;lastX:number;lastY:number;azimuth:number;inclination:number;camera:boolean};
let drag:Drag|undefined;
function paintPoint(x:number,y:number) {const rect=canvas.getBoundingClientRect();studio?.paint((x-rect.left)/rect.width,(y-rect.top)/rect.height);}
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0) return;hud.outside();
  const camera=event.shiftKey||activeTool==='observe'||document.body.classList.contains('immersive')||!$('#comparison').hidden;
  drag={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,azimuth:settings.azimuth,inclination:settings.inclination,camera};canvas.setPointerCapture(event.pointerId);
  const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
  if(!camera) {if(activeTool==='paint') {studio?.startPaint();paintPoint(event.clientX,event.clientY);}else studio?.inspect(x,y);}
});
canvas.addEventListener('pointermove',event=>{
  if(drag) {
    if(drag.camera) {settings.azimuth=drag.azimuth-(event.clientX-drag.x)*0.005;settings.inclination=clamp(drag.inclination+(event.clientY-drag.y)*0.13,...PARAMETER_RANGES.inclination);syncControls();}
    else if(activeTool==='paint') {
      const dx=event.clientX-drag.lastX,dy=event.clientY-drag.lastY,steps=Math.max(1,Math.min(256,Math.ceil(Math.hypot(dx,dy)/6)));
      for(let i=1;i<=steps;i++) paintPoint(drag.lastX+dx*i/steps,drag.lastY+dy*i/steps);
      drag.lastX=event.clientX;drag.lastY=event.clientY;
    }
  }
  const rect=canvas.getBoundingClientRect();
  if(activeTool==='paint'&&renderer&&$('#comparison').hidden) {const hit=renderer.inspect(view,(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height,false).hits[0];hud.pointer(event.clientX,event.clientY,Boolean(hit),hit?`r ${hit.radius.toFixed(1)} r_s`:'未落在盘面');}
  else hud.pointer(event.clientX,event.clientY,true);
});
const endDrag=()=>{if(drag&&!drag.camera) studio?.endPaint();drag=undefined;};
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('pointerleave',()=>hud.hidePointer());
canvas.addEventListener('contextmenu',event=>{event.preventDefault();endDrag();hud.hidePointer();hud.openCommands(event.clientX,event.clientY);});
canvas.addEventListener('wheel',event=>{if(event.ctrlKey) return;event.preventDefault();settings.distance=clamp(settings.distance+event.deltaY*0.016,...PARAMETER_RANGES.distance);syncControls();},{passive:false});

function populateJournal() {
  $('#journal-count').textContent=String(observations.length);const list=$('#journal-items');list.replaceChildren();journalUrls.clear();
  if(!observations.length) {const empty=document.createElement('div');empty.className='empty-journal';empty.innerHTML=`${svg('aperture')}<p>尚未留存观测</p><small>返回视野，点击「留存」或按 C。</small>`;list.append(empty);return;}
  for(const observation of observations) {
    const card=document.createElement('article');card.className='observation';const image=document.createElement('img');image.src=observation.image;image.alt=`质量 ${observation.settings.mass.toFixed(1)} 百万太阳质量、倾角 ${Math.round(observation.settings.inclination)} 度的观测`;image.dataset.phase=String(observation.phase);image.title=`模型演化时刻 t=${observation.phase.toFixed(2)} r_s/c`;
    const details=document.createElement('div');details.className='observation-details';const date=document.createElement('span'),meta=document.createElement('span');date.textContent=new Date(observation.capturedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});meta.textContent=`${observation.settings.mass.toFixed(2)} M☉ ×10⁶ / ${Math.round(observation.settings.inclination)}°`;details.append(date,meta);
    const actions=document.createElement('div');actions.className='observation-actions';const compare=document.createElement('button');compare.textContent='与此刻对照 ↔';compare.addEventListener('click',()=>{journal.close();startComparison(observation);});
    const download=document.createElement('a');download.textContent='下载 PNG ↗';download.download=`黑洞夜班-观测-${observation.id}.png`;
    try {download.href=journalUrls.add(observation.image);}catch(error) {download.textContent='图像损坏，无法下载';download.setAttribute('aria-disabled','true');download.title=error instanceof Error?error.message:'这份本地图像未能读取。';}
    actions.append(compare,download);card.append(image,details,actions);list.append(card);
  }
}
function captureObservation():boolean {
  if(!renderer) return false;
  hud.closeCommands();
  try {const image=renderer.capture(view,clock.phase,studio?.renderStrokes,studio?.isolate);observations=appendObservation(observations,createObservation(Date.now().toString(36),view,clock.phase,Date.now(),image));populateJournal();sound.chime();
    try {localStorage.setItem(journalKey,JSON.stringify(observations));toast('这一刻已留存。打开手记，可以下载或与此刻对照。');}catch {toast('已留存在本次会话。存储空间不足，请从手记下载图像保留。',7000);}
    return true;
  } catch(error) {toast(`留存未完成：${error instanceof Error?error.message:'请重试'}`);return false;}
}
$('#capture-button').addEventListener('click',captureObservation);
$('#journal-button').addEventListener('click',()=>{hud.close();populateJournal();journal.showModal();});$('#about-button').addEventListener('click',()=>{hud.close();about.showModal();});
document.querySelectorAll<HTMLButtonElement>('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog')!.close()));
for(const dialog of [journal,about]) dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)) dialog.close();});
function startComparison(observation:Observation) {$<HTMLImageElement>('#comparison-image').src=observation.image;$('#comparison').hidden=false;$('#light-images').hidden=true;hud.setMode('observe',false);setComparisonPosition(50);toast('拖动下方分界，比较留存的光与当前光场。');}
function endComparison() {$('#comparison').hidden=true;$('#light-images').hidden=false;}
function setComparisonPosition(value:number) {$('#past-image').style.clipPath=`inset(0 ${100-value}% 0 0)`;$('#comparison-line').style.left=`${value}%`;$<HTMLInputElement>('#comparison-position').value=String(value);}
$('#comparison-position').addEventListener('input',event=>setComparisonPosition(Number((event.target as HTMLInputElement).value)));$('#close-comparison').addEventListener('click',endComparison);
function showError(message:string) {renderingFailed=true;$('#render-error').hidden=false;$('#render-error p').textContent=message;status.textContent='光场中断';status.dataset.state='error';for(const id of ['#capture-button','#journey-start','#duet-start','#journey-menu','#about-journey','#write-message','#read-message','#journey-primary','#journey-secondary','#creation-return']) $(id).setAttribute('disabled','');}
function onStudioEvent(event:StudioEvent) {
  if(event.type==='arrival') {
    const stroke=studio?.strokes.find(item=>item.id===event.signal.id);
    if(stroke&&!journey?.guided&&!journal.open&&!about.open&&!artwork.open) sound.signal('echo',stroke.pigment,event.signal);
    return;
  }
  if(event.type==='signal'&&(journal.open||about.open||artwork.open)) return;
  const previous=journey?.stage;
  try {journey?.accept(event);} catch(error) {console.error(error);showError(error instanceof Error?error.message:'光场记录中断，请重新接入。');return;}
  if(event.type==='stroke') {const stroke=studio?.strokes.find(item=>item.id===event.id);if(stroke) sound.signal('emit',stroke.pigment);}
  if(event.type==='signal'&&previous!==journey?.stage&&(journey?.stage==='found'||journey?.stage==='complete')) {
    const stroke=studio?.strokes.find(item=>item.id===event.signal.id);
    if(stroke) sound.signal(journey.stage==='complete'?'return':'echo',stroke.pigment,event.signal);
  }
}
canvas.addEventListener('renderfailure',event=>showError((event as CustomEvent<string>).detail));
syncControls();updatePause();populateJournal();
try {
  renderer=new BlackHoleRenderer(canvas);
  studio=new LightStudio(renderer,{view:()=>view,time:()=>clock.phase,paused:()=>paused,seek,readingView:prepareReadingView,notice:toast,event:onStudioEvent,hud});
  journey=new JourneyView(studio,renderer,hud,{
    begin:(intent,resume)=>{if(journal.open) journal.close();if(about.open) about.close();if(artwork.open) artwork.close();endComparison();immersive(false);settings.lightDelay=true;view.lightDelay=true;if(intent==='duet'&&!resume) {settings.inclination=58;view={...settings};}syncControls();paused=true;updatePause();hud.setMode('paint',false);hud.close();canvas.focus({preventScroll:true});},
    leave:()=>hud.setMode('observe'),
    next:()=>{studio!.cyclePigment();hud.setMode('paint',false);hud.close();canvas.focus({preventScroll:true});},
    followView:()=>{settings.inclination=VIEWPOINTS.edge.inclination;syncControls();},
    play:()=>{paused=false;updatePause();canvas.focus({preventScroll:true});},freeze:phase=>seek(phase,true),time:()=>clock.phase,paused:()=>paused,speed:()=>view.speed,view:()=>view,
    capture:()=>{if(captureObservation()) $('#journal-button').click();},
    snapshot:()=>createObservation(`moment-${Date.now().toString(36)}`,view,clock.phase,Date.now(),renderer.snapshot(view,clock.phase,studio!.renderStrokes,studio!.isolate)),
    restore:moment=>{settings={...moment.settings};view={...settings};seek(moment.phase,true);syncControls();canvas.focus({preventScroll:true});},
    result:record=>{void artwork.show(record);},readCue:pigment=>sound.signal('return',pigment),
  });
  let last=performance.now(),lastUI=0,lastStudio=0,nextFrame=0;
  document.addEventListener('visibilitychange',()=>{last=performance.now();nextFrame=0;});
  const frame=(now:number)=>{
    if(renderingFailed) return;
    if(document.hidden) {last=now;requestAnimationFrame(frame);return;}
    if(now<nextFrame) {requestAnimationFrame(frame);return;}
    nextFrame=now+FRAME_BUDGET_MS-Math.max(0,now-nextFrame)%FRAME_BUDGET_MS;
    const elapsed=Math.max(0,(now-last)/1000);last=now;const blend=1-Math.exp(-elapsed*5);
    for(const key of ['mass','inclination','azimuth','distance','accretion'] as const) {const delta=settings[key]-view[key];view[key]=Math.abs(delta)<1e-6?settings[key]:view[key]+delta*blend;}
    view.palette=settings.palette;view.lightDelay=settings.lightDelay;view.speed=settings.speed;
    const held=paused||journal.open||about.open||artwork.open;
    clock=advanceClock(clock,elapsed,view.speed,view.mass,held);
    try {
      renderer.render(view,clock.phase,studio!.renderStrokes,studio!.isolate);
      if(now-lastStudio>120) {studio!.update(view,clock.phase);journey!.update();lastStudio=now;}
    } catch(error) {console.error(error);showError(error instanceof Error?error.message:'光场绘制中断，请重新接入。');return;}
    if(now-lastUI>500) {
      $('#session-clock').textContent=`${String(Math.floor(clock.realSeconds/60)).padStart(2,'0')}:${String(Math.floor(clock.realSeconds%60)).padStart(2,'0')}`;
      status.textContent=held?'TIME HELD':'LIVE / OPTICAL LINK';
      status.dataset.state='ready';status.dataset.frames=String(renderer.frames);status.dataset.fps=String(renderer.fps);status.dataset.resolution=renderer.resolution;status.dataset.hdr=String(renderer.usesHdr);
      status.dataset.gpuMs=renderer.gpuMs.toFixed(2);status.dataset.cpuMs=renderer.cpuMs.toFixed(2);
      status.dataset.fieldLayers=String(renderer.fieldLayers);
      status.dataset.viewSettled=String((['mass','inclination','azimuth','distance','accretion'] as const).every(key=>view[key]===settings[key]));
      $('#mass-hud').textContent=view.mass.toFixed(2);$('#radius-hud').textContent=(view.distance*4.3/view.mass).toFixed(1);
      $('#azimuth-readout').textContent=`${((view.azimuth*180/Math.PI%360+360)%360).toFixed(0).padStart(3,'0')}°`;$('#attitude-readout').textContent=`${view.inclination.toFixed(0).padStart(3,'0')}°`;
      sound.update(view.accretion,view.mass);lastUI=now;
    }
    requestAnimationFrame(frame);
  };requestAnimationFrame(frame);
} catch(error) {console.error(error);showError(error instanceof Error?error.message:'光场未能初始化，请重新打开。');}
