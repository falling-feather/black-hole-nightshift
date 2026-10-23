import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSignals,isDiscernibleSignal } from '../src/signals.ts';
test('可辨认信号的共同门槛用于旅程、标签与声场，孤立像素及微弱噪点不制造发现',()=>{
  assert.equal(isDiscernibleSignal({strength:24,pixels:2}),true);
  assert.equal(isDiscernibleSignal({strength:23,pixels:4}),false);
  assert.equal(isDiscernibleSignal({strength:128,pixels:1}),false);
});
test('追踪来自可见信号像素，选用亮处而非空白重心，区分不同绕行像',()=>{
  const pixels=new Uint8Array(4*2*4);
  pixels.set([1,0,10,32],0);pixels.set([1,0,50,64],4);pixels.set([1,1,25,128],24);
  const uv=new Uint8Array(pixels.length);uv.set([0x60,0,0x40,0],4);uv.set([0xA0,0,0xC0,0],24);
  const signals=decodeSignals(pixels,4,2,[17],uv,{phase:42,lightDelay:true,frame:12});
  assert.equal(signals.length,2);assert.equal(signals[0].id,17);assert.equal(signals[0].crossing,0);assert.equal(signals[0].pixels,2);
  assert.ok(Math.abs(signals[0].x-0.375)<0.00002);assert.ok(Math.abs(signals[0].y-0.75)<0.00002);assert.equal(signals[1].crossing,1);assert.ok(Math.abs(signals[1].y-0.25)<0.00002);
});
test('背景、无效槽位和不可见弱信号不产生虚构追踪标签',()=>{
  assert.deepEqual(decodeSignals(new Uint8Array([0,0,255,0,2,0,255,0,1,5,255,0,1,0,2,0]),4,1,[9],new Uint8Array(16),{phase:42,lightDelay:true,frame:12}),[]);
});
test('细光丝的锁定位置使用原图峰值坐标，不落在降采样格子的中心',()=>{
  const result=decodeSignals(new Uint8Array([1,1,128,64]),1,1,[8],new Uint8Array([0xE6,0x66,0x19,0x99]),{phase:42,lightDelay:true,frame:12});
  assert.ok(Math.abs(result[0].x-0.9)<0.00002);assert.ok(Math.abs(result[0].y-0.9)<0.00002);
});
test('异步追踪保留检测帧编号、时刻与光程开关，不能套用点击时的新状态',()=>{
  const result=decodeSignals(new Uint8Array([1,1,128,64]),1,1,[8],new Uint8Array(4),{phase:17,lightDelay:false,frame:86});
  assert.equal(result[0].observedTime,17);assert.equal(result[0].delayed,false);
  assert.equal(result[0].observedFrame,86);
});
