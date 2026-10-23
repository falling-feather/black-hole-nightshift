import test from 'node:test';
import assert from 'node:assert/strict';
import { EmissionField,atlasCapacity,type FieldLevel } from '../src/brush.ts';

function verifyFullReduction(levels:FieldLevel[]) {
  let lower=levels[0];
  for(const actual of levels.slice(1)) {
    const data=new Float32Array(actual.data.length);
    for(let y=0;y<actual.height;y++) for(let x=0;x<actual.width;x++) for(let c=0;c<2;c++) {
      const at=(dx:number,dy:number)=>lower.data[(Math.min(lower.height-1,y*2+dy)*lower.width+Math.min(lower.width-1,x*2+dx))*2+c];
      data[(y*actual.width+x)*2+c]=(at(0,0)+at(1,0)+at(0,1)+at(1,1))*0.25;
    }
    assert.deepEqual(actual.data,data,`Mip ${actual.width}×${actual.height} 与完整重建不一致`);
    lower={width:actual.width,height:actual.height,data};
  }
}

test('连续局部写入只更新覆盖区域，所有 Mip 与完整重建逐值一致',()=>{
  const field=new EmissionField();
  const samples=[
    {radius:6,angle:0.7,peak:0,width:0.2},
    {radius:6.2,angle:0.75,peak:1,width:0.2},
    {radius:6.4,angle:0.82,peak:2,width:0.18},
    {radius:8,angle:Math.PI-0.002,peak:3,width:0.2},
    {radius:8.2,angle:-Math.PI+0.005,peak:4,width:0.2},
  ];
  let previousRevision=-1;
  for(const sample of samples) {
    const before=field.levels.map(level=>level.data.slice());
    field.stamp(sample);
    const update=field.buildMips();
    assert.equal(update.fromRevision,previousRevision);
    assert.equal(update.toRevision,field.revision);
    assert.equal(update.regions.length,field.levels.length);
    assert.ok(update.regions[0].width*update.regions[0].height<field.width*field.height/8);
    field.levels.forEach((level,index)=>{
      const region=update.regions[index];
      for(let j=0;j<level.data.length;j++) if(level.data[j]!==before[index][j]) {
        const pixel=Math.floor(j/2),x=pixel%level.width,y=Math.floor(pixel/level.width);
        assert.ok(x>=region.x && x<region.x+region.width && y>=region.y && y<region.y+region.height,'更新矩形漏掉变化像素');
      }
    });
    verifyFullReduction(field.levels);
    assert.equal(field.buildMips(),update,'未变化时不再重建 Mip');
    previousRevision=field.revision;
  }
});

test('GPU 笔迹层按实际容量增长，并在大量撤销或清空后释放闲置容量',()=>{
  assert.equal(atlasCapacity(0,0),1);
  assert.equal(atlasCapacity(1,1),1);
  assert.equal(atlasCapacity(2,1),2);
  assert.equal(atlasCapacity(3,2),4);
  assert.equal(atlasCapacity(17,16),32);
  assert.equal(atlasCapacity(20,32),32);
  assert.equal(atlasCapacity(9,32),32);
  assert.equal(atlasCapacity(8,32),8);
  assert.equal(atlasCapacity(0,32),1);
});
