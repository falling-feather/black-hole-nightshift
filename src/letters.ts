import type { RasterMask } from './brush.ts';

export const MAX_MESSAGE_LENGTH=8;
export function isMessageSubmit(event:Pick<KeyboardEvent,'key'|'isComposing'|'keyCode'>) {
  // IME can finish composition before its final keydown reports isComposing.
  return event.key==='Enter'&&!event.isComposing&&event.keyCode!==229;
}
export function parseMessage(input:string):{ok:true;text:string}|{ok:false;message:string} {
  const text=input.trim().replace(/\s+/gu,' ').normalize('NFC');
  if(!text) return {ok:false,message:'先写下一句想留住的话。'};
  const length=[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(text)].length;
  if(length>MAX_MESSAGE_LENGTH) return {ok:false,message:'留一句短语，最多八个字符。'};
  return {ok:true,text};
}

/** Native glyph coverage becomes a real emitting field, rather than a screen
 * label. Fonts and text remain local; no bitmap or message is fetched or sent. */
export function rasterizeMessage(text:string):RasterMask|undefined {
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  if(!context) throw new Error('此浏览器暂时无法建立文字光笔。');
  const font='500 64px "Microsoft YaHei", "PingFang SC", sans-serif';
  context.font=font;const metrics=context.measureText(text),padding=12;
  canvas.width=Math.max(1,Math.ceil(metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight)+padding*2);
  canvas.height=Math.max(1,Math.ceil(metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent)+padding*2);
  context.font=font;context.fillStyle='#fff';context.textBaseline='alphabetic';
  context.fillText(text,padding+metrics.actualBoundingBoxLeft,padding+metrics.actualBoundingBoxAscent);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
  for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) if(pixels[(y*canvas.width+x)*4+3]) {left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left) return;
  left=Math.max(0,left-2);right=Math.min(canvas.width-1,right+2);top=Math.max(0,top-2);bottom=Math.min(canvas.height-1,bottom+2);
  const width=right-left+1,height=bottom-top+1,alpha=new Uint8Array(width*height);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) alpha[y*width+x]=pixels[((top+y)*canvas.width+left+x)*4+3];
  return {width,height,alpha};
}
