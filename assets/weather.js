import {
  cities
} from './model.js';
export function tomorrow(city, now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: cities[city].zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  return new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
}
export function parseWeather(data, day) {
  const h = data.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error('Weather response has no hourly data.');
  const rows = h.time.flatMap((time, i) => {
    if (!time.startsWith(day + 'T')) return [];
    // Radiation is a preceding-hour mean; shift it to the hour beginning at time.
    const values = [h.temperature_2m?.[i], h.relative_humidity_2m?.[i], h.shortwave_radiation?.[i + 1]];
    if (!values.every(Number.isFinite)) throw new Error('Weather response has missing values.');
    const [temp, humidity, radiation] = values;
    if (temp < -30 || temp > 65 || humidity < 0 || humidity > 100 || radiation < 0 || radiation > 1500)
      throw new Error('Weather response failed range checks.');
    return [{
      time,
      hour: Number(time.slice(11, 13)),
      temp,
      humidity,
      radiation
    }];
  });
  if (rows.length !== 24 || rows.some((r, i) => r.hour !== i)) throw new Error('A complete 24-hour day is required.');
  return rows;
}
export async function getWeather(city) {
  const c = cities[city];
  const query = new URLSearchParams({
    latitude: c.lat,
    longitude: c.lon,
    timezone: c.zone,
    hourly: 'temperature_2m,relative_humidity_2m,shortwave_radiation',
    forecast_days: 3
  });
  const response = await fetch('https://api.open-meteo.com/v1/forecast?' + query, {
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}.`);
  const rows = parseWeather(await response.json(), tomorrow(city));
  return {
    rows,
    fetched: new Date().toISOString(),
    city
  };
}
