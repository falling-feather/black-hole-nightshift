import { LIGHT_LIFETIME, LIGHT_RISE } from './light.ts';
export interface VisibleSignal {id:number;crossing:number;x:number;y:number;strength:number;age:number;pixels:number;observedTime:number;observedFrame:number;delayed:boolean}
export const isDiscernibleSignal=(signal:Pick<VisibleSignal,'strength'|'pixels'>)=>signal.strength>=24&&signal.pixels>=2;
/** Visible post-occlusion signal maxima, never a centroid in empty shadow. */
export function decodeSignals(bytes:Uint8Array,width:number,height:number,ids:readonly number[],coordinates:Uint8Array,observation:{phase:number;lightDelay:boolean;frame:number}):VisibleSignal[] {
  const groups=new Map<number,VisibleSignal>();
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const index=(y*width+x)*4,slot=bytes[index]-1,crossing=bytes[index+1],strength=bytes[index+2];
    if(slot<0 || slot>=ids.length || crossing>3 || strength<3) continue;
    const px=(coordinates[index]*256+coordinates[index+1])/65535,py=1-(coordinates[index+2]*256+coordinates[index+3])/65535;
    const key=slot*4+crossing,old=groups.get(key);
    if(old) {
      old.pixels++;
      if(strength<=old.strength) continue;
      old.x=px;old.y=py;old.strength=strength;
      old.age=bytes[index+3]/255*(LIGHT_LIFETIME+LIGHT_RISE)-LIGHT_RISE;
    } else groups.set(key,{id:ids[slot],crossing,x:px,y:py,strength,
      age:bytes[index+3]/255*(LIGHT_LIFETIME+LIGHT_RISE)-LIGHT_RISE,pixels:1,observedTime:observation.phase,observedFrame:observation.frame,delayed:observation.lightDelay});
  }
  return [...groups.values()];
}
