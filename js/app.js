import { searchCities, getForecast, describe } from './api.js';

const $ = (s) => document.querySelector(s);
const DEFAULT_CITY = { name: 'Москва', region: 'Россия', lat: 55.7522, lon: 37.6156 };

// ---------- Настройки в localStorage ----------
const prefs = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`sky_${key}`)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`sky_${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

const state = {
  city: prefs.get('city', DEFAULT_CITY),
  unit: prefs.get('unit', 'celsius'),
  favs: prefs.get('favs', [
    DEFAULT_CITY,
    { name: 'Санкт-Петербург', region: 'Россия', lat: 59.9386, lon: 30.3141 },
    { name: 'Сочи', region: 'Россия', lat: 43.6028, lon: 39.7342 },
  ]),
};

const sameCity = (a, b) => Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
const round = (n) => Math.round(n);
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = (iso) => iso.slice(11, 16);
const weekday = (iso, i) => {
  if (i === 0) return 'Сегодня';
  const [y, m, d] = iso.split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'short' });
  return s[0].toUpperCase() + s.slice(1);
};
const windDir = (deg) => ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'][Math.round(deg / 45) % 8];

// ---------- Загрузка ----------
let loadId = 0;
async function load(city) {
  const id = ++loadId;
  state.city = city;
  prefs.set('city', city);
  document.body.classList.add('is-loading');
  $('#error').hidden = true;
  $('#city').textContent = city.name;
  $('#region').textContent = city.region;
  renderFavs();
  try {
    const data = await getForecast(city, state.unit);
    if (id !== loadId) return;
    render(data);
    $('#main').hidden = false;
  } catch (err) {
    if (id !== loadId) return;
    showError(navigator.onLine ? err.message : 'Нет подключения к интернету');
  } finally {
    if (id === loadId) document.body.classList.remove('is-loading');
  }
}

function showError(text) {
  $('#main').hidden = true;
  const el = $('#error');
  el.innerHTML = `<p>😕 ${escapeHTML(text)}</p><button class="pill" id="retry">Попробовать снова</button>`;
  el.hidden = false;
  $('#retry').onclick = () => load(state.city);
}

// ---------- Рендер ----------
function render(data) {
  const { current: c, hourly: h, daily: d } = data;
  const w = describe(c.weather_code, c.is_day);

  document.body.dataset.theme = w.theme;
  document.body.dataset.day = c.is_day;
  setParticles(w.theme);
  document.title = `${round(c.temperature_2m)}° ${state.city.name} — Небо`;

  $('#nowIcon').textContent = w.icon;
  $('#nowTemp').textContent = `${round(c.temperature_2m)}°`;
  $('#nowText').textContent = w.text;
  $('#nowRange').textContent = `Макс. ${round(d.temperature_2m_max[0])}° · Мин. ${round(d.temperature_2m_min[0])}°`;
  updateStar();

  // Почасовой: 24 часа начиная с текущего
  const start = Math.max(0, h.time.findIndex((t) => t.slice(0, 13) === c.time.slice(0, 13)));
  $('#hourly').innerHTML = h.time.slice(start, start + 24).map((t, i) => {
    const k = start + i;
    const hw = describe(h.weather_code[k], h.is_day[k]);
    const rain = h.precipitation_probability[k];
    return `<div class="hour ${i === 0 ? 'is-now' : ''}">
      <span class="hour__time">${i === 0 ? 'Сейчас' : hhmm(t)}</span>
      <span class="hour__icon" title="${hw.text}">${hw.icon}</span>
      <span class="hour__temp">${round(h.temperature_2m[k])}°</span>
      <span class="hour__rain">${rain >= 20 ? `💧${rain}%` : '&nbsp;'}</span>
    </div>`;
  }).join('');

  // На неделю: полоска показывает диапазон температур дня относительно всей недели
  const lo = Math.min(...d.temperature_2m_min);
  const hi = Math.max(...d.temperature_2m_max);
  const span = hi - lo || 1;
  $('#daily').innerHTML = d.time.map((t, i) => {
    const dw = describe(d.weather_code[i]);
    const min = d.temperature_2m_min[i];
    const max = d.temperature_2m_max[i];
    const rain = d.precipitation_probability_max[i];
    return `<li class="day">
      <span class="day__name">${weekday(t, i)}</span>
      <span class="day__icon" title="${dw.text}">${dw.icon}<small>${rain >= 30 ? `${rain}%` : ''}</small></span>
      <span class="day__min">${round(min)}°</span>
      <span class="range"><span class="range__fill" style="left:${((min - lo) / span) * 100}%;right:${100 - ((max - lo) / span) * 100}%"></span>
        ${i === 0 ? `<span class="range__now" style="left:${((c.temperature_2m - lo) / span) * 100}%"></span>` : ''}</span>
      <span class="day__max">${round(max)}°</span>
    </li>`;
  }).join('');

  const uv = d.uv_index_max[0];
  const uvText = uv < 3 ? 'низкий' : uv < 6 ? 'умеренный' : uv < 8 ? 'высокий' : 'очень высокий';
  const tiles = [
    ['🌡️', 'Ощущается', `${round(c.apparent_temperature)}°`, c.apparent_temperature < c.temperature_2m ? 'Прохладнее из-за ветра' : 'Близко к реальной'],
    ['💧', 'Влажность', `${c.relative_humidity_2m}%`, c.relative_humidity_2m > 75 ? 'Влажно' : 'Комфортно'],
    ['💨', 'Ветер', `${c.wind_speed_10m.toFixed(1)} м/с`, `Направление: ${windDir(c.wind_direction_10m)}`],
    ['🧭', 'Давление', `${round(c.pressure_msl * 0.750062)}`, 'мм рт. ст.'],
    ['🌅', 'Восход', hhmm(d.sunrise[0]), `Закат в ${hhmm(d.sunset[0])}`],
    ['🔆', 'УФ-индекс', `${round(uv)}`, uvText[0].toUpperCase() + uvText.slice(1)],
  ];
  $('#details').innerHTML = tiles.map(([icon, label, value, note]) => `
    <article class="tile glass">
      <span class="tile__label">${icon} ${label}</span>
      <strong class="tile__value">${value}</strong>
      <span class="tile__note">${note}</span>
    </article>`).join('');
}

// ---------- Анимированный фон ----------
function setParticles(theme) {
  const box = $('#particles');
  const kind = theme === 'snow' ? 'snow' : (theme === 'rain' || theme === 'storm') ? 'rain' : '';
  if (box.dataset.kind === kind) return;
  box.dataset.kind = kind;
  box.innerHTML = '';
  if (!kind || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const count = kind === 'rain' ? 70 : 50;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = kind;
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDuration = `${kind === 'rain' ? 0.5 + Math.random() * 0.4 : 5 + Math.random() * 6}s`;
    p.style.animationDelay = `${-Math.random() * 8}s`;
    p.style.opacity = 0.3 + Math.random() * 0.6;
    if (kind === 'snow') p.style.setProperty('--size', `${3 + Math.random() * 5}px`);
    box.append(p);
  }
}

// ---------- Избранное ----------
function renderFavs() {
  $('#favs').innerHTML = state.favs.map((f, i) => `
    <button class="pill ${sameCity(f, state.city) ? 'is-active' : ''}" data-fav="${i}">${escapeHTML(f.name)}</button>`).join('');
}

function updateStar() {
  const on = state.favs.some((f) => sameCity(f, state.city));
  $('#starBtn').textContent = on ? '★' : '☆';
  $('#starBtn').setAttribute('aria-label', on ? 'Убрать из избранного' : 'Добавить в избранное');
  $('#starBtn').classList.toggle('is-on', on);
}

$('#starBtn').addEventListener('click', () => {
  const idx = state.favs.findIndex((f) => sameCity(f, state.city));
  if (idx >= 0) state.favs.splice(idx, 1);
  else state.favs.push(state.city);
  prefs.set('favs', state.favs);
  renderFavs();
  updateStar();
});

$('#favs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fav]');
  if (btn) load(state.favs[Number(btn.dataset.fav)]);
});

// ---------- Поиск с подсказками ----------
const input = $('#searchInput');
const suggest = $('#suggest');
let suggestions = [];
let active = -1;
let timer;
let controller;

function renderSuggest() {
  if (!suggestions.length) { suggest.hidden = true; return; }
  suggest.innerHTML = suggestions.map((s, i) => `
    <li role="option" class="${i === active ? 'is-active' : ''}" data-i="${i}">
      <strong>${escapeHTML(s.name)}</strong><span>${escapeHTML(s.region)}</span>
    </li>`).join('');
  suggest.hidden = false;
}

function pickSuggestion(i) {
  const city = suggestions[i];
  if (!city) return;
  input.value = '';
  suggestions = [];
  renderSuggest();
  input.blur();
  load(city);
}

input.addEventListener('input', () => {
  clearTimeout(timer);
  const q = input.value.trim();
  if (q.length < 2) { suggestions = []; renderSuggest(); return; }
  timer = setTimeout(async () => {
    controller?.abort();
    controller = new AbortController();
    try {
      suggestions = await searchCities(q, controller.signal);
      active = suggestions.length ? 0 : -1;
      if (!suggestions.length) {
        suggest.innerHTML = '<li class="is-empty">Ничего не найдено</li>';
        suggest.hidden = false;
        return;
      }
      renderSuggest();
    } catch (err) {
      if (err.name !== 'AbortError') { suggest.innerHTML = '<li class="is-empty">Поиск недоступен</li>'; suggest.hidden = false; }
    }
  }, 300);
});

input.addEventListener('keydown', (e) => {
  if (!suggestions.length) return;
  if (e.key === 'ArrowDown') { active = (active + 1) % suggestions.length; renderSuggest(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { active = (active - 1 + suggestions.length) % suggestions.length; renderSuggest(); e.preventDefault(); }
  if (e.key === 'Escape') { suggestions = []; renderSuggest(); }
});

$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (active >= 0) pickSuggestion(active);
});

suggest.addEventListener('mousedown', (e) => {
  const li = e.target.closest('[data-i]');
  if (li) { e.preventDefault(); pickSuggestion(Number(li.dataset.i)); }
});

input.addEventListener('blur', () => setTimeout(() => { suggest.hidden = true; }, 150));
input.addEventListener('focus', () => { if (suggestions.length) suggest.hidden = false; });

// ---------- Геолокация и единицы ----------
$('#geoBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return showError('Геолокация не поддерживается браузером');
  $('#geoBtn').classList.add('is-busy');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $('#geoBtn').classList.remove('is-busy');
      load({ name: 'Моё местоположение', region: `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`, lat: pos.coords.latitude, lon: pos.coords.longitude });
    },
    () => {
      $('#geoBtn').classList.remove('is-busy');
      showError('Не удалось определить местоположение. Разрешите доступ или найдите город через поиск.');
    },
    { timeout: 10000, maximumAge: 600000 },
  );
});

function updateUnitBtn() {
  $('#unitBtn').textContent = state.unit === 'celsius' ? '°C' : '°F';
}
$('#unitBtn').addEventListener('click', () => {
  state.unit = state.unit === 'celsius' ? 'fahrenheit' : 'celsius';
  prefs.set('unit', state.unit);
  updateUnitBtn();
  load(state.city);
});

updateUnitBtn();
load(state.city);
