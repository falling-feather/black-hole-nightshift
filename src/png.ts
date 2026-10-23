/** Decode persisted v1 PNGs without changing or re-rendering their bytes. */
export function pngBlob(image:string):Blob {
  const prefix='data:image/png;base64,';
  if(!image.startsWith(prefix)) throw new Error('这份记录不是 PNG 图像。');
  let binary:string;
  try {binary=atob(image.slice(prefix.length));}catch {throw new Error('这份 PNG 记录已经损坏。');}
  const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  const signature=[137,80,78,71,13,10,26,10];
  if(!signature.every((value,index)=>bytes[index]===value)) throw new Error('这份 PNG 记录已经损坏。');
  return new Blob([bytes],{type:'image/png'});
}

/** Each view owns its URLs and releases the prior set when replacing content. */
export class PngUrls {
  private urls:string[]=[];
  add(image:Blob|string) {const url=URL.createObjectURL(typeof image==='string'?pngBlob(image):image);this.urls.push(url);return url;}
  clear() {for(const url of this.urls) URL.revokeObjectURL(url);this.urls=[];}
}
