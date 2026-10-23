import type { Observation } from './model.ts';
export type CreativeIntent='letter'|'duet';
export const CREATIVE_INTENTS={
  letter:{name:'写给未来的信',subtitle:'同一个过去，不止一次到来。',moments:['初读','绕行后的重逢']},
  duet:{name:'与过去合奏',subtitle:'用此刻的一笔，回应先前留下的光。',moments:['留下','回应']},
} as const;
export interface ArtworkRecord {
  readonly intent:CreativeIntent;readonly title:string;
  readonly sourceIds:readonly number[];
  readonly moments:readonly [Observation,Observation];
}
const keep=(frame:Observation):Observation=>Object.freeze({...frame,settings:Object.freeze({...frame.settings})});

/** Two observed moments of one creation, not another clock or undo history. */
export class CreationDraft {
  private mode:CreativeIntent|undefined;
  private baseline=new Set<number>();private live=new Set<number>();private sources=new Set<number>();
  private first:{id:number;frame:Observation}|undefined;private meeting:Observation|undefined;
  get intent() {return this.mode;}
  get initial() {return this.first&&this.live.has(this.first.id)?this.first.frame:undefined;}
  get reunion() {return this.meeting;}
  get sourceIds() {return [...this.sources].filter(id=>this.live.has(id));}
  get hasPair() {return Boolean(this.initial)&&this.sourceIds.length>=(this.mode==='duet'?2:1);}
  get ready() {return this.hasPair&&Boolean(this.meeting);}
  begin(intent:CreativeIntent,history:readonly number[]) {
    this.mode=intent;this.baseline=new Set(history);this.live=new Set(history);this.sources.clear();this.first=undefined;this.meeting=undefined;
  }
  synchronize(history:readonly number[]) {
    this.live=new Set(history);
    if(this.mode==='letter'&&this.first&&!this.live.has(this.first.id)) {this.first=undefined;this.meeting=undefined;this.sources.clear();}
  }
  noteStroke(id:number,history:readonly number[]) {
    this.synchronize(history);if(!this.mode||!this.live.has(id)) return false;
    if(this.mode==='letter') {this.sources.clear();this.first=undefined;this.meeting=undefined;}
    else if(this.first&&!this.live.has(this.first.id)) {this.sources.clear();this.first=undefined;this.meeting=undefined;}
    if(!this.baseline.has(id)||this.mode==='letter') this.sources.add(id);
    return !this.first&&this.sources.has(id);
  }
  recordInitial(id:number,frame:Observation) {
    if(!this.live.has(id)||!this.sources.has(id)) throw new Error('起笔已经离开当前光场。');
    this.first={id,frame:keep(frame)};this.meeting=undefined;
  }
  adoptInitial(id:number,frame:Observation) {
    if(this.mode!=='duet'||!this.live.has(id)) throw new Error('这笔光不能作为当前合奏的起点。');
    this.sources.clear();this.sources.add(id);this.recordInitial(id,frame);
  }
  recordMeeting(frame:Observation) {if(this.first) this.meeting=keep(frame);}
  result(title:string):ArtworkRecord {
    if(!this.mode||!this.first||!this.meeting||!this.ready) throw new Error('先留下起笔和回应，再生成作品。');
    return {intent:this.mode,title,sourceIds:this.sourceIds,moments:[this.first.frame,this.meeting]};
  }
}
