import test from 'node:test';
import assert from 'node:assert/strict';
import { phraseFor } from '../src/score.ts';
import { playPhrase } from '../src/sound.ts';

test('同色的落笔、回声和重逢使用相关音高，位置来自观测信号',()=>{
  const emission=phraseFor('emit',0,60),echo=phraseFor('echo',0,60,{x:0.2,crossing:2,strength:64});
  assert.equal(echo[0].frequency/emission[0].frequency,0.75);
  assert.ok(echo[0].pan<0);assert.ok(phraseFor('echo',0,60,{x:0.8,crossing:2,strength:64})[0].pan>0);
  assert.equal(phraseFor('return',0,60).length,3);
  assert.deepEqual(phraseFor('emit',1,60),phraseFor('emit',1,60));
});

test('所有音句的频率、包络与声像有限，异常参数不能默默变成任意声音',()=>{
  for(const cue of ['emit','echo','return','capture'] as const) for(const pigment of [0,1,2]) for(const bass of [48,75]) {
    const notes=phraseFor(cue,pigment,bass,{x:1.1,crossing:3,strength:255});
    for(const note of notes) {
      assert.ok(Object.values(note).every(Number.isFinite));
      assert.ok(note.frequency>40&&note.frequency<3000);
      assert.ok(note.duration>0.1&&note.duration<5);assert.ok(note.delay>=0&&note.delay<1);
      assert.ok(note.gain>0&&note.gain<=0.1);assert.ok(Math.abs(note.pan)<=0.8);
    }
  }
  assert.throws(()=>phraseFor('emit',0,NaN),RangeError);
});

test('短音全部经过主音量总线，结束后释放临时节点，关闭声场不会留下旁路声音',()=>{
  type Node={connect:(to:Node)=>void;disconnect:()=>void;gain:{setValueAtTime:()=>void;linearRampToValueAtTime:()=>void;exponentialRampToValueAtTime:()=>void};frequency:{value:number};pan:{value:number};type:string;start:()=>void;stop:(at:number)=>void;addEventListener:(_name:string,callback:()=>void)=>void};
  const edges:Array<[Node,Node]>=[],created:Node[]=[],ended:Array<()=>void>=[],disconnected=new Set<Node>(),stops:number[]=[];
  const make=():Node=>{
    const node:Node={connect:to=>edges.push([node,to]),disconnect:()=>{disconnected.add(node);},gain:{setValueAtTime:()=>{},linearRampToValueAtTime:()=>{},exponentialRampToValueAtTime:()=>{}},frequency:{value:0},pan:{value:0},type:'',start:()=>{},stop:at=>{stops.push(at);},addEventListener:(_name,callback)=>{ended.push(callback);}};
    created.push(node);return node;
  };
  const destination=make(),master=make();master.connect(destination);
  const context={currentTime:10,createOscillator:make,createGain:make,createStereoPanner:make} as unknown as BaseAudioContext;
  playPhrase(context,master as unknown as AudioNode,phraseFor('return',1,60));
  assert.ok(edges.some(([,to])=>to===master));
  assert.ok(edges.filter(([,to])=>to===destination).every(([from])=>from===master));
  assert.ok(stops.every(at=>at>10&&at<16));
  ended.forEach(callback=>callback());
  assert.ok(created.filter(node=>node!==master&&node!==destination).every(node=>disconnected.has(node)));
});
