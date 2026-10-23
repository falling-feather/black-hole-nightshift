import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveResolution } from '../src/quality.ts';

test('持续 GPU 压力才逐步降低采样，保留画质下限，避免一次抖动反复分配画面缓冲',()=>{
  const quality=new AdaptiveResolution();
  assert.equal(quality.suggest(1,{gpuMs:16.6,fps:41}),1);
  const next=quality.suggest(1,{gpuMs:16.6,fps:41});assert.ok(next<1&&next>=0.93-1e-9);
  let scale=next;for(let i=0;i<20;i++) scale=quality.suggest(scale,{gpuMs:40,fps:20});
  assert.equal(scale,0.8);
});
test('浏览器或 CPU 调度导致的低帧率，不把足够快的 GPU 画面缩成模糊图',()=>{
  const quality=new AdaptiveResolution();let scale=1;
  for(let i=0;i<10;i++) scale=quality.suggest(scale,{gpuMs:2,fps:24});assert.equal(scale,1);
  assert.equal(quality.suggest(1,{gpuMs:17,fps:35}),1);assert.equal(quality.suggest(1,{gpuMs:6,fps:48}),1);
  assert.equal(quality.suggest(1,{gpuMs:17,fps:35}),1);
});
test('恢复画质需要更长的稳定余量；缺失计时、暂停与重置不沿用旧压力',()=>{
  const quality=new AdaptiveResolution();let scale=0.9;
  for(let i=0;i<3;i++) assert.equal(quality.suggest(scale,{gpuMs:6,fps:60}),scale);
  scale=quality.suggest(scale,{gpuMs:6,fps:60});assert.ok(scale>0.9&&scale<=0.935+1e-9);
  quality.reset();assert.equal(quality.suggest(1,{gpuMs:0,fps:20}),1);
  assert.ok(quality.suggest(1,{gpuMs:0,fps:20})<1);
  quality.reset();quality.suggest(1,{gpuMs:17,fps:30});quality.suggest(1,{gpuMs:17,fps:0});
  assert.equal(quality.suggest(1,{gpuMs:17,fps:30}),1);
  assert.equal(quality.suggest(1,{gpuMs:NaN,fps:30}),1);
});
