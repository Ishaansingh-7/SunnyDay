import { useEffect, useRef, useState } from 'react'
import { clock, deg, weekday } from '../lib/format.js'
import WeatherIcon from './WeatherIcon.jsx'

const ITEM = 66
const TOP = 88
const AMP = 24

const STOPS = [
  [8, [57, 135, 229]],
  [18, [120, 190, 236]],
  [24, [246, 196, 106]],
  [30, [240, 138, 58]],
  [37, [227, 73, 72]],
]

export function tempColor(t) {
  if (t <= STOPS[0][0]) return `rgb(${STOPS[0][1].join(',')})`
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i]
    if (t <= t1) {
      const [t0, c0] = STOPS[i - 1]
      const k = (t - t0) / (t1 - t0)
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`
}

function smooth(points) {
  if (points.length < 2) return ''
  let d = `M${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1] || points[i]
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    const [x3, y3] = points[i + 2] || points[i + 1]
    d += ` C${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6} ${x2} ${y2}`
  }
  return d
}

export default function HourlyStrip({ hours, nowTemp, selected = 0, onSelect }) {
  const scroller = useRef(null)
  const dragged = useRef(false)
  const [edge, setEdge] = useState({ start: true, end: false })
  const items = hours.map((h, i) => (i === 0 ? { ...h, temp: nowTemp ?? h.temp } : h))
  const temps = items.map((h) => h.temp)
  const lo = Math.min(...temps)
  const hi = Math.max(...temps)
  const pts = items.map((h, i) => [i * ITEM + ITEM / 2, TOP + AMP - ((h.temp - lo) / (hi - lo || 1)) * AMP])
  const line = smooth(pts)
  const width = items.length * ITEM
  const area = `${line} L${width - ITEM / 2} ${TOP + AMP + 18} L${ITEM / 2} ${TOP + AMP + 18} Z`

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = () => setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 })
    update()
    el.addEventListener('scroll', update, { passive: true })
    let down = null
    const pd = (e) => {
      if (e.pointerType !== 'mouse') return
      down = { x: e.clientX, left: el.scrollLeft }
      dragged.current = false
    }
    const pm = (e) => {
      if (!down) return
      const dx = e.clientX - down.x
      if (Math.abs(dx) > 4) {
        dragged.current = true
        el.classList.add('dragging')
      }
      if (dragged.current) el.scrollLeft = down.left - dx
    }
    const pu = () => {
      down = null
      el.classList.remove('dragging')
    }
    el.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    return () => {
      el.removeEventListener('scroll', update)
      el.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
    }
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const x = selected * ITEM + ITEM / 2 - el.clientWidth / 2
    el.scrollTo({ left: Math.max(0, x), behavior: 'smooth' })
  }, [selected])

  const nudge = (dir) => scroller.current?.scrollBy({ left: dir * ITEM * 5, behavior: 'smooth' })
  const pick = (i) => {
    if (dragged.current) {
      dragged.current = false
      return
    }
    onSelect?.(i)
  }

  return (
    <div className="hours-wrap">
      <button type="button" className="hours-nav prev" onClick={() => nudge(-1)} disabled={edge.start} aria-label="Earlier hours">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </button>
      <div className="hours-scroll" ref={scroller}>
        <div className="hours-track" style={{ width }}>
          <svg className="hours-curve" width={width} height={TOP + AMP + 18} aria-hidden="true">
            <defs>
              <linearGradient id="hc-temp" gradientUnits="userSpaceOnUse" x1="0" x2={width} y1="0" y2="0">
                {pts.map(([x], i) => (
                  <stop key={i} offset={x / width} stopColor={tempColor(items[i].temp)} />
                ))}
              </linearGradient>
              <linearGradient id="hc-fade" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <mask id="hc-mask">
                <path d={area} fill="url(#hc-fade)" />
              </mask>
            </defs>
            <rect x="0" y="0" width={width} height={TOP + AMP + 18} fill="url(#hc-temp)" mask="url(#hc-mask)" className="hc-area" />
            <path d={line} className="hc-line" stroke="url(#hc-temp)" pathLength="1" />
            {pts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i === selected ? 5 : 2.6} fill={tempColor(items[i].temp)} className={`hc-dot ${i === selected ? 'sel' : ''}`} style={{ animationDelay: `${0.4 + i * 0.02}s` }} />
            ))}
          </svg>
          <ol className="hours" role="listbox" aria-label="Next 48 hours" aria-orientation="horizontal">
            {items.map((h, i) => {
              const newDay = i > 0 && h.time.slice(11, 13) === '00'
              return (
                <li
                  key={h.time}
                  className={`${i === 0 ? 'is-now' : ''} ${i === selected ? 'is-sel' : ''} ${newDay ? 'new-day' : ''}`}
                  style={{ width: ITEM }}
                  role="option"
                  tabIndex={i === selected ? 0 : -1}
                  aria-selected={i === selected}
                  aria-label={`${i === 0 ? 'Now' : `${weekday(h.time.slice(0, 10))} ${clock(h.time)}`}, ${deg(h.temp)}, ${h.condition}`}
                  onClick={() => pick(i)}
                  onKeyDown={(e) => {
                    const go = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[e.key]
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect?.(i)
                    } else if (go != null && go >= 0 && go < items.length) {
                      e.preventDefault()
                      pick(go)
                      const el = e.currentTarget.parentElement.children[go]
                      el?.focus()
                      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                    }
                  }}
                >
                  <span className="h-time">{i === 0 ? 'Now' : newDay ? weekday(h.time.slice(0, 10)) : clock(h.time).replace(':00', '')}</span>
                  <WeatherIcon icon={h.icon} night={!h.isDay} size={26} />
                  <span className="h-temp" style={{ top: pts[i][1] - 23 }}>
                    {deg(h.temp)}
                  </span>
                  <span className="h-pop">
                    {h.pop >= 20 ? (
                      <>
                        <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
                          <path d="M4 0C4 0 0 4.6 0 6.6A4 4 0 0 0 8 6.6C8 4.6 4 0 4 0Z" fill="currentColor" />
                        </svg>
                        {h.pop}%
                      </>
                    ) : (
                      ' '
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
      <button type="button" className="hours-nav next" onClick={() => nudge(1)} disabled={edge.end} aria-label="Later hours">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}
