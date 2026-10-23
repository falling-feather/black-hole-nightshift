import { clamp } from './model.ts';
import { EmissionField,type LightSample,type RasterMask,type MaskPlacement } from './brush.ts';
export const MAX_STROKES=32,MAX_SAMPLES=4096;
export const LIGHT_LIFETIME=128,LIGHT_RISE=3;
export const PIGMENTS=[
  {name:'离子青',css:'#78eee8',rgb:[0.12,1.8,2.1]},
  {name:'极光紫',css:'#bb98ff',rgb:[1.05,0.22,2.2]},
  {name:'恒星金',css:'#f9c57e',rgb:[2.1,0.82,0.15]},
] as const;
export interface LetterSource {text:string;placement:Readonly<MaskPlacement>}
export interface LightStroke {id:number;pigment:number;anchor:LightSample;last:LightSample;minPeak:number;maxPeak:number;samples:number;field:EmissionField;letter?:LetterSource}
export function createLightSample(radius:number,angle:number,observerTime:number,travel:number,width:number,delayed=true):LightSample {
  return {radius,angle,peak:observerTime-(delayed?travel:0),width};
}
export function createStroke(id:number,sample:LightSample,pigment:number):LightStroke {
  const field=new EmissionField(undefined,undefined,sample.peak);field.stamp(sample);
  return assembleStroke(id,sample,pigment,field);
}
function assembleStroke(id:number,sample:LightSample,pigment:number,field:EmissionField,letter?:LetterSource):LightStroke {
  return {id,pigment,anchor:{...sample},last:{...sample},minPeak:sample.peak,maxPeak:sample.peak,samples:1,field,letter};
}
export function createMaskedStroke(id:number,mask:RasterMask,placement:MaskPlacement,peak:number,pigment:number,text:string):LightStroke|undefined {
  const field=new EmissionField(undefined,undefined,peak);field.paintMask(mask,placement,peak);
  if(field.bounds[0]===field.bounds[1]) return;
  let index=0;for(let i=1;i<mask.alpha.length;i++) if(mask.alpha[i]>mask.alpha[index]) index=i;
  const x=index%mask.width,y=Math.floor(index/mask.width);
  const sample={radius:placement.radius+(0.5-(y+0.5)/mask.height)*placement.radialSpan,
    angle:placement.angle+((x+0.5)/mask.width-0.5)*placement.angularSpan,peak,width:placement.radialSpan/mask.height};
  return assembleStroke(id,sample,pigment,field,{text,placement:{...placement}});
}
export function extendStroke(stroke:LightStroke,sample:LightSample,connect:boolean):boolean {
  if(stroke.samples>=MAX_SAMPLES) return false;
  if(connect) stroke.field.stroke(stroke.last,sample);else stroke.field.stamp(sample);
  stroke.minPeak=Math.min(stroke.minPeak,sample.peak);stroke.maxPeak=Math.max(stroke.maxPeak,sample.peak);
  stroke.last={...sample};stroke.samples++;return true;
}
export function lightEnvelope(age:number) {
  const rise=clamp((age+LIGHT_RISE)/LIGHT_RISE,0,1);
  return age<=-LIGHT_RISE || age>=LIGHT_LIFETIME?0
    :rise*rise*(3-2*rise)*Math.exp(-Math.max(0,age)/(LIGHT_LIFETIME*0.5))
      *(1-clamp((age-LIGHT_LIFETIME*0.65)/(LIGHT_LIFETIME*0.35),0,1));
}
export const seekTime=(time:number,start:number,end:number)=>clamp(time,start,end);
