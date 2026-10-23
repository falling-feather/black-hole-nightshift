export const FIELD_WIDTH=1024,FIELD_HEIGHT=256;
export const FIELD_INNER=2.5,FIELD_OUTER=15.5;
export interface LightSample {radius:number;angle:number;peak:number;width:number}
export interface FieldLevel {width:number;height:number;data:Float32Array}
export interface FieldRegion {x:number;y:number;width:number;height:number}
export interface FieldUpdate {fromRevision:number;toRevision:number;regions:readonly FieldRegion[]}
export interface RasterMask {width:number;height:number;alpha:Uint8Array}
export interface MaskPlacement {radius:number;angle:number;radialSpan:number;angularSpan:number}
export function atlasCapacity(required:number,current:number) {
  const next=2**Math.ceil(Math.log2(Math.max(1,required)));
  return required>current || required<=current/4?next:current;
}
const TAU=Math.PI*2;
const wrap=(a:number)=>((a+Math.PI)%TAU+TAU)%TAU-Math.PI;
export const orbitRate=(radius:number)=>Math.sqrt(0.5/radius**3);
export const materialAngle=(radius:number,angle:number,time:number,reference:number)=>wrap(angle-orbitRate(radius)*(time-reference));

/** A pulse painted in material coordinates. RG stores coverage and coverage ×
 * relative emission time. Mip reduction therefore preserves energy and time.
 * No floating-point texture filtering extension is required by the GPU reader.
 */
export class EmissionField {
  levels:FieldLevel[]=[];
  revision=0;
  private mipRevision=-1;
  private dirty:FieldRegion|undefined;
  private lastUpdate:FieldUpdate={fromRevision:-1,toRevision:-1,regions:[]};
  private minX=Infinity;private maxX=-Infinity;private minY=Infinity;private maxY=-Infinity;
  readonly width:number;readonly height:number;readonly reference:number;
  constructor(width=FIELD_WIDTH,height=FIELD_HEIGHT,reference=0) {
    this.width=width;this.height=height;this.reference=reference;
    for(let w=width,h=height;;w=Math.max(1,w>>1),h=Math.max(1,h>>1)) {
      this.levels.push({width:w,height:h,data:new Float32Array(w*h*2)});
      if(w===1 && h===1) break;
    }
  }
  stamp(sample:LightSample) {
    const angle=materialAngle(sample.radius,sample.angle,sample.peak,this.reference);
    const halfR=sample.width*2.7;
    const angleSize=sample.width*2.7/Math.max(sample.radius,3);
    const cx=(angle/TAU+0.5)*this.width-0.5,cy=(sample.radius-FIELD_INNER)/(FIELD_OUTER-FIELD_INNER)*this.height-0.5;
    const rx=Math.ceil(angleSize/TAU*this.width),ry=Math.ceil(halfR/(FIELD_OUTER-FIELD_INNER)*this.height);
    let minX=this.width,minY=this.height,maxX=-1,maxY=-1;
    for(let yy=Math.max(0,Math.floor(cy-ry));yy<=Math.min(this.height-1,Math.ceil(cy+ry));yy++) {
      const radius=FIELD_INNER+(yy+0.5)/this.height*(FIELD_OUTER-FIELD_INNER);
      for(let xx=Math.floor(cx-rx);xx<=Math.ceil(cx+rx);xx++) {
        const x=((xx%this.width)+this.width)%this.width;
        const phi=(x+0.5)/this.width*TAU-Math.PI;
        const q=((radius-sample.radius)**2+(sample.radius*wrap(phi-angle))**2)/(sample.width**2);
        const coverage=Math.exp(-q*3.5)*0.72+Math.exp(-q*0.65)*0.28;
        if(!this.writePixel(x,yy,coverage,sample.peak-this.reference)) continue;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);
        minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);
      }
    }
    this.commitRegion(minX,minY,maxX,maxY);
  }
  private writePixel(x:number,y:number,coverage:number,relativePeak:number) {
    const base=this.levels[0].data,index=(y*this.width+x)*2;
    if(coverage<0.001 || coverage<base[index]) return false;
    base[index]=coverage;base[index+1]=coverage*relativePeak;return true;
  }
  private commitRegion(minX:number,minY:number,maxX:number,maxY:number) {
    if(maxX>=0) {
      this.minX=Math.min(this.minX,minX);this.maxX=Math.max(this.maxX,maxX);
      this.minY=Math.min(this.minY,minY);this.maxY=Math.max(this.maxY,maxY);
      const old=this.dirty;
      if(old) {minX=Math.min(minX,old.x);minY=Math.min(minY,old.y);maxX=Math.max(maxX,old.x+old.width-1);maxY=Math.max(maxY,old.y+old.height-1);}
      this.dirty={x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};
    }
    this.revision++;
  }
  paintMask(mask:RasterMask,placement:MaskPlacement,peak:number) {
    if(!Number.isInteger(mask.width)||!Number.isInteger(mask.height)||mask.width<1||mask.height<1||mask.alpha.length!==mask.width*mask.height) throw new RangeError('字形覆盖率尺寸不符');
    if(![placement.radius,placement.angle,placement.radialSpan,placement.angularSpan,peak].every(Number.isFinite)||placement.radialSpan<=0||placement.angularSpan<=0||placement.angularSpan>TAU) throw new RangeError('字形盘面范围不符');
    const row=(radius:number)=>(radius-FIELD_INNER)/(FIELD_OUTER-FIELD_INNER)*this.height-0.5;
    const first=Math.max(0,Math.floor(row(placement.radius-placement.radialSpan/2)));
    const last=Math.min(this.height-1,Math.ceil(row(placement.radius+placement.radialSpan/2)));
    const alpha=(x:number,y:number)=>x<0||y<0||x>=mask.width||y>=mask.height?0:mask.alpha[y*mask.width+x];
    let minX=this.width,minY=this.height,maxX=-1,maxY=-1;
    for(let y=first;y<=last;y++) {
      const radius=FIELD_INNER+(y+0.5)/this.height*(FIELD_OUTER-FIELD_INNER);
      const v=0.5-(radius-placement.radius)/placement.radialSpan;if(v<0||v>1) continue;
      const py=v*mask.height-0.5,y0=Math.floor(py),fy=py-y0;
      const drift=orbitRate(radius)*(peak-this.reference);
      for(let x=0;x<this.width;x++) {
        const phi=(x+0.5)/this.width*TAU-Math.PI+drift;
        const u=wrap(phi-placement.angle)/placement.angularSpan+0.5;if(u<0||u>1) continue;
        const px=u*mask.width-0.5,x0=Math.floor(px),fx=px-x0;
        const coverage=((alpha(x0,y0)*(1-fx)+alpha(x0+1,y0)*fx)*(1-fy)+(alpha(x0,y0+1)*(1-fx)+alpha(x0+1,y0+1)*fx)*fy)/255;
        if(!this.writePixel(x,y,coverage,peak-this.reference)) continue;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      }
    }
    this.commitRegion(minX,minY,maxX,maxY);
  }
  stroke(from:LightSample,to:LightSample) {
    const delta=wrap(to.angle-from.angle);
    const length=Math.hypot(to.radius-from.radius,delta*(from.radius+to.radius)*0.5);
    const steps=Math.max(1,Math.ceil(length/(Math.min(from.width,to.width)*0.45)));
    for(let i=0;i<=steps;i++) {
      const t=i/steps;
      this.stamp({radius:from.radius+(to.radius-from.radius)*t,angle:from.angle+delta*t,
        peak:from.peak+(to.peak-from.peak)*t,width:from.width+(to.width-from.width)*t});
    }
  }
  buildMips():FieldUpdate {
    if(this.mipRevision===this.revision) return this.lastUpdate;
    const regions:FieldRegion[]=this.dirty?[this.dirty]:[];
    for(let level=1;level<this.levels.length;level++) {
      const previous=regions[level-1];if(!previous) break;
      const lower=this.levels[level-1],upper=this.levels[level];
      const x0=Math.floor(previous.x/2),y0=Math.floor(previous.y/2);
      const x1=Math.min(upper.width,Math.ceil((previous.x+previous.width)/2));
      const y1=Math.min(upper.height,Math.ceil((previous.y+previous.height)/2));
      regions.push({x:x0,y:y0,width:x1-x0,height:y1-y0});
      for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) {
        const index=(y*upper.width+x)*2;
        for(let channel=0;channel<2;channel++) {
          let sum=0;
          for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) sum+=lower.data[(Math.min(lower.height-1,y*2+dy)*lower.width+Math.min(lower.width-1,x*2+dx))*2+channel];
          upper.data[index+channel]=sum*0.25;
        }
      }
    }
    this.lastUpdate={fromRevision:this.mipRevision,toRevision:this.revision,regions};
    this.mipRevision=this.revision;
    this.dirty=undefined;
    return this.lastUpdate;
  }
  sample(radius:number,angle:number,level=0) {
    if(radius<FIELD_INNER || radius>FIELD_OUTER) return {coverage:0,peak:this.reference};
    const map=this.levels[level],x=(wrap(angle)/TAU+0.5)*map.width-0.5,y=(radius-FIELD_INNER)/(FIELD_OUTER-FIELD_INNER)*map.height-0.5;
    const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
    let coverage=0,weightedTime=0;
    for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) {
      const px=(((x0+dx)%map.width)+map.width)%map.width,py=Math.max(0,Math.min(map.height-1,y0+dy));
      const w=(dx?fx:1-fx)*(dy?fy:1-fy),index=(py*map.width+px)*2;
      coverage+=map.data[index]*w;weightedTime+=map.data[index+1]*w;
    }
    return {coverage,peak:this.reference+(coverage>1e-8?weightedTime/coverage:0)};
  }
  get bounds():[number,number,number,number] {
    if(!Number.isFinite(this.minX)) return [0,0,0,0];
    return [FIELD_INNER+this.minY/this.height*(FIELD_OUTER-FIELD_INNER),
      FIELD_INNER+(this.maxY+1)/this.height*(FIELD_OUTER-FIELD_INNER),
      ((this.minX+this.maxX+1)*0.5/this.width)*TAU-Math.PI,
      (this.maxX-this.minX+2)*0.5/this.width*TAU];
  }
}
