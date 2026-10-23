import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRayTable, observerMetadata } from '../src/geodesics.ts';
import { DEFAULT_SETTINGS } from '../src/model.ts';
import { cameraFor, traceScreen, imagesOfPoint,azimuthForFarSide } from '../src/optics.ts';

const table=buildRayTable();
const camera=cameraFor(DEFAULT_SETTINGS,1440,900);
const metadata=observerMetadata(table,camera.radius);

test('读信视角把指定盘面角放在远侧，逆变换和相机定义保持一致',()=>{
  for(const angle of [-3,-1.5,0,2,Math.PI+0.1]) {
    const reading=cameraFor({...DEFAULT_SETTINGS,azimuth:azimuthForFarSide(angle),inclination:32},1440,900);
    const length=Math.hypot(reading.radial[0],reading.radial[2]);
    const facing=(reading.radial[0]*Math.cos(angle)+reading.radial[2]*Math.sin(angle))/length;
    assert.ok(Math.abs(facing+1)<1e-12);
  }
});

test('盘面拾取与同一光路反求的成像位置和传播时间一致',()=>{
  let checked=0;
  for(const [x,y] of [[0.35,0.52],[0.6,0.55],[0.5,0.38],[0.45,0.6]]) {
    const hit=traceScreen(table,metadata,camera,x,y).hits[0];
    if(!hit) continue;
    const images=imagesOfPoint(table,metadata,camera,hit.position);
    const closest=images.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
    assert.ok(closest,'拾取到的点必须有对应图像');
    assert.ok(Math.hypot(closest.x-x,closest.y-y)<0.001,`${x},${y}: ${closest.x},${closest.y}`);
    assert.ok(Math.abs(closest.travel-hit.travel)<0.1);
    checked++;
  }
  assert.ok(checked>=2);
});

test('同一个远侧光源产生不同位置和传播时间的多个像，光路剖面始终有限',()=>{
  const images=imagesOfPoint(table,metadata,camera,[0,0,-6]);
  assert.ok(images.length>=2,`实际成像 ${images.length}`);
  assert.ok(images[1].travel>images[0].travel);
  for(const image of images) {
    const trace=traceScreen(table,metadata,camera,image.x,image.y);
    const hit=trace.hits.find(item=>Math.hypot(item.position[0],item.position[2]+6)<0.06);
    assert.ok(hit,'每个反求像均能追溯至同一光源');
    assert.ok(hit.path.length>8);
    assert.ok(hit.path.every(point=>point.every(Number.isFinite)));
    assert.ok(hit.travel>0);
  }
});

test('阴影中心不会误拾取一个可见盘面点；窄屏投影也可以往返',()=>{
  assert.equal(traceScreen(table,metadata,camera,camera.focus[0],1-camera.focus[1]).hits.length,0);
  const narrow=cameraFor(DEFAULT_SETTINGS,390,844);
  const image=imagesOfPoint(table,metadata,narrow,[0,0,-6])[0];
  assert.ok(image && Number.isFinite(image.x));
  const hit=traceScreen(table,metadata,narrow,image.x,image.y).hits
    .find(item=>Math.hypot(item.position[0],item.position[2]+6)<0.06);
  assert.ok(hit);
});

test('质量、倾角与距离边界下反求图像均保持有限并对应同一发光点',()=>{
  for(const changes of [{mass:2,distance:48},{mass:8.6,distance:22},{inclination:2},{inclination:86},{inclination:125},{inclination:178},{azimuth:1.8}]) {
    const altered=cameraFor({...DEFAULT_SETTINGS,...changes},1440,900);
    const meta=observerMetadata(table,altered.radius),point:[number,number,number]=[0,0,-6];
    const images=imagesOfPoint(table,meta,altered,point);
    assert.ok(images.length>=1 && images.length<=4,JSON.stringify(changes));
    for(const image of images) {
      assert.ok([image.x,image.y,image.travel].every(Number.isFinite));
      const hit=traceScreen(table,meta,altered,image.x,image.y).hits.find(item=>item.crossing===image.crossing);
      assert.ok(hit && Math.hypot(hit.position[0],hit.position[2]+6)<0.06,JSON.stringify(changes));
    }
  }
});
