import test from 'node:test';
import assert from 'node:assert/strict';
import { placeSignalLabels,type SignalLabel } from '../src/labels.ts';

const overlaps=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
test('相邻绕行像的文字避让，仍保留每个实际信号的独立标签',()=>{
  const labels:SignalLabel[]=Array.from({length:4},(_,i)=>({key:String(i),x:300+i*2,y:240+i*2,width:84,height:18,side:'left',priority:100-i}));
  const placed=placeSignalLabels(labels,{width:600,height:480});
  assert.equal(placed.length,4);
  for(let i=0;i<placed.length;i++) for(let j=0;j<i;j++) assert.equal(overlaps({...placed[i],width:84,height:18},{...placed[j],width:84,height:18}),false);
  assert.deepEqual(labels.map(l=>[l.x,l.y]),[[300,240],[302,242],[304,244],[306,246]]);
});
test('窄屏边缘的标签留在视口内，空间充足时互不重叠',()=>{
  for(const [x,y] of [[2,2],[388,2],[2,842],[388,842]]) {
    const labels:SignalLabel[]=Array.from({length:4},(_,i)=>({key:String(i),x,y,width:92,height:18,side:i%2?'left':'right',priority:4-i}));
    const placed=placeSignalLabels(labels,{width:390,height:844});
    for(let i=0;i<placed.length;i++) {
      assert.ok(placed[i].x>=8&&placed[i].x+92<=382);assert.ok(placed[i].y>=8&&placed[i].y+18<=836);
      for(let j=0;j<i;j++) assert.equal(overlaps({...placed[i],width:92,height:18},{...placed[j],width:92,height:18}),false);
    }
  }
});
test('最强可见信号优先保留就近标签，重复布局结果稳定',()=>{
  const labels:SignalLabel[]=[{key:'faint',x:300,y:240,width:84,height:18,side:'left',priority:10},{key:'clear',x:300,y:240,width:84,height:18,side:'left',priority:100}];
  const placed=placeSignalLabels(labels,{width:600,height:480});
  assert.equal(placed[0].key,'clear');assert.equal(placed[0].y,231);
  assert.deepEqual(placed,placeSignalLabels(labels,{width:600,height:480}));
});
