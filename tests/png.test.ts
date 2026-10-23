import test from 'node:test';
import assert from 'node:assert/strict';
import { pngBlob } from '../src/png.ts';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iL1kAAAAASUVORK5CYII=';
test('原 PNG 手记转为下载 Blob 时保留原始字节，不重新绘制图像',async()=>{
  const blob=pngBlob(`data:image/png;base64,${png}`);
  assert.equal(blob.type,'image/png');assert.deepEqual(Buffer.from(await blob.arrayBuffer()),Buffer.from(png,'base64'));
});
test('损坏的编码或其他格式明确拒绝，不能伪装成 PNG 下载',()=>{
  for(const value of ['data:text/html;base64,PGgxPmE8L2gxPg==','data:image/png;base64,%%%','data:image/png;base64,/9j/4AAQSkZJRg==']) assert.throws(()=>pngBlob(value));
});
