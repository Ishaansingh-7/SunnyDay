import { useId } from 'react'

const CLOUD = 'M7 15h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 15Z'

const PARTLY_CLOUD = 'M9 19.5h8.5a3.4 3.4 0 0 0 .3-6.8 4.6 4.6 0 0 0-8.9 1A2.9 2.9 0 0 0 9 19.5Z'

const FRONT_CLOUD = 'M6.5 19h9.5a3.8 3.8 0 0 0 .4-7.6 5.2 5.2 0 0 0-10 1.1A3.2 3.2 0 0 0 6.5 19Z'

const Sun = () => (
  <g className="i-sun">
    <circle cx="12" cy="12" r="4.2" className="i-sun-core" />
    <path className="i-rays" d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </g>
)
const Moon = () => <path className="i-moon" d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />

const Drops = ({ snow }) =>
  snow ? (
    <g className="i-flakes">
      <path d="M8 19h.01" />
      <path d="M12 18h.01" />
      <path d="M16 19h.01" />
      <path d="M10 21.5h.01" />
      <path d="M14 21.5h.01" />
    </g>
  ) : (
    <g className="i-drops">
      <path d="M8.5 17.5l-1 3" />
      <path d="M12.5 17.5l-1 3" />
      <path d="M16.5 17.5l-1 3" />
    </g>
  )

const shapes = {
  clear: (night) => (night ? <Moon /> : <Sun />),
  partly: (night, id) => (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <path className="i-cloud" d={PARTLY_CLOUD} fill="#000" stroke="#000" strokeWidth="4.2" />
      </mask>
      <g mask={`url(#${id})`}>
        {night ? (
          <g transform="translate(8.8 8.6) scale(.7) translate(-11.9 -12.1)" strokeWidth="2.3">
            <Moon />
          </g>
        ) : (
          <g transform="translate(8.7 8.7) scale(.68) translate(-12 -12)" strokeWidth="2.35">
            <Sun />
          </g>
        )}
      </g>
      <path className="i-cloud" d={PARTLY_CLOUD} />
    </>
  ),
  cloudy: (night, id) => (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <path className="i-cloud" d={FRONT_CLOUD} fill="#000" stroke="#000" strokeWidth="4.2" />
      </mask>
      <path className="i-cloud back" mask={`url(#${id})`} d="M10.5 8.2a4.6 4.6 0 0 1 8.6 1.3 3.6 3.6 0 0 1 2.4 5" />
      <path className="i-cloud" d={FRONT_CLOUD} />
    </>
  ),
  fog: () => (
    <>
      <path className="i-cloud" d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 14Z" />
      <g className="i-fog">
        <path d="M4 17.5h16" />
        <path d="M6 21h12" />
      </g>
    </>
  ),
  drizzle: () => (
    <>
      <path className="i-cloud" d={CLOUD} />
      <g className="i-drops slow">
        <path d="M9 18v1.4" />
        <path d="M13 18v1.4" />
        <path d="M16 19v1.4" />
      </g>
    </>
  ),
  rain: () => (
    <>
      <path className="i-cloud" d={CLOUD} />
      <Drops />
    </>
  ),
  snow: () => (
    <>
      <path className="i-cloud" d={CLOUD} />
      <Drops snow />
    </>
  ),
  storm: () => (
    <>
      <path className="i-cloud" d={CLOUD} />
      <path className="i-bolt" d="M12.5 15.5l-2.5 3.5h3.5l-2 3.5" />
    </>
  ),
}

export default function WeatherIcon({ icon = 'cloudy', night = false, size = 24, label, still = false }) {
  const draw = shapes[icon] || shapes.cloudy
  const id = `wxm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg
      className={`wx-icon wx-${icon} ${still ? 'still' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {draw(night, id)}
    </svg>
  )
}
