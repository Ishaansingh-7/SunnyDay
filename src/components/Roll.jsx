import { useMounted } from '../lib/motion.js'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export default function Roll({ value }) {
  const on = useMounted(80)
  const text = String(value)
  const chars = text.split('')
  return (
    <span className="roll" aria-hidden="true">
      {chars.map((ch, i) => {
        const key = chars.length - i
        if (!/\d/.test(ch)) {
          return (
            <span key={`s${key}`} className="roll-sign">
              {ch === '-' ? '−' : ch}
            </span>
          )
        }
        const d = on ? Number(ch) : 0
        return (
          <span key={key} className="roll-d">
            <span className="roll-strip" style={{ transform: `translateY(${-d * 10}%)`, transitionDelay: `${(chars.length - i) * 60}ms` }}>
              {DIGITS.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}
