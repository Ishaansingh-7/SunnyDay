export default function ChartTooltip({ active, payload, label, formatLabel, rows }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="chart-tip">
      <div className="tip-title">{formatLabel ? formatLabel(label, d) : label}</div>
      {rows(d).map(([name, value, color]) => (
        <div className="tip-row" key={name}>
          {color && <span className="tip-key" style={{ background: color }} />}
          <span className="tip-name">{name}</span>
          <span className="tip-value">{value}</span>
        </div>
      ))}
    </div>
  )
}
