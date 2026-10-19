import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Cities, { CITIES } from './components/Cities.jsx'
import Climate from './components/Climate.jsx'
import Search from './components/Search.jsx'
import Today from './components/Today.jsx'
import WeatherIcon from './components/WeatherIcon.jsx'
import Ambient from './components/scene/Ambient.jsx'
import Account, { useSession } from './components/Account.jsx'
import { useRevealObserver } from './lib/motion.js'
import { DEMO, demoState } from './lib/weather.js'

const TABS = [
  ['today', 'Today'],
  ['climate', 'Climate'],
  ['cities', 'Cities'],
]
const THEMES = ['auto', 'light', 'dark']

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

function sharedPlace() {
  try {
    const q = new URLSearchParams(window.location.search)
    const lat = Number(q.get('lat'))
    const lon = Number(q.get('lon'))
    if (!q.has('lat') || !q.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
    return { name: (q.get('place') || 'Shared place').slice(0, 80), admin1: q.get('region') || '', country: q.get('country') || '', lat, lon }
  } catch {
    return null
  }
}

const tabFromHash = () => {
  const h = window.location.hash.slice(1)
  return TABS.some(([id]) => id === h) ? h : 'today'
}

function ThemeButton({ theme, setTheme }) {
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
  const label = { auto: 'Theme: follows day and night', light: 'Theme: light', dark: 'Theme: dark' }[theme]
  return (
    <button type="button" className={`theme-btn t-${theme}`} onClick={() => setTheme(next)} title={`${label}. Switch to ${next}.`} aria-label={`${label}. Switch to ${next}.`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <g className="tb-sun">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </g>
        <path className="tb-moon" d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />
        <g className="tb-auto">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" />
        </g>
      </svg>
    </button>
  )
}

export default function App() {
  const [place, setPlace] = useState(() => sharedPlace() || load('sunnyday.place', CITIES[0]))
  const [recent, setRecent] = useState(() => load('sunnyday.recent', []))
  const [theme, setTheme] = useState(() => load('sunnyday.theme', 'auto'))
  const [tab, setTab] = useState(tabFromHash)
  const [scrolled, setScrolled] = useState(false)
  const [demo, setDemo] = useState(() => demoState.active)
  const [mini, setMini] = useState(null)
  const [accountOpen, setAccountOpen] = useState(() => window.location.hash === '#account')
  const session = useSession()
  const nav = useRef(null)
  const pill = useRef(null)
  const mainRef = useRef(null)
  useRevealObserver(mainRef)

  useEffect(() => save('sunnyday.place', place), [place])
  useEffect(() => save('sunnyday.recent', recent), [recent])
  useEffect(() => {
    save('sunnyday.theme', theme)
    const root = document.documentElement
    const apply = () => {
      const want = theme !== 'auto' ? theme : root.dataset.daynight === 'night' ? 'dark' : root.dataset.daynight === 'day' ? 'light' : null
      if (want === (root.dataset.theme || null)) return
      if (want) root.dataset.theme = want
      else delete root.dataset.theme
      window.dispatchEvent(new Event('sunnyday-theme'))
    }
    apply()
    if (theme !== 'auto') return
    const mo = new MutationObserver(apply)
    mo.observe(root, { attributes: true, attributeFilter: ['data-daynight'] })
    return () => mo.disconnect()
  }, [theme])
  useEffect(() => {
    if (window.location.hash !== '#account' && window.location.hash.slice(1) !== tab) window.history.replaceState(null, '', `#${tab}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [tab])
  useEffect(() => {
    const onMini = (e) => setMini(e.detail.hidden ? e.detail : null)
    window.addEventListener('sunnyday-mini', onMini)
    const onDemo = () => setDemo(true)
    window.addEventListener('sunnyday-demo', onDemo)
    const onOpenAccount = () => setAccountOpen(true)
    window.addEventListener('sunnyday-open-updates', onOpenAccount)
    const onHash = () => {
      if (window.location.hash === '#account') {
        setAccountOpen(true)
        return
      }
      setTab(tabFromHash())
    }
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('hashchange', onHash)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('sunnyday-demo', onDemo)
      window.removeEventListener('sunnyday-mini', onMini)
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('sunnyday-open-updates', onOpenAccount)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])
  useEffect(() => {
    document.title = `${place.name} · SunnyDay`
  }, [place])

  useLayoutEffect(() => {
    const place = () => {
      const btn = nav.current?.querySelector('[aria-selected="true"]')
      if (!btn || !pill.current) return
      pill.current.style.width = `${btn.offsetWidth}px`
      pill.current.style.transform = `translateX(${btn.offsetLeft}px)`
    }
    place()
    window.addEventListener('resize', place)
    document.fonts?.ready.then(place)
    return () => window.removeEventListener('resize', place)
  }, [tab])

  function select(p) {
    const clean = { name: p.name, admin1: p.admin1, country: p.country, lat: p.lat, lon: p.lon }
    setPlace(clean)
    if (clean.name !== 'Your location')
      setRecent((r) => [clean, ...r.filter((x) => `${x.lat},${x.lon}` !== `${clean.lat},${clean.lon}`)].slice(0, 5))
    if (tab === 'cities') setTab('today')
  }

  return (
    <>
      <div className="page-tint" aria-hidden="true" />
      <Ambient />
      <div className="app">
        <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <div className="brand">
            <a className="wordmark" href="#today" onClick={() => setTab('today')} aria-label="SunnyDay home">
              <svg className="logo" width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
                <g className="logo-rays">
                  <path d="M16 5v3M6.8 8.8l2.1 2.1M25.2 8.8l-2.1 2.1M3.5 17.5h3M25.5 17.5h3" stroke="var(--sun)" strokeWidth="2" strokeLinecap="round" />
                </g>
                <circle cx="16" cy="18" r="7" fill="var(--sun)" className="logo-sun" />
                <path d="M2 22.5h28" stroke="var(--bg)" strokeWidth="4.5" />
              </svg>
              <span className="wm-text">SunnyDay</span>
            </a>
            <button type="button" className={`mini-badge ${mini && tab === 'today' ? 'show' : ''}`} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} tabIndex={mini && tab === 'today' ? 0 : -1} aria-hidden={mini && tab === 'today' ? undefined : true} aria-label={mini ? `${mini.name} ${mini.temp} degrees, back to top` : 'Back to top'}>
              {mini && (
                <>
                  <WeatherIcon icon={mini.icon} night={!mini.isDay} size={20} />
                  <strong>{mini.temp}°</strong>
                  <span>{mini.name}</span>
                </>
              )}
            </button>
          </div>
          <nav className="tabs" role="tablist" aria-label="Views" ref={nav}>
            <span className="tab-pill" ref={pill} aria-hidden="true" />
            {TABS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                className={tab === id ? 'on' : ''}
                onClick={() => setTab(id)}
                onKeyDown={(e) => {
                  const k = TABS.findIndex(([t]) => t === id)
                  const to = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: TABS.length - 1 }[e.key]
                  if (to == null) return
                  e.preventDefault()
                  const next = TABS[(to + TABS.length) % TABS.length][0]
                  setTab(next)
                  requestAnimationFrame(() => nav.current?.querySelector('[aria-selected="true"]')?.focus())
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="top-tools">
            <Search onSelect={select} recent={recent} />
            <button type="button" className={`account-btn ${session ? 'in' : ''}`} onClick={() => setAccountOpen(true)} aria-label={session ? `Email updates for ${session.email}` : 'Sign in for email updates'}>
              {session ? (
                <span className="avatar" aria-hidden="true">
                  {session.email[0].toUpperCase()}
                </span>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="3" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
              )}
              <span className="account-label">{session ? 'Updates' : 'Get updates'}</span>
            </button>
            <ThemeButton theme={theme} setTheme={setTheme} />
          </div>
        </header>

        {DEMO && demo && (
          <p className="demo-note" role="status">
            Sample data: this preview can’t reach the live weather service, so it shows generated example weather. Use “Live weather” in the sky panel to preview every animation.
          </p>
        )}
        <main ref={mainRef}>
          <div key={`${tab}`} className="view">
            {tab === 'today' && <Today key={`t${place.lat},${place.lon}`} place={place} />}
            {tab === 'climate' && <Climate key={`c${place.lat},${place.lon}`} place={place} />}
            {tab === 'cities' && <Cities onOpen={select} />}
          </div>
        </main>

        <Account
        open={accountOpen}
        place={place}
        onClose={() => {
          setAccountOpen(false)
          if (window.location.hash === '#account') window.history.replaceState(null, '', `#${tab}`)
        }}
      />

      <footer className="footer">
          <p>
            Forecasts, air quality and ERA5 climate records from <a href="https://open-meteo.com">Open-Meteo</a>. “My location” place names from{' '}
            <a href="https://www.bigdatacloud.com">BigDataCloud</a>. Times are local to the place shown.
          </p>
        </footer>
      </div>
    </>
  )
}
