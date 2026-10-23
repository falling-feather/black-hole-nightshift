import { impactCoordinate, sampleRay, type RayTable, MAX_IMPACT } from './geodesics.ts';
import type { Settings } from './model.ts';

export type Vec3=[number,number,number];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const scale=(a:Vec3,s:number):Vec3=>[a[0]*s,a[1]*s,a[2]*s];
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=(a:Vec3):Vec3=>scale(a,1/Math.max(1e-12,Math.hypot(...a)));
const PI=Math.PI;
export interface Camera { position:Vec3; radial:Vec3; forward:Vec3; right:Vec3; up:Vec3; radius:number; aspect:number; focus:[number,number]; fov:number }
export interface DiscHit { position:Vec3; radius:number; angle:number; travel:number; crossing:number; path:Vec3[] }
export interface LightImage { x:number; y:number; travel:number; impact:number; crossing:number }

/** This projection also supplies the renderer's camera/focus/FOV uniforms. */
export function cameraFor(settings:Settings,width:number,height:number):Camera {
  const radius=settings.distance*4.3/settings.mass;
  const inclination=settings.inclination*PI/180;
  const radial:Vec3=[Math.sin(inclination)*Math.sin(settings.azimuth),Math.cos(inclination),Math.sin(inclination)*Math.cos(settings.azimuth)];
  const forward=scale(radial,-1),right=normalize(cross(forward,[0,1,0])),up=cross(right,forward);
  const aspect=width/height;
  return {position:scale(radial,radius),radial,forward,right,up,radius,aspect,
    focus:[0.5,0.5],fov:0.36*Math.max(1,1.05/aspect)};
}

/** Inverse of the camera's XZ heading: place an authored disc angle on its far side. */
export function azimuthForFarSide(angle:number) {
  const azimuth=PI*1.5-angle;
  return Math.atan2(Math.sin(azimuth),Math.cos(azimuth));
}

function metadataAt(table:RayTable,metadata:Float32Array,impact:number) {
  const coordinate=Math.max(0,Math.min(table.height-1,impactCoordinate(impact)*(table.height-1)));
  const row=Math.floor(coordinate),next=Math.min(table.height-1,row+1),f=coordinate-row;
  const value=(channel:number)=>metadata[row*4+channel]*(1-f)+metadata[next*4+channel]*f;
  return {phi:value(1),time:value(2),end:value(3)};
}

export function traceScreen(table:RayTable,metadata:Float32Array,camera:Camera,x:number,y:number,paths=true) {
  const sx=(x-camera.focus[0])*2*camera.aspect,sy=(1-y-camera.focus[1])*2;
  const direction=normalize(add(camera.forward,scale(add(scale(camera.right,sx),scale(camera.up,sy)),camera.fov)));
  const along=dot(direction,camera.radial);
  const transverse=normalize(add(direction,scale(camera.radial,-along)));
  const impact=camera.radius*Math.sqrt(Math.max(0,1-along*along))/Math.sqrt(1-1/camera.radius);
  const hits:DiscHit[]=[];
  if(impact>MAX_IMPACT) return {hits,impact};
  const meta=metadataAt(table,metadata,impact);
  const first=((Math.atan2(-camera.radial[1],transverse[1])+PI)%PI+PI)%PI;
  for(let crossing=0;crossing<4;crossing++) {
    const relative=first+crossing*PI,phi=relative+meta.phi;
    if(phi>=meta.end) break;
    const sample=sampleRay(table,impact,phi),radius=1/sample.u;
    if(!(sample.u>0 && sample.u<1 && radius>=3 && radius<=14.5)) continue;
    const position=scale(add(scale(camera.radial,Math.cos(relative)),scale(transverse,Math.sin(relative))),radius);
    const path:Vec3[]=[];
    for(let step=0;paths && step<=96;step++) {
      const angle=relative*step/96,s=sampleRay(table,impact,meta.phi+angle);
      if(s.u>0 && s.u<1) path.push(scale(add(scale(camera.radial,Math.cos(angle)),scale(transverse,Math.sin(angle))),1/s.u));
    }
    hits.push({position,radius,angle:Math.atan2(position[2],position[0]),travel:Math.max(0,sample.time-meta.time),crossing,path});
  }
  return {hits,impact};
}

/** Solve the same ray table in reverse, including up to the shader's four plane crossings.
 * Markers refer to the light source at its birth event, before orbital advection.
 */
export function imagesOfPoint(table:RayTable,metadata:Float32Array,camera:Camera,point:Vec3):LightImage[] {
  const sourceRadius=Math.hypot(...point),source=scale(point,1/sourceRadius);
  const cosine=Math.max(-1,Math.min(1,dot(source,camera.radial))),angle=Math.acos(cosine);
  const toward=normalize(add(source,scale(camera.radial,-cosine)));
  const images:LightImage[]=[];
  const limit=Math.min(MAX_IMPACT,camera.radius/Math.sqrt(1-1/camera.radius)*0.9999);
  for(const sign of [1,-1]) for(let winding=0;winding<2;winding++) {
    const relative=(sign===1?angle:2*PI-angle)+winding*2*PI;
    const transverse=scale(toward,sign);
    const first=((Math.atan2(-camera.radial[1],transverse[1])+PI)%PI+PI)%PI;
    const crossing=Math.round((relative-first)/PI);
    if(crossing<0 || crossing>=4) continue;
    const evaluate=(impact:number)=>{
      const meta=metadataAt(table,metadata,impact),phi=meta.phi+relative;
      if(phi>=meta.end) return Number.NaN;
      const sample=sampleRay(table,impact,phi);
      return sample.u>0 && sample.u<1?sample.u-1/sourceRadius:Number.NaN;
    };
    let previous=table.rows[0].impact,previousValue=evaluate(previous);
    for(let index=1;index<table.height;index++) {
      const current=Math.min(limit,table.rows[index].impact),value=evaluate(current);
      if(Number.isFinite(previousValue) && Number.isFinite(value) && value*previousValue<=0) {
        let low=previous,high=current,lowValue=previousValue;
        for(let i=0;i<24;i++) {
          const mid=(low+high)/2,middle=evaluate(mid);
          if(middle*lowValue>0) {low=mid;lowValue=middle;} else high=mid;
        }
        const impact=(low+high)/2;
        // A valid sign change must converge, rather than crossing an end-of-ray gap.
        if(Math.abs(evaluate(impact))<0.0001) {
          const sine=impact*Math.sqrt(1-1/camera.radius)/camera.radius;
          const direction=add(scale(camera.radial,-Math.sqrt(Math.max(0,1-sine*sine))),scale(transverse,sine));
          const forward=dot(direction,camera.forward),meta=metadataAt(table,metadata,impact);
          const x=camera.focus[0]+dot(direction,camera.right)/(forward*camera.fov*2*camera.aspect);
          const y=1-camera.focus[1]-dot(direction,camera.up)/(forward*camera.fov*2);
          const travel=sampleRay(table,impact,meta.phi+relative).time-meta.time;
          if(forward>0 && x>=0 && x<=1 && y>=0 && y<=1 && travel>0) images.push({x,y,impact,travel,crossing});
        }
      }
      previous=current;previousValue=value;
      if(current>=limit) break;
    }
  }
  return images.sort((a,b)=>a.travel-b.travel);
}
