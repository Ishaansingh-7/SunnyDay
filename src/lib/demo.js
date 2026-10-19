import { seeded } from './motion.js'

const PLACES = [
  ['Vellore', 'Tamil Nadu', 'India', 'IN', 12.92, 79.13],
  ['Chennai', 'Tamil Nadu', 'India', 'IN', 13.08, 80.27],
  ['Hyderabad', 'Telangana', 'India', 'IN', 17.38, 78.47],
  ['Bengaluru', 'Karnataka', 'India', 'IN', 12.97, 77.59],
  ['Mumbai', 'Maharashtra', 'India', 'IN', 19.08, 72.88],
  ['New Delhi', 'Delhi', 'India', 'IN', 28.61, 77.21],
  ['Kolkata', 'West Bengal', 'India', 'IN', 22.57, 88.36],
  ['Kochi', 'Kerala', 'India', 'IN', 9.93, 76.27],
  ['Jaipur', 'Rajasthan', 'India', 'IN', 26.91, 75.79],
  ['Pune', 'Maharashtra', 'India', 'IN', 18.52, 73.86],
  ['Shimla', 'Himachal Pradesh', 'India', 'IN', 31.1, 77.17],
  ['Srinagar', 'Jammu and Kashmir', 'India', 'IN', 34.08, 74.8],
  ['London', 'England', 'United Kingdom', 'GB', 51.51, -0.13],
  ['New York', 'New York', 'United States', 'US', 40.71, -74.01],
  ['Tokyo', 'Tokyo', 'Japan', 'JP', 35.68, 139.69],
  ['Dubai', 'Dubai', 'United Arab Emirates', 'AE', 25.2, 55.27],
  ['Singapore', '', 'Singapore', 'SG', 1.29, 103.85],
  ['Sydney', 'New South Wales', 'Australia', 'AU', -33.87, 151.21],
  ['Oslo', 'Oslo', 'Norway', 'NO', 59.91, 10.75],
]

const CODES = [0, 1, 2, 2, 3, 61, 63, 80, 95, 3, 45, 51]

const pad = (n) => String(n).padStart(2, '0')
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

function offsetFor(lat, lon) {
  if (lat > 6 && lat < 37 && lon > 68 && lon < 98) return 19800
  return Math.round(lon / 15) * 3600
}

function baseTemp(lat) {
  return 30 - Math.max(0, Math.abs(lat) - 12) * 0.55
}

function forecastOne(lat, lon, salt = 0) {
  const offset = offsetFor(lat, lon)
  const local = new Date(Date.now() + offset * 1000)
  const day0 = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
  const rnd = seeded(Math.round(Math.abs(lat * 100 + lon * 37)) + 11 + salt)
  const base = baseTemp(lat)
  const swing = 4 + rnd() * 3
  const codesByDay = Array.from({ length: 7 }, () => CODES[Math.floor(rnd() * CODES.length)])
  const pops = codesByDay.map((c) => (c >= 51 ? 60 + Math.floor(rnd() * 35) : Math.floor(rnd() * 30)))
  const rise = 6 * 60 + Math.round((Math.abs(lat) - 12) * 0.8)
  const set = 17 * 60 + 52 - Math.round((Math.abs(lat) - 12) * 0.8)
  const time = []
  const temp = []
  const feels = []
  const pop = []
  const pr = []
  const code = []
  const isDay = []
  for (let i = 0; i < 168; i++) {
    const t = new Date(day0.getTime() + i * 3600e3)
    const hr = i % 24
    const d = Math.floor(i / 24)
    time.push(`${isoDate(t)}T${pad(hr)}:00`)
    const v = base + (d % 3) * 0.6 - 1 + swing * Math.sin(((hr - 9) / 24) * 2 * Math.PI)
    temp.push(Math.round(v * 10) / 10)
    feels.push(Math.round((v + 2 + rnd()) * 10) / 10)
    const p = Math.max(0, Math.min(100, Math.round(pops[d] * (0.5 + 0.5 * Math.sin((hr + d) / 4)))))
    pop.push(p)
    pr.push(p > 55 ? Math.round(rnd() * 25) / 10 : 0)
    const day = hr * 60 >= rise && hr * 60 < set
    isDay.push(day ? 1 : 0)
    code.push(p > 60 ? codesByDay[d] : hr % 5 === 0 ? 3 : day ? 2 : 1)
  }
  const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes()
  const hi = local.getUTCHours()
  const curCode = codesByDay[0]
  const curDay = nowMin >= rise && nowMin < set
  const days = Array.from({ length: 7 }, (_, d) => isoDate(new Date(day0.getTime() + d * 864e5)))
  const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
  return {
    latitude: lat, longitude: lon, timezone: 'Local', utc_offset_seconds: offset, elevation: 200,
    current: {
      time: `${isoDate(local)}T${pad(hi)}:${pad(Math.floor(local.getUTCMinutes() / 15) * 15)}`,
      temperature_2m: temp[hi] + 0.3, relative_humidity_2m: 55 + Math.floor(rnd() * 30), apparent_temperature: temp[hi] + 3.4,
      is_day: curDay ? 1 : 0, precipitation: 0, weather_code: curCode, cloud_cover: 40, pressure_msl: 1004 + Math.round(rnd() * 14),
      wind_speed_10m: Math.round(6 + rnd() * 18), wind_direction_10m: Math.round(rnd() * 360), wind_gusts_10m: Math.round(18 + rnd() * 20),
      dew_point_2m: Math.round(base - 6), visibility: 18000 + Math.round(rnd() * 12000), uv_index: curDay ? Math.round(rnd() * 90) / 10 : 0,
    },
    hourly: {
      time, temperature_2m: temp, apparent_temperature: feels, precipitation_probability: pop, precipitation: pr,
      weather_code: code, is_day: isDay, relative_humidity_2m: time.map(() => 60 + Math.floor(rnd() * 25)), wind_speed_10m: time.map(() => Math.round(6 + rnd() * 14)),
    },
    daily: {
      time: days, weather_code: codesByDay,
      temperature_2m_max: days.map((_, d) => Math.round((base + swing + (d % 3) * 0.6 - 1) * 10) / 10),
      temperature_2m_min: days.map((_, d) => Math.round((base - swing + (d % 3) * 0.6 - 1) * 10) / 10),
      precipitation_sum: pops.map((p) => (p > 55 ? Math.round(rnd() * 250) / 10 : 0)),
      precipitation_probability_max: pops,
      sunrise: days.map((d) => `${d}T${hm(rise)}`), sunset: days.map((d) => `${d}T${hm(set)}`),
      uv_index_max: days.map(() => Math.round((5 + rnd() * 5) * 10) / 10), wind_speed_10m_max: days.map(() => Math.round(14 + rnd() * 16)),
      daylight_duration: days.map(() => (set - rise) * 60),
    },
  }
}

function archive(lat, start, end) {
  const rnd = seeded(Math.round(Math.abs(lat * 1000)) + 5)
  const g = () => {
    const u = rnd() || 1e-9
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
  }
  const base = baseTemp(lat) - 3
  const t0 = new Date(`${start}T00:00:00Z`)
  const t1 = new Date(`${end}T00:00:00Z`)
  const out = { time: [], temperature_2m_mean: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [] }
  const y0 = t0.getUTCFullYear()
  for (let d = t0; d <= t1; d = new Date(d.getTime() + 864e5)) {
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    const doy = Math.round((d - Date.UTC(y, 0, 0)) / 864e5)
    const v = base + 4 * Math.sin((2 * Math.PI * (doy - 80)) / 365) + 0.027 * (y - y0) + 0.25 * Math.sin(y * 1.3) + g()
    const wet = m >= 6 && m <= 11
    out.time.push(isoDate(d))
    out.temperature_2m_mean.push(Math.round(v * 10) / 10)
    out.temperature_2m_max.push(Math.round((v + 6 + g() * 0.5) * 10) / 10)
    out.temperature_2m_min.push(Math.round((v - 5) * 10) / 10)
    out.precipitation_sum.push(Math.round(Math.max(0, (wet ? 6 : 0.5) + g() * (wet ? 9 : 2)) * 10) / 10)
  }
  return { daily: out }
}

export function demoResponse(url, params) {
  if (url.includes('geocoding')) {
    const q = String(params.name || '').toLowerCase()
    const hits = PLACES.filter((p) => p[0].toLowerCase().includes(q) || p[1].toLowerCase().includes(q) || p[2].toLowerCase().includes(q))
    return { results: hits.slice(0, 8).map(([name, admin1, country, cc, latitude, longitude]) => ({ name, admin1, country, country_code: cc, latitude, longitude })) }
  }
  if (url.includes('air-quality')) {
    const rnd = seeded(Math.round(Math.abs(+params.latitude * 100)) + 3)
    return { current: { us_aqi: Math.round(30 + rnd() * 130), pm2_5: Math.round(rnd() * 600) / 10, pm10: Math.round(rnd() * 900) / 10 } }
  }
  if (url.includes('archive')) return archive(+params.latitude, params.start_date, params.end_date)
  const lats = String(params.latitude).split(',').map(Number)
  const lons = String(params.longitude).split(',').map(Number)
  if (lats.length > 1) return lats.map((la, i) => {
    const f = forecastOne(la, lons[i], i * 7)
    f.daily = Object.fromEntries(Object.entries(f.daily).map(([k, v]) => [k, v.slice(0, 1)]))
    return f
  })
  return forecastOne(lats[0], lons[0])
}
