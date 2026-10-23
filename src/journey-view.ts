import './journey.css';
import './creation.css';
import { JourneyFlow,type JourneyEvent,type JourneyStage } from './journey.ts';
import { CreationDraft,type CreativeIntent,type ArtworkRecord } from './artwork.ts';
import { MAX_STROKES } from './light.ts';
import type { BlackHoleRenderer } from './renderer.ts';
import type { LightStudio } from './studio.ts';
import type { VisorHud } from './hud.ts';
import type { Observation,Settings } from './model.ts';
const q=<T extends HTMLElement>(id:string)=>document.querySelector<T>(id)!;
type CreativeStage=JourneyStage|'duet-write'|'duet-answer'|'duet-ready';
type Host={begin:(intent:CreativeIntent,resume:boolean)=>void;leave:()=>void;next:()=>void;followView:()=>void;play:()=>void;freeze:(phase:number)=>void;time:()=>number;paused:()=>boolean;speed:()=>number;view:()=>Settings;capture:()=>void;snapshot:()=>Observation;restore:(frame:Observation)=>void;result:(record:ArtworkRecord)=>void;readCue:(pigment:number)=>void};
type Copy={code:string;title:string;body:string;index:number};
const copy:Record<Exclude<CreativeStage,'idle'>,Copy>={
  write:{code:'01 / A LETTER',title:'想留住的话，\n先写给黑暗。',body:'写一句短语，它会成为盘面上的光。先读清，再让它远行。',index:0},
  watch:{code:'02 / IN TRANSIT',title:'你留下的，\n正在远行。',body:'留意相同颜色从别处再次出现。找到清晰的绕行像后，观测会停住。',index:1},
  found:{code:'03 / ANOTHER ARRIVAL',title:'这也是你\n留下的那束光。',body:'弯路带来更早的盘面。回拨，重读你留下的话。',index:2},
  rewind:{code:'03 / FOLLOW THE LIGHT',title:'弯路更长，\n带回的过去更早。',body:'剖面对应你选中的发光点。可以重放比较，也可以直接回到初读时刻。',index:2},
  returning:{code:'03 / REUNION',title:'沿着相同的路，\n再看一次。',body:'这笔光没有被重写。你改变的是观看的时刻；新的成像仍然由同一光路演算。',index:2},
  complete:{code:'03 / THE LIGHT RETURNS',title:'过去再次抵达，\n你还认得它吗。',body:'回到最初可读的时刻，把初读与绕行后的重逢留在同一张作品里。',index:2},
  readback:{code:'04 / TAKE THE LETTER',title:'读信的，\n是现在的你。',body:'初读与绕行后的重逢，都可以留在同一张作品里。',index:3},
  'duet-write':{code:'01 / AN OPEN COMPOSITION',title:'先留下一笔，\n再用此刻回应。',body:'按住光带画一笔；换色后，再画下一笔回应。',index:0},
  'duet-answer':{code:'02 / AN ANSWER',title:'旧光还在走，\n你可以继续写。',body:'直接在光带上继续写。空格暂停，Shift 环绕。',index:1},
  'duet-ready':{code:'02 / PAST & PRESENT',title:'让新的此刻，\n与旧光暂时相遇。',body:'继续加笔或回拨。喜欢这一刻，就留存这段合奏。',index:2},
};

export class JourneyView {
  private flow=new JourneyFlow();
  private draft=new CreationDraft();
  private suspended=false;
  private invitationDismissed=false;
  private previousIsolate=false;
  private hintKey='';private hint:{x:number;y:number}|undefined;
  private renderKey='';
  constructor(private studio:LightStudio,private renderer:BlackHoleRenderer,private hud:VisorHud,private host:Host) {
    for(const id of ['#journey-start','#journey-menu','#about-journey']) q(id).addEventListener('click',()=>this.start('letter'));
    q('#duet-start').addEventListener('click',()=>this.start('duet'));
    q('#creation-menu').addEventListener('click',()=>{this.cancel();this.hud.close();this.invitationDismissed=false;this.refresh();});
    q('#creation-return').addEventListener('click',()=>this.start(this.draft.intent??'letter'));
    q('#journey-dismiss').addEventListener('click',()=>{this.invitationDismissed=true;this.refresh();});
    q('#journey-exit').addEventListener('click',()=>this.cancel());
    q('#journey-restart').addEventListener('click',()=>this.start(this.draft.intent??'letter',true));
    q('#journey-primary').addEventListener('click',()=>this.primary());
    q('#journey-secondary').addEventListener('click',()=>this.secondary());
    q('#journey-focus').addEventListener('click',()=>this.inspect());
    this.refresh();
  }
  get active() {return Boolean(this.draft.intent)&&!this.suspended;}
  get guided() {return this.active&&this.draft.intent==='letter';}
  get stage():CreativeStage {
    if(this.draft.intent==='duet') return this.draft.sourceIds.length>=2?'duet-ready':this.draft.sourceIds.length===1?'duet-answer':'duet-write';
    return this.flow.stage;
  }
  start(intent:CreativeIntent='letter',restart=false) {
    const resume=this.suspended&&this.draft.intent===intent&&!restart;
    if(!this.active) this.previousIsolate=this.studio.isolate;
    this.invitationDismissed=true;this.suspended=false;
    if(!resume) {this.draft.begin(intent,this.studio.strokes.map(s=>s.id));if(intent==='letter') this.flow.start();else this.flow.cancel();}
    this.host.begin(intent,resume);this.studio.showAllSignals();this.hintKey='';
    if(intent==='letter') {
      const moment=['found','rewind','complete'].includes(this.flow.stage)?this.draft.reunion:this.draft.initial;
      if(resume&&moment) {if(this.flow.strokeId!==undefined) this.studio.selectSignal(this.flow.strokeId);this.studio.setSoloView(true);this.host.restore(moment);this.studio.setSignalView(true);}
      else this.studio.setSignalView(false);
      if(this.flow.stage==='write'&&this.studio.strokes.length<MAX_STROKES) this.openLetter();
    } else {if(!resume) {q<HTMLDetailsElement>('#letter-emitter').open=false;q<HTMLDetailsElement>('#hand-emitter').open=true;}this.studio.setSignalView(false);this.hud.close();}
    this.refresh();
  }
  cancel(restoreMode=true) {
    if(!this.active) return;
    this.suspended=true;this.studio.showAllSignals();this.studio.setSignalView(this.previousIsolate);this.refresh();
    if(restoreMode) this.host.leave();
  }
  accept(event:JourneyEvent) {
    if(event.type==='history') {this.draft.synchronize(event.ids);if(this.draft.intent==='letter') {this.flow.accept(event);if(this.flow.stage==='write') this.studio.showAllSignals();}this.refresh();return;}
    if(!this.active) return;
    if(event.type==='stroke') {
      this.invitationDismissed=true;
      if(this.guided&&['readback','complete'].includes(this.flow.stage)) {this.cancel(false);return;}
      const needsInitial=this.draft.noteStroke(event.id,this.studio.strokes.map(s=>s.id));
      if(this.guided) {
        this.flow.accept(event);this.watch();
        if(needsInitial) this.draft.recordInitial(event.id,this.host.snapshot());
      } else {
        this.hud.close();
        if(needsInitial) {this.draft.recordInitial(event.id,this.host.snapshot());this.host.next();if(!matchMedia('(prefers-reduced-motion: reduce)').matches) this.host.play();}
      }
      this.refresh();return;
    }
    if(!this.guided) return;
    const changed=this.flow.accept(event);
    if(changed) {
      if(this.stage==='watch'||this.stage==='returning') this.watch();
      if((this.stage==='found'||this.stage==='complete')&&this.flow.echo) {this.host.freeze(this.flow.echo.observedTime);this.draft.recordMeeting(this.host.snapshot());}
      this.refresh();
    }
  }
  private openLetter() {
    this.hud.setMode('paint',true);q<HTMLDetailsElement>('#hand-emitter').open=false;q<HTMLDetailsElement>('#letter-emitter').open=true;
    q<HTMLInputElement>('#message').focus({preventScroll:true});
  }
  private watch() {
    if(this.flow.strokeId!==undefined) this.studio.selectSignal(this.flow.strokeId);
    this.studio.setSoloView(true);
    this.studio.setSignalView(true);this.hud.close();
    const letter=this.studio.strokes.find(s=>s.id===this.flow.strokeId)?.letter;
    if(!letter&&!matchMedia('(prefers-reduced-motion: reduce)').matches) this.host.play();
    else this.renderer.canvas.focus({preventScroll:true});
  }
  private followExisting() {
    const stroke=this.studio.strokes.findLast(s=>s.letter)??this.studio.strokes.at(-1);if(!stroke) return;
    this.draft.noteStroke(stroke.id,this.studio.strokes.map(s=>s.id));
    this.flow.follow(stroke.id,this.renderer.frames,this.host.time());
    this.studio.replay(stroke.id);if(stroke.letter) this.studio.readMessage();
    this.studio.setSignalView(true);this.studio.setSoloView(true);this.draft.recordInitial(stroke.id,this.host.snapshot());this.watch();this.refresh();
  }
  private inspect() {if(this.flow.strokeId!==undefined) this.studio.inspectVisible(this.flow.strokeId,this.flow.echo?.crossing);}
  private readback() {
    const initial=this.draft.initial,id=this.flow.strokeId;if(!initial||id===undefined) return;
    this.studio.selectSignal(id);this.studio.setSoloView(true);
    this.host.restore(initial);this.hud.close();this.flow.accept({type:'readback',id});
    this.host.readCue(this.studio.strokes.find(s=>s.id===id)!.pigment);this.refresh();
  }
  private save() {
    this.host.freeze(this.host.time());this.hud.close();
    if(this.draft.intent==='duet') this.draft.recordMeeting(this.host.snapshot());
    if(!this.draft.ready) return;
    const text=this.studio.strokes.find(s=>s.id===(this.draft.intent==='letter'?this.flow.strokeId:this.draft.sourceIds[0]))?.letter?.text;
    this.host.result(this.draft.result(this.draft.intent==='letter'?(text??'无言的光'):(text?`回应「${text}」`:'过去与此刻')));
  }
  private primary() {
    if(this.draft.intent==='duet') {
      if(this.studio.strokes.length>=MAX_STROKES&&!this.draft.hasPair) {this.host.capture();return;}
      if(this.stage==='duet-ready') this.save();
      else if(this.stage==='duet-write') this.studio.example();
      else this.host.next();
      return;
    }
    const id=this.flow.strokeId;
    switch(this.stage) {
      case 'write': if(this.studio.strokes.length>=MAX_STROKES) this.followExisting();else this.openLetter();break;
      case 'watch': if(this.host.paused()) {if(this.studio.strokes.find(s=>s.id===id)?.letter) this.host.followView();this.host.play();}else if(id!==undefined) this.studio.locateEcho(id);break;
      case 'found': case 'complete': this.readback();break;
      case 'rewind': if(id!==undefined) this.studio.replay(id);break;
      case 'returning': if(this.host.paused()) this.host.play();else this.host.freeze(this.host.time());break;
      case 'readback': this.save();break;
    }
  }
  private secondary() {
    const id=this.flow.strokeId;
    if(this.draft.intent==='duet') {
      if(this.studio.strokes.length>=MAX_STROKES&&!this.draft.hasPair) this.cancel();
      else {this.host.next();if(this.stage==='duet-ready'&&!matchMedia('(prefers-reduced-motion: reduce)').matches) this.host.play();}
      return;
    }
    switch(this.stage) {
      case 'write': if(this.studio.strokes.length>=MAX_STROKES) this.host.capture();else this.studio.example();break;
      case 'watch': if(id!==undefined) this.studio.locateEcho(id);break;
      case 'found': this.inspect();break;
      case 'rewind': case 'complete': this.readback();break;
      case 'returning': if(id!==undefined) this.studio.locateEcho(id);break;
      case 'readback': {
        const initial=this.draft.initial;if(!initial||id===undefined) break;
        this.start('duet',true);this.draft.adoptInitial(id,initial);this.host.next();
        if(!matchMedia('(prefers-reduced-motion: reduce)').matches) this.host.play();this.refresh();break;
      }
    }
  }
  private refresh() {
    const key=[this.active,this.draft.intent,this.stage,this.flow.strokeId,this.host.paused(),Math.round(this.host.speed()),this.studio.strokes.length,this.draft.sourceIds.join(','),this.draft.ready,this.invitationDismissed,this.hud.mode,this.hud.hasPanel,this.studio.ink.name].join('/');
    if(key===this.renderKey) return;this.renderKey=key;
    q('#journey-invite').hidden=this.invitationDismissed||this.active||this.hud.mode!=='observe';
    q('#journey-start strong').textContent=this.suspended&&this.draft.intent==='letter'?'继续这封光信 →':'写给未来的信 ↗';
    q('#duet-start strong').textContent=this.suspended&&this.draft.intent==='duet'?'继续自由合奏 →':'与过去合奏 ↗';
    document.body.toggleAttribute('data-invitation',!q('#journey-invite').hidden);
    q('#creation-return').hidden=!this.draft.intent||!this.suspended||this.hud.hasPanel||!q('#journey-invite').hidden;
    q('#creation-return').textContent=this.draft.intent==='duet'?'返回自由合奏 →':'返回这封光信 →';
    document.body.toggleAttribute('data-resume',!q('#creation-return').hidden);
    q('#journey').hidden=!this.active;q('#journey-focus').hidden=true;
    if(!this.active) {delete document.body.dataset.journey;delete document.body.dataset.creation;return;}
    const stage=this.stage as Exclude<CreativeStage,'idle'>,content=copy[stage];
    document.body.dataset.journey=stage;document.body.dataset.creation=this.draft.intent;
    q('#journey').dataset.stage=stage;q('#journey-code').textContent=content.code;
    q('#journey-title').textContent=content.title;q('#journey-copy').textContent=content.body;
    const letter=this.studio.strokes.find(s=>s.id===this.flow.strokeId)?.letter;
    if(stage==='watch'&&letter&&this.host.paused()) q('#journey-copy').textContent=`「${letter.text}」已成为光。\n读完，让它远行。`;
    const rail=q('#journey-progress'),duet=this.draft.intent==='duet';
    rail.style.setProperty('--progress',String(content.index/(duet?2:3)));
    rail.querySelectorAll<HTMLElement>('i').forEach((dot,index)=>{dot.hidden=duet&&index>=2;dot.dataset.active=String(duet?index<(content.index+1):index<=content.index);});
    const primary:Record<Exclude<CreativeStage,'idle'>,string>={write:this.studio.strokes.length>=MAX_STROKES?'跟随已有一笔':'写一句想留住的话 →',watch:this.host.paused()?'让这封信远行 →':'找回较晚的抵达 →',found:letter?'回拨，重读光信 ↶':'回到起笔时刻 ↶',rewind:'重放这条光路 ↶',returning:this.host.paused()?'让光继续 →':'停住这一刻',complete:'回到初读时刻 ↶',readback:'生成这封光信 →','duet-write':'试写一笔光 ↗','duet-answer':'换一种光墨 ↻','duet-ready':'留存这段合奏 →'};
    const secondary:Record<Exclude<CreativeStage,'idle'>,string>={write:this.studio.strokes.length>=MAX_STROKES?'先留存已有光场':'不写字，试一笔光',watch:'定位另一条路',found:'查看光路',rewind:'直接回拨读信',returning:'定位回声',complete:'直接回拨读信',readback:'用一笔光回应它','duet-write':'换一种光墨','duet-answer':'换一种光墨','duet-ready':'换色，继续写'};
    const full=duet&&this.studio.strokes.length>=MAX_STROKES&&!this.draft.hasPair;
    q('#journey-primary').textContent=full?'留存已有光场':primary[stage];q('#journey-secondary').textContent=full?'返回自由观测':secondary[stage];q('#journey-secondary').hidden=false;
    if(full) q('#journey-copy').textContent='32 笔光场已满。先留帧，或撤销后继续书写；已有作品不会被覆盖。';
    q('#journey-clock').textContent=this.host.paused()?'观测暂停 · 空格继续':`光场正在演化 · ${Math.round(this.host.speed())}×`;
    q('#journey-status').textContent=duet?`${this.studio.ink.name} · 本轮 ${this.draft.sourceIds.length} 笔 · Shift 拖动视角`:this.flow.strokeId!==undefined?`光信 ${String(this.flow.strokeId).padStart(2,'0')} · 单笔观看，退出恢复全场`:'写信或手绘都可以，全部笔迹会保留。';
  }
  update() {
    this.refresh();if(!this.active) return;
    const focus=q<HTMLButtonElement>('#journey-focus');focus.hidden=true;
    if(this.stage==='write'||this.stage==='duet-write') {
      const canvas=this.renderer.canvas,view=this.host.view(),key=[canvas.clientWidth,canvas.clientHeight,view.mass,view.inclination,view.azimuth,view.distance].join('/');
      if(key!==this.hintKey) {this.hintKey=key;const point=this.renderer.images(view,[6.2*Math.cos(-1.6),0,6.2*Math.sin(-1.6)])[0];this.hint=point?{x:point.x,y:point.y}:undefined;}
      if(this.hint) {focus.hidden=false;focus.disabled=true;focus.dataset.kind='hint';focus.style.left=`${this.hint.x*100}%`;focus.style.top=`${this.hint.y*100}%`;focus.setAttribute('aria-hidden','true');focus.querySelector('span')!.textContent='按住光带，拖出一笔';}
    } else if(this.stage==='found') {
      const signal=this.renderer.signals.find(s=>s.id===this.flow.strokeId&&s.crossing===this.flow.echo?.crossing);
      if(signal) {focus.hidden=false;focus.disabled=false;focus.dataset.kind='echo';focus.style.left=`${signal.x*100}%`;focus.style.top=`${signal.y*100}%`;focus.removeAttribute('aria-hidden');focus.querySelector('span')!.textContent='同一笔光的绕行像';}
    }
  }
}
