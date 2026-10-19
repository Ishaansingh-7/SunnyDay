import { clock, duration, minutesOf } from '../lib/format.js'
import { useCountUp } from '../lib/motion.js'

const W = 240
const H = 132
const CX = W / 2
const CY = 112
const R = 96

function point(t) {
  const a = Math.PI * (1 - t)
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)]
}

export function sunProgress(now, today) {
  const n = minutesOf(now)
  const rise = minutesOf(today.sunrise)
  const set = minutesOf(today.sunset)
  return { up: n >= rise && n <= set, t: Math.max(0, Math.min(1, (n - rise) / (set - rise))), n, rise, set }
}

export default function DaylightArc({ now, today, tomorrow }) {
  const { up, t, n, rise, set } = sunProgress(now, today)
  const anim = useCountUp(up ? t * 1000 : 0, 1800) / 1000
  const [sx, sy] = point(anim)
  const [ex, ey] = point(1)
  const [bx, by] = point(0)

  let note
  if (up) note = `Sunset in ${duration(set - n)}`
  else if (n < rise) note = `Sunrise in ${duration(rise - n)}`
  else note = tomorrow ? `Sunrise in ${duration(24 * 60 - n + minutesOf(tomorrow.sunrise))}` : 'After sunset'

  return (
    <figure className="arc" aria-label={`Daylight: sunrise ${clock(today.sunrise)}, sunset ${clock(today.sunset)}. ${note}.`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true">
        <defs>
          <linearGradient id="arc-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#ffb25b" />
            <stop offset="1" stopColor="#ffd66b" />
          </linearGradient>
        </defs>
        <path d={`M${bx} ${by} A${R} ${R} 0 0 1 ${ex} ${ey}`} className="arc-track" />
        {up && anim > 0.001 && <path d={`M${bx} ${by} A${R} ${R} 0 0 1 ${sx} ${sy}`} className="arc-done" />}
        <line x1="8" x2={W - 8} y1={CY} y2={CY} className="arc-horizon" />
        {up ? (
          <g>
            <circle cx={sx} cy={sy} r="16" className="sun-glow" />
            <circle cx={sx} cy={sy} r="8" className="sun-core" />
          </g>
        ) : (
          <circle cx={n < rise ? bx : ex} cy={CY} r="5" className="sun-down" />
        )}
      </svg>
      <figcaption>
        <span>
          <small>Sunrise</small>
          {clock(today.sunrise)}
        </span>
        <span className="arc-note">{note}</span>
        <span className="right">
          <small>Sunset</small>
          {clock(today.sunset)}
        </span>
      </figcaption>
    </figure>
  )
}
