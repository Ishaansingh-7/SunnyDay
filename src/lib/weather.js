const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality'

const WMO = {
  0: ['Clear sky', 'clear'], 1: ['Mainly clear', 'clear'], 2: ['Partly cloudy', 'partly'], 3: ['Overcast', 'cloudy'],
  45: ['Fog', 'fog'], 48: ['Rime fog', 'fog'],
  51: ['Light drizzle', 'drizzle'], 53: ['Drizzle', 'drizzle'], 55: ['Dense drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'drizzle'], 57: ['Freezing drizzle', 'drizzle'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'], 81: ['Rain showers', 'rain'], 82: ['Violent showers', 'rain'],
  85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm with hail', 'storm'], 99: ['Thunderstorm with hail', 'storm'],
}

export const condition = (code) => WMO[code] || ['Unknown', 'cloudy']

const round = (v, n = 1) => (v == null ? null : Math.round(v * 10 ** n) / 10 ** n)

export const DEMO = !!import.meta.env.VITE_DEMO
export const demoState = { active: false }

async function get(url, params) {
  const query = new URLSearchParams(params).toString()
  if (DEMO && demoState.active) {
    const { demoResponse } = await import('./demo.js')
    return demoResponse(url, params)
  }
  let res
  try {
    res = await fetch(`${url}?${query}`)
  } catch {
    if (DEMO) {
      demoState.active = true
      window.dispatchEvent(new Event('sunnyday-demo'))
      const { demoResponse } = await import('./demo.js')
      return demoResponse(url, params)
    }
    throw new Error('Can’t reach the weather service. Check your internet connection and try again')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.reason || `The weather service returned an error (${res.status})`)
  return body
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { expires, data } = JSON.parse(raw)
    return expires > Date.now() ? data : null
  } catch {
    return null
  }
}

function cacheSet(key, data, ttlMs) {
  try {
    localStorage.setItem(key, JSON.stringify({ expires: Date.now() + ttlMs, data }))
  } catch {
    /* storage full or unavailable */
  }
}

const memo = new Map()

async function cached(key, ttlMs, produce, persist = false) {
  const hit = memo.get(key)
  if (hit && hit.expires > Date.now()) return hit.promise
  if (persist) {
    const stored = cacheGet(key)
    if (stored) return stored
  }
  const promise = produce().then((data) => {
    if (persist) cacheSet(key, data, ttlMs)
    return data
  })
  memo.set(key, { promise, expires: Date.now() + ttlMs })
  promise.catch(() => memo.delete(key))
  return promise
}

const coordKey = (lat, lon) => `${(+lat).toFixed(2)},${(+lon).toFixed(2)}`

export function searchPlaces(q) {
  return cached(`geo:${q.toLowerCase()}`, 864e5, async () => {
    const raw = await get(GEOCODE, { name: q, count: 8, language: 'en', format: 'json' })
    return (raw.results || []).map((r) => ({
      name: r.name, admin1: r.admin1, country: r.country, countryCode: r.country_code,
      lat: r.latitude, lon: r.longitude, timezone: r.timezone, population: r.population,
    }))
  })
}

export function uvLevel(uv) {
  if (uv == null) return null
  if (uv < 3) return { label: 'Low', tone: 'good' }
  if (uv < 6) return { label: 'Moderate', tone: 'moderate' }
  if (uv < 8) return { label: 'High', tone: 'poor' }
  if (uv < 11) return { label: 'Very high', tone: 'severe' }
  return { label: 'Extreme', tone: 'severe' }
}

export function aqiLevel(aqi) {
  if (aqi == null) return null
  if (aqi <= 50) return { label: 'Good', tone: 'good' }
  if (aqi <= 100) return { label: 'Moderate', tone: 'moderate' }
  if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', tone: 'poor' }
  if (aqi <= 200) return { label: 'Unhealthy', tone: 'poor' }
  if (aqi <= 300) return { label: 'Very unhealthy', tone: 'severe' }
  return { label: 'Hazardous', tone: 'severe' }
}

function weekdayOf(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' })
}

function forecastInsights(current, daily, air) {
  const out = []
  if (!daily.length) return out
  const hottest = daily.reduce((a, b) => (b.max > a.max ? b : a))
  out.push(
    hottest.date === daily[0].date
      ? `Today is the warmest day of the week at ${Math.round(hottest.max)}°.`
      : `${weekdayOf(hottest.date)} is the warmest day ahead at ${Math.round(hottest.max)}°.`
  )
  const wet = daily.filter((d) => (d.pop || 0) >= 60)
  if (wet.length) out.push(`Rain is likely on ${wet.slice(0, 4).map((d) => weekdayOf(d.date)).join(', ')}.`)
  else out.push('No day this week has a high chance of rain.')
  const total = daily.reduce((s, d) => s + (d.precip || 0), 0)
  if (total >= 1) out.push(`About ${Math.round(total)} mm of rain expected over the next 7 days.`)
  if (daily.some((d) => (d.uv || 0) >= 8)) out.push('UV reaches very high levels. Avoid direct sun from 11 am to 3 pm.')
  const hotDays = daily.slice(1).filter((d) => (d.max || 0) >= 38)
  if (hotDays.length) out.push(`Heat warning: highs reach 38° or more on ${hotDays.slice(0, 3).map((d) => weekdayOf(d.date)).join(', ')}.`)
  if (current.feelsLike - current.temp >= 4) out.push('Humidity is making it feel much warmer than the thermometer says.')
  if (air?.aqi > 100) out.push(`Air quality is ${air.level.label.toLowerCase()} right now (US AQI ${air.aqi}).`)
  return out
}

function forecastAlerts(daily, hourly, air) {
  const out = []
  const d = daily[0]
  if (!d) return out
  if (d.max >= 38) out.push({ kind: 'heat', title: 'Extreme heat', text: `Highs near ${Math.round(d.max)}° today. Avoid the midday sun and drink water often.` })
  const storm = hourly.slice(0, 24).find((h) => h.icon === 'storm')
  if (storm) out.push({ kind: 'storm', title: 'Thunderstorms', text: `Storms are possible from about ${storm.time.slice(11, 13) % 12 || 12} ${storm.time.slice(11, 13) < 12 ? 'am' : 'pm'}${storm.time.slice(0, 10) !== d.date ? ' tomorrow' : ''}. Stay indoors when you hear thunder.` })
  if (d.precip >= 35 || (d.pop >= 80 && d.precip >= 15)) out.push({ kind: 'rain', title: 'Heavy rain', text: `About ${Math.round(d.precip)} mm of rain is expected today. Watch for waterlogged roads.` })
  if (air?.aqi > 150) out.push({ kind: 'air', title: 'Poor air quality', text: `US AQI is ${air.aqi}. Limit long or hard outdoor activity.` })
  return out
}

export function getForecast(lat, lon) {
  return cached(`fc:${coordKey(lat, lon)}`, 9 * 6e4, async () => {
    const [raw, airRaw] = await Promise.all([
      get(FORECAST, {
        latitude: lat, longitude: lon, timezone: 'auto', forecast_days: 7,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m,visibility,uv_index',
        hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,is_day,relative_humidity_2m,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max,daylight_duration',
      }),
      get(AIR, { latitude: lat, longitude: lon, current: 'us_aqi,pm2_5,pm10' }).catch(() => null),
    ])
    const c = raw.current
    const [condText, icon] = condition(c.weather_code)
    const current = {
      time: c.time, temp: round(c.temperature_2m), feelsLike: round(c.apparent_temperature),
      humidity: c.relative_humidity_2m, dewPoint: round(c.dew_point_2m), precip: c.precipitation,
      cloud: c.cloud_cover, pressure: Math.round(c.pressure_msl), wind: round(c.wind_speed_10m, 0),
      gusts: round(c.wind_gusts_10m, 0), windDir: c.wind_direction_10m, visibility: c.visibility,
      uv: round(c.uv_index), isDay: !!c.is_day, code: c.weather_code, condition: condText, icon,
    }
    const h = raw.hourly
    const nowHour = c.time.slice(0, 13)
    let start = h.time.findIndex((t) => t.slice(0, 13) >= nowHour)
    if (start < 0) start = 0
    const allHourly = h.time.map((t, i) => ({
      time: t, temp: round(h.temperature_2m[i]), pop: h.precipitation_probability[i] ?? 0, precip: h.precipitation[i],
      icon: condition(h.weather_code[i])[1], isDay: !!h.is_day[i],
    }))
    const hourly = h.time.slice(start, start + 48).map((t, k) => {
      const i = start + k
      return {
        time: t, temp: round(h.temperature_2m[i]), feelsLike: round(h.apparent_temperature[i]),
        pop: h.precipitation_probability[i] ?? 0, precip: h.precipitation[i], humidity: h.relative_humidity_2m[i],
        wind: round(h.wind_speed_10m[i], 0), isDay: !!h.is_day[i], icon: condition(h.weather_code[i])[1],
        condition: condition(h.weather_code[i])[0],
      }
    })
    const d = raw.daily
    const daily = d.time.map((date, i) => ({
      date, max: round(d.temperature_2m_max[i]), min: round(d.temperature_2m_min[i]),
      precip: round(d.precipitation_sum[i]), pop: d.precipitation_probability_max[i] ?? 0,
      uv: round(d.uv_index_max[i]), wind: round(d.wind_speed_10m_max[i], 0),
      sunrise: d.sunrise[i], sunset: d.sunset[i], daylight: d.daylight_duration[i],
      condition: condition(d.weather_code[i])[0], icon: condition(d.weather_code[i])[1],
    }))
    const a = airRaw?.current
    const air = a && a.us_aqi != null
      ? { aqi: Math.round(a.us_aqi), pm25: round(a.pm2_5), pm10: round(a.pm10), level: aqiLevel(a.us_aqi) }
      : null
    return {
      timezone: raw.timezone, utcOffset: raw.utc_offset_seconds ?? 0, elevation: raw.elevation,
      current, hourly, allHourly, daily, air, fetchedAt: Date.now(),
      insights: forecastInsights(current, daily, air),
      alerts: forecastAlerts(daily, hourly, air),
    }
  })
}

export function getCities(cities) {
  const key = cities.map((c) => coordKey(c.lat, c.lon)).join('|')
  return cached(`cities:${key}`, 9 * 6e4, async () => {
    const raw = await get(FORECAST, {
      latitude: cities.map((c) => c.lat).join(','), longitude: cities.map((c) => c.lon).join(','),
      timezone: 'auto', forecast_days: 1,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    })
    const list = Array.isArray(raw) ? raw : [raw]
    return list.map((r, i) => ({
      ...cities[i],
      temp: round(r.current.temperature_2m), feelsLike: round(r.current.apparent_temperature),
      humidity: r.current.relative_humidity_2m, wind: round(r.current.wind_speed_10m, 0),
      isDay: !!r.current.is_day, time: r.current.time,
      condition: condition(r.current.weather_code)[0], icon: condition(r.current.weather_code)[1],
      max: round(r.daily.temperature_2m_max[0]), min: round(r.daily.temperature_2m_min[0]),
      pop: r.daily.precipitation_probability_max[0] ?? 0,
    }))
  })
}

export function getArchive(lat, lon, years) {
  const end = new Date(Date.now() - 7 * 864e5)
  const endStr = end.toISOString().slice(0, 10)
  const startStr = `${end.getUTCFullYear() - years}-01-01`
  return get(ARCHIVE, {
    latitude: lat, longitude: lon, timezone: 'auto', start_date: startStr, end_date: endStr,
    daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum',
  })
}

export { cached, coordKey }
