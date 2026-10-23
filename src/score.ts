import { clamp } from './model.ts';

export type SignalCue='emit'|'echo'|'return'|'capture';
export interface SignalPosition {x:number;crossing:number;strength:number}
export interface SignalTone {frequency:number;delay:number;duration:number;gain:number;pan:number}

/** Authored musical relationships, not a conversion of vacuum into sound. */
export function phraseFor(cue:SignalCue,pigment:number,bass:number,position:SignalPosition={x:0.5,crossing:0,strength:255}):readonly SignalTone[] {
  const interval=[1,6/5,3/2][pigment];
  if(!interval||bass<=0||![bass,position.x,position.crossing,position.strength].every(Number.isFinite)) throw new RangeError('声场参数不符');
  const root=bass*8*interval,pan=clamp((position.x-0.5)*1.6,-0.8,0.8);
  const level=0.55+0.45*clamp(position.strength/255,0,1);
  const tone=(ratio:number,delay:number,duration:number,gain:number,offset=0):SignalTone=>({frequency:root*ratio,delay,duration,gain:gain*level,pan:clamp(pan+offset,-0.8,0.8)});
  switch(cue) {
    case 'emit': return [tone(1,0,1.8,0.07),tone(2,0.12,1.25,0.012,0.08)];
    case 'echo': return [tone(0.75,0,2.6+Math.min(3,Math.max(0,position.crossing))*0.2,0.07)];
    case 'return': return [tone(1,0,2.8,0.06,-0.1),tone(1.2,0.17,2.4,0.045),tone(1.5,0.34,2.1,0.035,0.1)];
    case 'capture': return [tone(1.5,0,1.5,0.045),tone(2,0.12,1.2,0.025)];
  }
}
