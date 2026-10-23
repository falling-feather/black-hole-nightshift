import type { BlackHoleRenderer } from './renderer.ts';
import { createLightSample,createStroke,createMaskedStroke,extendStroke,seekTime,LIGHT_LIFETIME,LIGHT_RISE,MAX_STROKES,PIGMENTS,type LightStroke } from './light.ts';
import { materialAngle,orbitRate,type MaskPlacement } from './brush.ts';
import { gravitationalScale,type Settings } from './model.ts';
import { cameraFor,azimuthForFarSide,type LightImage,type Vec3 } from './optics.ts';
import { isDiscernibleSignal,type VisibleSignal } from './signals.ts';
import type { VisorHud } from './hud.ts';
import { StrokeHistory } from './history.ts';
import type { JourneyEvent } from './journey.ts';
import { parseMessage,rasterizeMessage,isMessageSubmit } from './letters.ts';
import { placeSignalLabels } from './labels.ts';
const el=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
export type StudioEvent=JourneyEvent|{type:'arrival';signal:VisibleSignal};
type Controls={view:()=>Settings;time:()=>number;paused:()=>boolean;seek:(time:number,paused:boolean)=>void;readingView:(azimuth?:number)=>Settings;notice:(message:string)=>void;event:(event:StudioEvent)=>void;hud:VisorHud};
type Selection={point:Vec3;peak?:number;strokeId?:number};

export class LightStudio {
  private ledger=new StrokeHistory();
  private get history() {return this.ledger.items;}
  isolate=false;
  private pigment=0;private width=0.2;private nextId=1;
  private active:LightStroke|undefined;private connected=false;private drawing=false;
  private selection:Selection|undefined;private routes:LightImage[]=[];private routeIndex=0;
  private cameraKey='';private tracking=true;private lastTime=0;
  private solo=false;private optionKey='';
  private seen=new Set<string>();private markers=new Map<string,HTMLButtonElement>();
  get strokes():readonly LightStroke[] {return this.history;}
  get renderStrokes():readonly LightStroke[] {
    const stroke=this.solo?this.history.find(item=>item.id===this.selection?.strokeId):undefined;
    return stroke?[stroke]:this.history;
  }
  get ink() {return PIGMENTS[this.pigment];}
  constructor(private renderer:BlackHoleRenderer,private controls:Controls) {
    document.querySelectorAll<HTMLButtonElement>('[data-ink]').forEach(button=>{
      const index=Number(button.dataset.ink);button.style.setProperty('--color',PIGMENTS[index].css);
      button.addEventListener('click',()=>this.setPigment(index));
    });
    this.setPigment(0);
    el<HTMLInputElement>('#brush-width').addEventListener('input',event=>{
      this.width=Number((event.target as HTMLInputElement).value);el('#brush-width-value').textContent=`${this.width.toFixed(2)} r_s`;
      const input=event.target as HTMLInputElement;input.style.setProperty('--value',`${(this.width-0.1)/0.5*100}%`);
    });
    el('#seed-light').addEventListener('click',()=>this.example());
    const submit=()=>{try {this.writeMessage();}catch(error) {console.error(error);controls.notice(`文字写入未完成：${error instanceof Error?error.message:'请重试'}`);}};
    el('#write-message').addEventListener('click',submit);
    el('#message').addEventListener('keydown',event=>{if(isMessageSubmit(event)) {event.preventDefault();submit();}});
    el('#read-message').addEventListener('click',()=>this.readMessage());
    el('#isolate-light').addEventListener('click',()=>{
      this.setSignalView(!this.isolate);
    });
    el('#tracking-button').addEventListener('click',()=>{this.tracking=!this.tracking;el('#tracking-button').setAttribute('aria-pressed',String(this.tracking));this.clearMarkers();});
    el<HTMLSelectElement>('#signal-select').addEventListener('change',event=>{
      if(this.selectSignal(Number((event.target as HTMLSelectElement).value))) controls.hud.setMode('trace',false);
    });
    el('#solo-signal').addEventListener('click',()=>{
      this.setSoloView(!this.solo);
    });
    el('#undo-light').addEventListener('click',()=>this.undo());
    el('#redo-light').addEventListener('click',()=>this.redo());
    el('#clear-light').addEventListener('click',()=>{
      this.endPaint();if(this.ledger.clear()) this.selectLast();controls.hud.announce('信号缓存已清空。可以撤销清空，留存的观测也仍在。','FIELD CLEARED');
    });
    el<HTMLInputElement>('#light-time').addEventListener('input',event=>{
      this.endPaint();
      const [start,end]=this.bounds();controls.seek(start+(end-start)*Number((event.target as HTMLInputElement).value)/1000,true);
      this.seen.clear();this.reportSeek();this.update(controls.view(),controls.time());
    });
    for(const id of ['#replay-light','#quick-replay','#trace-replay']) el(id).addEventListener('click',()=>this.replay());
  }
  private setPigment(index:number) {
    this.pigment=index;document.documentElement.style.setProperty('--ink',PIGMENTS[index].css);
    document.querySelectorAll<HTMLButtonElement>('[data-ink]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.ink)===index)));
  }
  cyclePigment() {this.setPigment((this.pigment+1)%PIGMENTS.length);}
  private letterTravel(view:Settings,p:Readonly<MaskPlacement>) {
    let longest=-Infinity;
    for(const row of [-0.5,0,0.5]) for(const column of [-0.5,0,0.5]) {
      const radius=p.radius+row*p.radialSpan,angle=p.angle+column*p.angularSpan;
      const image=this.renderer.images(view,[radius*Math.cos(angle),0,radius*Math.sin(angle)])[0];
      if(image) longest=Math.max(longest,image.travel);
    }
    return Number.isFinite(longest)?longest:undefined;
  }
  writeMessage() {
    this.endPaint();
    if(!this.ledger.canAppend) {this.controls.notice('32 笔缓存已满。先留帧、撤销或清空，再写下一句话。');return;}
    const parsed=parseMessage(el<HTMLInputElement>('#message').value);
    if(!parsed.ok) {this.controls.notice(parsed.message);return;}
    const mask=rasterizeMessage(parsed.text);
    if(!mask) {this.controls.notice('这些字符没有产生可见字形。换一句短语试试。');return;}
    const target=this.controls.readingView(),camera=cameraFor(target,this.renderer.canvas.clientWidth,this.renderer.canvas.clientHeight);
    const radius=7.4,radialSpan=1.5+this.width*2.5;
    const placement={radius,angle:Math.atan2(camera.position[2],camera.position[0])+Math.PI,radialSpan,angularSpan:Math.max(0.24,Math.min(2.4,radialSpan*mask.width/mask.height/radius))};
    const travel=this.letterTravel(target,placement);
    if(travel===undefined) {this.controls.notice('这片字形在画幅之外。拉远视角后再试。');return;}
    const phase=this.controls.time(),stroke=createMaskedStroke(this.nextId,mask,placement,phase-(target.lightDelay?travel:0),this.pigment,parsed.text);
    if(!stroke) {this.controls.notice('这段文字没有形成可分辨的光。换一句短语试试。');return;}
    this.nextId++;this.ledger.append(stroke);this.selectStroke(stroke);this.setSignalView(true);this.controls.hud.close();
    this.controls.hud.announce('这句话已进入光场。先读清它，空格继续；回拨可以重读。',`LETTER / ${this.code(stroke.id)}`,10000);
    this.update(this.controls.view(),phase);this.controls.event({type:'stroke',id:stroke.id,frame:this.renderer.frames,phase});
  }
  readMessage() {
    this.endPaint();
    const stroke=this.history.find(item=>item.id===this.selection?.strokeId&&item.letter)??this.history.findLast(item=>item.letter);
    if(!stroke?.letter) return;
    const target=this.controls.readingView(azimuthForFarSide(stroke.letter.placement.angle));
    const travel=this.letterTravel(target,stroke.letter.placement);if(travel===undefined) {this.controls.notice('这句话目前在画幅之外。拉远后再试。');return;}
    this.selectStroke(stroke);this.setSignalView(true);
    this.controls.seek(stroke.anchor.peak+(target.lightDelay?travel:0),true);this.reportSeek();this.controls.hud.close();
    this.controls.hud.announce('回到这句话的读信时刻。痕迹没有被重写。','READ THE PAST');
  }
  setSignalView(value:boolean) {
    this.isolate=value;el('#isolate-light').setAttribute('aria-pressed',String(value));
  }
  setSoloView(value:boolean) {
    if(this.solo===value) return;
    this.solo=value;this.renderer.invalidateSignals();this.clearMarkers();this.update(this.controls.view(),this.controls.time());
  }
  showAllSignals() {this.setSoloView(false);}
  selectSignal(id:number):boolean {
    const stroke=this.history.find(item=>item.id===id);if(!stroke) return false;
    if(this.selection?.strokeId!==id) this.selectStroke(stroke);return true;
  }
  startPaint() {this.showAllSignals();this.drawing=true;this.active=undefined;this.connected=false;}
  paint(x:number,y:number) {
    if(!this.drawing) return;
    if(x<0 || x>1 || y<0 || y>1) {this.connected=false;return;}
    const view=this.controls.view(),hit=this.renderer.inspect(view,x,y,false).hits[0];
    if(!hit) {this.connected=false;return;}
    const sample=createLightSample(hit.radius,hit.angle,this.controls.time(),hit.travel,this.width,view.lightDelay);
    if(!this.active) {
      if(!this.ledger.canAppend) {this.drawing=false;this.controls.notice('32 笔缓存已满。可以留存光场后清空，或撤销后继续。');return;}
      this.active=createStroke(this.nextId++,sample,this.pigment);this.ledger.append(this.active);
      this.selectStroke(this.active);
    } else if(!extendStroke(this.active,sample,this.connected)) {
      this.drawing=false;this.controls.notice('这一笔已记录 4096 个位置。抬手后可以继续新的一笔。');return;
    }
    this.connected=true;
  }
  endPaint() {
    const stroke=this.active;this.drawing=false;this.active=undefined;this.connected=false;
    if(!stroke) return;
    this.controls.hud.announce(this.controls.paused()?'信号已写入。时间已定格；空格继续，看它如何延展。':`信号 ${this.code(stroke.id)} 已写入。光丝正在延展；留意它在别处出现的像。`,`EMISSION / ${this.code(stroke.id)}`);
    el('#quick-replay').hidden=false;this.refreshGeometry();
    this.controls.event({type:'stroke',id:stroke.id,frame:this.renderer.frames,phase:this.controls.time()});
  }
  private code(id:number) {return String(id).padStart(2,'0');}
  private selectStroke(stroke:LightStroke) {
    this.controls.hud.dismissSignal();
    this.renderer.invalidateSignals();
    const sample=stroke.anchor;
    this.selection={point:[sample.radius*Math.cos(sample.angle),0,sample.radius*Math.sin(sample.angle)],peak:sample.peak,strokeId:stroke.id};
    this.routeIndex=0;this.seen.clear();this.clearMarkers();this.refreshGeometry();
  }
  private selectLast() {
    this.controls.hud.dismissSignal();
    const last=this.history.at(-1);this.renderer.invalidateSignals();
    if(last) this.selectStroke(last);else {this.selection=undefined;this.routes=[];this.clearMarkers();this.refreshGeometry();}
    this.update(this.controls.view(),this.controls.time());
    this.controls.event({type:'history',ids:this.history.map(stroke=>stroke.id)});
  }
  example() {
    this.endPaint();
    this.showAllSignals();
    if(!this.ledger.canAppend) return;
    this.controls.hud.setMode('paint',false);
    const phase=this.controls.time(),view=this.controls.view();let stroke:LightStroke|undefined;
    for(let i=0;i<=18;i++) {
      const t=i/18,radius=5.5+2.1*t,angle=-1.88+t*0.64;
      const point:Vec3=[radius*Math.cos(angle),0,radius*Math.sin(angle)],images=this.renderer.images(view,point);
      if(!images.length) continue;
      const sample=createLightSample(radius,angle,phase,images[0].travel,this.width,view.lightDelay);
      if(!stroke) {stroke=createStroke(this.nextId++,sample,this.pigment);this.ledger.append(stroke);}
      else extendStroke(stroke,sample,true);
    }
    if(!stroke) {this.controls.notice('此视角下示例信号在画幅外。拉远后重试，或直接在可见盘面书写。');return;}
    this.selectStroke(stroke);el('#quick-replay').hidden=false;
    this.controls.hud.announce('一束光丝已写在远侧盘面。现在可以关闭浮窗，观察它如何流动。',`EMISSION / ${this.code(stroke.id)}`);
    this.update(view,phase);
    this.controls.event({type:'stroke',id:stroke.id,frame:this.renderer.frames,phase});
  }
  inspect(x:number,y:number,signal?:VisibleSignal) {
    const view=this.controls.view(),hit=this.renderer.inspect(view,x,y).hits.find(item=>!signal || item.crossing===signal.crossing);
    if(!hit) {this.controls.notice('这条视线没有可分辨的发光盘面。放大后选择光带，或选取另一处信号。');return false;}
    const stroke=signal?this.history.find(item=>item.id===signal.id):undefined;
    if(stroke) {
      const emission=signal!.observedTime-hit.travel*(signal!.delayed?1:0);
      const field=stroke.field.sample(hit.radius,materialAngle(hit.radius,hit.angle,emission,stroke.field.reference));
      const peak=field.coverage>0.001?field.peak:emission-signal!.age;
      const angle=hit.angle-orbitRate(hit.radius)*(emission-peak);
      this.selection={point:[hit.radius*Math.cos(angle),0,hit.radius*Math.sin(angle)],peak,strokeId:stroke.id};
    } else {this.selection={point:hit.position};this.solo=false;this.renderer.invalidateSignals();}
    this.routeIndex=0;this.refreshGeometry();
    if(signal) {
      let distance=Infinity;
      this.routes.forEach((route,index)=>{const d=(route.x-signal.x)**2+(route.y-signal.y)**2;if(route.crossing===signal.crossing&&d<distance) {distance=d;this.routeIndex=index;}});
      this.drawPath();
    }
    this.controls.hud.setMode('trace',false);this.controls.hud.open('trace');
    el<HTMLDetailsElement>('#trace-geometry').open=true;
    if(stroke && signal) this.controls.event({type:'inspect',id:stroke.id,crossing:signal.crossing});
    return true;
  }
  inspectVisible(id:number,crossing?:number) {
    const signals=this.renderer.signals.filter(signal=>signal.id===id && signal.crossing>0);
    const signal=signals.find(item=>item.crossing===crossing)??signals[0];
    if(!signal) {this.controls.notice('此刻没有锁定这笔光的绕行像。可以继续演化，或定位较晚的抵达。');return false;}
    return this.inspect(signal.x,signal.y,signal);
  }
  locateEcho(id:number) {
    const stroke=this.history.find(item=>item.id===id);if(!stroke) return;
    this.selectStroke(stroke);this.setSignalView(true);this.controls.hud.close();
    const index=this.routes.findIndex(route=>route.crossing>0);
    if(index>=0) this.selectRoute(index);else this.controls.notice('这个位置的绕行像在画幅之外。改变视角，或试写另一束光。');
  }
  refreshGeometry() {
    this.routes=this.selection?this.renderer.images(this.controls.view(),this.selection.point):[];
    this.routeIndex=Math.min(this.routeIndex,Math.max(0,this.routes.length-1));
    const options=el('#route-options');
    while(options.children.length>this.routes.length) options.lastElementChild!.remove();
    const seconds=gravitationalScale(this.controls.view().mass).crossingSeconds;
    this.routes.forEach((route,index)=>{
      let button=options.children[index] as HTMLButtonElement|undefined;
      if(!button) {button=document.createElement('button');button.className='route-option';button.append(document.createElement('span'),document.createElement('small'));button.addEventListener('click',()=>{this.selectRoute(index);el<HTMLDetailsElement>('#trace-geometry').open=true;});options.append(button);}
      button.children[0].textContent=`光路 ${this.code(index+1)}`;
      button.children[1].textContent=`+${((route.travel-this.routes[0].travel)*seconds).toFixed(0)} s`;
      button.title=this.selection?.peak!==undefined?'查看此光路并停在发光波峰抵达时刻':'查看此处发光点的计算路径';
    });
    el('#light-reading').textContent=this.selection
      ?`${this.selection.strokeId?`信号 ${this.code(this.selection.strokeId)} 的波峰事件`:'所选盘面发光点'} · ${this.routes.length} 条画幅内的几何光路。`
      :'点击盘面或信号标签，检视同一发光点的不同光路。';
    const point=this.selection?.point;
    el('#source-reading').textContent=point?`${this.selection?.peak===undefined?'盘面':'波峰发光'}位置 · r ${Math.hypot(point[0],point[2]).toFixed(2)} r_s / φ ${(Math.atan2(point[2],point[0])*180/Math.PI).toFixed(1)}°`:'等待发光位置';
    const selected=this.history.find(stroke=>stroke.id===this.selection?.strokeId);
    if(selected) el('#trace-panel').style.setProperty('--ink',PIGMENTS[selected.pigment].css);else el('#trace-panel').style.removeProperty('--ink');
    this.drawPath();
  }
  private selectRoute(index:number) {
    if(!this.routes[index]) return;
    this.routeIndex=index;
    if(this.selection?.peak!==undefined) {
      this.controls.seek(this.selection.peak+(this.controls.view().lightDelay?this.routes[index].travel:0)+0.1,true);this.seen.clear();
      this.reportSeek();
    }
    this.drawPath();this.update(this.controls.view(),this.controls.time());
  }
  private drawPath() {
    const route=this.routes[this.routeIndex],point=this.selection?.point;
    document.querySelectorAll('.route-option').forEach((button,index)=>button.setAttribute('aria-pressed',String(index===this.routeIndex)));
    const diagram=document.querySelector<SVGSVGElement>('#ray-diagram')!;
    if(!route || !point) {diagram.innerHTML='<circle class="diagram-guide" cx="150" cy="85" r="45"/><circle class="diagram-horizon" cx="150" cy="85" r="12"/><text x="150" y="154" text-anchor="middle">等待选定光路</text>';el('#route-stats strong').textContent='等待选定光路';return;}
    const view=this.controls.view(),canvas=this.renderer.canvas,camera=cameraFor(view,canvas.clientWidth,canvas.clientHeight);
    const hit=this.renderer.inspect(view,route.x,route.y).hits.find(item=>item.crossing===route.crossing);if(!hit) return;
    const dot=(a:Vec3,b:Vec3)=>a.reduce((sum,v,i)=>sum+v*b[i],0),along=dot(point,camera.radial);
    const tangent=point.map((v,i)=>v-along*camera.radial[i]) as Vec3;
    const size=Math.hypot(...tangent),side=tangent.map(v=>v/Math.max(1e-8,size)) as Vec3;
    const near=Math.max(8,hit.radius*1.2),scale=124/near;
    const project=(p:Vec3)=>[150+dot(p,camera.radial)*scale,86-dot(p,side)*scale];
    const coordinates=hit.path.map(project),source=coordinates.at(-1)!;
    diagram.innerHTML=`<defs><clipPath id="ray-near-field"><rect x="1" y="5" width="298" height="140"/></clipPath></defs><line class="diagram-straight" x1="${coordinates[0][0]}" y1="${coordinates[0][1]}" x2="${source[0]}" y2="${source[1]}" clip-path="url(#ray-near-field)"/><circle class="diagram-guide" cx="150" cy="86" r="${scale*1.5}"/><circle class="diagram-horizon" cx="150" cy="86" r="${scale}"/><polyline class="diagram-path" points="${coordinates.map(p=>p.map(v=>v.toFixed(2)).join(',')).join(' ')}" clip-path="url(#ray-near-field)"/><circle class="diagram-source" cx="${source[0]}" cy="${source[1]}" r="3"/><text x="${source[0]}" y="${source[1]-10}" text-anchor="middle">发光点</text><text x="292" y="105" text-anchor="end">→ 观察者</text><text x="150" y="160" text-anchor="middle">近场剖面 ±${near.toFixed(1)} r_s</text>`;
    el('#route-stats strong').textContent=`${(route.travel*gravitationalScale(view.mass).crossingSeconds/60).toFixed(1)} min`;
  }
  private bounds():[number,number] {
    if(!this.history.length) return [this.controls.time(),this.controls.time()+120];
    const radius=this.controls.view().distance*4.3/this.controls.view().mass;
    return [Math.min(...this.history.map(stroke=>stroke.minPeak))-LIGHT_RISE-4,
      Math.max(...this.history.map(stroke=>stroke.maxPeak))+Math.max(radius+100,...this.routes.map(route=>route.travel))+LIGHT_LIFETIME+12];
  }
  undo() {this.endPaint();if(this.ledger.undo()) this.selectLast();}
  redo() {this.endPaint();if(this.ledger.redo()) this.selectLast();}
  private reportSeek() {if(this.selection?.strokeId) this.controls.event({type:'seek',id:this.selection.strokeId,frame:this.renderer.frames,phase:this.controls.time()});}
  scrubBy(delta:number) {this.endPaint();if(!this.history.length) return;const [start,end]=this.bounds();this.controls.seek(seekTime(this.controls.time()+delta,start,end),true);this.seen.clear();this.reportSeek();}
  replay(id?:number) {
    this.endPaint();
    const stroke=id===undefined?(this.history.find(item=>item.id===this.selection?.strokeId)??this.history.at(-1)):this.history.find(item=>item.id===id);if(!stroke) return;
    if(this.selection?.strokeId!==stroke.id || this.selection.peak===undefined) this.selectStroke(stroke);
    else {this.routeIndex=0;this.seen.clear();this.clearMarkers();this.renderer.invalidateSignals();this.refreshGeometry();}
    this.controls.seek(this.selection!.peak!+(this.controls.view().lightDelay?(this.routes[0]?.travel??0):0)-LIGHT_RISE-0.3,false);
    this.controls.hud.announce(`回看信号 ${this.code(stroke.id)}。相同的发光，再次沿不同光路抵达。`,'TEMPORAL REPLAY');
    this.controls.event({type:'replay',id:stroke.id,frame:this.renderer.frames,phase:this.controls.time()});
  }
  private markerLayoutKey='';
  private clearMarkers() {for(const marker of this.markers.values()) marker.remove();this.markers.clear();this.markerLayoutKey='';}
  private updateMarkers() {
    const id=this.selection?.strokeId??this.history.at(-1)?.id;
    const stroke=this.history.find(item=>item.id===id);
    if(!stroke) {this.clearMarkers();return;}
    const observed=this.renderer.signals.filter(signal=>signal.id===id),alive=new Set<string>();
    for(const signal of observed) this.controls.event({type:'signal',signal});
    if(!this.tracking) {this.clearMarkers();return;}
    const signals=observed.filter(isDiscernibleSignal);
    const key=[this.renderer.canvas.clientWidth,this.renderer.canvas.clientHeight,stroke.pigment,...signals.map(s=>[s.id,s.crossing,s.x,s.y,s.strength,s.observedFrame].join(','))].join('/');
    if(key===this.markerLayoutKey) return;this.markerLayoutKey=key;
    for(const signal of signals) {
      const key=`${signal.id}/${signal.crossing}`;alive.add(key);
      let marker=this.markers.get(key);
      if(!marker) {
        marker=document.createElement('button');marker.className=`signal-marker${signal.crossing?' echo':''}`;
        const label=document.createElement('span'),code=document.createElement('b'),kind=document.createElement('small');code.textContent=this.code(signal.id);kind.textContent=signal.crossing?`绕行像 ${signal.crossing}`:'主像';label.append(code,kind);marker.append(label);
        const leader=document.createElementNS('http://www.w3.org/2000/svg','svg');leader.setAttribute('aria-hidden','true');leader.append(document.createElementNS('http://www.w3.org/2000/svg','line'));marker.append(leader);
        marker.style.setProperty('--color',PIGMENTS[stroke.pigment].css);marker.setAttribute('aria-label',`追踪信号 ${signal.id} 的${signal.crossing?`绕行像 ${signal.crossing}`:'主像'}`);
        this.markers.set(key,marker);el('#light-images').append(marker);
      }
      marker.onclick=()=>this.inspect(signal.x,signal.y,signal);
      marker.style.left=`${signal.x*100}%`;marker.style.top=`${signal.y*100}%`;
      if(marker.dataset.strength!==String(signal.strength)) marker.dataset.strength=String(signal.strength);
      if(marker.dataset.observedTime!==String(signal.observedTime)) marker.dataset.observedTime=String(signal.observedTime);
      if(!this.seen.has(key)) {
        this.seen.add(key);
        if(signal.crossing) this.controls.event({type:'arrival',signal});
        if(signal.crossing) this.controls.hud.announce(this.controls.paused()?`此刻可见信号 ${this.code(signal.id)} 的绕行像。可以回拨比较它与主像。`:`识别到信号 ${this.code(signal.id)} 的绕行像。相同的光，从另一条路径显影。`,`LENSED SIGNAL / ${this.code(signal.id)}`);
      }
    }
    for(const [key,marker] of this.markers) if(!alive.has(key)) {marker.remove();this.markers.delete(key);}
    this.layoutMarkers(signals);
  }
  private layoutMarkers(signals:readonly VisibleSignal[]) {
    const entries=signals.map(signal=>{
      const key=`${signal.id}/${signal.crossing}`,marker=this.markers.get(key)!;
      const label=marker.querySelector('span')!,anchor=marker.getBoundingClientRect(),rect=label.getBoundingClientRect();
      return {key,marker,label,anchor,x:anchor.x+anchor.width/2,y:anchor.y+anchor.height/2,width:rect.width,height:rect.height,side:signal.crossing?'left' as const:'right' as const,priority:signal.strength};
    });
    const positions=placeSignalLabels(entries,{width:this.renderer.canvas.clientWidth,height:this.renderer.canvas.clientHeight});
    for(const position of positions) {
      const entry=entries.find(item=>item.key===position.key)!;
      entry.label.style.right='auto';entry.label.style.left=`${position.x-entry.anchor.x}px`;entry.label.style.top=`${position.y-entry.anchor.y}px`;
      const leader=entry.marker.querySelector('svg')!,line=leader.querySelector('line')!;
      leader.setAttribute('viewBox',`0 0 ${entry.anchor.width} ${entry.anchor.height}`);
      line.setAttribute('x1',String(entry.anchor.width/2));line.setAttribute('y1',String(entry.anchor.height/2));
      line.setAttribute('x2',String(Math.max(position.x,Math.min(position.x+entry.width,entry.x))-entry.anchor.x));line.setAttribute('y2',String(position.y+entry.height/2-entry.anchor.y));
      leader.style.visibility=Math.abs(position.y-entry.y+entry.height/2)>5?'visible':'hidden';
    }
  }
  update(view:Settings,time:number) {
    if(time<this.lastTime-0.1) this.seen.clear();this.lastTime=time;
    const canvas=this.renderer.canvas,key=[view.mass,view.inclination,view.azimuth,view.distance,canvas.clientWidth,canvas.clientHeight].join('/');
    if(key!==this.cameraKey) {this.cameraKey=key;if(this.controls.hud.isOpen('trace') && this.selection) this.refreshGeometry();}
    const has=this.history.length>0;
    const optionKey=this.history.map(stroke=>stroke.id).join('/');
    const select=el<HTMLSelectElement>('#signal-select');
    if(optionKey!==this.optionKey) {
      this.optionKey=optionKey;select.replaceChildren();
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='选择自己的信号';select.append(placeholder);
      for(const stroke of this.history) {const option=document.createElement('option');option.value=String(stroke.id);option.textContent=`信号 ${this.code(stroke.id)} · ${stroke.letter?`「${stroke.letter.text}」`:PIGMENTS[stroke.pigment].name}`;select.append(option);}
    }
    select.disabled=!has;select.value=this.selection?.strokeId?String(this.selection.strokeId):'';
    el<HTMLButtonElement>('#solo-signal').disabled=!this.selection?.strokeId;
    el<HTMLButtonElement>('#trace-replay').disabled=!this.selection?.strokeId;
    el('#solo-signal').setAttribute('aria-pressed',String(this.solo));
    el('#mark-count').textContent=`${this.code(this.history.length)} / ${MAX_STROKES} 笔`;
    el('#signal-count-hud').textContent=this.code(this.history.length);
    for(const selector of ['#clear-light','#replay-light','#light-time']) (el(selector) as HTMLButtonElement).disabled=!has;
    el<HTMLButtonElement>('#undo-light').disabled=!this.ledger.canUndo;el<HTMLButtonElement>('#redo-light').disabled=!this.ledger.canRedo;
    el<HTMLButtonElement>('#seed-light').disabled=!this.ledger.canAppend;el('#quick-replay').hidden=!has;
    el<HTMLButtonElement>('#write-message').disabled=!this.ledger.canAppend;
    el<HTMLButtonElement>('#read-message').disabled=!this.history.some(stroke=>stroke.letter);
    const [start,end]=this.bounds(),seconds=gravitationalScale(view.mass).crossingSeconds;
    el<HTMLInputElement>('#light-time').value=String(1000*(Math.max(start,Math.min(end,time))-start)/(end-start));
    el('#time-reading').textContent=has?`t +${((time-start)*seconds/60).toFixed(1)} min`:'等待信号';
    if(this.controls.hud.isOpen('time')) {
      const events=el('#time-events');events.replaceChildren();
      if(this.selection?.peak!==undefined) {
        const peak=this.selection.peak,ticks=[{time:peak,label:'写入',type:'birth'},...this.routes.map((route,i)=>({time:peak+route.travel,label:this.code(i+1),type:'arrival'}))];
        for(const tick of ticks) {const marker=document.createElement('span');marker.className=`time-event ${tick.type}`;marker.style.left=`${100*(tick.time-start)/(end-start)}%`;marker.textContent=tick.label;events.append(marker);}
      }
      el('#time-caption').textContent=!view.lightDelay?'同时发光对照：选择光路停在共同发光时刻，刻度仍显示几何传播时间。':has?'拖动回拨，重看光丝如何延展、剪切和绕行。刻度对应所选波峰事件。':'落笔后，可以回到同一时刻，重新看见自己的光。';
    }
    this.updateMarkers();
  }
}
