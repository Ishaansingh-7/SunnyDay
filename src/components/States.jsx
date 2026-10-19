export function Loading({ label, tall }) {
  return (
    <div className={`state ${tall ? 'state-tall' : ''}`} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}…</p>
    </div>
  )
}

export function ErrorState({ error, retry, what }) {
  return (
    <div className="state state-error" role="alert">
      <div>
        <p className="state-title">Couldn’t load {what}</p>
        <p>{error.message}.</p>
      </div>
      <button type="button" className="btn" onClick={retry}>
        Try again
      </button>
    </div>
  )
}
