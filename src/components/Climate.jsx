import { useEffect, useRef, useState } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getClimate, HEAVY_RAIN, HOT_DAY, RAINY_DAY } from '../lib/climate.js'
import { useAsync } from '../lib/useAsync.js'
import { deg, divergingColor, longDate, mm, signed, STRIPE_GRADIENT } from '../lib/format.js'
import { axisProps, useTokens } from '../lib/theme.js'
import { Num } from '../lib/motion.js'
import ChartTooltip from './ChartTooltip.jsx'
import { ErrorState, Loading } from './States.jsx'

const SPANS = [10, 20, 30, 40]

function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw)
  const top = Math.ceil(max / step) * step
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(6))
}

function ClimateLoading({ years, name }) {
  return (
    <div className="clim-loading" role="status">
      <div className="stripes loading-stripes" aria-hidden="true">
        {Array.from({ length: 32 }, (_, i) => (
          <span key={i} className="stripe" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <p>
        Downloading {years} years of daily records for {name} and running the trend analysis…
      </p>
    </div>
  )
}

function Stripes({ yearly, baseline }) {
  const n = yearly.length
  const full = yearly.filter((y) => y.complete)
  const limit = Math.max(0.5, ...(full.length ? full : yearly).map((y) => Math.abs(y.anomaly)))
  const [hover, setHover] = useState(null)
  const box = useRef(null)
  const onMove = (e) => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(r.width - 1, e.clientX - r.left))
    setHover(Math.floor((x / r.width) * n))
  }
  const yOf = (a) => Math.max(7, Math.min(93, 50 - (a / limit) * 34))
  const pt = (yr, i) => `${i + 0.5},${yOf(yr.anomaly).toFixed(2)}`
  const lastFull = yearly.length - 1 - [...yearly].reverse().findIndex((yr) => yr.complete)
  const pts = yearly.slice(0, lastFull + 1).map(pt).join(' ')
  const partialPts = lastFull < n - 1 ? yearly.slice(lastFull).map((yr, k) => pt(yr, lastFull + k)).join(' ') : null
  const y = hover != null ? yearly[hover] : null
  const xPct = hover != null ? ((hover + 0.5) / n) * 100 : 0
  const step = n > 24 ? 5 : n > 12 ? 2 : 1
  const gap = Math.max(2, Math.ceil(step * 0.6))
  const ticks = yearly
    .map((yr, i) => [yr.year, i])
    .filter(([yr, i]) => i === 0 || i === n - 1 || (yr % step === 0 && i >= gap && i <= n - 1 - gap))
  const done = full
  const warmest = done.reduce((a, b) => (b.anomaly > a.anomaly ? b : a), done[0] || yearly[0])
  const coolest = done.reduce((a, b) => (b.anomaly < a.anomaly ? b : a), done[0] || yearly[0])
  const tipSide = xPct < 14 ? 'start' : xPct > 86 ? 'end' : 'mid'
  return (
    <figure className="stripes-fig reveal">
      <div
        ref={box}
        className={`stripes ${hover != null ? 'is-hover' : ''}`}
        role="img"
        aria-label={`Annual temperature anomaly stripes relative to ${baseline}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {yearly.map((yr, i) => (
          <span
            key={yr.year}
            className={`stripe ${hover === i ? 'hot' : ''} ${yr.complete ? '' : 'partial'}`}
            style={{ background: divergingColor(yr.anomaly, limit), boxShadow: `1px 0 0 ${divergingColor(yr.anomaly, limit)}`, animationDelay: `${i * 18}ms` }}
          />
        ))}
        <svg className="stripes-line" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2={n} y1="50" y2="50" className="zero" />
          <polyline points={pts} className="trace" />
          {partialPts && <polyline points={partialPts} className="trace partial" />}
        </svg>
        {y && (
          <>
            <span className="stripe-shade" style={{ left: 0, width: `${(hover / n) * 100}%` }} />
            <span className="stripe-shade" style={{ left: `${((hover + 1) / n) * 100}%`, right: 0 }} />
            <span className="stripe-cursor" style={{ left: `${xPct}%` }} />
            <span className="stripe-dot" style={{ left: `${xPct}%`, top: `${yOf(y.anomaly)}%`, background: divergingColor(y.anomaly, limit) }} />
          </>
        )}
      </div>
      {y && (
        <div className={`stripe-tip tip-${tipSide}`} style={{ left: `calc(var(--pad) + (100% - 2 * var(--pad)) * ${(xPct / 100).toFixed(4)})` }}>
          <span className="tip-head">
            <i style={{ background: divergingColor(y.anomaly, limit) }} />
            <strong>
              {y.year}
              {y.complete ? '' : ' so far'}
            </strong>
          </span>
          <span className={`tip-anom ${y.anomaly >= 0 ? 'warm' : 'cool'}`}>{signed(y.anomaly, 2, '°C')}</span>
          <span>vs the {baseline} average</span>
          <span className="tip-sub">
            Mean {deg(y.meanTemp, 1)}C · {mm(y.precip)} rain
          </span>
        </div>
      )}
      <div className="stripes-ticks" aria-hidden="true">
        {ticks.map(([yr, i]) => (
          <span key={yr} style={{ left: `${((i + 0.5) / n) * 100}%` }} className={i === 0 ? 'first' : i === n - 1 ? 'last' : ''}>
            {yr}
          </span>
        ))}
      </div>
      <div className="stripes-foot">
        <div className="stripes-scale">
          <span>{signed(-limit, 1, '°C')}</span>
          <span className="st-scale-bar" style={{ background: STRIPE_GRADIENT }}>
            <i />
          </span>
          <span>{signed(limit, 1, '°C')}</span>
          <em>
            <span className="leg">
              <b className="leg-line" /> each year
            </span>
            <span className="leg">
              <b className="leg-dash" /> {baseline} average
            </span>
            {lastFull < n - 1 && (
              <span className="leg">
                <b className="leg-hatch" /> year so far
              </span>
            )}
          </em>
        </div>
        <div className="stripes-extremes">
          <span className="ext warm">
            <i style={{ background: divergingColor(warmest.anomaly, limit) }} />
            Warmest <strong>{warmest.year}</strong> {signed(warmest.anomaly, 2, '°C')}
          </span>
          <span className="ext cool">
            <i style={{ background: divergingColor(coolest.anomaly, limit) }} />
            Coolest <strong>{coolest.year}</strong> {signed(coolest.anomaly, 2, '°C')}
          </span>
        </div>
      </div>
    </figure>
  )
}

export default function Climate({ place }) {
  const [years, setYears] = useState(30)
  const { data, error, loading, retry } = useAsync(() => getClimate(place.lat, place.lon, years), [place.lat, place.lon, years])
  const t = useTokens()

  const controls = (
    <div className="span-picker with-pill" role="radiogroup" aria-label="Analysis period" style={{ '--n': SPANS.length, '--k': SPANS.indexOf(years) }}>
      <span className="sp-pill" aria-hidden="true" />
      {SPANS.map((n) => (
        <button key={n} type="button" role="radio" aria-checked={years === n} className={years === n ? 'on' : ''} onClick={() => setYears(n)}>
          {n} years
        </button>
      ))}
    </div>
  )

  if (error)
    return (
      <>
        {controls}
        <ErrorState error={error} retry={retry} what="climate history" />
      </>
    )
  if (!data)
    return (
      <>
        {controls}
        <ClimateLoading years={years} name={place.name} />
      </>
    )

  const tr = data.trends
  const full = data.full
  const rainTicks = niceTicks(Math.max(...full.map((y) => y.precip)))
  const monthTicks = niceTicks(Math.max(...data.monthly.map((m) => m.precip)))
  const yearly = full
  const ytd = data.yearToDate
  const rainPct = ytd.precipPct
  const r = data.records
  const pText = (p) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`)

  return (
    <div className={`climate ${loading ? 'is-refreshing' : ''}`}>
      <header className="climate-head">
        <div>
          <h1 className="place">{place.name}</h1>
          <p className="place-meta">
            Climate record {longDate(data.period.start)} to {longDate(data.period.end)}, compared with the {data.period.baseline} average
          </p>
        </div>
        {controls}
      </header>

      <Stripes yearly={data.yearly} baseline={data.period.baseline} />

      <dl className="headline-stats reveal">
        <div>
          <dt>Warming rate</dt>
          <dd>
            <Num value={tr.meanTemp.perDecade} decimals={2} signed suffix="°C" />
          </dd>
          <dd className="stat-note">per decade, {tr.meanTemp.significant ? 'statistically significant' : 'not significant'} ({pText(tr.meanTemp.pValue)})</dd>
        </div>
        <div>
          <dt>{ytd.year} so far</dt>
          <dd>
            <Num value={ytd.anomaly} decimals={2} signed suffix="°C" />
          </dd>
          <dd className="stat-note">vs the same months in {data.period.baseline}</dd>
        </div>
        <div>
          <dt>Rain in {ytd.year}</dt>
          <dd>
            <Num value={rainPct} signed suffix="%" />
          </dd>
          <dd className="stat-note">
            {mm(ytd.precip)} against a normal of {mm(ytd.basePrecip)}
          </dd>
        </div>
        <div>
          <dt>Days ≥ {HOT_DAY}°C</dt>
          <dd>
            <Num value={tr.hotDays.perDecade} decimals={1} signed />
          </dd>
          <dd className="stat-note">days per decade</dd>
        </div>
      </dl>

      <section className="panel reveal" aria-labelledby="h-findings">
        <h2 id="h-findings">Key findings</h2>
        <ul className="insights">
          {data.insights.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section className="panel reveal" aria-labelledby="h-annual">
        <h2 id="h-annual">Annual mean temperature</h2>
        <div className="legend">
          <span>
            <i className="lg-line" style={{ background: t.heat }} />
            Yearly mean (°C)
          </span>
          <span>
            <i className="lg-dash" style={{ borderColor: t.trend }} />
            Linear trend
          </span>
        </div>
        <div className="chart" style={{ height: 260 }}>
          <ResponsiveContainer>
            <ComposedChart data={yearly} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="year" {...axisProps(t)} minTickGap={24} />
              <YAxis {...axisProps(t)} domain={['dataMin - 0.3', 'dataMax + 0.3']} tickFormatter={(v) => v.toFixed(1)} />
              <ReferenceLine y={data.baseline.meanTemp} stroke={t['ink-3']} strokeDasharray="2 4" />
              <Tooltip
                cursor={{ stroke: t['ink-3'], strokeDasharray: '3 3' }}
                content={
                  <ChartTooltip
                    rows={(d) => [
                      ['Mean', deg(d.meanTemp, 2), t.heat],
                      ['Anomaly', signed(d.anomaly, 2, '°C')],
                      ['Hottest day', deg(d.maxTemp, 1)],
                      ['Trend', deg(d.trend, 2), t.trend],
                    ]}
                  />
                }
              />
              <Line type="linear" dataKey="trend" stroke={t.trend} strokeWidth={1.5} strokeDasharray="6 4" dot={false} activeDot={false} />
              <Line type="monotone" dataKey="meanTemp" stroke={t.heat} strokeWidth={2} dot={{ r: 2.5, fill: t.heat, strokeWidth: 0 }} activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-note">Dotted line marks the {data.period.baseline} average of {deg(data.baseline.meanTemp, 2)}C. Trend fitted by least squares; Sen’s slope gives {signed(tr.meanTemp.sensPerDecade, 2, '°C')} per decade.</p>
      </section>

      <div className="grid-2">
        <section className="panel reveal" aria-labelledby="h-rain">
          <h2 id="h-rain">Annual rainfall (mm)</h2>
          <div className="chart" style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={full} margin={{ top: 8, right: 8, bottom: 0, left: -6 }} barCategoryGap={2}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="year" {...axisProps(t)} minTickGap={24} />
                <YAxis {...axisProps(t)} ticks={rainTicks} domain={[0, rainTicks[rainTicks.length - 1]]} />
                <ReferenceLine y={data.baseline.precip} stroke={t['ink-3']} strokeDasharray="2 4" />
                <Tooltip
                  cursor={{ fill: t.grid, opacity: 0.5 }}
                  content={
                    <ChartTooltip
                      rows={(d) => [
                        ['Rainfall', mm(d.precip), t.rain],
                        ['vs normal', signed(d.precipAnomalyPct, 0, '%')],
                        ['Rainy days', d.rainyDays],
                        ['Heavy-rain days', d.heavyRainDays],
                      ]}
                    />
                  }
                />
                <Bar dataKey="precip" fill={t.rain} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-note">Trend {signed(tr.precip.perDecade, 0, ' mm')} per decade ({tr.precip.significant ? 'significant' : 'not significant'}).</p>
        </section>

        <section className="panel reveal" aria-labelledby="h-hot">
          <h2 id="h-hot">Days at or above {HOT_DAY}°C</h2>
          <div className="chart" style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={full} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap={2}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="year" {...axisProps(t)} minTickGap={24} />
                <YAxis {...axisProps(t)} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: t.grid, opacity: 0.5 }}
                  content={<ChartTooltip rows={(d) => [['Hot days', d.hotDays, t.heat], ['Hottest day', deg(d.maxTemp, 1)]]} />}
                />
                <Bar dataKey="hotDays" fill={t.heat} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-note">Based on daily maximum temperature, the threshold IMD uses for heat stress.</p>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel reveal" aria-labelledby="h-season-t">
          <h2 id="h-season-t">Typical year: temperature (°C)</h2>
          <div className="legend">
            <span>
              <i className="lg-band" style={{ background: t.heat }} />
              Average low to high
            </span>
            <span>
              <i className="lg-line" style={{ background: t.heat }} />
              Daily mean
            </span>
          </div>
          <div className="chart" style={{ height: 220 }}>
            <ResponsiveContainer>
              <ComposedChart data={data.monthly} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="name" {...axisProps(t)} interval={0} />
                <YAxis {...axisProps(t)} domain={['dataMin - 2', 'dataMax + 2']} tickFormatter={(v) => Math.round(v)} />
                <Tooltip
                  cursor={{ stroke: t['ink-3'], strokeDasharray: '3 3' }}
                  content={
                    <ChartTooltip
                      rows={(d) => [
                        ['Average high', deg(d.avgMax, 1)],
                        ['Mean', deg(d.meanTemp, 1), t.heat],
                        ['Average low', deg(d.avgMin, 1)],
                      ]}
                    />
                  }
                />
                <Area type="monotone" dataKey={(d) => [d.avgMin, d.avgMax]} stroke="none" fill={t.heat} fillOpacity={0.18} activeDot={false} />
                <Line type="monotone" dataKey="meanTemp" stroke={t.heat} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel reveal" aria-labelledby="h-season-r">
          <h2 id="h-season-r">Typical year: rainfall (mm)</h2>
          <div className="chart" style={{ height: 248 }}>
            <ResponsiveContainer>
              <BarChart data={data.monthly} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={4}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="name" {...axisProps(t)} interval={0} />
                <YAxis {...axisProps(t)} ticks={monthTicks} domain={[0, monthTicks[monthTicks.length - 1]]} />
                <Tooltip
                  cursor={{ fill: t.grid, opacity: 0.5 }}
                  content={<ChartTooltip rows={(d) => [['Rainfall', mm(d.precip), t.rain], ['Rainy days', d.rainyDays]]} />}
                />
                <Bar dataKey="precip" fill={t.rain} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel reveal" aria-labelledby="h-seasons">
          <h2 id="h-seasons">Seasons</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Season</th>
                  <th scope="col">Share of rain</th>
                  <th scope="col">Avg rainfall</th>
                  <th scope="col">Mean temp</th>
                  <th scope="col">Rain trend / decade</th>
                </tr>
              </thead>
              <tbody>
                {data.seasons.map((s) => (
                  <tr key={s.season}>
                    <th scope="row">{s.season}</th>
                    <td>{s.share}%</td>
                    <td>{mm(s.avgPrecip)}</td>
                    <td>{deg(s.meanTemp, 1)}</td>
                    <td>{signed(s.precipTrend.perDecade, 0, ' mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="sub">By decade</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Decade</th>
                  <th scope="col">Mean temp</th>
                  <th scope="col">Hot days / yr</th>
                  <th scope="col">Rain / yr</th>
                </tr>
              </thead>
              <tbody>
                {data.decadal.map((d) => (
                  <tr key={d.decade}>
                    <th scope="row">
                      {d.decade}
                      {d.years < 10 && <span className="dd-note"> ({d.years} yrs)</span>}
                    </th>
                    <td>{deg(d.meanTemp, 2)}</td>
                    <td>{d.hotDays}</td>
                    <td>{mm(d.precip)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel reveal" aria-labelledby="h-records">
          <h2 id="h-records">Records in this period</h2>
          <dl className="records">
            <div>
              <dt>Hottest day</dt>
              <dd>
                {deg(r.hottestDay.value, 1)}C <span>{longDate(r.hottestDay.date)}</span>
              </dd>
            </div>
            <div>
              <dt>Coldest night</dt>
              <dd>
                {deg(r.coldestDay.value, 1)}C <span>{longDate(r.coldestDay.date)}</span>
              </dd>
            </div>
            <div>
              <dt>Wettest day</dt>
              <dd>
                {mm(r.wettestDay.value)} <span>{longDate(r.wettestDay.date)}</span>
              </dd>
            </div>
            <div>
              <dt>Warmest year</dt>
              <dd>
                {r.hottestYear.year} <span>{deg(r.hottestYear.value, 2)}C mean</span>
              </dd>
            </div>
            <div>
              <dt>Coolest year</dt>
              <dd>
                {r.coldestYear.year} <span>{deg(r.coldestYear.value, 2)}C mean</span>
              </dd>
            </div>
            <div>
              <dt>Wettest year</dt>
              <dd>
                {r.wettestYear.year} <span>{mm(r.wettestYear.value)}</span>
              </dd>
            </div>
            <div>
              <dt>Driest year</dt>
              <dd>
                {r.driestYear.year} <span>{mm(r.driestYear.value)}</span>
              </dd>
            </div>
          </dl>
          <p className="chart-note">
            Source: ERA5 reanalysis via Open-Meteo. Trends tested with Mann-Kendall; rainy day ≥ {RAINY_DAY} mm and heavy rain ≥ {HEAVY_RAIN} mm follow IMD definitions.
          </p>
        </section>
      </div>
    </div>
  )
}
