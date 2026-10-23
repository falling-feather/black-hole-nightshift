import test from 'node:test';
import assert from 'node:assert/strict';
import { StrokeHistory } from '../src/history.ts';
import { createStroke,createLightSample } from '../src/light.ts';
const stroke=(id:number)=>createStroke(id,createLightSample(6,id/10,40,20,0.2),id%3);
test('整笔撤销、恢复与清空按真实操作顺序回退，不丢掉整幅光场',()=>{
  const h=new StrokeHistory(),a=stroke(1),b=stroke(2);
  h.append(a);h.append(b);h.clear();assert.equal(h.items.length,0);
  h.undo();assert.deepEqual(h.items.map(s=>s.id),[1,2]);
  h.undo();assert.deepEqual(h.items.map(s=>s.id),[1]);
  h.redo();h.redo();assert.equal(h.items.length,0);
  h.undo();assert.equal(h.items[1].field,b.field);
});
test('撤销后新创作形成新分支，容量不覆盖旧笔迹',()=>{
  const h=new StrokeHistory();h.append(stroke(1));h.append(stroke(2));h.undo();h.append(stroke(3));
  assert.equal(h.canRedo,false);assert.deepEqual(h.items.map(s=>s.id),[1,3]);
  for(let id=4;id<=33;id++) assert.equal(h.append(stroke(id)),true);
  assert.equal(h.append(stroke(34)),false);assert.equal(h.items.length,32);assert.equal(h.items[0].id,1);
});
test('反复清空创作限制缓存总量，同时保留最近清空的恢复能力',()=>{
  const h=new StrokeHistory();let id=0;
  for(let generation=0;generation<4;generation++) {for(let i=0;i<32;i++) h.append(stroke(++id));h.clear();}
  assert.ok(h.retainedStrokes<=64);assert.ok(h.undo());assert.equal(h.items.length,32);assert.equal(h.items[31].id,128);
});
