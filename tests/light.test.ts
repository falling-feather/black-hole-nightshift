import test from 'node:test';
import assert from 'node:assert/strict';
import { createLightSample, createStroke, extendStroke, lightEnvelope, seekTime, MAX_STROKES, MAX_SAMPLES } from '../src/light.ts';

test('落笔以选中光路的发光时刻为起点，绕行像随后才收到这次发光',()=>{
  const mark=createLightSample(6,0.7,100,28,0.2);
  assert.equal(mark.peak,72);
  assert.equal(lightEnvelope(100-38-mark.peak),0);
  assert.ok(lightEnvelope(100-28-mark.peak)>0.8);
  assert.ok(lightEnvelope(110-38-mark.peak)>0.8);
  assert.equal(lightEnvelope(400-mark.peak),0);
  assert.equal(MAX_STROKES,32);
});

test('关闭光程差时在当前统一发光时刻落笔，光不会预先移动或衰减',()=>{
  const mark=createLightSample(6,0.7,100,28,0.2,false);
  assert.equal(mark.peak,100);
  assert.equal(lightEnvelope(100-mark.peak),1);
  assert.ok(createStroke(1,mark,0).field.sample(6,0.7).coverage>0.9);
});

test('时间回拨仅改变观看时刻，重复观看得到相同笔触状态',()=>{
  const mark=createLightSample(6,0.7,100,28,0.2);
  const first=lightEnvelope(105-28-mark.peak);
  assert.equal(seekTime(20,60,140),60);
  assert.equal(seekTime(160,60,140),140);
  assert.equal(seekTime(105,60,140),105);
  assert.equal(first,lightEnvelope(seekTime(105,60,140)-28-mark.peak));
});

test('一笔持续写入同一材质场，容量边界不会悄悄删除已有笔迹',()=>{
  const start=createLightSample(6,0.7,100,28,0.2),stroke=createStroke(7,start,1);
  assert.ok(extendStroke(stroke,{...start,angle:0.9,peak:80},true));
  assert.equal(stroke.samples,2);assert.equal(stroke.minPeak,72);assert.equal(stroke.maxPeak,80);
  assert.equal(stroke.anchor.angle,0.7);
  stroke.samples=MAX_SAMPLES;
  assert.equal(extendStroke(stroke,{...start,peak:90},true),false);
  assert.equal(stroke.maxPeak,80);
});

test('光脉冲在峰值之前平滑起亮，不把笔触切成瞬间开关的硬边',()=>{
  assert.equal(lightEnvelope(-4),0);
  assert.ok(lightEnvelope(-2)>0 && lightEnvelope(-2)<lightEnvelope(-1));
  assert.equal(lightEnvelope(0),1);
  assert.ok(lightEnvelope(4)<1);
});
