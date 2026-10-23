import { isDiscernibleSignal,type VisibleSignal } from './signals.ts';

export type JourneyStage='idle'|'write'|'watch'|'found'|'rewind'|'returning'|'complete'|'readback';
export type JourneyEvent=
  |{type:'stroke';id:number;frame:number;phase:number}
  |{type:'signal';signal:VisibleSignal}
  |{type:'inspect';id:number;crossing:number}
  |{type:'replay'|'seek';id:number;frame:number;phase:number}
  |{type:'readback';id:number}
  |{type:'history';ids:readonly number[]};

/** The guide observes the same scene as the visitor. It owns neither the clock
 * nor the artwork, and a geometric path is not evidence of a visible echo. */
export class JourneyFlow {
  private current:JourneyStage='idle';
  private tracked:{id:number;minimumFrame:number;revealPhase:number}|undefined;
  private echoSignal:VisibleSignal|undefined;
  get stage() {return this.current;}
  get active() {return this.current!=='idle';}
  get strokeId() {return this.tracked?.id;}
  get echo() {return this.echoSignal;}
  start() {this.current='write';this.tracked=undefined;this.echoSignal=undefined;}
  cancel() {this.current='idle';this.tracked=undefined;this.echoSignal=undefined;}
  follow(id:number,frame:number,phase:number) {
    if(!this.active) return;
    this.current='watch';this.tracked={id,minimumFrame:frame,revealPhase:phase+2};this.echoSignal=undefined;
  }
  accept(event:JourneyEvent) {
    if(!this.active) return false;
    const before=this.current,previousId=this.strokeId;
    if(event.type==='stroke') {
      if(this.current==='complete'||this.current==='readback') this.cancel();else this.follow(event.id,event.frame,event.phase);
    } else if(event.type==='history' && this.tracked && !event.ids.includes(this.tracked.id)) {
      this.start();
    } else if(event.type==='signal' && this.tracked) {
      const s=event.signal;
      if(s.id===this.tracked.id && s.observedFrame>=this.tracked.minimumFrame && s.observedTime>=this.tracked.revealPhase && s.crossing>0 && s.delayed && isDiscernibleSignal(s)) {
        if(this.current==='watch' || this.current==='returning') {
          this.echoSignal={...s};this.current=this.current==='watch'?'found':'complete';
        }
      }
    } else if(event.type==='readback' && ['found','rewind','complete'].includes(this.current) && event.id===this.strokeId) {
      this.current='readback';
    } else if(event.type==='inspect' && this.current==='found' && event.id===this.strokeId && event.crossing>0) {
      this.current='rewind';
    } else if(event.type==='replay' && this.current==='rewind' && event.id===this.strokeId) {
      this.tracked={id:event.id,minimumFrame:event.frame,revealPhase:event.phase+2};this.current='returning';
    } else if((event.type==='seek'||event.type==='replay') && this.tracked && event.id===this.strokeId && (this.current==='watch'||this.current==='returning')) {
      this.tracked.minimumFrame=event.frame;this.tracked.revealPhase=event.phase+(event.type==='replay'?2:0);
    }
    return before!==this.current || previousId!==this.strokeId;
  }
}
