import { PanelPlacement } from './visor-layout.ts';
export type Tool='observe'|'paint'|'trace';
export type Panel='brush'|'trace'|'time'|'telemetry';
const q=<T extends HTMLElement>(id:string)=>document.querySelector<T>(id)!;
const modes:Record<Tool,[string,string,string,string]>={
  observe:['01 / OBSERVE','光所未至。','你看见的，是不同时刻的过去。','拖动环绕 · 滚轮靠近 · 右键唤出面罩'],
  paint:['02 / EMIT','给黑暗，一束光。','按住，在吸积流上留下你的光丝。','连续划过盘面 · Shift 拖动视角'],
  trace:['03 / TRACE','同一个过去，再次抵达。','点击信号或盘面，检视它走过的弯路。','可见信号标签会跟随光场 · R 回拨时序'],
};
export class VisorHud {
  mode:Tool='observe';
  private active:Panel|undefined;
  private pinned=new Set<Panel>();
  private placements=new Map<Panel,PanelPlacement>();
  private captionTimer=0;private signalTimer=0;
  constructor(private onMode:(mode:Tool)=>void,private onPanel:(panel:Panel)=>void) {
    const panelLayout=new ResizeObserver(entries=>{
      for(const entry of entries) {
        const panel=entry.target as HTMLElement;if(panel.hidden) continue;
        this.reflow(panel);
      }
    });
    q('#visor-menu-button').addEventListener('click',event=>this.toggleCommands(undefined,undefined,(event as MouseEvent).detail===0));
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>button.addEventListener('click',event=>{
      const tool=button.dataset.mode as Tool;
      if(tool===this.mode && tool!=='observe') this.toggle(tool==='paint'?'brush':'trace',(event as MouseEvent).detail===0);else this.setMode(tool,true,(event as MouseEvent).detail===0);
    }));
    document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button=>button.addEventListener('click',event=>this.toggle(button.dataset.panel as Panel,(event as MouseEvent).detail===0)));
    q('#dock').addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
      event.preventDefault();event.stopPropagation();
      const buttons=[...q('#dock').querySelectorAll<HTMLButtonElement>('button')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;
      buttons[next]?.focus();
    });
    q('#dock').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>this.closeCommands()));
    document.querySelectorAll<HTMLElement>('.holo-panel').forEach(panel=>{
      panelLayout.observe(panel);
      const name=panel.id.replace('-panel','') as Panel;
      this.placements.set(name,new PanelPlacement());
      panel.querySelector('[data-close]')!.addEventListener('click',()=>this.close(true));
      const pin=panel.querySelector<HTMLButtonElement>('[data-pin]')!;
      pin.addEventListener('click',()=>{
        if(this.pinned.has(name)) this.pinned.delete(name);else this.pinned.add(name);
        pin.setAttribute('aria-pressed',String(this.pinned.has(name)));
      });
      const handle=panel.querySelector<HTMLElement>('[data-drag]')!;
      let drag:{x:number;y:number;left:number;top:number}|undefined;
      handle.addEventListener('pointerdown',event=>{
        if(event.button!==0 || (event.target as HTMLElement).closest('button')) return;
        drag={x:event.clientX,y:event.clientY,left:panel.offsetLeft,top:panel.offsetTop};handle.setPointerCapture(event.pointerId);event.preventDefault();
      });
      handle.addEventListener('pointermove',event=>{
        if(!drag) return;
        const position=this.placements.get(name)!.move({left:drag.left+event.clientX-drag.x,top:drag.top+event.clientY-drag.y},{width:panel.offsetWidth,height:panel.offsetHeight},{width:innerWidth,height:innerHeight});
        this.position(panel,position);
      });
      handle.addEventListener('pointerup',()=>{drag=undefined;});handle.addEventListener('pointercancel',()=>{drag=undefined;});
    });
    window.addEventListener('resize',()=>{
      if(this.commandsOpen) {const r=q('#dock').getBoundingClientRect();this.openCommands(r.left+r.width/2,r.top+r.height/2);}
      if(!this.active) return;
      this.reflow(q(`#${this.active}-panel`));
    });
    this.setMode('observe');
  }
  private reflow(panel:HTMLElement) {
    const placement=this.placements.get(panel.id.replace('-panel','') as Panel)!;
    for(const property of ['left','top','right','bottom']) panel.style.removeProperty(property);
    const anchor={left:panel.offsetLeft,top:panel.offsetTop};
    const position=placement.layout(anchor,{width:panel.offsetWidth,height:panel.offsetHeight},{width:innerWidth,height:innerHeight});
    if(placement.moved||position.left!==anchor.left||position.top!==anchor.top) this.position(panel,position);
  }
  private position(panel:HTMLElement,position:{left:number;top:number}) {
    panel.style.left=`${position.left}px`;panel.style.top=`${position.top}px`;panel.style.bottom='auto';panel.style.right='auto';
  }
  setMode(mode:Tool,open=true,keyboard=false) {
    this.closeCommands();
    this.mode=mode;document.body.dataset.tool=mode;
    const [number,title,description,hint]=modes[mode];
    q('#mode-number').textContent=number;q('#mode-name').textContent=title;q('#mode-description').textContent=description;q('#gesture-hint').textContent=hint;
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
    document.body.classList.remove('caption-quiet');clearTimeout(this.captionTimer);
    this.captionTimer=window.setTimeout(()=>document.body.classList.add('caption-quiet'),mode==='observe'?8500:6500);
    if(open) {if(mode==='paint') this.open('brush',keyboard);else if(mode==='trace') this.open('trace',keyboard);else {this.close();if(keyboard) q('#visor-menu-button').focus();}}
    this.onMode(mode);
  }
  isOpen(panel:Panel) {return this.active===panel;}
  get hasPanel() {return this.active!==undefined;}
  open(panel:Panel,keyboard=false) {
    this.closeCommands();
    if(this.active!==panel) this.close();
    this.active=panel;document.body.dataset.panel=panel;q(`#${panel}-panel`).hidden=false;
    const surface=q(`#${panel}-panel`);
    this.reflow(surface);
    const target=this.trigger(panel);target?.setAttribute('aria-expanded','true');
    this.onPanel(panel);
    if(keyboard) surface.querySelector<HTMLElement>('summary,input:not(:disabled),select:not(:disabled),button:not(:disabled):not([data-pin]):not([data-close])')?.focus();
  }
  private trigger(panel:Panel) {return document.querySelector<HTMLButtonElement>(panel==='brush'?'#tool-paint':panel==='trace'?'#tool-trace':`[data-panel="${panel}"]`);}
  toggle(panel:Panel,keyboard=false) {if(this.active===panel) this.close();else this.open(panel,keyboard);}
  close(restore=false) {
    if(!this.active) return;
    const previous=this.active;q(`#${previous}-panel`).hidden=true;this.active=undefined;delete document.body.dataset.panel;
    this.trigger(previous)?.setAttribute('aria-expanded','false');
    if(restore) {if(!q('#dock').hidden) this.trigger(previous)?.focus();else q('#visor-menu-button').focus();}
  }
  get commandsOpen() {return !q('#dock').hidden;}
  openCommands(x=innerWidth/2,y=innerHeight-250,keyboard=false) {
    if(this.active && !this.pinned.has(this.active)) this.close();
    const surface=q('#dock'),diameter=Math.max(180,Math.min(326,innerWidth-28,innerHeight-180));
    surface.hidden=false;surface.style.width=`${diameter}px`;surface.style.height=`${diameter}px`;
    surface.style.left=`${Math.max(diameter/2+12,Math.min(innerWidth-diameter/2-12,x))}px`;
    surface.style.top=`${Math.max(diameter/2+88,Math.min(innerHeight-diameter/2-85,y))}px`;
    const buttons=[...surface.querySelectorAll<HTMLButtonElement>('button')];
    buttons.forEach((button,index)=>{const angle=index/buttons.length*Math.PI*2-Math.PI/2;button.style.left=`${diameter/2+Math.cos(angle)*diameter*0.335}px`;button.style.top=`${diameter/2+Math.sin(angle)*diameter*0.335}px`;});
    q('#visor-menu-button').setAttribute('aria-expanded','true');
    if(keyboard) buttons[0]?.focus();
  }
  closeCommands(restore=false) {q('#dock').hidden=true;q('#visor-menu-button').setAttribute('aria-expanded','false');if(restore) q('#visor-menu-button').focus();}
  toggleCommands(x?:number,y?:number,keyboard=false) {if(this.commandsOpen) this.closeCommands(true);else this.openCommands(x,y,keyboard);}
  outside() {this.closeCommands();if(this.active && !this.pinned.has(this.active)) this.close();}
  announce(message:string,eyebrow='SIGNAL RECEIVED',duration=7500) {
    q('#signal-eyebrow').textContent=eyebrow;q('#scene-message').textContent=message;
    q('.signal-caption').classList.add('active');clearTimeout(this.signalTimer);
    this.signalTimer=window.setTimeout(()=>q('.signal-caption').classList.remove('active'),duration);
  }
  dismissSignal() {clearTimeout(this.signalTimer);q('.signal-caption').classList.remove('active');}
  pointer(x:number,y:number,valid:boolean,label='') {
    const reticle=q('#reticle');reticle.hidden=false;reticle.style.left=`${x}px`;reticle.style.top=`${y}px`;reticle.style.opacity=valid?'1':'.45';q('#reticle-label').textContent=label;
  }
  hidePointer() {q('#reticle').hidden=true;}
}
