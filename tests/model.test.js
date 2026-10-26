import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, demoWeather, demand, dispatch, summarize } from '../assets/model.js';
import { parseWeather, tomorrow } from '../assets/weather.js';
const weather = demoWeather('dubai');
const base = demand(weather, defaults);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test('sector loads add up; extra heat raises cooling demand', () => {
  base.forEach(r => close(Object.values(r.sectors).reduce((a, b) => a + b, 0), r.load));
  const hot = demand(weather, { ...defaults, heat: 3 });
  assert.ok(hot.every((r, i) => r.load > base[i].load));
});
test('housing growth changes homes only', () => {
  const growth = demand(weather, { ...defaults, homes: defaults.homes * 2 });
  growth.forEach((r, i) => {
    close(r.sectors.Homes, 2 * base[i].sectors.Homes);
    close(r.sectors.Industry, base[i].sectors.Industry);
    close(r.sectors.Business, base[i].sectors.Business);
  });
});
test('dispatch respects energy balance, power, SOC, and terminal energy', () => {
  for (const [capacity, power, solar] of [[24, 6, 12], [80, 20, 40], [10, 2, 100]]) {
    const input = demand(weather, { ...defaults, solar });
    const rows = dispatch(input, capacity, power);
    let previous = capacity / 2;
    rows.forEach(r => {
      close(r.soc, previous + r.charge * Math.sqrt(.9) - r.discharge / Math.sqrt(.9));
      close(r.grid + r.solar + r.discharge, r.load + r.charge + r.curtail);
      assert.ok(r.charge <= power + 1e-7 && r.discharge <= power + 1e-7);
      assert.ok(r.soc >= .1 * capacity - 1e-7 && r.soc <= .9 * capacity + 1e-7);
      assert.ok(r.charge * r.discharge === 0 && r.grid >= 0);
      previous = r.soc;
    });
    close(previous, capacity / 2);
    assert.ok(summarize(rows).peak <= Math.max(...input.map(r => r.net)) + 1e-7);
  }
});
test('zero power or energy disables dispatch', () => {
  for (const [energy, power] of [[0, 6], [24, 0]]) dispatch(base, energy, power).forEach(r => {
    close(r.grid, Math.max(0, r.net)); close(r.charge + r.discharge, 0);
  });
});
test('weather rejects partial and invalid days; aligns radiation', () => {
  const times = Array.from({ length: 25 }, (_, i) => i < 24 ? `2025-07-15T${String(i).padStart(2, '0')}:00` : '2025-07-16T00:00');
  const hourly = { time: times, temperature_2m: Array(25).fill(35), relative_humidity_2m: Array(25).fill(50), shortwave_radiation: Array.from({ length: 25 }, (_, i) => i) };
  assert.equal(parseWeather({ hourly }, '2025-07-15')[0].radiation, 1);
  hourly.temperature_2m[5] = null;
  assert.throws(() => parseWeather({ hourly }, '2025-07-15'), /missing/);
  assert.throws(() => parseWeather({ hourly: { time: [] } }, '2025-07-15'), /24-hour/);
});
test('tomorrow uses city date at UTC midnight boundary', () => {
  assert.equal(tomorrow('dubai', new Date('2025-07-15T22:00:00Z')), '2025-07-17');
});
test('flat demand does not cause needless battery cycling', () => {
  const rows = dispatch(Array.from({ length: 24 }, () => ({ net: 40, load: 40, solar: 0 })), 24, 6);
  rows.forEach(r => close(r.charge + r.discharge, 0));
});
