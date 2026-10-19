import { useEffect, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getForecast } from '../lib/weather.js'
import { useAsync } from '../lib/useAsync.js'
import { clock, deg, hourLabel, mm, pct, placeLabel, weekday } from '../lib/format.js'
import { useLocalClock, useNow, useReducedMotion } from '../lib/motion.js'
import Roll from './Roll.jsx'
import { axisProps, useTokens } from '../lib/theme.js'
import ChartTooltip from './ChartTooltip.jsx'
import DaylightArc, { sunProgress } from './DaylightArc.jsx'
import HourlyStrip from './HourlyStrip.jsx'
import Tiles from './Tiles.jsx'
import WeekList from './WeekList.jsx'
import WeatherIcon from './WeatherIcon.jsx'
import WeatherScene from './scene/WeatherScene.jsx'
import { ErrorState } from './States.jsx'

export function skyClass(icon, isDay) {
  if (!isDay) return icon === 'storm' || icon === 'rain' || icon === 'drizzle' ? 'sky-night-rain' : icon === 'cloudy' || icon === 'fog' ? 'sky-night-cloudy' : 'sky-night'
  return { clear: 'sky-clear', partly: 'sky-partly', rain: 'sky-rain', drizzle: 'sky-rain', storm: 'sky-storm', fog: 'sky-fog', snow: 'sky-snow' }[icon] || 'sky-cloudy'
}

const PREVIEWS = [
  ['clear', true, 'Sunny'],
  ['partly', true, 'Partly cloudy'],
  ['cloudy', true, 'Overcast'],
  ['drizzle', true, 'Drizzle'],
  ['rain', true, 'Rain'],
  ['storm', true, 'Thunderstorm'],
  ['snow', true, 'Snow'],
  ['fog', true, 'Fog'],
  ['clear', false, 'Clear night'],
  ['rain', false, 'Rainy night'],
]

function EffectsMenu({ preview, setPreview }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [])
  const pick = (p) => {
    setPreview(p)
    setOpen(false)
  }
  return (
    <div className="fx" ref={box}>
      <button type="button" className={`fx-btn ${preview ? 'on' : ''}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <span className={`fx-dot ${preview ? 'preview' : 'live'}`} aria-hidden="true" />
        {preview ? `Preview: ${preview[2]}` : 'Live weather'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="fx-menu" role="menu">
          <button type="button" role="menuitemradio" aria-checked={!preview} className={`fx-live ${!preview ? 'on' : ''}`} onClick={() => pick(null)}>
            <span className="fx-dot live" aria-hidden="true" /> Show live weather
          </button>
          <p className="fx-head">Preview an effect</p>
          <div className="fx-grid">
            {PREVIEWS.map((p) => {
              const on = !!preview && preview[2] === p[2]
              return (
                <button key={p[2]} type="button" role="menuitemradio" aria-checked={on} className={on ? 'on' : ''} onClick={() => pick(p)}>
                  <WeatherIcon icon={p[0]} night={!p[1]} size={20} />
                  {p[2]}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function placeLink(place) {
  const q = new URLSearchParams({ place: place.name, lat: String(place.lat), lon: String(place.lon) })
  if (place.admin1) q.set('region', place.admin1)
  if (place.country) q.set('country', place.country)
  return `${window.location.origin}${window.location.pathname}?${q}#today`
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (!ok) throw new Error('copy failed')
  }
}

function ShareButton({ place, text }) {
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 2200)
    return () => clearTimeout(t)
  }, [note])
  const share = async () => {
    const url = placeLink(place)
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: `${place.name} weather · SunnyDay`, text, url })
        return
      }
      await copyText(url)
      setNote('Link copied')
    } catch (e) {
      if (e?.name !== 'AbortError') setNote('Couldn’t copy the link')
    }
  }
  return (
    <div className="share">
      <button type="button" className="fx-btn share-btn" onClick={share} aria-label={`Share ${place.name}'s weather`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
          <path d="M5 12.5v5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-5" />
        </svg>
        <span>Share</span>
      </button>
      {note && (
        <span className="share-note" role="status">
          {note}
        </span>
      )}
    </div>
  )
}

const ALERT_ICON = { heat: 'clear', storm: 'storm', rain: 'rain', air: 'fog' }

function Alerts({ alerts }) {
  if (!alerts?.length) return null
  return (
    <section className="alerts reveal" aria-label="Weather warnings">
      {alerts.map((a) => (
        <div key={a.kind} className={`alert alert-${a.kind}`} role="note">
          <WeatherIcon icon={ALERT_ICON[a.kind]} size={26} still />
          <p>
            <strong>{a.title}</strong>
            {a.text}
          </p>
        </div>
      ))}
    </section>
  )
}

function LiveTime({ offset }) {
  const now = useLocalClock(offset, 1000)
  const h = Number(now.slice(11, 13))
  const m = now.slice(14, 16)
  return (
    <span className="live-time">
      {weekday(now.slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' })}, {h % 12 || 12}
      <span className="blink">:</span>
      {m} {h < 12 ? 'am' : 'pm'}
    </span>
  )
}

function Updated({ at }) {
  const now = useNow(15000)
  const mins = Math.floor((now - at) / 60000)
  return <span>{mins < 1 ? 'Updated just now' : `Updated ${mins} min ago`}</span>
}

function Skeleton() {
  return (
    <div className="today" aria-busy="true" aria-label="Loading forecast">
      <div className="sky sky-partly skel-sky">
        <WeatherScene kind="partly" isDay />
        <span className="skel w40" />
        <span className="skel w25" />
        <span className="skel big" />
        <span className="skel strip" />
      </div>
      <div className="tiles">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="tile skel-tile" />
        ))}
      </div>
    </div>
  )
}

function Timeline({ hours, sel, setSel }) {
  const max = hours.length - 1
  const h = hours[sel]
  const live = sel === 0
  const days = hours.map((x, i) => [i, x.time]).filter(([i, t]) => i > 0 && t.slice(11, 13) === '00')
  return (
    <div className="timeline">
      <div className="tl-track">
        <input
          id="timeline-range"
          type="range"
          min="0"
          max={max}
          value={sel}
          aria-label="Forecast hour"
          aria-valuetext={live ? 'Now' : `${weekday(h.time.slice(0, 10))} ${clock(h.time)}`}
          style={{ '--p': `${(sel / max) * 100}%` }}
          onChange={(e) => setSel(Number(e.target.value))}
        />
        <div className="tl-days" aria-hidden="true">
          {days.map(([i, t]) => (
            <span key={t} style={{ left: `${(i / max) * 100}%` }}>
              {weekday(t.slice(0, 10))}
            </span>
          ))}
        </div>
      </div>
      <span className="tl-label">{live ? 'Live now' : `${weekday(h.time.slice(0, 10))} ${clock(h.time)}`}</span>
      <button type="button" className={`tl-now ${live ? 'hide' : ''}`} onClick={() => setSel(0)} tabIndex={live ? -1 : 0}>
        Back to now
      </button>
    </div>
  )
}

export default function Today({ place }) {
  const { data, error, retry } = useAsync(() => getForecast(place.lat, place.lon), [place.lat, place.lon])
  const [preview, setPreview] = useState(null)
  const [sel, setSel] = useState(0)
  const skyRef = useRef(null)
  const reduced = useReducedMotion()
  const t = useTokens()
  const offset = data?.utcOffset ?? 0
  const now = useLocalClock(offset, 30000).slice(0, 16)

  useEffect(() => {
    const id = setInterval(retry, 10 * 60 * 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.lat, place.lon])

  const hour = data ? data.hourly[sel] : null
  const live = sel === 0
  const kind = preview ? preview[0] : !data ? null : live ? data.current.icon : hour.icon
  const isDay = preview ? preview[1] : !data ? true : live ? data.current.isDay : hour.isDay
  const wind = !data ? 8 : live ? data.current.wind : hour.wind

  useEffect(() => {
    if (!kind) return
    const root = document.documentElement
    root.dataset.sky = isDay ? kind : 'night'
    root.dataset.daynight = isDay ? 'day' : 'night'
  }, [kind, isDay, wind])

  useEffect(() => {
    const el = skyRef.current
    if (!el || !data) return
    const send = (hidden) =>
      window.dispatchEvent(
        new CustomEvent('sunnyday-mini', { detail: { hidden, temp: Math.round(data.current.temp), icon: data.current.icon, isDay: data.current.isDay, name: place.name } })
      )
    const io = new IntersectionObserver(([e]) => send(!e.isIntersecting), { threshold: 0, rootMargin: '-80px 0px 0px 0px' })
    io.observe(el)
    let raf
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => el.style.setProperty('--sy', Math.min(600, window.scrollY).toFixed(0)))
    }
    if (!reduced) window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
      send(false)
    }
  }, [data, place.name, reduced])

  if (error && !data) return <ErrorState error={error} retry={retry} what="the forecast" />
  if (!data) return <Skeleton />

  const c = data.current
  const today = data.daily[0]
  const ticks = data.hourly.filter((h) => Number(h.time.slice(11, 13)) % 6 === 0).map((h) => h.time)
  const atTime = live ? now : hour.time
  const dayIdx = Math.max(0, data.daily.findIndex((d) => d.date === atTime.slice(0, 10)))
  const day = data.daily[dayIdx] || today
  const sun = sunProgress(atTime, day)
  const nearEdge = Math.min(Math.abs(sun.n - sun.rise), Math.abs(sun.n - sun.set))
  const golden = !preview && isDay && nearEdge < 75 ? 1 - nearEdge / 75 : 0
  const temp = Math.round(live ? c.temp : hour.temp)
  const feels = live ? c.feelsLike : hour.feelsLike
  const condText = preview ? preview[2] : live ? c.condition : hour.condition

  return (
    <div className="today">
      <section ref={skyRef} className={`sky ${skyClass(kind, isDay)} ${live ? '' : 'is-forecast'}`} aria-label="Current conditions">
        <WeatherScene key={`${kind}${isDay}`} kind={kind} isDay={isDay} wind={wind} windDir={c.windDir} sunT={preview ? 0.62 : sun.t} golden={golden} />
        <div className="sky-head">
          <div>
            <h1 className="place">{place.name}</h1>
            <p className="sky-meta">
              {placeLabel(place) && <span>{placeLabel(place)} · </span>}
              {live ? <LiveTime offset={offset} /> : <span className="fc-chip">Forecast for {weekday(hour.time.slice(0, 10), { weekday: 'long' })} {clock(hour.time)}</span>}
            </p>
          </div>
          <div className="sky-tools">
            <ShareButton place={place} text={`${place.name}: ${Math.round(c.temp)}°C, ${c.condition.toLowerCase()}`} />
            <EffectsMenu preview={preview} setPreview={setPreview} />
          </div>
        </div>
        <div className="sky-body">
          <div className="now">
            <span className="now-temp" aria-label={`${temp} degrees Celsius`}>
              <Roll value={temp} />
              <span className="now-unit">°C</span>
            </span>
            <div className="now-cond" key={`${condText}`}>
              <WeatherIcon key={`${kind}${isDay}`} icon={kind} night={!isDay} size={56} />
              <p className="cond-text">{condText}</p>
              <p className="cond-sub">
                <span>Feels like {deg(feels)}</span> · <span>H {deg(day.max)}</span> · <span>L {deg(day.min)}</span>
              </p>
            </div>
          </div>
          <DaylightArc now={atTime} today={day} tomorrow={data.daily[dayIdx + 1]} />
        </div>
        <HourlyStrip hours={data.hourly} nowTemp={c.temp} selected={sel} onSelect={setSel} />
        <Timeline hours={data.hourly} sel={sel} setSel={setSel} />
        <p className="sky-foot">
          <Updated at={data.fetchedAt} />
          <span>Click the sky to interact · Refreshes every 10 minutes</span>
        </p>
      </section>

      <Alerts alerts={data.alerts} />

      {data.insights.length > 0 && (
        <section className="outlook reveal" aria-label="This week">
          <ul>
            {data.insights.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <button type="button" className="outlook-cta" onClick={() => window.dispatchEvent(new Event('sunnyday-open-updates'))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3.5 7.5 12 13l8.5-5.5" />
              <rect x="3" y="5" width="18" height="14" rx="3" />
            </svg>
            Get {place.name}’s forecast by email
          </button>
        </section>
      )}

      <Tiles c={c} today={today} air={data.air} now={now} />

      <div className="split">
        <section className="panel week-panel reveal" aria-labelledby="h-week">
          <h2 id="h-week">7-day forecast</h2>
          <p className="panel-hint">Select a day for its hourly temperature</p>
          <WeekList daily={data.daily} allHourly={data.allHourly} />
        </section>

        <section className="panel reveal" style={{ '--i': 1 }} aria-labelledby="h-48">
          <h2 id="h-48">Next 48 hours</h2>
          <h3 className="chart-title">Temperature, °C</h3>
          <div className="chart" style={{ height: 210 }}>
            <ResponsiveContainer>
              <LineChart data={data.hourly} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="time" ticks={ticks} tickFormatter={hourLabel} {...axisProps(t)} />
                <YAxis {...axisProps(t)} domain={['dataMin - 1', 'dataMax + 1']} allowDecimals={false} tickFormatter={(v) => Math.round(v)} />
                <Tooltip
                  cursor={{ stroke: t['ink-3'], strokeDasharray: '3 3' }}
                  content={
                    <ChartTooltip
                      formatLabel={(_, d) => `${weekday(d.time.slice(0, 10))} ${clock(d.time)}`}
                      rows={(d) => [
                        ['Temperature', deg(d.temp, 1), t.heat],
                        ['Feels like', deg(d.feelsLike, 1)],
                        ['Humidity', pct(d.humidity)],
                        ['Wind', `${d.wind} km/h`],
                      ]}
                    />
                  }
                />
                <Line type="monotone" dataKey="temp" stroke={t.heat} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: t.surface, strokeWidth: 2 }} animationDuration={1200} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <h3 className="chart-title">Chance of rain, %</h3>
          <div className="chart" style={{ height: 130 }}>
            <ResponsiveContainer>
              <BarChart data={data.hourly} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barCategoryGap={2}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="time" ticks={ticks} tickFormatter={hourLabel} {...axisProps(t)} />
                <YAxis {...axisProps(t)} domain={[0, 100]} ticks={[0, 50, 100]} />
                <Tooltip
                  cursor={{ fill: t.grid, opacity: 0.5 }}
                  content={
                    <ChartTooltip
                      formatLabel={(_, d) => `${weekday(d.time.slice(0, 10))} ${clock(d.time)}`}
                      rows={(d) => [
                        ['Chance of rain', pct(d.pop), t.rain],
                        ['Expected', mm(d.precip, 1)],
                      ]}
                    />
                  }
                />
                <Bar dataKey="pop" fill={t.rain} radius={[3, 3, 0, 0]} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  )
}
