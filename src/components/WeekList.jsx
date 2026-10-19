import { useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { clock, deg, hourLabel, mm, pct, weekday } from '../lib/format.js'
import { useMounted } from '../lib/motion.js'
import { useTokens } from '../lib/theme.js'
import ChartTooltip from './ChartTooltip.jsx'
import WeatherIcon from './WeatherIcon.jsx'

export default function WeekList({ daily, allHourly }) {
  const [open, setOpen] = useState(null)
  const grown = useMounted(250)
  const t = useTokens()
  const weekMin = Math.min(...daily.map((d) => d.min))
  const weekMax = Math.max(...daily.map((d) => d.max))
  const span = weekMax - weekMin || 1

  return (
    <ol className="week">
      {daily.map((d, i) => {
        const isOpen = open === i
        const hours = allHourly.filter((h) => h.time.startsWith(d.date))
        return (
          <li key={d.date} className={isOpen ? 'open' : ''}>
            <button type="button" className="w-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
              <span className="w-day">{i === 0 ? 'Today' : weekday(d.date)}</span>
              <WeatherIcon icon={d.icon} size={24} label={d.condition} still />
              <span className="w-pop" title="Chance of rain">
                {d.pop >= 20 ? `${d.pop}%` : ''}
              </span>
              <span className="w-min">{deg(d.min)}</span>
              <span className="w-range" aria-hidden="true">
                <span
                  style={{
                    left: `${((d.min - weekMin) / span) * 100}%`,
                    right: `${((weekMax - d.max) / span) * 100}%`,
                    transform: grown ? 'scaleX(1)' : 'scaleX(0)',
                    transitionDelay: `${i * 70}ms`,
                  }}
                />
              </span>
              <span className="w-max">{deg(d.max)}</span>
              <svg className="w-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div className="w-detail">
              <div className="w-detail-inner">
                {isOpen && (
                  <>
                    <p className="w-summary">
                      {d.condition}. {d.pop}% chance of rain{d.precip > 0 ? `, about ${mm(d.precip, 1)}` : ''}. UV up to {d.uv}, wind up to {d.wind} km/h.
                    </p>
                    {hours.length > 1 && (
                      <div className="w-chart">
                        <ResponsiveContainer>
                          <AreaChart data={hours} margin={{ top: 6, right: 4, bottom: 0, left: -26 }}>
                            <defs>
                              <linearGradient id={`wg${i}`} x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0" stopColor={t.heat} stopOpacity="0.35" />
                                <stop offset="1" stopColor={t.heat} stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="time" tickFormatter={hourLabel} ticks={hours.filter((h) => Number(h.time.slice(11, 13)) % 6 === 0).map((h) => h.time)} tick={{ fill: t['ink-3'], fontSize: 11 }} tickLine={false} axisLine={false} />
                            <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: t['ink-3'], fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v) => Math.round(v)} />
                            <Tooltip
                              cursor={{ stroke: t['ink-3'], strokeDasharray: '3 3' }}
                              content={<ChartTooltip formatLabel={(_, h) => clock(h.time)} rows={(h) => [['Temperature', deg(h.temp, 1), t.heat], ['Chance of rain', pct(h.pop)]]} />}
                            />
                            <Area type="monotone" dataKey="temp" stroke={t.heat} strokeWidth={2} fill={`url(#wg${i})`} animationDuration={700} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <dl className="w-facts">
                      <div>
                        <dt>Sunrise</dt>
                        <dd>{clock(d.sunrise)}</dd>
                      </div>
                      <div>
                        <dt>Sunset</dt>
                        <dd>{clock(d.sunset)}</dd>
                      </div>
                      <div>
                        <dt>Rain</dt>
                        <dd>{mm(d.precip, 1)}</dd>
                      </div>
                      <div>
                        <dt>UV max</dt>
                        <dd>{d.uv ?? '–'}</dd>
                      </div>
                    </dl>
                  </>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
