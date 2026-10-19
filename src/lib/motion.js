import { useEffect, useRef, useState } from 'react'

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => !!mq?.matches)
  useEffect(() => {
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export function useCountUp(target, duration = 1100) {
  const [value, setValue] = useState(() => (mq?.matches || target == null ? target ?? 0 : 0))
  const from = useRef(mq?.matches ? target ?? 0 : 0)

  useEffect(() => {
    if (target == null) return
    if (mq?.matches) {
      setValue(target)
      from.current = target
      return
    }
    const start = performance.now()
    const a = from.current
    let raf
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const e = 1 - Math.pow(1 - t, 4)
      const v = a + (target - a) * e
      setValue(v)
      from.current = v
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

export function Num({ value, decimals = 0, prefix = '', suffix = '', signed = false }) {
  const v = useCountUp(value)
  if (value == null) return '–'
  const shown = Math.abs(v).toFixed(decimals)
  const sign = signed ? (Number(shown) === 0 ? '±' : v > 0 ? '+' : '−') : v < 0 && Number(shown) !== 0 ? '−' : ''
  return `${prefix}${sign}${shown}${suffix}`
}

export function useMounted(delay = 60) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return on
}

function localIso(offsetSeconds) {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString().slice(0, 19)
}

export function useLocalClock(offsetSeconds, everyMs = 1000) {
  const [now, setNow] = useState(() => localIso(offsetSeconds))
  useEffect(() => {
    setNow(localIso(offsetSeconds))
    const id = setInterval(() => setNow(localIso(offsetSeconds)), everyMs)
    return () => clearInterval(id)
  }, [offsetSeconds, everyMs])
  return now
}

export function useNow(everyMs = 30000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

export function useRevealObserver(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (!('IntersectionObserver' in window) || mq?.matches) {
      const showAll = () => root.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'))
      showAll()
      const mo = new MutationObserver(showAll)
      mo.observe(root, { childList: true, subtree: true })
      return () => mo.disconnect()
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.08 }
    )
    const scan = () => root.querySelectorAll('.reveal:not(.in):not([data-watch])').forEach((el) => {
      el.dataset.watch = '1'
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.classList.add('in')
        return
      }
      el.classList.add('pre')
      io.observe(el)
    })
    scan()
    const mo = new MutationObserver(scan)
    mo.observe(root, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      io.disconnect()
    }
  }, [rootRef])
}

export function useTilt(max = 7) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || mq?.matches || !window.matchMedia('(hover: hover)').matches) return
    let raf
    const move = (e) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`)
        el.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`)
        el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`)
        el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`)
      })
    }
    const leave = () => {
      cancelAnimationFrame(raf)
      el.style.setProperty('--rx', '0deg')
      el.style.setProperty('--ry', '0deg')
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      cancelAnimationFrame(raf)
    }
  }, [max])
  return ref
}

export function seeded(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}
