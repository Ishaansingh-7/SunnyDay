import { cached, coordKey, getArchive } from './weather.js'

export const HOT_DAY = 35
export const RAINY_DAY = 2.5
export const HEAVY_RAIN = 64.5
export const SEASONS = [
  ['Winter', [1, 2]],
  ['Pre-monsoon', [3, 4, 5]],
  ['Monsoon', [6, 7, 8, 9]],
  ['Post-monsoon', [10, 11, 12]],
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const r = (v, n = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** n) / 10 ** n)
const mean = (xs) => {
  const v = xs.filter((x) => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
const sum = (xs) => xs.reduce((a, b) => a + b, 0)

function erfc(x) {
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const y = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? y : 2 - y
}

export function linreg(xs, ys) {
  const n = xs.length
  if (n < 3) return { slope: 0, intercept: mean(ys) ?? 0, r2: 0 }
  const mx = mean(xs)
  const my = mean(ys)
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
    sxy += (xs[i] - mx) * (ys[i] - my)
  }
  const slope = sxx ? sxy / sxx : 0
  return { slope, intercept: my - slope * mx, r2: sxx && syy ? (sxy * sxy) / (sxx * syy) : 0 }
}

export function sensSlope(xs, ys) {
  const s = []
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) if (xs[j] !== xs[i]) s.push((ys[j] - ys[i]) / (xs[j] - xs[i]))
  if (!s.length) return 0
  s.sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function mannKendall(ys) {
  const n = ys.length
  if (n < 4) return { z: 0, p: 1 }
  let s = 0
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += Math.sign(ys[j] - ys[i])
  const sd = Math.sqrt((n * (n - 1) * (2 * n + 5)) / 18)
  const z = s > 0 ? (s - 1) / sd : s < 0 ? (s + 1) / sd : 0
  return { z, p: erfc(Math.abs(z) / Math.SQRT2) }
}

function trend(xs, ys) {
  const { slope, intercept, r2 } = linreg(xs, ys)
  const { p } = mannKendall(ys)
  return {
    perDecade: r(slope * 10, 3), sensPerDecade: r(sensSlope(xs, ys) * 10, 3), r2: r(r2, 3),
    pValue: p, significant: p < 0.05, slope, intercept,
  }
}

function dayOfYear(date) {
  const y = +date.slice(0, 4)
  return Math.round((Date.UTC(y, +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(y, 0, 0)) / 864e5)
}

export function analyse(d) {
  const days = []
  d.time.forEach((t, i) => {
    const mn = d.temperature_2m_mean[i]
    const mx = d.temperature_2m_max[i]
    const lo = d.temperature_2m_min[i]
    if (mn == null || mx == null || lo == null) return
    days.push({ date: t, year: +t.slice(0, 4), month: +t.slice(5, 7), doy: dayOfYear(t), mean: mn, max: mx, min: lo, pr: d.precipitation_sum[i] ?? 0 })
  })
  if (!days.length) throw new Error('No historical records are available for this location')

  const last = days[days.length - 1]
  const byYear = new Map()
  for (const day of days) {
    if (!byYear.has(day.year)) byYear.set(day.year, [])
    byYear.get(day.year).push(day)
  }

  const yearly = [...byYear.entries()].map(([year, rows]) => ({
    year, complete: rows.length >= 360,
    meanTemp: r(mean(rows.map((x) => x.mean))), avgMax: r(mean(rows.map((x) => x.max))), avgMin: r(mean(rows.map((x) => x.min))),
    maxTemp: r(Math.max(...rows.map((x) => x.max)), 1), minTemp: r(Math.min(...rows.map((x) => x.min)), 1),
    precip: r(sum(rows.map((x) => x.pr)), 1),
    hotDays: rows.filter((x) => x.max >= HOT_DAY).length,
    rainyDays: rows.filter((x) => x.pr >= RAINY_DAY).length,
    heavyRainDays: rows.filter((x) => x.pr >= HEAVY_RAIN).length,
  }))
  const full = yearly.filter((y) => y.complete)
  if (full.length < 3) throw new Error('At least three complete years of records are needed for this analysis')

  let base = full.filter((y) => y.year >= 1991 && y.year <= 2020)
  if (base.length < 20) base = full
  const baseline = `${base[0].year}–${base[base.length - 1].year}`
  const baseTemp = mean(base.map((y) => y.meanTemp))
  const basePrecip = mean(base.map((y) => y.precip))
  for (const y of yearly) {
    y.anomaly = r(y.meanTemp - baseTemp)
    y.precipAnomalyPct = basePrecip ? r((100 * (y.precip - basePrecip)) / basePrecip, 1) : null
  }

  const xs = full.map((y) => y.year)
  const trends = {
    meanTemp: trend(xs, full.map((y) => y.meanTemp)),
    avgMax: trend(xs, full.map((y) => y.avgMax)),
    avgMin: trend(xs, full.map((y) => y.avgMin)),
    precip: trend(xs, full.map((y) => y.precip)),
    hotDays: trend(xs, full.map((y) => y.hotDays)),
  }
  for (const y of full) y.trend = r(trends.meanTemp.intercept + trends.meanTemp.slope * y.year)

  const fullSet = new Set(xs)
  const monthly = MONTHS.map((name, k) => {
    const rows = days.filter((x) => x.month === k + 1 && fullSet.has(x.year))
    const n = new Set(rows.map((x) => x.year)).size || 1
    return {
      month: k + 1, name,
      meanTemp: r(mean(rows.map((x) => x.mean)), 1), avgMax: r(mean(rows.map((x) => x.max)), 1), avgMin: r(mean(rows.map((x) => x.min)), 1),
      precip: r(sum(rows.map((x) => x.pr)) / n, 1), rainyDays: r(rows.filter((x) => x.pr >= RAINY_DAY).length / n, 1),
    }
  })

  const totalRain = sum(monthly.map((m) => m.precip)) || 1
  const seasons = SEASONS.map(([season, months]) => {
    const perYear = xs.map((y) => sum(byYear.get(y).filter((x) => months.includes(x.month)).map((x) => x.pr)))
    return {
      season, months,
      avgPrecip: r(mean(perYear), 0),
      share: r((100 * sum(months.map((m) => monthly[m - 1].precip))) / totalRain, 1),
      meanTemp: r(mean(months.map((m) => monthly[m - 1].meanTemp)), 1),
      precipTrend: trend(xs, perYear),
    }
  })

  const ytdRows = byYear.get(last.year) || []
  const ytdTemp = mean(ytdRows.map((x) => x.mean))
  const ytdBase = mean(base.map((y) => mean(byYear.get(y.year).filter((x) => x.doy <= last.doy).map((x) => x.mean))))
  const ytdRain = sum(ytdRows.map((x) => x.pr))
  const ytdRainBase = mean(base.map((y) => sum(byYear.get(y.year).filter((x) => x.doy <= last.doy).map((x) => x.pr))))

  const pick = (arr, f, better) => arr.reduce((a, b) => (better(f(b), f(a)) ? b : a))
  const gt = (a, b) => a > b
  const lt = (a, b) => a < b
  const hottestDay = pick(days, (x) => x.max, gt)
  const coldestDay = pick(days, (x) => x.min, lt)
  const wettestDay = pick(days, (x) => x.pr, gt)
  const hottestYear = pick(full, (y) => y.meanTemp, gt)
  const coldestYear = pick(full, (y) => y.meanTemp, lt)
  const wettestYear = pick(full, (y) => y.precip, gt)
  const driestYear = pick(full, (y) => y.precip, lt)

  const decades = new Map()
  for (const y of full) {
    const k = Math.floor(y.year / 10) * 10
    if (!decades.has(k)) decades.set(k, [])
    decades.get(k).push(y)
  }
  const decadal = [...decades.entries()].map(([k, v]) => ({
    decade: `${k}s`, years: v.length, meanTemp: r(mean(v.map((y) => y.meanTemp))),
    hotDays: r(mean(v.map((y) => y.hotDays)), 0), precip: r(mean(v.map((y) => y.precip)), 0),
  }))

  const result = {
    period: { start: days[0].date, end: last.date, completeYears: full.length, baseline },
    baseline: { meanTemp: r(baseTemp), precip: r(basePrecip, 0) },
    yearly, full, monthly, seasons, decadal, trends,
    yearToDate: {
      year: last.year, through: last.date, meanTemp: r(ytdTemp), baseMeanTemp: r(ytdBase),
      anomaly: ytdTemp != null && ytdBase != null ? r(ytdTemp - ytdBase) : null,
      precip: r(ytdRain, 0), basePrecip: r(ytdRainBase, 0),
      precipPct: ytdRainBase ? r((100 * (ytdRain - ytdRainBase)) / ytdRainBase, 0) : null,
    },
    records: {
      hottestDay: { date: hottestDay.date, value: r(hottestDay.max, 1) },
      coldestDay: { date: coldestDay.date, value: r(coldestDay.min, 1) },
      wettestDay: { date: wettestDay.date, value: r(wettestDay.pr, 1) },
      hottestYear: { year: hottestYear.year, value: hottestYear.meanTemp },
      coldestYear: { year: coldestYear.year, value: coldestYear.meanTemp },
      wettestYear: { year: wettestYear.year, value: wettestYear.precip },
      driestYear: { year: driestYear.year, value: driestYear.precip },
    },
  }
  result.insights = insights(result)
  return result
}

const fmtP = (p) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`)
const signed = (v, d) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`

function insights(c) {
  const t = c.trends
  const out = []
  const mt = t.meanTemp
  out.push(
    mt.significant
      ? `Average temperature has ${mt.perDecade >= 0 ? 'risen' : 'fallen'} by ${Math.abs(mt.perDecade).toFixed(2)}°C per decade, a statistically significant trend (Mann-Kendall ${fmtP(mt.pValue)}).`
      : `Average temperature changed by ${signed(mt.perDecade, 2)}°C per decade, which is not statistically significant (${fmtP(mt.pValue)}).`
  )
  const nights = t.avgMin.perDecade
  const days = t.avgMax.perDecade
  if (nights > 0 || days > 0)
    out.push(
      nights > days
        ? 'Nights are warming faster than days: minimum temperatures rise more steeply than maximums.'
        : 'Days are warming faster than nights: maximum temperatures rise more steeply than minimums.'
    )
  else out.push('Neither days nor nights show a warming trend over this period.')
  const hd = t.hotDays.perDecade
  if (Math.abs(hd) >= 0.5)
    out.push(`Days at or above ${HOT_DAY}°C are ${hd > 0 ? 'increasing' : 'decreasing'} by about ${Math.abs(hd).toFixed(1)} days per decade.`)
  const wet = c.seasons.reduce((a, b) => (b.share > a.share ? b : a))
  out.push(`The ${wet.season.toLowerCase()} season brings ${Math.round(wet.share)}% of the year’s rain.`)
  out.push(`Annual rainfall is ${t.precip.perDecade >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(t.precip.perDecade))} mm per decade (${t.precip.significant ? 'significant' : 'not significant'}).`)
  const y = c.yearToDate
  if (y.anomaly != null)
    out.push(`${y.year} so far is ${Math.abs(y.anomaly).toFixed(2)}°C ${y.anomaly >= 0 ? 'warmer' : 'cooler'} than the ${c.period.baseline} average for the same months.`)
  out.push(`The warmest year in this record was ${c.records.hottestYear.year}.`)
  return out
}

export function getClimate(lat, lon, years) {
  return cached(`clim:v1:${coordKey(lat, lon)}:${years}`, 7 * 864e5, async () => analyse((await getArchive(lat, lon, years)).daily), true)
}
