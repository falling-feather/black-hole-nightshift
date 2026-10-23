import test from 'node:test';
import assert from 'node:assert/strict';
import { CreationDraft } from '../src/artwork.ts';
import { createObservation,DEFAULT_SETTINGS } from '../src/model.ts';
const frame=(id:string,phase:number)=>createObservation(id,DEFAULT_SETTINGS,phase,100,'data:image/png;base64,c25hcHNob3Q=');

test('明确用已读光信作为合奏起点时，仅将该笔纳入，仍需真实的新回应',()=>{
  const draft=new CreationDraft();draft.begin('duet',[1,2]);draft.adoptInitial(2,frame('read',34));
  draft.recordMeeting(frame('same',34));assert.equal(draft.ready,false);assert.deepEqual(draft.sourceIds,[2]);
  draft.noteStroke(3,[1,2,3]);draft.recordMeeting(frame('answer',38));
  assert.equal(draft.ready,true);assert.deepEqual(draft.result('回应').sourceIds,[2,3]);
  assert.throws(()=>draft.adoptInitial(99,frame('missing',30)));
});

test('光信成稿必须来自同一笔仍存在的光及两次真实记录，不用几何事件补造图像',()=>{
  const draft=new CreationDraft();draft.begin('letter',[]);
  draft.noteStroke(7,[7]);assert.equal(draft.ready,false);
  draft.recordInitial(7,frame('first',34));assert.equal(draft.ready,false);
  draft.recordMeeting(frame('echo',39));assert.equal(draft.ready,true);
  const result=draft.result('还会再见');assert.equal(result.intent,'letter');assert.deepEqual(result.sourceIds,[7]);
  assert.deepEqual(result.moments.map(m=>m.phase),[34,39]);
  draft.synchronize([]);assert.equal(draft.ready,false);assert.throws(()=>draft.result('还会再见'));
  draft.synchronize([7]);assert.equal(draft.ready,false);
});
test('自由合奏只统计本轮新增的笔迹，回应撤销后不能导出完整合奏，恢复后可重新取景',()=>{
  const draft=new CreationDraft();draft.begin('duet',[1,2]);
  draft.noteStroke(3,[1,2,3]);draft.recordInitial(3,frame('first',34));
  draft.recordMeeting(frame('alone',35));assert.equal(draft.ready,false);
  draft.noteStroke(4,[1,2,3,4]);draft.recordMeeting(frame('answer',36));
  assert.equal(draft.ready,true);assert.deepEqual(draft.result('过去与此刻').sourceIds,[3,4]);
  draft.synchronize([1,2,3]);assert.equal(draft.ready,false);
  draft.synchronize([1,2,3,4]);draft.recordMeeting(frame('returned',38));assert.equal(draft.ready,true);
  assert.equal(draft.result('过去与此刻').moments[1].phase,38);
});

test('撤销清空可恢复自由合奏的已观察起点，不另造历史或重新声称一次发现',()=>{
  const draft=new CreationDraft();draft.begin('duet',[]);
  draft.noteStroke(1,[1]);draft.recordInitial(1,frame('first',34));draft.noteStroke(2,[1,2]);draft.recordMeeting(frame('answer',38));
  draft.synchronize([]);assert.equal(draft.ready,false);assert.equal(draft.initial,undefined);
  draft.synchronize([1,2]);assert.equal(draft.ready,true);assert.equal(draft.initial?.phase,34);
  assert.deepEqual(draft.result('相遇').sourceIds,[1,2]);
});
test('撤销起笔后重新创作建立新的起点；重开只清理成稿草稿，不拥有或更改光场历史',()=>{
  const history=[9,10],draft=new CreationDraft();draft.begin('duet',history);
  draft.noteStroke(11,[...history,11]);draft.recordInitial(11,frame('old',34));
  draft.synchronize(history);draft.noteStroke(12,[...history,12]);draft.recordInitial(12,frame('new',40));
  draft.noteStroke(13,[...history,12,13]);draft.recordMeeting(frame('answer',41));
  assert.deepEqual(draft.result('相遇').sourceIds,[12,13]);assert.equal(draft.result('相遇').moments[0].phase,40);
  draft.begin('letter',history);assert.equal(draft.ready,false);assert.deepEqual(history,[9,10]);
});
