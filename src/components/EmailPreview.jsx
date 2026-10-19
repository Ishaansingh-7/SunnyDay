import { getForecast } from '../lib/weather.js'
import { useAsync } from '../lib/useAsync.js'
import { clock, weekday } from '../lib/format.js'
import { FREQUENCIES } from '../lib/account.js'
import WeatherIcon from './WeatherIcon.jsx'

function severe(f) {
  const d = f.daily[0]
  const out = []
  if (d.max >= 38) out.push(['Extreme heat', `Highs near ${Math.round(d.max)}°C. Avoid the midday sun and drink water often.`])
  if (f.hourly.slice(0, 24).some((h) => h.icon === 'storm')) out.push(['Thunderstorms', 'Thunderstorms are forecast in the next 24 hours.'])
  if (d.precip >= 35 || (d.pop >= 80 && d.precip >= 15)) out.push(['Heavy rain', `About ${Math.round(d.precip)} mm of rain is expected.`])
  if ((f.air?.aqi ?? 0) > 150) out.push(['Poor air quality', `US AQI is ${f.air.aqi}. Limit long outdoor activity.`])
  return out
}

export default function EmailPreview({ prefs, email }) {
  const { data, error } = useAsync(() => getForecast(prefs.city.lat, prefs.city.lon), [prefs.city.lat, prefs.city.lon])
  if (error) return <p className="acc-error">Couldn’t load the forecast for the preview. {error.message}.</p>
  if (!data) return <p className="acc-muted">Building your preview…</p>

  const c = data.current
  const now = c.time
  const focus = Number(now.slice(11, 13)) >= 17 && data.daily.length > 1 ? 1 : 0
  const d = data.daily[focus]
  const when = focus ? 'Tomorrow' : 'Today'
  const alerts = prefs.alerts || prefs.frequency === 'alerts' ? severe(data) : []
  const rainFrom = data.allHourly.find((h) => h.time.startsWith(d.date) && h.time.slice(0, 13) >= now.slice(0, 13) && h.pop >= 60)
  const PERIODS = { 9: 'morning', 15: 'afternoon', 19: 'evening', 23: 'night' }
  const parts = data.allHourly
    .filter((h) => h.time.slice(0, 13) >= now.slice(0, 13) && PERIODS[Number(h.time.slice(11, 13))])
    .slice(0, 4)
    .map((h) => {
      const name = PERIODS[Number(h.time.slice(11, 13))]
      const label =
        h.time.slice(0, 10) === data.daily[0].date
          ? name === 'night'
            ? 'Tonight'
            : name[0].toUpperCase() + name.slice(1)
          : `${weekday(h.time.slice(0, 10), { weekday: 'short' })} ${name}`
      return [label, h]
    })
  const outlook = data.daily.slice(focus + 1, focus + 1 + (prefs.frequency === 'weekly' ? 6 : 3))
  const subject =
    prefs.frequency === 'alerts' && alerts.length
      ? `Weather alert for ${prefs.city.name}: ${alerts.map((a) => a[0].toLowerCase()).join(', ')}`
      : `${prefs.city.name}${focus ? ' tomorrow' : ''}: ${(focus ? d.condition : c.condition).toLowerCase()}, ${Math.round(d.max)}° / ${Math.round(d.min)}°${rainFrom ? `, rain likely from ${clock(rainFrom.time)}` : ''}`
  const freq = FREQUENCIES.find((f) => f[0] === prefs.frequency)

  return (
    <div className="mail">
      <div className="mail-head">
        <span>
          <b>From</b> SunnyDay
        </span>
        <span>
          <b>To</b> {email}
        </span>
        <span>
          <b>Subject</b> {subject}
        </span>
      </div>
      <div className="mail-body">
        <div className={`mail-band ${d.pop >= 50 ? 'wet' : ''}`}>
          <p className="mail-kicker">Your SunnyDay update · {weekday(data.daily[0].date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <p className="mail-city">{prefs.city.name}</p>
          <p className="mail-temp">
            {Math.round(c.temp)}°C <WeatherIcon icon={c.icon} night={!c.isDay} size={40} />
          </p>
          <p>{c.condition} now</p>
          <p className="mail-when">
            {when}: {d.condition} · High {Math.round(d.max)}° · Low {Math.round(d.min)}°
          </p>
          <p className="mail-sub">
            {d.pop}% chance of rain{d.precip >= 1 ? `, about ${Math.round(d.precip)} mm` : ''}
          </p>
        </div>
        {alerts.map(([t, m]) => (
          <div key={t} className="mail-alert">
            <strong>{t}</strong>
            {m}
          </div>
        ))}
        <div className="mail-parts">
          {parts.map(([label, h]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{Math.round(h.temp)}°</strong>
              <span>{h.pop}% rain</span>
            </div>
          ))}
        </div>
        <p className="mail-facts">
          Feels like {Math.round(c.feelsLike)}° · Humidity {c.humidity}% · Wind {c.wind} km/h{data.air ? ` · Air quality ${data.air.aqi} (US AQI)` : ''} · UV up to {d.uv}
        </p>
        <p className="mail-h">{outlook.length > 3 ? 'The week ahead' : 'Next 3 days'}</p>
        <table className="mail-days">
          <tbody>
            {outlook.map((x) => (
              <tr key={x.date}>
                <td>{weekday(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                <td>{x.condition}</td>
                <td className="pop">{x.pop}%</td>
                <td className="hl">
                  {Math.round(x.max)}° / {Math.round(x.min)}°
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mail-foot">
          You get SunnyDay updates {freq ? freq[1].toLowerCase() : ''}. Open {prefs.city.name} on SunnyDay · Change settings · Unsubscribe
        </p>
      </div>
    </div>
  )
}
