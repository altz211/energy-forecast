import {
  defaults,
  cities,
  demoWeather,
  demand,
  dispatch,
  summarize,
  peak
} from './model.js';
import {
  getWeather
} from './weather.js';
const $ = id => document.getElementById(id);
const number = (n, digits = 1) => n.toLocaleString('en', {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits
});
let settings = {
  ...defaults
};
let city = 'dubai';
let weather = demoWeather(city);
let source = 'Illustrative summer weather';
let fetched = '';
let rows = [];
let reference = [];
let request = 0;
const controls = [
  ['homes', 'Homes', 1000, 30000, 100, ''],
  ['occupancy', 'Occupied homes', 30, 100, 1, '%'],
  ['business', 'Business floor area', 50, 200, 5, '%'],
  ['industry', 'Industry utilisation', 0, 100, 1, '%'],
  ['heat', 'Warmer weather', 0, 6, 0.5, '°C'],
  ['efficiency', 'Cooling efficiency gain', 0, 40, 5, '%'],
  ['solar', 'Solar capacity', 0, 40, 1, ' MW'],
  ['battery', 'Battery energy', 0, 80, 2, ' MWh'],
  ['power', 'Battery power', 0, 20, 1, ' MW'],
  ['limit', 'Connection limit', 20, 140, 5, ' MW']
];
$('controls').innerHTML = controls.map(([key, label, min, max, step, unit], i) =>
  `${i === 4 ? '<p class="control-group">HEAT & FLEXIBILITY</p>' : ''}<div class="control"><label for="${key}">${label}<output id="${key}-value" for="${key}"></output></label><input type="range" id="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-unit="${unit}"></div>`).join('');

function syncControls() {
  for (const [key, , , , , unit] of controls) {
    $(key).value = settings[key];
    $(key + '-value').textContent = number(settings[key], key === 'heat' ? 1 : 0) + unit;
  }
}

function lineChart(series, options = {}) {
  const w = 750,
    h = options.small ? 180 : 300;
  const left = 42,
    right = 12,
    top = 20,
    bottom = 30;
  const max = Math.max(1, ...series.flatMap(s => s.values), options.limit || 0) * 1.12;
  const x = i => left + i / 23 * (w - left - right);
  const y = v => h - bottom - v / max * (h - top - bottom);
  const grid = Array.from({
    length: 5
  }, (_, i) => {
    const value = max * i / 4;
    return `<line x1="${left}" x2="${w - right}" y1="${y(value)}" y2="${y(value)}" stroke="#d7dbcf"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${Math.round(value)}</text>`;
  }).join('');
  const ticks = [0, 6, 12, 18, 23].map(i => `<text x="${x(i)}" y="${h - 8}" text-anchor="middle">${String(i).padStart(2, '0')}:00</text>`).join('');
  const lines = series.map(s => `<polyline points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.5}" ${s.dashed ? 'stroke-dasharray="5 5"' : ''}/>`).join('');
  const limit = options.limit ? `<line x1="${left}" x2="${w - right}" y1="${y(options.limit)}" y2="${y(options.limit)}" stroke="#a65b31" stroke-dasharray="3 5"/>` : '';
  const cursor = options.cursor !== undefined ? `<line x1="${x(options.cursor)}" x2="${x(options.cursor)}" y1="${top}" y2="${h - bottom}" stroke="#345b3e" opacity=".35"/>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${options.label || 'Hourly demand and grid import. Exact values are in the hourly table.'}"><text x="0" y="10">${options.unit || 'MW'}</text>${grid}${ticks}${limit}${lines}${cursor}</svg>`;
}

function inspect() {
  const i = Number($('hour').value);
  const r = rows[i];
  $('hour-label').textContent = `${String(i).padStart(2, '0')}:00`;
  $('chart').innerHTML = lineChart([{
    values: reference.map(r => r.load),
    color: '#969c90',
    dashed: true
  }, {
    values: rows.map(r => r.load),
    color: '#222722'
  }, {
    values: rows.map(r => r.grid),
    color: '#4f7448',
    width: 3.5
  }], {
    limit: settings.limit,
    cursor: i
  });
  $('hour-detail').innerHTML = [
      ['Temperature', `${number(r.temp)}°C`],
      ['Demand', `${number(r.load)} MW`],
      ['Grid import', `${number(r.grid)} MW`],
      ['Battery charge', `${number(r.soc)} MWh`]
    ]
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function render() {
  syncControls();
  reference = demand(weather, defaults, city);
  rows = dispatch(demand(weather, settings, city), settings.battery, settings.power);
  const stats = summarize(rows);
  const noBattery = Math.max(...rows.map(r => Math.max(0, r.net)));
  const peakRow = rows.reduce((a, b) => a.grid >= b.grid ? a : b);
  $('peak').innerHTML = `${number(stats.peak)} <small>MW</small>`;
  $('peak-note').textContent = `At ${String(peakRow.hour).padStart(2, '0')}:00 · ${cities[city].name} time`;
  $('energy').innerHTML = `${number(stats.energy, 0)} <small>MWh</small>`;
  $('energy-note').textContent = `${number(stats.load, 0)} MWh district demand`;
  $('reduction').innerHTML = `${number(noBattery - stats.peak)} <small>MW</small>`;
  $('day-label').textContent = `${weather[0].time.slice(0, 10)} · ${cities[city].zone} · hourly averages`;
  const over = rows.filter(r => r.grid > settings.limit + 1e-6).length;
  $('insight').innerHTML = over ?
    `<strong>${over} hours above the connection limit.</strong>The planned peak exceeds ${settings.limit} MW by ${number(stats.peak - settings.limit)} MW. Compare cooling efficiency, solar and storage before changing the connection assumption.` :
    `<strong>${number(settings.limit - stats.peak)} MW of headroom at the peak.</strong>Your scenario stays below the assumed ${settings.limit} MW connection limit. This is a district energy balance, not a network feasibility study.`;
  const p = peak(rows);
  $('sectors').innerHTML = Object.entries(p.sectors).map(([name, value]) =>
    `<div class="sector"><div class="sector-label"><span>${name}</span><span>${number(value)} MW · ${number(value / p.load * 100, 0)}%</span></div><div class="track"><i style="width:${value / p.load * 100}%"></i></div></div>`).join('');
  $('battery-chart').innerHTML = lineChart([{
    values: rows.map(r => r.soc),
    color: '#345b3e'
  }], {
    small: true,
    unit: 'MWh',
    label: 'End-of-hour stored battery energy. Exact values are in the hourly table.'
  });
  $('battery-note').textContent = `Start / finish: ${number(settings.battery / 2)} MWh · Round-trip efficiency: 90% · Conversion losses: ${number(stats.losses)} MWh. ${settings.battery && settings.power ? 'Dispatch minimises the import peak on a discrete energy grid.' : 'Battery dispatch is disabled.'}`;
  $('hourly').innerHTML = rows.map(r => `<tr><td>${String(r.hour).padStart(2, '0')}:00</td>${[r.temp, r.load, r.solar, r.charge, r.discharge, r.grid, r.soc].map(v => `<td>${number(v)}</td>`).join('')}</tr>`).join('');
  inspect();
}
$('controls').addEventListener('input', e => {
  settings[e.target.id] = Number(e.target.value);
  render();
});
$('hour').addEventListener('input', inspect);
$('reset').addEventListener('click', () => {
  settings = {
    ...defaults
  };
  render();
});
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  settings = {
    ...defaults,
    ...(button.dataset.preset === 'heat' ? {
      heat: 3
    } : {
      homes: 14400,
      business: 120,
      industry: 84
    })
  };
  render();
}));

function useDemo() {
  request++;
  weather = demoWeather(city);
  source = 'Illustrative summer weather';
  fetched = '';
  $('live').disabled = false;
  $('weather-status').textContent = 'Illustrative summer weather · 15 Jul 2025';
  render();
}
$('city').addEventListener('change', () => {
  city = $('city').value;
  useDemo();
});
$('demo').addEventListener('click', useDemo);
$('live').addEventListener('click', async () => {
  const id = ++request;
  const requestedCity = city;
  $('live').disabled = true;
  $('weather-status').textContent = 'Fetching tomorrow’s weather…';
  try {
    const result = await getWeather(requestedCity);
    if (id !== request) return;
    weather = result.rows;
    source = 'Open-Meteo forecast';
    fetched = result.fetched;
    $('weather-status').textContent = `Live weather forecast · fetched ${new Date(fetched).toLocaleTimeString('en-GB', { timeZone: cities[city].zone, hour: '2-digit', minute: '2-digit' })} local · demand remains simulated`;
    render();
  } catch (error) {
    if (id !== request) return;
    $('weather-status').textContent = `${error.message} Keeping ${source.toLowerCase()}${fetched ? ' fetched ' + fetched : ' (15 Jul 2025)'}.`;
  } finally {
    if (id === request) $('live').disabled = false;
  }
});
$('export').addEventListener('click', () => {
  const columns = ['time_local', 'timezone', 'demand_source', 'model_version', 'weather_source', 'weather_fetched_utc', 'temperature_c', 'humidity_pct', 'demand_mw', 'solar_mw', 'charge_mw', 'discharge_mw', 'grid_mw', 'curtailed_mw', 'soc_mwh', ...Object.keys(settings)];
  const csv = [columns, ...rows.map(r => [r.time, cities[city].zone, 'simulated district', '0.1.0', source, fetched, r.temp, r.humidity,
      r.load, r.solar, r.charge, r.discharge, r.grid, r.curtail, r.soc, ...Object.values(settings)
    ])]
    .map(row => row.map(v => typeof v === 'number' ? v.toFixed(4) : `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], {
    type: 'text/csv;charset=utf-8'
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `district-${city}-${weather[0].time.slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
render();
