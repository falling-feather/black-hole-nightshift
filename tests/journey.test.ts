import test from 'node:test';
import assert from 'node:assert/strict';
import { JourneyFlow } from '../src/journey.ts';
import type { VisibleSignal } from '../src/signals.ts';

const signal=(id=1,frame=12,crossing=1,delayed=true):VisibleSignal=>({id,crossing,observedFrame:frame,observedTime:42,x:0.6,y:0.4,strength:128,age:1,pixels:3,delayed});

test('看见真实绕行像后可以直接回拨读信，错误笔迹和仅有几何光路不能跳到读信',()=>{
  const flow=new JourneyFlow();flow.start();flow.accept({type:'stroke',id:1,frame:10,phase:34});
  flow.accept({type:'readback',id:1});assert.equal(flow.stage,'watch');
  flow.accept({type:'signal',signal:signal()});flow.accept({type:'readback',id:2});assert.equal(flow.stage,'found');
  flow.accept({type:'readback',id:1});assert.equal(flow.stage,'readback');
  flow.accept({type:'signal',signal:signal(1,14)});assert.equal(flow.stage,'readback');
  flow.accept({type:'history',ids:[]});assert.equal(flow.stage,'write');
});

test('读信后继续落笔离开这封信的旅程，已有历史由光场继续保留',()=>{
  const flow=new JourneyFlow();flow.start();flow.accept({type:'stroke',id:1,frame:10,phase:34});
  flow.accept({type:'signal',signal:signal()});flow.accept({type:'readback',id:1});
  flow.accept({type:'stroke',id:2,frame:20,phase:34});assert.equal(flow.stage,'idle');
});

test('可选重放完成后撤销来源仍回到落笔，返回创作不能留下无效的空阶段',()=>{
  const flow=new JourneyFlow();flow.start();flow.accept({type:'stroke',id:1,frame:10,phase:34});
  flow.accept({type:'signal',signal:signal()});flow.accept({type:'inspect',id:1,crossing:1});
  flow.accept({type:'replay',id:1,frame:20,phase:30});flow.accept({type:'signal',signal:signal(1,21)});
  assert.equal(flow.stage,'complete');flow.accept({type:'history',ids:[]});assert.equal(flow.stage,'write');
});

test('首次旅程以真实笔迹、绕行像、检视和新一轮回放成像依次推进',()=>{
  const flow=new JourneyFlow();flow.start();assert.equal(flow.stage,'write');
  flow.accept({type:'stroke',id:1,frame:10,phase:34});assert.equal(flow.stage,'watch');
  for(const s of [signal(2),signal(1,9),signal(1,12,0),signal(1,12,1,false),{...signal(),strength:5},{...signal(),pixels:1}]) flow.accept({type:'signal',signal:s});
  assert.equal(flow.stage,'watch','其他笔迹、旧帧、主像、同时发光对照或过弱的采样都不能冒充可辨认的像');
  flow.accept({type:'signal',signal:signal()});assert.equal(flow.stage,'found');
  flow.accept({type:'inspect',id:2,crossing:1});assert.equal(flow.stage,'found');
  flow.accept({type:'inspect',id:1,crossing:1});assert.equal(flow.stage,'rewind');
  flow.accept({type:'replay',id:1,frame:30,phase:30});assert.equal(flow.stage,'returning');
  flow.accept({type:'signal',signal:signal(1,20)});assert.equal(flow.stage,'returning','回放前的异步结果不能完成重逢');
  flow.accept({type:'signal',signal:signal(1,31)});assert.equal(flow.stage,'complete');
  assert.equal(flow.echo?.observedFrame,31);
});

test('几何光路按钮和主像不能代替用户发现可见绕行像',()=>{
  const flow=new JourneyFlow();flow.start();flow.accept({type:'stroke',id:1,frame:10,phase:34});
  flow.accept({type:'replay',id:1,frame:11,phase:30});
  flow.accept({type:'inspect',id:1,crossing:1});
  flow.accept({type:'signal',signal:signal(1,12,0)});
  assert.equal(flow.stage,'watch');
});

test('撤销或清空被追踪笔迹后回到落笔，恢复旧历史不伪造一次新创作',()=>{
  const flow=new JourneyFlow();flow.start();flow.accept({type:'stroke',id:4,frame:10,phase:34});
  flow.accept({type:'signal',signal:signal(4)});
  flow.accept({type:'history',ids:[1,2]});
  assert.equal(flow.stage,'write');assert.equal(flow.strokeId,undefined);
  flow.accept({type:'history',ids:[1,2,4]});assert.equal(flow.stage,'write');
  flow.follow(4,30,34);assert.equal(flow.stage,'watch');assert.equal(flow.strokeId,4);
  flow.accept({type:'signal',signal:signal(4,29)});assert.equal(flow.stage,'watch');
});

test('主动重画切换到新信号，完成后继续落笔自然回到自由创作',()=>{
  const flow=new JourneyFlow();flow.start();flow.accept({type:'stroke',id:1,frame:10,phase:34});
  flow.accept({type:'stroke',id:2,frame:20,phase:34});
  flow.accept({type:'signal',signal:signal(1,21)});assert.equal(flow.stage,'watch');
  flow.accept({type:'signal',signal:signal(2,21)});
  flow.accept({type:'inspect',id:2,crossing:1});flow.accept({type:'replay',id:2,frame:30,phase:30});
  flow.accept({type:'signal',signal:signal(2,31)});assert.equal(flow.stage,'complete');
  flow.accept({type:'stroke',id:3,frame:40,phase:34});assert.equal(flow.active,false);
});

test('退出后迟来的反馈不重新打开导览，重来只重置旅程状态',()=>{
  const flow=new JourneyFlow();flow.start();flow.accept({type:'stroke',id:1,frame:10,phase:34});flow.cancel();
  flow.accept({type:'signal',signal:signal()});assert.equal(flow.stage,'idle');
  flow.start();assert.equal(flow.stage,'write');assert.equal(flow.strokeId,undefined);assert.equal(flow.echo,undefined);
});


test('落笔后先保留演化时间，暂停画面中的旧像不能立即跳过观看',()=>{
  const flow=new JourneyFlow();flow.start();flow.accept({type:'stroke',id:1,frame:10,phase:42});
  flow.accept({type:'signal',signal:signal(1,12)});assert.equal(flow.stage,'watch');
  flow.accept({type:'signal',signal:{...signal(1,13),observedTime:44}});assert.equal(flow.stage,'found');
});

test('主动定位只更新观测起点，必须等定位后的真实成像才能推进',()=>{
  const flow=new JourneyFlow();flow.start();flow.accept({type:'stroke',id:1,frame:10,phase:100});
  flow.accept({type:'seek',id:1,frame:30,phase:34});assert.equal(flow.stage,'watch');
  flow.accept({type:'signal',signal:{...signal(1,29),observedTime:34}});assert.equal(flow.stage,'watch');
  flow.accept({type:'signal',signal:{...signal(1,31),observedTime:34}});assert.equal(flow.stage,'found');
});
