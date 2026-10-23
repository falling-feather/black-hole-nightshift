import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, gravitationalScale, orbitalPeriod, advanceClock,
  normalizeSettings, createObservation, appendObservation,
} from '../src/model.ts';

test('改变质量时，物理长度和时间同比改变，固定物理距离下视角尺度会改变', () => {
  const first = gravitationalScale(4.3);
  const doubled = gravitationalScale(8.6);
  assert.ok(Math.abs(first.radiusKm - 12_699_134) < 100);
  assert.ok(Math.abs(first.crossingSeconds - 42.35922) < 0.001);
  assert.equal(doubled.radiusKm / first.radiusKm, 2);
  assert.equal(doubled.crossingSeconds / first.crossingSeconds, 2);
  assert.equal(orbitalPeriod(6, 8.6) / orbitalPeriod(6, 4.3), 2);
});

test('圆轨道周期随半径的三次方根规律变化', () => {
  assert.ok(Math.abs(orbitalPeriod(12, 4.3) / orbitalPeriod(3, 4.3) - 8) < 1e-10);
});

test('暂停冻结演化但允许观测计时；恢复后不会补算暂停时长', () => {
  const origin = { realSeconds: 0, physicalSeconds: 0, phase: 0 };
  const running = advanceClock(origin, 1, 120, 4.3, false);
  const paused = advanceClock(running, 10, 120, 4.3, true);
  assert.equal(paused.physicalSeconds, running.physicalSeconds);
  assert.equal(paused.phase, running.phase);
  assert.equal(paused.realSeconds, 11);
  const resumed = advanceClock(paused, 1, 120, 4.3, false);
  assert.equal(resumed.physicalSeconds, 240);
  assert.ok(Math.abs(resumed.phase - 2 * running.phase) < 1e-10);
});

test('相同时间划分得到相同演化；质量增大时演化更慢', () => {
  const start = { realSeconds: 0, physicalSeconds: 0, phase: 0 };
  const one = advanceClock(start, 1, 120, 4.3, false);
  let partitioned = start;
  for (let i = 0; i < 100; i++) partitioned = advanceClock(partitioned, 0.01, 120, 4.3, false);
  assert.ok(Math.abs(one.phase - partitioned.phase) < 1e-10);
  assert.equal(one.phase / advanceClock(start, 1, 120, 8.6, false).phase, 2);
});

test('观测数据拒绝非有限值，并保留明确的关闭状态', () => {
  const result = normalizeSettings({ ...DEFAULT_SETTINGS, mass: NaN, inclination: 999, lightDelay: false });
  assert.equal(result.mass, DEFAULT_SETTINGS.mass);
  assert.equal(result.inclination, 178);
  assert.equal(result.lightDelay, false);
});

test('留存的时刻独立于后续参数修改，并限制为三份本地观测', () => {
  const settings = { ...DEFAULT_SETTINGS };
  const first = createObservation('a', settings, 42, 2026, 'data:image/png;base64,AAA');
  settings.inclination = 20;
  assert.equal(first.settings.inclination, DEFAULT_SETTINGS.inclination);
  assert.equal(first.phase, 42);
  let observations = [first];
  for (const id of ['b', 'c', 'd']) observations = appendObservation(observations, createObservation(id, settings, 50, 2027, 'data:image/png;base64,BBB'));
  assert.deepEqual(observations.map(item => item.id), ['d', 'c', 'b']);
});
