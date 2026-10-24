// Работа с Open-Meteo: бесплатный API без ключа. https://open-meteo.com

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export async function searchCities(query, signal) {
  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=6&language=ru&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Поиск городов недоступен');
  const data = await res.json();
  return (data.results ?? []).map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export async function getForecast({ lat, lon }, unit = 'celsius') {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max',
    timezone: 'auto',
    forecast_days: '7',
    wind_speed_unit: 'ms',
    temperature_unit: unit,
  });
  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error('Не удалось загрузить прогноз');
  return res.json();
}

// Коды погоды WMO → описание, иконка и тема фона.
const CODES = {
  0: ['Ясно', '☀️', '🌙', 'clear'],
  1: ['Преимущественно ясно', '🌤️', '🌙', 'clear'],
  2: ['Переменная облачность', '⛅', '☁️', 'cloudy'],
  3: ['Пасмурно', '☁️', '☁️', 'cloudy'],
  45: ['Туман', '🌫️', '🌫️', 'fog'],
  48: ['Изморозь', '🌫️', '🌫️', 'fog'],
  51: ['Слабая морось', '🌦️', '🌧️', 'rain'],
  53: ['Морось', '🌦️', '🌧️', 'rain'],
  55: ['Сильная морось', '🌧️', '🌧️', 'rain'],
  56: ['Ледяная морось', '🌧️', '🌧️', 'rain'],
  57: ['Ледяная морось', '🌧️', '🌧️', 'rain'],
  61: ['Небольшой дождь', '🌦️', '🌧️', 'rain'],
  63: ['Дождь', '🌧️', '🌧️', 'rain'],
  65: ['Ливень', '🌧️', '🌧️', 'rain'],
  66: ['Ледяной дождь', '🌧️', '🌧️', 'rain'],
  67: ['Ледяной дождь', '🌧️', '🌧️', 'rain'],
  71: ['Небольшой снег', '🌨️', '🌨️', 'snow'],
  73: ['Снег', '🌨️', '🌨️', 'snow'],
  75: ['Сильный снег', '❄️', '❄️', 'snow'],
  77: ['Снежные зёрна', '🌨️', '🌨️', 'snow'],
  80: ['Кратковременный дождь', '🌦️', '🌧️', 'rain'],
  81: ['Ливни', '🌧️', '🌧️', 'rain'],
  82: ['Сильные ливни', '⛈️', '⛈️', 'storm'],
  85: ['Снегопад', '🌨️', '🌨️', 'snow'],
  86: ['Сильный снегопад', '❄️', '❄️', 'snow'],
  95: ['Гроза', '⛈️', '⛈️', 'storm'],
  96: ['Гроза с градом', '⛈️', '⛈️', 'storm'],
  99: ['Гроза с градом', '⛈️', '⛈️', 'storm'],
};

export function describe(code, isDay = 1) {
  const [text, dayIcon, nightIcon, theme] = CODES[code] ?? ['—', '🌡️', '🌡️', 'cloudy'];
  return { text, icon: isDay ? dayIcon : nightIcon, theme };
}
