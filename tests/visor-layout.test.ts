import test from 'node:test';
import assert from 'node:assert/strict';
import { PanelPlacement } from '../src/visor-layout.ts';

test('自动避让不记作手动拖动，放大窗口后重新使用原有响应式锚点',()=>{
  const panel=new PanelPlacement();
  assert.deepEqual(panel.layout({left:1150,top:240},{width:338,height:500},{width:1366,height:768}),{left:1016,top:170});
  assert.equal(panel.moved,false);
  assert.deepEqual(panel.layout({left:1465,top:248},{width:360,height:500},{width:1920,height:1080}),{left:1465,top:248});
});

test('缩小窗口只临时避让，恢复桌面尺寸后回到观众拖动的位置',()=>{
  const panel=new PanelPlacement();
  const desktop={width:1920,height:1080},small={width:1024,height:640};
  const preferred=panel.move({left:1300,top:370},{width:360,height:450},desktop);
  assert.equal(panel.moved,true);
  assert.deepEqual(panel.layout({left:60,top:110},{width:338,height:426},small),{left:674,top:116});
  assert.deepEqual(panel.layout({left:115,top:200},{width:360,height:450},desktop),preferred);
});

test('主要桌面尺寸与窄屏的浮窗始终给页眉、底部操作和屏边留出空间',()=>{
  for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:1024,height:640},{width:390,height:844}]) {
    const size={width:Math.min(560,viewport.width-28),height:viewport.height-214};
    for(const position of [{left:-300,top:-400},{left:3000,top:2000}]) {
      const fitted=new PanelPlacement().move(position,size,viewport);
      assert.ok(fitted.left>=12&&fitted.left+size.width<=viewport.width-12);
      assert.ok(fitted.top>=100&&fitted.top+size.height<=viewport.height-98);
    }
  }
});

test('浮窗内容展开后可避让，折回后仍恢复观众原来的位置',()=>{
  const panel=new PanelPlacement(),viewport={width:1366,height:768};
  panel.move({left:80,top:310},{width:338,height:280},viewport);
  assert.deepEqual(panel.layout({left:80,top:310},{width:338,height:554},viewport),{left:80,top:116});
  assert.deepEqual(panel.layout({left:80,top:116},{width:338,height:280},viewport),{left:80,top:310});
});
