import { CREATIVE_INTENTS,type ArtworkRecord } from './artwork.ts';
import { PngUrls } from './png.ts';
const q=<T extends HTMLElement>(id:string)=>document.querySelector<T>(id)!;
const imageFrom=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
  const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('观测图像未能读取，请返回光场重新取景。'));image.src=src;
});

/** The printable result uses two real scene snapshots, never a new simulation. */
export async function composeArtwork(record:ArtworkRecord):Promise<Blob> {
  const images=await Promise.all(record.moments.map(moment=>imageFrom(moment.image)));
  const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1600;
  const c=canvas.getContext('2d');if(!c) throw new Error('此浏览器暂时无法生成作品图像。');
  const intention=CREATIVE_INTENTS[record.intent];
  c.fillStyle='#080f16';c.fillRect(0,0,2400,1600);
  c.fillStyle='#94c6c7';c.font='28px "Microsoft YaHei",sans-serif';c.fillText('黑洞夜班 · 迟到的光',120,108);
  c.textAlign='right';c.fillText(intention.name,2280,108);c.textAlign='left';
  c.strokeStyle='#35525a';c.lineWidth=1;c.beginPath();c.moveTo(120,146);c.lineTo(2280,146);c.stroke();
  c.fillStyle='#e4f0e9';c.font='76px "Microsoft YaHei",sans-serif';c.fillText(record.title,120,271);
  c.fillStyle='#9ab8bd';c.font='32px "Microsoft YaHei",sans-serif';c.fillText(intention.subtitle,120,339);
  for(let i=0;i<2;i++) {
    const x=120+i*1130,top=416,width=1030,height=790,image=images[i];
    const scale=Math.min(width/image.width,height/image.height),w=image.width*scale,h=image.height*scale;
    c.drawImage(image,x+(width-w)/2,top+(height-h)/2,w,h);
    c.strokeStyle='#35525a';c.beginPath();c.moveTo(x,1240);c.lineTo(x+width,1240);c.stroke();
    c.fillStyle='#bce1d9';c.font='32px "Microsoft YaHei",sans-serif';c.fillText(`${i+1} / ${intention.moments[i]}`,x,1303);
    const moment=record.moments[i];c.fillStyle='#8ba6ad';c.font='24px "Microsoft YaHei",sans-serif';
    c.fillText(`模型时刻 ${moment.phase.toFixed(2)} r_s/c · 倾角 ${Math.round(moment.settings.inclination)}°`,x,1352);
  }
  c.fillStyle='#c5dcd7';c.font='36px "Microsoft YaHei",sans-serif';
  c.fillText(record.intent==='letter'?'你停下以后，光仍在抵达。':'把新的此刻，留在旧光的旁边。',120,1472);
  c.fillStyle='#718e98';c.font='23px "Microsoft YaHei",sans-serif';
  c.fillText(record.intent==='letter'?'同一笔光的两次实际观看。':'本轮 '+record.sourceIds.length+' 笔光的两次实际观看。',120,1538);
  c.textAlign='right';c.fillText('实时演算留帧 / 非旋转黑洞薄盘近似',2280,1538);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('作品图像未能编码，请重新生成。')),'image/png'));
}

export class ArtworkView {
  private generation=0;
  private urls=new PngUrls();
  constructor(private ready:()=>void,private onClose:()=>void) {
    q('#artwork-close').addEventListener('click',()=>this.close());
    q('#artwork-continue').addEventListener('click',()=>this.close());
    q<HTMLDialogElement>('#artwork').addEventListener('close',()=>{this.generation++;this.onClose();});
  }
  get open() {return q<HTMLDialogElement>('#artwork').open;}
  close() {q<HTMLDialogElement>('#artwork').close();}
  async show(record:ArtworkRecord) {
    const generation=++this.generation,dialog=q<HTMLDialogElement>('#artwork');
    const download=q<HTMLAnchorElement>('#artwork-download'),preview=q<HTMLImageElement>('#artwork-image');
    q('#artwork-title').textContent=record.title;q('#artwork-description').textContent=CREATIVE_INTENTS[record.intent].subtitle;
    q('#artwork-status').textContent='正在整理你实际看见的两次光。';
    download.hidden=true;download.removeAttribute('href');preview.hidden=true;
    this.urls.clear();
    if(!dialog.open) dialog.showModal();
    try {
      const png=await composeArtwork(record);if(generation!==this.generation||!dialog.open) return;
      const url=this.urls.add(png);preview.src=url;preview.hidden=false;download.href=url;
      download.download=`黑洞夜班-${record.intent==='letter'?'光信':'合奏'}-${Date.now().toString(36)}.png`;download.hidden=false;
      q('#artwork-status').textContent='作品已生成。下载 PNG 可以带走；可编辑的光场仍留在本次会话。';this.ready();
    } catch(error) {
      if(generation===this.generation&&dialog.open) q('#artwork-status').textContent=error instanceof Error?error.message:'作品生成未完成，请返回光场重新取景。';
    }
  }
}
