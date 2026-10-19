import { useEffect, useMemo, useRef } from 'react'
import { seeded, useReducedMotion } from '../../lib/motion.js'
import SkyCanvas from './SkyCanvas.jsx'
import './scene.css'

const CLOUDS = {
  clear: { day: 5, night: 0, tone: 'white', opacity: 0.92 },
  partly: { day: 8, night: 4, tone: 'white', opacity: 0.97 },
  cloudy: { day: 8, night: 7, tone: 'grey', opacity: 0.9 },
  fog: { day: 4, night: 4, tone: 'mist', opacity: 0.7 },
  drizzle: { day: 7, night: 6, tone: 'grey', opacity: 0.9 },
  rain: { day: 8, night: 7, tone: 'dark', opacity: 0.92 },
  storm: { day: 9, night: 8, tone: 'storm', opacity: 0.95 },
  snow: { day: 6, night: 5, tone: 'grey', opacity: 0.85 },
}

const CLOUD_PATH =
  'M26 70c-12 0-22-8-22-19 0-10 8-18 19-19 3-13 15-22 29-22 12 0 23 7 27 18 3-1 6-2 10-2 14 0 25 10 26 23 9 2 16 9 16 18 0 2 0 2-1 3H26z'

function Cloud({ c }) {
  return (
    <div
      className="cloud-track"
      style={{
        top: `${c.top}%`,
        animationDuration: `${c.duration}s`,
        animationDelay: `${-c.offset * c.duration}s`,
        animationDirection: c.reverse ? 'reverse' : 'normal',
      }}
    >
      <svg className="cloud" width={c.size} height={c.size * 0.55} viewBox="0 0 160 80" style={{ opacity: c.opacity, filter: `blur(${c.blur}px)` }}>
        <path d={CLOUD_PATH} />
      </svg>
    </div>
  )
}

function Stars({ count = 70 }) {
  const stars = useMemo(() => {
    const rnd = seeded(42)
    return Array.from({ length: count }, () => ({
      x: rnd() * 100, y: rnd() * 75, s: 0.6 + rnd() * 1.8, d: 2 + rnd() * 4, delay: -rnd() * 6, o: 0.35 + rnd() * 0.65,
    }))
  }, [count])
  return (
    <div className="stars" aria-hidden="true">
      {stars.map((s, i) => (
        <span
          key={i}
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o, animationDuration: `${s.d}s`, animationDelay: `${s.delay}s` }}
        />
      ))}
      <span className="shooting" />
      <span className="shooting two" />
    </div>
  )
}

export default function WeatherScene({ kind = 'clear', isDay = true, wind = 8, windDir = 270, sunT = 0.5, golden = 0, paused = false }) {
  const wrap = useRef(null)
  const reduced = useReducedMotion()
  const cfg = CLOUDS[kind] || CLOUDS.cloudy
  const blowsWest = Math.sin((((windDir ?? 270) + 180) * Math.PI) / 180) < 0
  const speed = 0.55 + Math.min(2.2, (wind ?? 8) / 14)
  const n = isDay ? cfg.day : cfg.night

  const clouds = useMemo(() => {
    const rnd = seeded(kind.length * 97 + (isDay ? 1 : 7))
    return Array.from({ length: n }, (_, i) => {
      const depth = rnd()
      return {
        top: -6 + rnd() * (kind === 'clear' || kind === 'partly' ? 42 : 58),
        size: 150 + depth * 260 + (kind === 'cloudy' || kind === 'storm' || kind === 'rain' ? 120 : 0),
        opacity: cfg.opacity * (0.55 + depth * 0.45),
        blur: depth < 0.35 ? 3 : depth < 0.7 ? 1.2 : 0,
        duration: (120 - depth * 60) / speed,
        offset: (i + rnd() * 0.6) / n,
        reverse: blowsWest,
        depth,
      }
    })
  }, [kind, isDay, n, cfg.opacity, speed, blowsWest])

  useEffect(() => {
    const el = wrap.current?.parentElement
    if (!el || reduced || !window.matchMedia('(hover: hover)').matches) return
    let raf
    const move = (e) => {
      const r = el.getBoundingClientRect()
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        wrap.current?.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3))
        wrap.current?.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3))
      })
    }
    const leave = () => {
      wrap.current?.style.setProperty('--mx', 0)
      wrap.current?.style.setProperty('--my', 0)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      cancelAnimationFrame(raf)
    }
  }, [reduced])

  const sunVisible = isDay && kind !== 'rain' && kind !== 'storm' && kind !== 'snow'
  const sunDim = kind === 'cloudy' || kind === 'drizzle' || kind === 'fog'
  const moonVisible = !isDay && (kind === 'clear' || kind === 'partly')
  const t = Math.max(0, Math.min(1, sunT))
  const orbX = isDay ? 30 + t * 34 : 58
  const orbY = isDay ? 44 - Math.sin(Math.PI * t) * 26 : 24

  return (
    <div ref={wrap} className={`scene scene-${kind} ${isDay ? 'is-day' : 'is-night'} tone-${cfg.tone} ${golden > 0.3 ? 'dusk' : ''} ${paused ? 'is-paused' : ''}`} aria-hidden="true">
      {isDay && sunVisible && !sunDim && <div className="daylight" style={{ '--lx': `${orbX}%`, '--ly': `${orbY}%` }} />}
      {!isDay && <div className="nightfall" />}
      {!isDay && <Stars count={kind === 'clear' ? 160 : kind === 'partly' ? 110 : kind === 'cloudy' || kind === 'fog' ? 30 : 0} />}
      {sunVisible && (
        <div className="orb-layer" style={{ left: `${orbX}%`, top: `${orbY}%` }}>
          <div className={`sun ${sunDim ? 'dim' : ''}`}>
            <span className="sun-beams" />
            <span className="sun-halo" />
            <span className="sun-rays" />
            <span className="sun-rays two" />
            <span className="sun-corona" />
            <span className="sun-disc" />
          </div>
        </div>
      )}
      {moonVisible && (
        <div className="orb-layer" style={{ left: `${orbX}%`, top: `${orbY}%` }}>
          <div className="moon">
            <span className="moon-glow" />
            <span className="moon-halo" />
            <span className="moon-ring" />
            <span className="moon-disc" />
          </div>
        </div>
      )}
      {golden > 0 && <div className="golden" style={{ opacity: golden }} />}
      <div className="cloud-layer far">{clouds.filter((c) => c.depth < 0.5).map((c, i) => <Cloud key={i} c={c} />)}</div>
      {kind === 'fog' && (
        <div className="fog">
          <span />
          <span />
          <span />
        </div>
      )}
      <SkyCanvas kind={kind} isDay={isDay} wind={wind} windDir={windDir} paused={paused} />
      <div className="cloud-layer near">{clouds.filter((c) => c.depth >= 0.5).map((c, i) => <Cloud key={i} c={c} />)}</div>
      <div className="scene-shade" />
    </div>
  )
}
