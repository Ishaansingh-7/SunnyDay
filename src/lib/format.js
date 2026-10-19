export const deg = (v, digits = 0) => (v == null ? '–' : `${Number(v).toFixed(digits)}°`)

export const signed = (v, digits = 2, unit = '') => {
  if (v == null) return '–'
  const shown = Math.abs(v).toFixed(digits)
  const sign = Number(shown) === 0 ? '±' : v > 0 ? '+' : '−'
  return `${sign}${shown}${unit}`
}

export const mm = (v, digits = 0) => (v == null ? '–' : `${Number(v).toFixed(digits)} mm`)

export const pct = (v) => (v == null ? '–' : `${Math.round(v)}%`)

export function compass(degrees) {
  if (degrees == null) return ''
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(degrees / 45) % 8]
}

export function weekday(date, opts = { weekday: 'short' }) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', opts)
}

export function hourLabel(iso) {
  const h = Number(iso.slice(11, 13))
  if (h === 0) return weekday(iso.slice(0, 10))
  return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`
}

export function clock(iso) {
  if (!iso) return '–'
  const h = Number(iso.slice(11, 13))
  return `${h % 12 || 12}:${iso.slice(14, 16)} ${h < 12 ? 'am' : 'pm'}`
}

export function longDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function placeLabel(p) {
  return [p.admin1, p.country].filter(Boolean).join(', ')
}

const STRIPE_STOPS = [
  [-1, [8, 48, 107]],
  [-0.7, [24, 92, 170]],
  [-0.4, [66, 146, 198]],
  [-0.15, [158, 202, 225]],
  [0, [222, 230, 238]],
  [0.15, [252, 201, 180]],
  [0.4, [246, 128, 96]],
  [0.7, [214, 46, 38]],
  [1, [120, 6, 20]],
]

export function divergingColor(value, limit) {
  const t = Math.max(-1, Math.min(1, value / (limit || 1)))
  let i = 1
  while (i < STRIPE_STOPS.length - 1 && STRIPE_STOPS[i][0] < t) i++
  const [t0, c0] = STRIPE_STOPS[i - 1]
  const [t1, c1] = STRIPE_STOPS[i]
  const k = (t - t0) / (t1 - t0)
  return `rgb(${c0.map((x, j) => Math.round(x + (c1[j] - x) * k)).join(',')})`
}

export const STRIPE_GRADIENT = `linear-gradient(90deg, ${STRIPE_STOPS.map(([t, c]) => `rgb(${c.join(',')}) ${((t + 1) / 2) * 100}%`).join(', ')})`

export function minutesOf(iso) {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16))
}

export function duration(mins) {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

export function localDateTime(iso) {
  return `${weekday(iso.slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' })}, ${clock(iso)}`
}
