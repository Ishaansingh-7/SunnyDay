import { useMemo } from 'react'
import { seeded } from '../../lib/motion.js'
import './scene.css'

const COUNT = { clear: 1, partly: 3, cloudy: 4, fog: 3, drizzle: 3, rain: 4, storm: 4, snow: 3 }
const CLOUD_PATH =
  'M26 70c-12 0-22-8-22-19 0-10 8-18 19-19 3-13 15-22 29-22 12 0 23 7 27 18 3-1 6-2 10-2 14 0 25 10 26 23 9 2 16 9 16 18 0 2 0 2-1 3H26z'

export default function MiniScene({ kind, isDay, seed = 1 }) {
  const n = isDay || kind !== 'clear' ? COUNT[kind] ?? 2 : 0
  const clouds = useMemo(() => {
    const rnd = seeded(seed * 131 + kind.length)
    return Array.from({ length: n }, (_, i) => ({
      top: -10 + rnd() * 50, size: 110 + rnd() * 120, duration: 40 + rnd() * 30, offset: (i + rnd()) / n, o: 0.5 + rnd() * 0.45,
    }))
  }, [kind, n, seed])
  const tone = { cloudy: 'grey', fog: 'mist', drizzle: 'grey', rain: 'dark', storm: 'storm', snow: 'grey' }[kind] || 'white'

  return (
    <div className={`mini ${isDay ? 'is-day' : 'is-night'} tone-${tone}`} aria-hidden="true">
      {isDay && (kind === 'clear' || kind === 'partly') && <span className="mini-sun" />}
      {!isDay && (kind === 'clear' || kind === 'partly') && <span className="mini-moon" />}
      {clouds.map((c, i) => (
        <div key={i} className="cloud-track" style={{ top: `${c.top}%`, animationDuration: `${c.duration}s`, animationDelay: `${-c.offset * c.duration}s` }}>
          <svg className="cloud" width={c.size} height={c.size * 0.55} viewBox="0 0 160 80" style={{ opacity: c.o }}>
            <path d={CLOUD_PATH} />
          </svg>
        </div>
      ))}
      {(kind === 'rain' || kind === 'storm') && <span className="mini-rain" />}
      {kind === 'drizzle' && <span className="mini-rain light" />}
      {kind === 'snow' && <span className="mini-snow" />}
      {kind === 'storm' && <span className="mini-flash" style={{ animationDelay: `${-seed * 1.7}s` }} />}
    </div>
  )
}
