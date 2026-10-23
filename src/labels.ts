import { clamp } from './model.ts';
export interface SignalLabel {
  key:string;x:number;y:number;width:number;height:number;
  side:'left'|'right';priority:number;
}
export interface PlacedLabel {key:string;x:number;y:number}

/** Move text only; callers keep each marker at its measured signal pixel. */
export function placeSignalLabels(labels:readonly SignalLabel[],viewport:{width:number;height:number}):PlacedLabel[] {
  const placed:Array<PlacedLabel&{width:number;height:number}>=[];
  for(const label of [...labels].sort((a,b)=>b.priority-a.priority)) {
    const x=clamp(label.x+(label.side==='left'?-14-label.width:14),8,Math.max(8,viewport.width-label.width-8));
    const desired=label.y-label.height/2,candidates=[desired];
    for(let step=1;step<=labels.length;step++) candidates.push(desired-step*(label.height+6),desired+step*(label.height+6));
    const choices=candidates.map(y=>clamp(y,8,Math.max(8,viewport.height-label.height-8)));
    const overlap=(y:number)=>placed.reduce((sum,other)=>sum+Math.max(0,Math.min(x+label.width+4,other.x+other.width+4)-Math.max(x,other.x))*Math.max(0,Math.min(y+label.height+4,other.y+other.height+4)-Math.max(y,other.y)),0);
    const y=choices.find(y=>overlap(y)===0)??choices.reduce((best,y)=>overlap(y)<overlap(best)?y:best,choices[0]);
    placed.push({key:label.key,x,y,width:label.width,height:label.height});
  }
  return placed.map(({key,x,y})=>({key,x,y}));
}
