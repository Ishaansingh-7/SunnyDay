import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../../lib/motion.js'

function readMode() {
  const root = document.documentElement
  const sky = root.dataset.sky || 'partly'
  const night = root.dataset.daynight === 'night'
  const t = root.dataset.theme
  const dark = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  return { sky, night, dark }
}

export default function Ambient() {
  const ref = useRef(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    let w = 0
    let h = 0
    let raf = 0
    let mode = readMode()
    let parts = []
    let shoot = null
    const mouse = { x: -999, y: -999 }

    const style = () => {
      const { sky, night } = mode
      if (sky === 'snow') return 'snow'
      if (sky === 'rain' || sky === 'drizzle' || sky === 'storm') return 'rain'
      if (night) return 'stars'
      return 'none'
    }

    const spawn = (kind, anywhere) => {
      const z = 0.3 + Math.random() * 0.7
      const p = { x: Math.random() * w, y: anywhere ? Math.random() * h : kind === 'motes' ? h + 10 : -20, z, a: Math.random() * Math.PI * 2, life: Math.random() }
      if (kind === 'rain') Object.assign(p, { vy: 5 + z * 7, len: 10 + z * 14 })
      if (kind === 'snow') Object.assign(p, { vy: 0.4 + z * 0.9, r: 0.8 + z * 2.2 })
      if (kind === 'stars') Object.assign(p, { y: Math.random() * h * 0.75, r: 0.4 + z * 0.9 })
      return p
    }

    let kind = style()
    const reset = () => {
      kind = style()
      const density = { rain: 80, snow: 70, stars: 140, none: 0 }[kind]
      const n = Math.round(density * Math.min(1.8, Math.max(0.5, (w * h) / (1400 * 900))))
      parts = Array.from({ length: n }, () => spawn(kind, true))
    }

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      reset()
    }

    let last = performance.now()
    const frame = (now) => {
      const dt = Math.min(3, (now - last) / 16.67)
      last = now
      ctx.clearRect(0, 0, w, h)
      const dark = mode.dark
      for (const p of parts) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const d2 = dx * dx + dy * dy
        if (kind !== 'stars' && d2 < 120 * 120 && d2 > 1) {
          const f = (1 - Math.sqrt(d2) / 120) * 1.6
          p.x += (dx / Math.sqrt(d2)) * f * dt
          p.y += (dy / Math.sqrt(d2)) * f * dt
        }
        if (kind === 'rain') {
          p.y += p.vy * dt
          p.x -= p.vy * 0.12 * dt
          if (p.y > h + 20) Object.assign(p, spawn(kind, false))
          ctx.strokeStyle = dark ? `rgba(170,195,235,${0.08 + p.z * 0.12})` : `rgba(60,95,140,${0.07 + p.z * 0.1})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x + p.len * 0.12, p.y - p.len)
          ctx.stroke()
        } else if (kind === 'snow') {
          p.a += 0.015 * dt
          p.y += p.vy * dt
          p.x += Math.sin(p.a) * 0.4 * dt
          if (p.y > h + 10) Object.assign(p, spawn(kind, false))
          ctx.fillStyle = dark ? `rgba(255,255,255,${0.25 + p.z * 0.4})` : `rgba(120,150,190,${0.18 + p.z * 0.25})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fill()
        } else if (kind === 'stars') {
          const tw = 0.55 + 0.45 * Math.sin(now / (900 + p.z * 900) + p.a * 5)
          ctx.fillStyle = `rgba(255,255,255,${(0.25 + p.z * 0.6) * tw})`
          ctx.fillRect(p.x, p.y, p.r * 1.6, p.r * 1.6)
        }
      }
      if (kind === 'stars') {
        if (!shoot && Math.random() < 0.004 * dt) shoot = { x: Math.random() * w * 0.8 + w * 0.1, y: Math.random() * h * 0.35, t: 0 }
        if (shoot) {
          shoot.t += 0.025 * dt
          const k = shoot.t
          const x = shoot.x - k * 260
          const y = shoot.y + k * 120
          const g = ctx.createLinearGradient(x, y, x + 90, y - 42)
          const a = Math.sin(Math.PI * Math.min(1, k))
          g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`)
          g.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.strokeStyle = g
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + 90, y - 42)
          ctx.stroke()
          if (k >= 1) shoot = null
        }
      }
      raf = requestAnimationFrame(frame)
    }

    resize()
    raf = requestAnimationFrame(frame)
    const mo = new MutationObserver(() => {
      const next = readMode()
      const changed = next.sky !== mode.sky || next.night !== mode.night
      mode = next
      if (changed) reset()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sky', 'data-daynight', 'data-theme'] })
    const move = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }
    const vis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [reduced])

  return <canvas ref={ref} className="ambient" aria-hidden="true" />
}
