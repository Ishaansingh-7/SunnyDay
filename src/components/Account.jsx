import { useEffect, useRef, useState } from 'react'
import {
  ACCOUNTS,
  DEMO_CODE,
  confirmSignUp,
  forgotPassword,
  getSession,
  resendCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from '../lib/auth.js'
import { FREQUENCIES, WEEKDAYS, deleteAccount, loadAccount, nextSend, saveAccount, sendTest } from '../lib/account.js'
import { duration, placeLabel } from '../lib/format.js'
import { useNow } from '../lib/motion.js'
import EmailPreview from './EmailPreview.jsx'
import Search from './Search.jsx'

export function useSession() {
  const [s, setS] = useState(getSession)
  useEffect(() => {
    const on = () => setS(getSession())
    window.addEventListener('sunnyday-auth', on)
    return () => window.removeEventListener('sunnyday-auth', on)
  }, [])
  return s
}

function Field({ id, label, hint, ...rest }) {
  return (
    <label className="acc-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...rest} />
      {hint && <small>{hint}</small>}
    </label>
  )
}

function PasswordField({ id, label, hint, ...rest }) {
  const [show, setShow] = useState(false)
  return (
    <label className="acc-field" htmlFor={id}>
      <span>{label}</span>
      <span className="pw-wrap">
        <input id={id} type={show ? 'text' : 'password'} {...rest} />
        <button type="button" className="pw-eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="3" />
            {show && <path d="M4 20 20 4" />}
          </svg>
        </button>
      </span>
      {hint && <small>{hint}</small>}
    </label>
  )
}

function CodeInput({ value, onChange }) {
  const refs = useRef([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')
  const set = (i, ch) => {
    const next = digits.map((d, k) => (k === i ? ch : d)).join('').replace(/\s+$/, '')
    onChange(next.replace(/ /g, ''))
  }
  return (
    <div className="code" onPaste={(e) => {
      const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
      if (t) {
        e.preventDefault()
        onChange(t)
        refs.current[Math.min(5, t.length)]?.focus()
      }
    }}>
      {digits.map((d, i) => (
        <input
          key={i}
          id={`code-${i}`}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          value={d.trim()}
          className={d.trim() ? 'filled' : ''}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, '').slice(-1)
            set(i, ch || ' ')
            if (ch) refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d.trim()) refs.current[i - 1]?.focus()
          }}
        />
      ))}
    </div>
  )
}

function AuthForms({ onDone }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const run = async (fn) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      if (e.code === 'UserNotConfirmedException') {
        setMode('verify')
        setCode('')
        await resendCode(email).catch(() => {})
        setMsg({ type: 'ok', text: `Your email isn’t confirmed yet. We sent a new code to ${email.trim()}.` })
        return
      }
      setMsg({ type: 'error', text: `${e.message}.` })
    } finally {
      setBusy(false)
    }
  }

  const submit = (e) => {
    e.preventDefault()
    if (mode === 'signin') run(async () => (await signIn(email, password), onDone()))
    if (mode === 'signup')
      run(async () => {
        await signUp(email, password)
        setMode('verify')
        setMsg({ type: 'ok', text: `We sent a 6-digit code to ${email}.` })
      })
    if (mode === 'verify')
      run(async () => {
        await confirmSignUp(email, code)
        await signIn(email, password)
        onDone()
      })
    if (mode === 'forgot')
      run(async () => {
        await forgotPassword(email)
        setMode('reset')
        setCode('')
        setPassword('')
        setMsg({ type: 'ok', text: `If ${email} has an account, a reset code is on its way.` })
      })
    if (mode === 'reset')
      run(async () => {
        await resetPassword(email, code, password)
        await signIn(email, password)
        onDone()
      })
  }

  const titles = {
    signin: ['Sign in', 'Get weather updates for your city by email.'],
    signup: ['Create your account', 'Free. Choose a city and how often you hear from us.'],
    verify: ['Check your email', `Enter the 6-digit code we sent to ${email || 'your email'}.`],
    forgot: ['Reset your password', 'We’ll email you a code to set a new one.'],
    reset: ['Choose a new password', `Enter the code sent to ${email} and a new password.`],
  }

  return (
    <form className="acc-form" onSubmit={submit} noValidate>
      {(mode === 'signin' || mode === 'signup') && (
        <div className="acc-switch" role="tablist" style={{ '--k': mode === 'signin' ? 0 : 1 }}>
          <span className="sp-pill" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => (setMode('signin'), setMsg(null))}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => (setMode('signup'), setMsg(null))}>
            Create account
          </button>
        </div>
      )}
      <div className="acc-step" key={mode}>
        <h2>{titles[mode][0]}</h2>
        <p className="acc-muted">{titles[mode][1]}</p>
        {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
          <Field id="acc-email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        )}
        {(mode === 'verify' || mode === 'reset') && <CodeInput value={code} onChange={setCode} />}
        {ACCOUNTS === 'demo' && (mode === 'verify' || mode === 'reset') && <p className="acc-demo">Sample mode: the code is {DEMO_CODE}.</p>}
        {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
          <PasswordField
            id="acc-password"
            label={mode === 'reset' ? 'New password' : 'Password'}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={mode !== 'signin' ? 'At least 8 characters, including a number' : null}
          />
        )}
        {msg && (
          <p className={msg.type === 'error' ? 'acc-error' : 'acc-ok'} role={msg.type === 'error' ? 'alert' : 'status'}>
            {msg.text}
          </p>
        )}
        <button type="submit" className="acc-primary" disabled={busy}>
          {busy && <span className="spin" aria-hidden="true" />}
          {{ signin: 'Sign in', signup: 'Create account', verify: 'Verify email', forgot: 'Send reset code', reset: 'Save new password' }[mode]}
        </button>
        <div className="acc-links">
          {mode === 'signin' && (
            <button type="button" className="acc-link" onClick={() => (setMode('forgot'), setMsg(null))}>
              Forgot your password?
            </button>
          )}
          {mode === 'verify' && (
            <button type="button" className="acc-link" onClick={() => run(async () => (await resendCode(email), setMsg({ type: 'ok', text: 'We sent a new code.' })))}>
              Send a new code
            </button>
          )}
          {(mode === 'verify' || mode === 'forgot' || mode === 'reset') && (
            <button type="button" className="acc-link" onClick={() => (setMode('signin'), setMsg(null))}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

function Toggle({ id, checked, onChange, label, hint }) {
  return (
    <label className="acc-toggle" htmlFor={id}>
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  )
}

function fmtWhen(ts) {
  const d = new Date(ts)
  return d.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function until(ms) {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 48 * 60) return duration(mins)
  const d = Math.floor(mins / 1440)
  const h = Math.round((mins % 1440) / 60)
  return `${d} days${h ? ` ${h} h` : ''}`
}

const hourLabel = (h) => `${h % 12 || 12}:00 ${h < 12 ? 'am' : 'pm'}`

function zoneName() {
  try {
    const part = new Intl.DateTimeFormat('en-IN', { timeZoneName: 'long' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')
    return part ? part.value : ''
  } catch {
    return ''
  }
}

function Settings({ place, email }) {
  const [state, setState] = useState({ loading: true, error: null })
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState(null)
  const [preview, setPreview] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const now = useNow(30000)

  const defaults = () => ({
    city: { name: place.name, admin1: place.admin1, country: place.country, lat: place.lat, lon: place.lon },
    frequency: 'daily',
    hour: 7,
    weekday: 0,
    alerts: true,
    paused: false,
    utcOffsetMin: -new Date().getTimezoneOffset(),
  })

  useEffect(() => {
    let alive = true
    loadAccount()
      .then((r) => {
        if (!alive) return
        const p = r.prefs ? { ...defaults(), ...r.prefs } : null
        setSaved(p)
        setDraft(p || defaults())
        setState({ loading: false, error: null })
      })
      .catch((e) => alive && setState({ loading: false, error: e }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!preview) return
    const esc = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      setPreview(false)
    }
    document.addEventListener('keydown', esc, true)
    return () => document.removeEventListener('keydown', esc, true)
  }, [preview])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  if (state.loading) return <p className="acc-muted acc-pad">Loading your settings…</p>
  if (state.error) return <p className="acc-error acc-pad">Couldn’t load your settings. {state.error.message}.</p>

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const next = nextSend(draft, now)

  const act = async (name, fn) => {
    setBusy(name)
    try {
      await fn()
    } catch (e) {
      setToast({ type: 'error', text: `${e.message}.` })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="acc-settings">
      <section className="acc-card">
        <h3>City</h3>
        <div className="acc-city">
          <div>
            <b>{draft.city.name}</b>
            <small>{placeLabel(draft.city) || `${draft.city.lat}, ${draft.city.lon}`}</small>
          </div>
          {(place.lat !== draft.city.lat || place.lon !== draft.city.lon) && (
            <button type="button" className="acc-chip" onClick={() => set({ city: { name: place.name, admin1: place.admin1, country: place.country, lat: place.lat, lon: place.lon } })}>
              Use {place.name}
            </button>
          )}
        </div>
        <Search onSelect={(p) => set({ city: { name: p.name, admin1: p.admin1, country: p.country, lat: p.lat, lon: p.lon } })} recent={[]} shortcut={false} placeholder="Search for a different city" />
      </section>

      <section className="acc-card">
        <h3>How often</h3>
        <div className="freq" role="radiogroup" aria-label="How often">
          {FREQUENCIES.map(([id, label, hint]) => (
            <button key={id} type="button" role="radio" aria-checked={draft.frequency === id} className={draft.frequency === id ? 'on' : ''} onClick={() => set({ frequency: id })}>
              <span className={`freq-ico f-${id}`} aria-hidden="true" />
              <b>{label}</b>
              <small>{hint}</small>
            </button>
          ))}
        </div>
        <div className="acc-row">
          <label className="acc-field inline" htmlFor="acc-hour">
            <span>{draft.frequency === 'alerts' ? 'Check from' : 'Send at'}</span>
            <select id="acc-hour" value={draft.hour} onChange={(e) => set({ hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                  {draft.frequency === 'twice' ? ` and ${hourLabel((h + 12) % 24)}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {zoneName() && <p className="acc-zone">Times are in your time zone, {zoneName()}.</p>}
        {draft.frequency === 'weekly' && (
          <div className="days" role="radiogroup" aria-label="Day of the week">
            {WEEKDAYS.map((d, i) => (
              <button key={d} type="button" role="radio" aria-checked={draft.weekday === i} className={draft.weekday === i ? 'on' : ''} onClick={() => set({ weekday: i })}>
                {d}
              </button>
            ))}
          </div>
        )}
        {draft.frequency !== 'alerts' && (
          <Toggle id="acc-alerts" checked={draft.alerts} onChange={(v) => set({ alerts: v })} label="Severe weather alerts" hint="Extra email if heat, storms, heavy rain or bad air is coming" />
        )}
        <Toggle id="acc-paused" checked={draft.paused} onChange={(v) => set({ paused: v })} label="Pause all emails" hint="Keep your settings but stop sending for now" />
      </section>

      <section className={`acc-next ${draft.paused ? 'paused' : ''}`} aria-live="polite">
        {draft.paused ? (
          <p>Emails are paused.</p>
        ) : next ? (
          <>
            <p>
              {draft.frequency === 'alerts' ? 'Next severe-weather check' : 'Next email'}: <b>{fmtWhen(next)}</b>
            </p>
            <small>
              in {until(next - now)}
              {dirty ? ' once you save' : ''}
            </small>
          </>
        ) : (
          <p>No email is scheduled.</p>
        )}
      </section>

      <div className="acc-actions">
        <button
          type="button"
          className="acc-primary"
          disabled={!dirty || !!busy}
          onClick={() =>
            act('save', async () => {
              const r = await saveAccount(draft)
              const p = { ...draft, ...r.prefs }
              setSaved(p)
              setDraft(p)
              setToast({ type: 'ok', text: saved ? 'Settings saved.' : 'You’re subscribed. Your first update is on its way at the next scheduled time.' })
            })
          }
        >
          {busy === 'save' && <span className="spin" aria-hidden="true" />}
          {saved ? (dirty ? 'Save changes' : 'Saved') : 'Start my updates'}
        </button>
        <button type="button" className="acc-secondary" onClick={() => setPreview(true)}>
          Preview email
        </button>
        <button
          type="button"
          className="acc-secondary"
          disabled={!saved || dirty || !!busy}
          title={!saved || dirty ? 'Save your settings first' : undefined}
          onClick={() =>
            act('test', async () => {
              const r = await sendTest()
              setToast({ type: 'ok', text: r.demo ? 'Sample mode: on the live site this sends the email to you now.' : `Test email sent to ${r.to}.` })
            })
          }
        >
          {busy === 'test' && <span className="spin dark" aria-hidden="true" />}
          Send a test email
        </button>
      </div>

      {toast && (
        <p className={`acc-toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
          {toast.text}
        </p>
      )}

      <section className="acc-danger">
        {confirmDelete ? (
          <>
            <p>This deletes your account and settings. You won’t get any more emails.</p>
            <div className="acc-actions">
              <button type="button" className="acc-delete" disabled={!!busy} onClick={() => act('delete', deleteAccount)}>
                {busy === 'delete' && <span className="spin" aria-hidden="true" />}
                Delete my account
              </button>
              <button type="button" className="acc-secondary" onClick={() => setConfirmDelete(false)}>
                Keep my account
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="acc-link danger" onClick={() => setConfirmDelete(true)}>
            Delete account
          </button>
        )}
      </section>

      {preview && (
        <div className="mail-modal" role="dialog" aria-modal="true" aria-label="Email preview">
          <div className="mail-modal-bar">
            <b>Preview of your email</b>
            <button type="button" className="acc-icon" onClick={() => setPreview(false)} aria-label="Close preview">
              ×
            </button>
          </div>
          <EmailPreview prefs={draft} email={email} />
        </div>
      )}
    </div>
  )
}

export default function Account({ open, onClose, place }) {
  const session = useSession()
  const panel = useRef(null)

  useEffect(() => {
    if (!open) return
    const esc = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      onClose()
    }
    document.addEventListener('keydown', esc)
    const t = setTimeout(() => panel.current?.querySelector('input, button.acc-primary')?.focus(), 350)
    document.body.classList.add('drawer-open')
    return () => {
      document.removeEventListener('keydown', esc)
      clearTimeout(t)
      document.body.classList.remove('drawer-open')
    }
  }, [open, onClose])

  return (
    <div className={`drawer-wrap ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" ref={panel} role="dialog" aria-modal="true" aria-label="Your SunnyDay account" inert={open ? undefined : ''}>
        <div className="drawer-head">
          <div className="drawer-title">
            <span className="mail-glyph" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="m4 7 8 6 8-6" />
              </svg>
            </span>
            <div>
              <b>Email updates</b>
              <small>{session ? session.email : 'Weather for your city, on your schedule'}</small>
            </div>
          </div>
          <div className="drawer-tools">
            {session && (
              <button type="button" className="acc-link" onClick={signOut}>
                Sign out
              </button>
            )}
            <button type="button" className="acc-icon" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>
        <div className="drawer-body">
          {ACCOUNTS === 'demo' && <p className="acc-demo">Sample mode: accounts and settings are saved only in this browser, and no emails are sent.</p>}
          {ACCOUNTS === 'off' ? (
            <div className="acc-pad acc-off">
              <h2>Accounts switch on after you deploy</h2>
              <p className="acc-muted">
                Sign-up, sign-in and email updates run on Amazon Cognito, Lambda, DynamoDB and SES. Run <code>deploy.ps1</code> in the SunnyDay folder, then open the CloudFront address it prints.
              </p>
              <ol>
                <li>Install the AWS CLI and AWS SAM CLI, then run <code>aws configure</code>.</li>
                <li>
                  Run <code>.\deploy.ps1</code> and enter the email address the updates should come from.
                </li>
                <li>Click the verification link AWS emails to that address.</li>
              </ol>
            </div>
          ) : session && open ? (
            <Settings key={session.email} place={place} email={session.email} />
          ) : open ? (
            <AuthForms onDone={() => {}} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
