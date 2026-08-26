const WEATHER_API_URL = 'https://api.aldeapucela.org/weather';
const WEATHER_CACHE_KEY = 'fiestas-valladolid-weather-v3';
const WEATHER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const WEATHER_TIMEOUT_MS = 5000;

const weatherConditions = [
  { codes: [0], icon: 'fa-sun', label: 'Despejado' },
  { codes: [1], icon: 'fa-sun', label: 'Principalmente despejado' },
  { codes: [2], icon: 'fa-cloud-sun', label: 'Parcialmente nuboso' },
  { codes: [3], icon: 'fa-cloud', label: 'Nuboso' },
  { codes: [45, 48], icon: 'fa-smog', label: 'Niebla' },
  { codes: [51, 53, 55, 56, 57], icon: 'fa-cloud-rain', label: 'Llovizna' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], icon: 'fa-cloud-showers-heavy', label: 'Lluvia o chubascos' },
  { codes: [71, 73, 75, 77, 85, 86], icon: 'fa-snowflake', label: 'Nieve' },
  { codes: [95, 96, 99], icon: 'fa-cloud-bolt', label: 'Tormenta' }
];

export async function loadWeatherForecast() {
  const cached = readCachedWeather();
  if (cached) return cached;

  const fetcher = typeof window !== 'undefined' ? window.fetch : null;
  if (typeof fetcher !== 'function') return {};

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = window.setTimeout(() => controller?.abort(), WEATHER_TIMEOUT_MS);

  try {
    const response = await fetcher(WEATHER_API_URL, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal
    });
    if (!response.ok) throw new Error(`Weather request failed with status ${response.status}`);

    const payload = await response.json();
    const days = normalizeWeatherPayload(payload);
    if (Object.keys(days).length) writeCachedWeather(days);
    return days;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getWeatherCondition(code) {
  const numericCode = Number(code);
  return weatherConditions.find((condition) => condition.codes.includes(numericCode)) || null;
}

export function getWeatherLabel(day) {
  const condition = getWeatherCondition(day?.weatherCode);
  if (!condition) return '';

  const details = [condition.label];
  if (Number.isFinite(day.max) && Number.isFinite(day.min)) {
    details.push(`${formatTemperature(day.min)}–${formatTemperature(day.max)}`);
  } else if (Number.isFinite(day.max)) {
    details.push(`máxima ${formatTemperature(day.max)}`);
  }
  if (Number.isFinite(day.rainProbability)) details.push(`lluvia ${Math.round(day.rainProbability)} %`);
  return `Previsión: ${details.join(', ')}`;
}

export function getWeatherAtTime(day, time) {
  const targetMinutes = timeToMinutes(time);
  const hours = Array.isArray(day?.hourly) ? day.hourly : [];
  if (targetMinutes === null || !hours.length) return null;

  const closest = hours.reduce((best, hour) => {
    const hourMinutes = timeToMinutes(hour.time?.slice(11, 16));
    if (hourMinutes === null || !Number.isFinite(hour.temperature) || !getWeatherCondition(hour.weatherCode)) return best;
    if (!best || Math.abs(hourMinutes - targetMinutes) < Math.abs(best.minutes - targetMinutes)) {
      return { ...hour, minutes: hourMinutes };
    }
    return best;
  }, null);
  if (!closest) return null;

  return {
    weatherCode: closest.weatherCode,
    temperature: closest.temperature,
    rainProbability: closest.rainProbability,
    time: closest.time?.slice(11, 16) || ''
  };
}

function normalizeWeatherPayload(payload) {
  const daily = payload?.daily;
  const dates = Array.isArray(daily?.time) ? daily.time : [];
  const weatherCodes = Array.isArray(daily?.weather_code) ? daily.weather_code : [];
  const maximums = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max : [];
  const minimums = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min : [];
  const rainProbabilities = Array.isArray(daily?.precipitation_probability_max)
    ? daily.precipitation_probability_max
    : [];
  const hourly = payload?.hourly;
  const hourlyTimes = Array.isArray(hourly?.time) ? hourly.time : [];
  const hourlyCodes = Array.isArray(hourly?.weather_code) ? hourly.weather_code : [];
  const hourlyTemperatures = Array.isArray(hourly?.temperature_2m) ? hourly.temperature_2m : [];
  const hourlyRainProbabilities = Array.isArray(hourly?.precipitation_probability)
    ? hourly.precipitation_probability
    : [];
  const hourlyByDate = {};

  hourlyTimes.forEach((timestamp, index) => {
    const match = String(timestamp).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (!match) return;
    const weatherCode = Number(hourlyCodes[index]);
    const temperature = toFiniteNumber(hourlyTemperatures[index]);
    if (!Number.isFinite(weatherCode) || !Number.isFinite(temperature) || !getWeatherCondition(weatherCode)) return;
    const date = match[1];
    if (!hourlyByDate[date]) hourlyByDate[date] = [];
    hourlyByDate[date].push({
      time: `${date}T${match[2]}`,
      weatherCode,
      temperature,
      rainProbability: toFiniteNumber(hourlyRainProbabilities[index])
    });
  });
  const days = {};

  dates.forEach((date, index) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return;
    const weatherCode = Number(weatherCodes[index]);
    if (!Number.isFinite(weatherCode) || !getWeatherCondition(weatherCode)) return;
    days[date] = {
      weatherCode,
      max: toFiniteNumber(maximums[index]),
      min: toFiniteNumber(minimums[index]),
      rainProbability: toFiniteNumber(rainProbabilities[index]),
      hourly: hourlyByDate[date] || []
    };
  });

  return days;
}

function readCachedWeather() {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const cached = JSON.parse(window.localStorage.getItem(WEATHER_CACHE_KEY) || 'null');
    if (!cached || !Number.isFinite(cached.fetchedAt) || Date.now() - cached.fetchedAt > WEATHER_CACHE_TTL_MS) return null;
    return cached.days && typeof cached.days === 'object' ? cached.days : null;
  } catch (_) {
    return null;
  }
}

function writeCachedWeather(days) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), days }));
  } catch (_) {}
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatTemperature(value) {
  return `${Math.round(value)} °C`;
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
