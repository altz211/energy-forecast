export const defaults = Object.freeze({
  homes: 12000,
  occupancy: 85,
  business: 100,
  industry: 70,
  heat: 0,
  efficiency: 0,
  solar: 12,
  battery: 24,
  power: 6,
  limit: 65
});
export const cities = {
  dubai: {
    name: 'Dubai',
    lat: 25.2048,
    lon: 55.2708,
    zone: 'Asia/Dubai',
    weekend: [0, 6]
  },
  riyadh: {
    name: 'Riyadh',
    lat: 24.7136,
    lon: 46.6753,
    zone: 'Asia/Riyadh',
    weekend: [5, 6]
  }
};
export const sum = values => values.reduce((a, b) => a + b, 0);
export const peak = rows => rows.reduce((a, b) => a.load > b.load ? a : b);

export function demoWeather(city) {
  return Array.from({
    length: 24
  }, (_, hour) => ({
    time: `2025-07-15T${String(hour).padStart(2, '0')}:00`,
    hour,
    temp: (city === 'dubai' ? 36 : 37) + 6 * Math.cos((hour - 15) * Math.PI / 12),
    humidity: (city === 'dubai' ? 55 : 22) - 12 * Math.cos((hour - 15) * Math.PI / 12),
    radiation: Math.max(0, 900 * Math.sin((hour - 6) * Math.PI / 13))
  }));
}

export function demand(weather, settings, city = 'dubai') {
  let thermal = weather[0].temp + settings.heat;
  return weather.map(w => {
    const h = w.hour;
    const weekend = cities[city].weekend.includes(new Date(w.time.slice(0, 10) + 'T12:00:00Z').getUTCDay());
    thermal = 0.65 * thermal + 0.35 * (w.temp + settings.heat);
    const cooling = Math.max(0, thermal - 24) * (1 + Math.max(0, w.humidity - 40) / 200);
    const ac = 1 - settings.efficiency / 100;
    const residentialActivity = h < 6 ? 0.65 : h < 9 ? 1 : h < 17 ? 0.7 : 1.3;
    const officeActivity = h >= 8 && h < 19 ? (weekend ? 0.45 : 1) : 0.25;
    const occupied = settings.homes * settings.occupancy / 100;
    const sectors = {
      Homes: occupied * (0.00065 * residentialActivity + 0.00016 * cooling * ac),
      Business: settings.business / 100 * (8 * officeActivity + 0.8 * cooling * ac * (0.4 + 0.6 * officeActivity)),
      Hotels: 4 + 0.3 * cooling * ac,
      Industry: 14 * settings.industry / 100 * (h >= 7 && h < 22 ? 1 : 0.65)
    };
    const load = sum(Object.values(sectors));
    const cellTemp = w.temp + settings.heat + w.radiation * 0.03;
    const solar = Math.max(0, Math.min(settings.solar,
      settings.solar * w.radiation / 1000 * 0.86 * (1 - 0.004 * (cellTemp - 25))));
    return {
      ...w,
      temp: w.temp + settings.heat,
      sectors,
      load,
      solar,
      net: load - solar
    };
  });
}

export function dispatch(rows, capacity, power) {
  if (capacity <= 0 || power <= 0) return rows.map(r => ({
    ...r,
    charge: 0,
    discharge: 0,
    soc: capacity / 2,
    grid: Math.max(0, r.net),
    curtail: Math.max(0, -r.net)
  }));
  const eta = Math.sqrt(0.9);
  const levels = Array.from({
    length: 81
  }, (_, i) => capacity * (0.1 + i / 100));

  function solve(ceiling, minimizeFlow) {
    let costs = levels.map(() => ({
      peak: Infinity,
      flow: Infinity
    }));
    costs[40] = {
      peak: 0,
      flow: 0
    };
    const parents = [];
    // Keep the same opening and closing charge so tomorrow does not borrow energy.
    for (const row of rows) {
      const next = levels.map(() => ({
        peak: Infinity,
        flow: Infinity
      }));
      const prev = new Int16Array(81).fill(-1);
      for (let from = 0; from < 81; from++) {
        if (!Number.isFinite(costs[from].peak)) continue;
        for (let to = 0; to < 81; to++) {
          const change = levels[to] - levels[from];
          const charge = Math.max(0, change / eta);
          const discharge = Math.max(0, -change * eta);
          if (charge > power + 1e-9 || discharge > power + 1e-9 || discharge > Math.max(0, row.net) + 1e-9) continue;
          const grid = Math.max(0, row.net + charge - discharge);
          if (grid > ceiling + 1e-8) continue;
          const candidate = {
            peak: Math.max(costs[from].peak, grid),
            flow: costs[from].flow + charge + discharge
          };
          if (minimizeFlow ? candidate.flow < next[to].flow - 1e-9 : candidate.peak < next[to].peak - 1e-9) {
            next[to] = candidate;
            prev[to] = from;
          }
        }
      }
      parents.push(prev);
      costs = next;
    }
    return {
      parents,
      peak: costs[40].peak
    };
  }
  const first = solve(Infinity, false);
  // With the peak fixed, avoid cycling that does not improve the plan.
  const {
    parents
  } = solve(first.peak, true);
  let state = 40;
  const result = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const from = parents[i][state];
    const change = levels[state] - levels[from];
    const charge = Math.max(0, change / eta);
    const discharge = Math.max(0, -change * eta);
    const net = rows[i].net + charge - discharge;
    result.unshift({
      ...rows[i],
      charge,
      discharge,
      soc: levels[state],
      grid: Math.max(0, net),
      curtail: Math.max(0, -net)
    });
    state = from;
  }
  return result;
}

export function summarize(rows) {
  return {
    peak: Math.max(...rows.map(r => r.grid)),
    energy: sum(rows.map(r => r.grid)),
    load: sum(rows.map(r => r.load)),
    solar: sum(rows.map(r => r.solar)),
    losses: sum(rows.map(r => r.charge - r.discharge))
  };
}
