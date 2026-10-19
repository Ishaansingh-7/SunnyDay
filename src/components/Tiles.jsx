import { compass, clock, minutesOf } from '../lib/format.js'
import { Num, useMounted } from '../lib/motion.js'
import { uvLevel } from '../lib/weather.js'

function Tile({ title, children, foot, i }) {
  return (
    <div className="tile reveal" style={{ '--i': i }}>
      <h3>{title}</h3>
      <div className="tile-body">{children}</div>
      {foot && <p className="tile-foot">{foot}</p>}
    </div>
  )
}

function Scale({ value, max, label, stops }) {
  const on = useMounted(300)
  const pos = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="scale" role="img" aria-label={label}>
      <span className="scale-bar" style={{ background: `linear-gradient(90deg, ${stops})` }} />
      <span className="scale-mark" style={{ left: on ? `${pos}%` : '0%' }} />
    </div>
  )
}

function Glass({ value }) {
  const on = useMounted(200)
  return (
    <span className="glass" aria-hidden="true">
      <span className="glass-fill" style={{ height: on ? `${value}%` : '0%' }}>
        <span className="wave" />
        <span className="wave two" />
      </span>
    </span>
  )
}

function Gauge({ value, min, max }) {
  const on = useMounted(250)
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const angle = -120 + (on ? t : 0) * 240
  return (
    <svg className="gauge" width="64" height="52" viewBox="0 0 64 52" aria-hidden="true">
      <path d="M10.7 44.3A24 24 0 1 1 53.3 44.3" className="gauge-track" />
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '32px 32px' }} className="gauge-needle">
        <path d="M32 32 32 13" />
      </g>
      <circle cx="32" cy="32" r="3.5" className="gauge-hub" />
    </svg>
  )
}

function Ring({ fraction }) {
  const on = useMounted(250)
  const r = 19
  const c = 2 * Math.PI * r
  return (
    <svg className="ring" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r={r} className="ring-track" />
      <circle cx="24" cy="24" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={on ? c * (1 - fraction) : c} />
      <circle cx="24" cy="5" r="3" className="ring-sun" style={{ transform: `rotate(${(on ? fraction : 0) * 360}deg)`, transformOrigin: '24px 24px' }} />
    </svg>
  )
}

function feelsNote(c) {
  const d = c.feelsLike - c.temp
  if (d >= 3) return 'Humidity makes it feel warmer than it is.'
  if (d <= -3) return 'Wind makes it feel cooler than it is.'
  return 'Close to the actual temperature.'
}

export default function Tiles({ c, today, air, now }) {
  const uvNow = c.uv ?? today.uv ?? 0
  const uv = uvLevel(uvNow)
  const rise = minutesOf(today.sunrise)
  const set = minutesOf(today.sunset)
  const elapsed = Math.max(0, Math.min(1, (minutesOf(now) - rise) / (set - rise)))
  const windOn = useMounted(200)

  return (
    <section className="tiles" aria-labelledby="h-details">
      <h2 id="h-details" className="sr-only">Details right now</h2>
      <Tile i={0} title="Feels like" foot={feelsNote(c)}>
        <span className="tile-value">
          <Num value={c.feelsLike} />°
        </span>
        <span className={`thermo ${c.feelsLike >= 35 ? 'hot' : c.feelsLike <= 15 ? 'cold' : ''}`} aria-hidden="true">
          <span style={{ height: `${Math.max(8, Math.min(100, ((c.feelsLike + 5) / 50) * 100))}%` }} />
        </span>
      </Tile>
      <Tile i={1} title="Humidity" foot={`Dew point ${Math.round(c.dewPoint)}°`}>
        <span className="tile-value">
          <Num value={c.humidity} />%
        </span>
        <Glass value={c.humidity} />
      </Tile>
      <Tile i={2} title="Wind" foot={c.gusts ? `Gusts up to ${c.gusts} km/h` : null}>
        <span className="tile-value">
          <Num value={c.wind} />
          <small> km/h</small>
        </span>
        <span className="wind-dial" aria-label={`From the ${compass(c.windDir)}`}>
          <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="22" className="dial-ring" />
            {['N', 'E', 'S', 'W'].map((d, k) => (
              <text key={d} x={26 + 16 * Math.sin((k * Math.PI) / 2)} y={26 - 16 * Math.cos((k * Math.PI) / 2) + 3} className="dial-letter">
                {d}
              </text>
            ))}
            <g className="dial-sway" style={{ transform: `rotate(${windOn ? (c.windDir ?? 0) + 180 : 0}deg)`, transformOrigin: '26px 26px' }}>
              <path d="M26 6 31 18H21Z" className="dial-arrow" />
              <path d="M26 18v18" className="dial-tail" />
            </g>
          </svg>
          <small>from {compass(c.windDir)}</small>
        </span>
      </Tile>
      <Tile i={3} title="UV index" foot={uv ? `${uv.label}${(today.uv ?? 0) >= 6 ? `, peaks at ${today.uv} today` : ''}` : null}>
        <span className="tile-value">
          <Num value={uvNow} decimals={uvNow % 1 ? 1 : 0} />
        </span>
        <Scale value={uvNow} max={11} label={`UV ${uv?.label}`} stops="#3fae5a, #f2c230, #f08a24, #d8432f, #8e3fb5" />
      </Tile>
      <Tile i={4} title="Air quality" foot={air ? `${air.level.label} · PM2.5 ${air.pm25} µg/m³` : 'Not available for this place'}>
        <span className="tile-value">{air ? <Num value={air.aqi} /> : '–'}</span>
        {air && <Scale value={air.aqi} max={300} label={`US AQI ${air.level.label}`} stops="#3fae5a 0%, #f2c230 22%, #f08a24 40%, #d8432f 58%, #8e3fb5 80%, #7a1f35 100%" />}
      </Tile>
      <Tile i={5} title="Rain today" foot={`${today.pop}% chance`}>
        <span className="tile-value">
          <Num value={today.precip} decimals={today.precip < 10 ? 1 : 0} />
          <small> mm</small>
        </span>
        <span className="rain-cup" aria-hidden="true">
          <span style={{ height: `${Math.min(100, today.pop)}%` }} />
        </span>
      </Tile>
      <Tile i={6} title="Pressure" foot={c.visibility != null ? `Visibility ${Math.round(c.visibility / 1000)} km` : null}>
        <span className="tile-value">
          <Num value={c.pressure} />
          <small> hPa</small>
        </span>
        <Gauge value={c.pressure} min={980} max={1040} />
      </Tile>
      <Tile i={7} title="Daylight" foot={`${clock(today.sunrise)} to ${clock(today.sunset)}`}>
        <span className="tile-value">
          <Num value={Math.floor(today.daylight / 3600)} />
          <small> h </small>
          <Num value={Math.round((today.daylight % 3600) / 60)} />
          <small> min</small>
        </span>
        <Ring fraction={elapsed} />
      </Tile>
    </section>
  )
}
