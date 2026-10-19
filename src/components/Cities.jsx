import { useLayoutEffect, useRef, useState } from 'react'
import { getCities } from '../lib/weather.js'
import { useAsync } from '../lib/useAsync.js'
import { clock, deg } from '../lib/format.js'
import { Num, useTilt } from '../lib/motion.js'
import WeatherIcon from './WeatherIcon.jsx'
import MiniScene from './scene/MiniScene.jsx'
import { ErrorState, Loading } from './States.jsx'
import { skyClass } from './Today.jsx'

export const CITIES = [
  { name: 'Vellore', admin1: 'Tamil Nadu', country: 'India', lat: 12.92, lon: 79.13 },
  { name: 'Chennai', admin1: 'Tamil Nadu', country: 'India', lat: 13.08, lon: 80.27 },
  { name: 'Hyderabad', admin1: 'Telangana', country: 'India', lat: 17.38, lon: 78.47 },
  { name: 'Bengaluru', admin1: 'Karnataka', country: 'India', lat: 12.97, lon: 77.59 },
  { name: 'Mumbai', admin1: 'Maharashtra', country: 'India', lat: 19.08, lon: 72.88 },
  { name: 'New Delhi', admin1: 'Delhi', country: 'India', lat: 28.61, lon: 77.21 },
  { name: 'Kolkata', admin1: 'West Bengal', country: 'India', lat: 22.57, lon: 88.36 },
  { name: 'Kochi', admin1: 'Kerala', country: 'India', lat: 9.93, lon: 76.27 },
  { name: 'Jaipur', admin1: 'Rajasthan', country: 'India', lat: 26.91, lon: 75.79 },
]

const SORTS = [
  ['default', 'A–Z', (a, b) => a.name.localeCompare(b.name)],
  ['warm', 'Warmest', (a, b) => b.temp - a.temp],
  ['cool', 'Coolest', (a, b) => a.temp - b.temp],
  ['rain', 'Rain chance', (a, b) => b.pop - a.pop],
  ['humid', 'Humidity', (a, b) => b.humidity - a.humidity],
]

function CityCard({ c, i, onOpen }) {
  const ref = useTilt(8)
  return (
    <button ref={ref} type="button" className={`city ${skyClass(c.icon, c.isDay)}`} onClick={() => onOpen(c)}>
      <MiniScene kind={c.icon} isDay={c.isDay} seed={i + 1} />
      <span className="city-glare" aria-hidden="true" />
      <span className="city-top">
        <span>
          <span className="city-name">{c.name}</span>
          <span className="city-meta">
            {c.admin1}
            <span className="city-time"> · {clock(c.time)}</span>
          </span>
        </span>
        <WeatherIcon icon={c.icon} night={!c.isDay} size={34} />
      </span>
      <span className="city-temp">
        <Num value={Math.round(c.temp)} />°
      </span>
      <span className="city-foot">
        <span>{c.condition}</span>
        <span>
          H {deg(c.max)} · L {deg(c.min)}
        </span>
      </span>
      <span className="city-extra">
        <span>Humidity {c.humidity}%</span>
        <span>Rain {c.pop}%</span>
        <span>Wind {c.wind} km/h</span>
      </span>
    </button>
  )
}

export default function Cities({ onOpen }) {
  const { data, error, retry } = useAsync(() => getCities(CITIES), [])
  const [sort, setSort] = useState('default')
  const grid = useRef(null)
  const rects = useRef(new Map())

  const sorted = data ? [...data].sort(SORTS.find((s) => s[0] === sort)[2]) : []

  useLayoutEffect(() => {
    const el = grid.current
    if (!el) return
    const items = [...el.children]
    items.forEach((node) => {
      const prev = rects.current.get(node.dataset.key)
      const now = node.getBoundingClientRect()
      if (prev) {
        const dx = prev.left - now.left
        const dy = prev.top - now.top
        if (dx || dy) {
          node.style.transition = 'none'
          node.style.transform = `translate(${dx}px, ${dy}px)`
          requestAnimationFrame(() => {
            node.style.transition = 'transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1)'
            node.style.transform = ''
          })
        }
      }
      rects.current.set(node.dataset.key, now)
    })
  }, [sort, data])

  if (error) return <ErrorState error={error} retry={retry} what="city conditions" />
  if (!data) return <Loading label="Checking the sky across India" tall />

  const hottest = data.reduce((a, b) => (b.temp > a.temp ? b : a))
  const coolest = data.reduce((a, b) => (b.temp < a.temp ? b : a))
  const wettest = data.reduce((a, b) => (b.pop > a.pop ? b : a))

  return (
    <div className="cities">
      <header className="view-head">
        <div>
          <h1 className="place">Across India right now</h1>
          <p className="place-meta">
            Warmest in {hottest.name} at {deg(hottest.temp)}, coolest in {coolest.name} at {deg(coolest.temp)}.
            {wettest.pop >= 40 ? ` Best chance of rain today: ${wettest.name}, ${wettest.pop}%.` : ''}
          </p>
        </div>
        <div className="span-picker" role="radiogroup" aria-label="Sort cities">
          {SORTS.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={sort === id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      <ul className="city-grid" ref={grid}>
        {sorted.map((c, i) => (
          <li key={c.name} data-key={c.name} className="reveal" style={{ '--i': i }}>
            <CityCard c={c} i={CITIES.findIndex((x) => x.name === c.name)} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  )
}
