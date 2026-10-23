import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRayTable, sampleRay, observerPhase, CRITICAL_IMPACT, OUTER_RADIUS } from '../src/geodesics.ts';

const table=buildRayTable(256,2048);

test('光子捕获临界冲量参数为 3√3/2；两侧轨迹分别落入视界和逃逸',()=>{
  assert.ok(Math.abs(CRITICAL_IMPACT-2.598076211)<1e-8);
  const below=sampleRay(table,2.5,15),above=sampleRay(table,2.8,15);
  assert.ok(below.u>=1);
  assert.ok(above.u<=0);
});

test('光路表在观测者位置连续，光行时间随接近黑洞增加',()=>{
  const near=observerPhase(table,5,20),far=observerPhase(table,5,40);
  assert.ok(near.phi>far.phi);
  assert.ok(near.time>far.time);
  assert.ok(Math.abs(sampleRay(table,5,near.phi).u-1/20)<0.0004);
});

test('弱场远离黑洞的光偏折变小，轨迹具有内外对称性',()=>{
  const row=table.rows.find(item=>item.impact>20)!;
  const closest=sampleRay(table,row.impact,row.turn);
  assert.ok(closest.u>1/OUTER_RADIUS && closest.u<0.08);
  const before=sampleRay(table,row.impact,row.turn-0.2);
  const after=sampleRay(table,row.impact,row.turn+0.2);
  assert.ok(Math.abs(before.u-after.u)<0.0002);
});

test('近径向光路的发光时间接近解析解，不能在中心放大为纹理方块',()=>{
  // Schwarzschild radial null travel from r=30 to r=14: Δt=Δr+ln((r1-1)/(r2-1)).
  // Small nonzero impact parameters differ from this radial limit by <0.01 here.
  const radial=16+Math.log(29/13);
  for(const impact of [0.05,0.1,0.3]) {
    const delay=observerPhase(table,impact,14).time-observerPhase(table,impact,30).time;
    assert.ok(Math.abs(delay-radial)<0.08,`b=${impact}: ${delay}, radial=${radial}`);
  }
});

test('相邻近中心光路的发光时间连续，不能产生棋盘状跳变',()=>{
  let previous:number|undefined;
  for(let i=0;i<=30;i++) {
    const impact=0.05+i*0.02;
    const delay=observerPhase(table,impact,14).time-observerPhase(table,impact,30).time;
    if(previous!==undefined) assert.ok(Math.abs(delay-previous)<0.1,`b=${impact}: ${previous} -> ${delay}`);
    previous=delay;
  }
});

test('出射与入射的同一半径区间具有相同的正传播时间',()=>{
  for(const threshold of [3,5,8]) {
    const row=table.rows.find(item=>item.impact>threshold)!;
    const far=observerPhase(table,row.impact,30),near=observerPhase(table,row.impact,14);
    const incoming=near.time-far.time;
    const outgoing=sampleRay(table,row.impact,2*row.turn-far.phi).time
      -sampleRay(table,row.impact,2*row.turn-near.phi).time;
    assert.ok(incoming>0 && outgoing>0);
    assert.ok(Math.abs(incoming-outgoing)<0.15,`b=${row.impact}: ${incoming} vs ${outgoing}`);
  }
});

test('角度下界在非线性坐标变换前截断，起点时间保持为零',()=>{
  const start=sampleRay(table,0.8,-0.1);
  assert.equal(start.u,1/OUTER_RADIUS);
  assert.equal(start.time,0);
});
