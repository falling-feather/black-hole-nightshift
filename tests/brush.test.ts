import test from 'node:test';
import assert from 'node:assert/strict';
import { EmissionField, materialAngle, type LightSample } from '../src/brush.ts';

const sample:LightSample={radius:6,angle:1,peak:35,width:0.22};
test('默认光丝在相邻材质网格间移动时保持峰值，不能显露网格亮暗',()=>{
  for(let i=0;i<24;i++) {
    const field=new EmissionField(),radius=6.5+i*0.005,angle=-1.5+i*0.0005;
    field.stamp({radius,angle,peak:0,width:0.2});
    assert.ok(field.sample(radius,angle).coverage>0.92,`采样位置 ${i} 的峰值损失过大`);
  }
});
test('笔迹写入随圆轨道运动的材质坐标，峰值时在原盘面位置读取',()=>{
  const field=new EmissionField(512,128,35);
  field.stamp(sample);
  const result=field.sample(6,materialAngle(6,1,35,35));
  assert.ok(result.coverage>0.8);
  assert.ok(Math.abs(result.peak-35)<0.02);
  const later=35+20,angle=1+Math.sqrt(0.5/6**3)*20;
  assert.ok(field.sample(6,materialAngle(6,angle,later,35)).coverage>0.8);
});
test('角度跨过正负π仍连续，未涂区域没有凭空发光',()=>{
  const field=new EmissionField(512,128,35);
  field.stamp({...sample,angle:Math.PI-0.005});
  assert.ok(field.sample(6,-Math.PI+0.005).coverage>0.7);
  assert.equal(field.sample(11,0).coverage,0);
});
test('连续笔迹没有按鼠标事件留下断点，mip层保留能量与加权时间',()=>{
  const field=new EmissionField(512,128,35);
  field.stroke(sample,{...sample,radius:7.5,angle:1.5,peak:39});
  for(let i=0;i<=20;i++) {
    const f=i/20,r=6+1.5*f,a=1+0.5*f,t=35+4*f;
    const value=field.sample(r,materialAngle(r,a,t,35));
    assert.ok(value.coverage>0.6,`断点 ${i}`);
    assert.ok(Math.abs(value.peak-t)<0.5);
  }
  field.buildMips();
  for(const level of field.levels) assert.ok(level.data.every(Number.isFinite));
  const mean=field.levels[0].data.filter((_,i)=>i%2===0).reduce((a,b)=>a+b,0)/(512*128);
  const last=field.levels.at(-1)!;
  assert.ok(Math.abs(last.data[0]-mean)<1e-6);
});
