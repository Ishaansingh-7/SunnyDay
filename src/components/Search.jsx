import { useEffect, useId, useRef, useState } from 'react'
import { searchPlaces } from '../lib/weather.js'
import { placeLabel } from '../lib/format.js'

async function placeName(lat, lon) {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 4000)
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { signal: ctl.signal })
    clearTimeout(t)
    if (!r.ok) return {}
    const j = await r.json()
    const name = j.city || j.locality
    return name ? { name, admin1: j.principalSubdivision || '', country: j.countryName || '' } : {}
  } catch {
    return {}
  }
}

export default function Search({ onSelect, recent, shortcut = true, placeholder = 'Search a city' }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const box = useRef(null)
  const input = useRef(null)
  const listId = useId()

  const q = query.trim()
  const showing = q.length >= 2 ? results : recent

  useEffect(() => {
    if (q.length < 2) {
      setResults([])
      setStatus('')
      return
    }
    let alive = true
    const timer = setTimeout(() => {
      setStatus('Searching…')
      searchPlaces(q)
        .then((list) => {
          if (!alive) return
          setResults(list)
          setActive(0)
          setOpen(true)
          setStatus(list.length ? '' : `No places match “${q}”. Check the spelling or try a nearby city.`)
        })
        .catch((e) => alive && setStatus(`${e.message}.`))
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q])

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    const slash = (e) => {
      if (shortcut && e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', slash)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', slash)
    }
  }, [shortcut])

  function choose(place) {
    onSelect(place)
    setQuery('')
    setResults([])
    setOpen(false)
    input.current?.blur()
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, showing.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && showing[active]) {
      choose(showing[active])
    } else if (e.key === 'Escape') {
      if (!open || !showing.length) {
        setQuery('')
        setStatus('')
      }
      setOpen(false)
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setStatus('This browser can’t share your location. Search for a city instead.')
      return
    }
    setStatus('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = +pos.coords.latitude.toFixed(3)
        const lon = +pos.coords.longitude.toFixed(3)
        const named = await placeName(lat, lon)
        setStatus('')
        choose({ name: 'Your location', ...named, lat, lon })
      },
      () => setStatus('Location access was blocked. Allow it in the browser, or search for a city instead.'),
      { timeout: 10000 }
    )
  }

  return (
    <div className="search" ref={box}>
      <div className="search-field">
        <svg className="search-glyph" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
        <input
          ref={input}
          type="search"
          value={query}
          placeholder={placeholder}
          aria-label="Search for a city"
          role="combobox"
          aria-expanded={open && showing.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && showing[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {shortcut && <kbd className="search-kbd" aria-hidden="true">/</kbd>}
        <button type="button" className="locate" onClick={locate} title="Use my location" aria-label="Use my location">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
            <circle cx="12" cy="12" r="7" />
          </svg>
          <span>My location</span>
        </button>
      </div>
      {open && showing.length > 0 && (
        <ul id={listId} className="search-results" role="listbox" aria-label={q.length >= 2 ? 'Matching places' : 'Recent places'}>
          {q.length < 2 && <li className="results-head" role="presentation">Recent</li>}
          {showing.map((r, i) => (
            <li
              id={`${listId}-${i}`}
              key={`${r.lat},${r.lon}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(r)
              }}
            >
              <span className="r-name">{r.name}</span>
              <span className="r-meta">{placeLabel(r)}</span>
            </li>
          ))}
        </ul>
      )}
      {status && (
        <p className="search-status" role="status">
          {status}
        </p>
      )}
    </div>
  )
}
