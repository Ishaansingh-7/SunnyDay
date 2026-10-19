import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../../lib/motion.js'

const BLOCK = 'button, a, input, [role="menu"], .hours-wrap, .timeline, .fx'

export default function SkyCanvas({ kind, isDay, wind, windDir, paused }) {
  const ref = useRef(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    const host = canvas?.closest('.sky')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w = 0
    let h = 0
    let raf = 0
    let running = true
    const snow = kind === 'snow'
    const storm = kind === 'storm'
    const drizzle = kind === 'drizzle'
    const wet = kind === 'rain' || storm || drizzle
    const falling = wet || snow
    const toward = (((windDir ?? 270) + 180) * Math.PI) / 180
    const baseDrift = Math.sin(toward) * Math.min(1.4, (wind ?? 8) / 22)
    let gust = 0
    let gustTarget = 0
    const base = drizzle ? 90 : storm ? 300 : snow ? 120 : wet ? 210 : 0
    let drops = []
    let splashes = []
    let bursts = []
    let flash = 0
    let bolts = []
    let nextBolt = performance.now() + 1500 + Math.random() * 3000

    const make = (top) => {
      const z = 0.35 + Math.random() * 0.65
      return {
        x: Math.random() * (w + 200) - 100,
        y: top ? -Math.random() * h : Math.random() * h,
        z,
        len: snow ? 0 : (drizzle ? 7 : 14) + z * (drizzle ? 6 : 16),
        vy: snow ? 0.5 + z * 1.1 : (drizzle ? 6 : 11) + z * (drizzle ? 4 : 9),
        phase: Math.random() * Math.PI * 2,
        r: 0.8 + z * 2.2,
      }
    }

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round(base * Math.min(1.6, Math.max(0.5, (w * h) / (1100 * 520))))
      drops = Array.from({ length: n }, () => make(false))
    }

    const makeBolt = (x0, yEnd) => {
      const pts = [[x0 ?? w * (0.2 + Math.random() * 0.6), -10]]
      let [x, y] = pts[0]
      const end = yEnd ?? h * (0.55 + Math.random() * 0.3)
      while (y < end) {
        x += (Math.random() - 0.5) * 46
        y += 14 + Math.random() * 26
        pts.push([x, y])
      }
      const k = Math.floor(pts.length / 3)
      const branch = pts.slice(k, k + 4).map(([bx, by], i) => [bx + i * 18 * (Math.random() > 0.5 ? 1 : -1), by + i * 10])
      return { pts, branch, life: 1 }
    }

    const strike = (x, y, power = 1) => {
      bolts.push(makeBolt(x, y))
      flash = 0.5 * power
      window.dispatchEvent(new CustomEvent('sunnyday-thunder', { detail: { delay: 0.3 + Math.random() * 1.2, power } }))
    }

    const burst = (x, y) => {
      if (wet || storm) {
        strike(x, y, 1)
        for (let i = 0; i < 3; i++) bursts.push({ type: 'ring', x, y, r: 0, life: 1, delay: i * 6 })
        return
      }
      if (snow) {
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2
          const s = 1 + Math.random() * 4
          bursts.push({ type: 'flake', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, r: 1 + Math.random() * 2.5 })
        }
        return
      }
      if (!isDay) {
        bursts.push({ type: 'star', x, y, vx: 9 + Math.random() * 4, vy: 3.5 + Math.random() * 2, life: 1, trail: [] })
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2
          bursts.push({ type: 'spark', x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 1, r: 1 + Math.random() * 1.5, hue: 220 })
        }
        return
      }
      if (kind === 'cloudy' || kind === 'fog') {
        for (let i = 0; i < 9; i++) {
          const a = Math.random() * Math.PI * 2
          bursts.push({ type: 'puff', x, y, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, life: 1, r: 14 + Math.random() * 14 })
        }
        return
      }
      for (let i = 0; i < 36; i++) {
        const a = Math.random() * Math.PI * 2
        const s = 1.5 + Math.random() * 5
        bursts.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 1, r: 1.2 + Math.random() * 2.2, hue: 40 + Math.random() * 15 })
      }
      bursts.push({ type: 'ring', x, y, r: 0, life: 1, delay: 0, warm: true })
    }

    let last = performance.now()
    const frame = (now) => {
      const dt = Math.min(3, (now - last) / 16.67)
      last = now
      ctx.clearRect(0, 0, w, h)
      gust += (gustTarget - gust) * 0.04 * dt
      const drift = baseDrift + gust

      if (storm && now > nextBolt) {
        strike(undefined, undefined, 0.8)
        nextBolt = now + 2500 + Math.random() * 5500
      }
      if (flash > 0) {
        ctx.fillStyle = `rgba(225,232,255,${flash})`
        ctx.fillRect(0, 0, w, h)
        flash = Math.max(0, flash - 0.03 * dt)
      }
      bolts = bolts.filter((b) => {
        ctx.save()
        ctx.strokeStyle = `rgba(255,255,255,${b.life})`
        ctx.shadowColor = 'rgba(170,190,255,0.9)'
        ctx.shadowBlur = 18
        ctx.lineWidth = 2.6
        ctx.beginPath()
        b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.stroke()
        ctx.lineWidth = 1.2
        ctx.beginPath()
        b.branch.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.stroke()
        ctx.restore()
        b.life -= 0.05 * dt
        return b.life > 0
      })

      if (snow) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        for (const d of drops) {
          d.phase += 0.02 * dt
          d.y += d.vy * dt
          d.x += (drift * 0.8 + Math.sin(d.phase) * 0.5) * dt
          if (d.y > h + 5 || d.x < -110 || d.x > w + 110) Object.assign(d, make(true), { y: -5 })
          ctx.globalAlpha = 0.45 + d.z * 0.5
          ctx.beginPath()
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      } else if (wet) {
        ctx.lineCap = 'round'
        for (const d of drops) {
          const vx = drift * d.vy * 0.32
          d.y += d.vy * dt
          d.x += vx * dt
          if (d.y > h) {
            if (!drizzle && d.z > 0.7 && splashes.length < 60) splashes.push({ x: d.x, y: h - 2 - Math.random() * 8, life: 1 })
            Object.assign(d, make(true), { y: -d.len })
          }
          if (d.x < -110) d.x += w + 200
          if (d.x > w + 110) d.x -= w + 200
          ctx.strokeStyle = `rgba(235,242,255,${0.18 + d.z * 0.42})`
          ctx.lineWidth = 0.6 + d.z * 0.9
          ctx.beginPath()
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(d.x - vx * (d.len / d.vy), d.y - d.len)
          ctx.stroke()
        }
        ctx.strokeStyle = 'rgba(235,242,255,0.5)'
        ctx.lineWidth = 0.8
        splashes = splashes.filter((s) => {
          s.life -= 0.07 * dt
          if (s.life <= 0) return false
          const r = (1 - s.life) * 7
          ctx.globalAlpha = s.life * 0.8
          ctx.beginPath()
          ctx.ellipse(s.x, s.y, r, r * 0.3, 0, Math.PI, Math.PI * 2)
          ctx.stroke()
          return true
        })
        ctx.globalAlpha = 1
      }

      bursts = bursts.filter((p) => {
        if (p.delay > 0) {
          p.delay -= dt
          return true
        }
        p.life -= (p.type === 'star' ? 0.012 : p.type === 'puff' ? 0.012 : p.type === 'ring' ? 0.025 : 0.02) * dt
        if (p.life <= 0) return false
        if (p.type === 'ring') {
          p.r += 3.2 * dt
          ctx.strokeStyle = p.warm ? `rgba(255,214,120,${p.life * 0.8})` : `rgba(235,242,255,${p.life * 0.7})`
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.r, p.r * (p.warm ? 1 : 0.45), 0, 0, Math.PI * 2)
          ctx.stroke()
        } else if (p.type === 'spark') {
          p.vy += 0.06 * dt
          p.vx *= 0.98
          p.x += p.vx * dt
          p.y += p.vy * dt
          ctx.fillStyle = `hsla(${p.hue}, 100%, ${p.hue > 100 ? 85 : 70}%, ${p.life})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r * (0.5 + p.life * 0.5), 0, Math.PI * 2)
          ctx.fill()
        } else if (p.type === 'flake') {
          p.vy += 0.03 * dt
          p.vx *= 0.97
          p.x += (p.vx + drift * 0.5) * dt
          p.y += p.vy * dt
          ctx.fillStyle = `rgba(255,255,255,${p.life})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.type === 'puff') {
          p.x += (p.vx + drift * 0.6) * dt
          p.y += p.vy * dt
          p.r += 0.6 * dt
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
          g.addColorStop(0, `rgba(255,255,255,${p.life * 0.5})`)
          g.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.type === 'star') {
          p.trail.push([p.x, p.y])
          if (p.trail.length > 22) p.trail.shift()
          p.x += p.vx * dt
          p.y += p.vy * dt
          ctx.lineCap = 'round'
          for (let i = 1; i < p.trail.length; i++) {
            const a = (i / p.trail.length) * p.life
            ctx.strokeStyle = `rgba(255,255,255,${a})`
            ctx.lineWidth = (i / p.trail.length) * 2.6
            ctx.beginPath()
            ctx.moveTo(p.trail[i - 1][0], p.trail[i - 1][1])
            ctx.lineTo(p.trail[i][0], p.trail[i][1])
            ctx.stroke()
          }
          ctx.fillStyle = `rgba(255,255,255,${p.life})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2)
          ctx.fill()
        }
        return true
      })

      const idle = !falling && !bursts.length && !bolts.length && flash <= 0
      if (running && !idle) raf = requestAnimationFrame(frame)
      else raf = 0
    }

    const wake = () => {
      if (!raf && running) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    const onMove = (e) => {
      const r = host.getBoundingClientRect()
      gustTarget = ((e.clientX - r.left) / r.width - 0.5) * 1.6
    }
    const onLeave = () => {
      gustTarget = 0
    }
    const onClick = (e) => {
      if (e.target.closest(BLOCK)) return
      const r = canvas.getBoundingClientRect()
      burst(e.clientX - r.left, e.clientY - r.top)
      wake()
    }
    const onExternal = () => {
      burst(w * (0.35 + Math.random() * 0.4), h * (0.25 + Math.random() * 0.3))
      wake()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    if (reduced || paused) {
      running = !reduced && !paused ? true : false
      frame(performance.now())
    } else {
      raf = requestAnimationFrame(frame)
    }
    if (host && !reduced) {
      host.addEventListener('pointermove', onMove)
      host.addEventListener('pointerleave', onLeave)
      host.addEventListener('click', onClick)
    }
    canvas.addEventListener('sky-burst', onExternal)
    const vis = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!reduced && !paused) {
        running = true
        wake()
      }
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', vis)
      canvas.removeEventListener('sky-burst', onExternal)
      if (host) {
        host.removeEventListener('pointermove', onMove)
        host.removeEventListener('pointerleave', onLeave)
        host.removeEventListener('click', onClick)
      }
    }
  }, [kind, isDay, wind, windDir, reduced, paused])

  return <canvas ref={ref} className="precip" aria-hidden="true" />
}
