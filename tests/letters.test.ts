import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage,isMessageSubmit } from '../src/letters.ts';
import { createMaskedStroke } from '../src/light.ts';
import { EmissionField,materialAngle,orbitRate,type RasterMask } from '../src/brush.ts';

const mask:RasterMask={width:4,height:3,alpha:new Uint8Array([0,255,255,0,0,255,0,0,0,255,255,255])};
const placement={radius:7.2,angle:-1.5,radialSpan:2,angularSpan:1.2};

test('短句按可见字符限制，保留中文、组合字符和完整 emoji，不接受空白或超长内容',()=>{
  assert.deepEqual(parseMessage('  明天  见  '),{ok:true,text:'明天 见'});
  assert.deepEqual(parseMessage('e\u0301'),{ok:true,text:'é'});
  assert.equal(parseMessage('👨‍👩‍👧‍👦').ok,true);
  assert.equal(parseMessage('        ').ok,false);
  assert.equal(parseMessage('123456789').ok,false);
});

test('输入法确认候选字的 Enter 不写入光场，普通 Enter 才提交完整短句',()=>{
  assert.equal(isMessageSubmit({key:'Enter',isComposing:true,keyCode:13}),false);
  assert.equal(isMessageSubmit({key:'Enter',isComposing:false,keyCode:229}),false);
  assert.equal(isMessageSubmit({key:'Enter',isComposing:false,keyCode:13}),true);
  assert.equal(isMessageSubmit({key:'a',isComposing:false,keyCode:65}),false);
});

test('字形覆盖率进入盘面材质，反向映射保持上下和角度方向，未写区域仍为空',()=>{
  const field=new EmissionField(512,128,20);field.paintMask(mask,placement,20);
  const topRadius=placement.radius+placement.radialSpan/3;
  const leftAngle=placement.angle-placement.angularSpan/8;
  assert.ok(field.sample(topRadius,leftAngle).coverage>0.9);
  assert.equal(field.sample(12,0).coverage,0);
  assert.equal(field.sample(topRadius,leftAngle).peak,20);
  field.buildMips();
  const mean=field.levels[0].data.filter((_,i)=>i%2===0).reduce((a,b)=>a+b,0)/(512*128);
  assert.ok(Math.abs(field.levels.at(-1)!.data[0]-mean)<1e-6);
});

test('跨角度边界的字形随同一圆轨道读取，不漂浮在屏幕上',()=>{
  const field=new EmissionField(512,128,20),p={...placement,angle:Math.PI-0.02};
  field.paintMask(mask,p,20);
  const radius=p.radius+p.radialSpan/3,angle=p.angle-p.angularSpan/8;
  const initial=field.sample(radius,angle),later=20+18;
  const movedAngle=angle+orbitRate(radius)*18;
  assert.ok(initial.coverage>0.9);
  assert.ok(Math.abs(field.sample(radius,materialAngle(radius,movedAngle,later,20)).coverage-initial.coverage)<1e-8);
});

test('文字是一笔可撤销的真实光源，空字形不占用笔迹，也不以光点替代',()=>{
  const stroke=createMaskedStroke(3,mask,placement,20,1,'明天见');
  assert.ok(stroke);assert.equal(stroke.letter?.text,'明天见');assert.deepEqual(stroke.letter?.placement,placement);assert.equal(stroke.samples,1);
  assert.equal(stroke.minPeak,20);assert.equal(stroke.maxPeak,20);
  assert.ok(stroke.field.sample(stroke.anchor.radius,stroke.anchor.angle).coverage>0.8);
  assert.equal(createMaskedStroke(4,{width:4,height:3,alpha:new Uint8Array(12)},placement,20,1,' '),undefined);
});
