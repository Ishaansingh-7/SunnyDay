import { useEffect, useState } from 'react'

const NAMES = ['heat', 'rain', 'ink', 'ink-2', 'ink-3', 'grid', 'surface', 'trend']

function read() {
  const s = getComputedStyle(document.documentElement)
  return Object.fromEntries(NAMES.map((n) => [n, s.getPropertyValue(`--${n}`).trim()]))
}

export function useTokens() {
  const [tokens, setTokens] = useState(read)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => requestAnimationFrame(() => setTokens(read()))
    mq.addEventListener('change', update)
    window.addEventListener('sunnyday-theme', update)
    return () => {
      mq.removeEventListener('change', update)
      window.removeEventListener('sunnyday-theme', update)
    }
  }, [])
  return tokens
}

export const axisProps = (t) => ({
  stroke: t.grid,
  tick: { fill: t['ink-3'], fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: t.grid },
})
