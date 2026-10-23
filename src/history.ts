import { MAX_STROKES,type LightStroke } from './light.ts';
type Change={before:readonly LightStroke[];after:readonly LightStroke[]};
/** Whole-gesture history. Snapshots share finished fields; retention is bounded
 * by unique stroke objects, so repeated clear/restore cannot retain unbounded maps.
 */
export class StrokeHistory {
  private current:readonly LightStroke[]=[];
  private past:Change[]=[];private future:Change[]=[];
  get items() {return this.current;}
  get canAppend() {return this.current.length<MAX_STROKES;}
  get canUndo() {return this.past.length>0;}
  get canRedo() {return this.future.length>0;}
  get retainedStrokes() {
    const fields=new Set(this.current);
    for(const change of [...this.past,...this.future]) for(const stroke of [...change.before,...change.after]) fields.add(stroke);
    return fields.size;
  }
  private commit(next:readonly LightStroke[]) {
    this.past.push({before:this.current,after:next});this.current=next;this.future=[];
    while(this.past.length>1 && (this.past.length>64 || this.retainedStrokes>MAX_STROKES*2)) this.past.shift();
  }
  append(stroke:LightStroke) {if(!this.canAppend) return false;this.commit([...this.current,stroke]);return true;}
  clear() {if(!this.current.length) return false;this.commit([]);return true;}
  undo() {const change=this.past.pop();if(!change) return false;this.future.push(change);this.current=change.before;return true;}
  redo() {const change=this.future.pop();if(!change) return false;this.past.push(change);this.current=change.after;return true;}
}
