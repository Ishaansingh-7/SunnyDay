import { ACCOUNTS, accessToken, forgetDemoUser, getSession, signOut } from './auth.js'

const DEMO_PREFS = 'sunnyday.demo.prefs'

export const FREQUENCIES = [
  ['daily', 'Once a day', 'One update a day at the time you choose'],
  ['twice', 'Twice a day', 'At your time and again 12 hours later'],
  ['weekly', 'Once a week', 'A weekly outlook on the day you pick'],
  ['alerts', 'Severe weather only', 'Only when heat, storms, heavy rain or bad air is expected'],
]

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function slots(p) {
  const h = p.hour
  if (p.frequency === 'twice') return [h, (h + 12) % 24]
  if (p.frequency === 'alerts') return [0, 6, 12, 18].map((k) => (h + k) % 24)
  return [h]
}

export function nextSend(p, from = Date.now()) {
  if (!p || p.paused) return null
  const step = 30 * 60000
  let t = Math.floor(from / step) * step
  for (let k = 1; k <= 48 * 8; k++) {
    const at = t + k * step
    const local = new Date(at + p.utcOffsetMin * 60000)
    if (local.getUTCMinutes() >= 30) continue
    const wd = (local.getUTCDay() + 6) % 7
    if (slots(p).includes(local.getUTCHours()) && (p.frequency !== 'weekly' || wd === p.weekday)) return at
  }
  return null
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_PREFS) || '{}')
  } catch {
    return {}
  }
}

function write(v) {
  try {
    localStorage.setItem(DEMO_PREFS, JSON.stringify(v))
  } catch {
    /* storage unavailable */
  }
}

async function api(method, path, body) {
  const token = await accessToken()
  let res
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Auth': token },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Can’t reach the SunnyDay server. Check your connection')
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) signOut()
  if (!res.ok) throw new Error(data.error || `The server returned an error (${res.status})`)
  return data
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

export async function loadAccount() {
  if (ACCOUNTS === 'demo') {
    await pause(300)
    const email = getSession()?.email
    return { email, prefs: read()[email] || null }
  }
  return api('GET', '/api/account')
}

export async function saveAccount(prefs) {
  const body = { ...prefs, siteUrl: window.location.origin.startsWith('https://') ? window.location.origin : '' }
  if (ACCOUNTS === 'demo') {
    await pause(450)
    const all = read()
    all[getSession().email] = prefs
    write(all)
    return { email: getSession().email, prefs }
  }
  return api('POST', '/api/account', body)
}

export async function sendTest() {
  if (ACCOUNTS === 'demo') {
    await pause(700)
    return { sent: true, to: getSession().email, demo: true }
  }
  return api('POST', '/api/account/test', {})
}

export async function deleteAccount() {
  if (ACCOUNTS === 'demo') {
    await pause(500)
    const email = getSession().email
    const all = read()
    delete all[email]
    write(all)
    forgetDemoUser(email)
    signOut()
    return
  }
  await api('DELETE', '/api/account')
  signOut()
}
