let ctx = null
let master = null
let rainGain = null
let patterGain = null
let windGain = null
let windFilter = null
let timers = []
let state = { kind: 'clear', isDay: true, wind: 8 }
let on = false

function noise(seconds, brown) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else d[i] = w
  }
  return buf
}

function loop(buf) {
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.start()
  return src
}

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)()
  master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  const white = noise(3, false)
  const brown = noise(4, true)

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 500
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 5200
  rainGain = ctx.createGain()
  rainGain.gain.value = 0
  loop(white).connect(hp)
  hp.connect(lp).connect(rainGain).connect(master)

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2600
  bp.Q.value = 0.8
  patterGain = ctx.createGain()
  patterGain.gain.value = 0
  loop(white).connect(bp).connect(patterGain).connect(master)

  windFilter = ctx.createBiquadFilter()
  windFilter.type = 'lowpass'
  windFilter.frequency.value = 500
  windGain = ctx.createGain()
  windGain.gain.value = 0
  loop(brown).connect(windFilter).connect(windGain).connect(master)
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.09
  const lfoAmt = ctx.createGain()
  lfoAmt.gain.value = 320
  lfo.connect(lfoAmt).connect(windFilter.frequency)
  lfo.start()

  window.addEventListener('sunnyday-thunder', (e) => thunder(e.detail?.delay ?? 0.6, e.detail?.power ?? 1))
}

function chirp(t, f0, f1, dur, vol) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.2)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function birds() {
  const t = ctx.currentTime + 0.05
  const n = 2 + Math.floor(Math.random() * 4)
  const base = 2600 + Math.random() * 1400
  for (let i = 0; i < n; i++) chirp(t + i * 0.13, base, base * (1.3 + Math.random() * 0.5), 0.09, 0.05)
}

function crickets() {
  const t = ctx.currentTime + 0.05
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 4400 + Math.random() * 300
    g.gain.setValueAtTime(0, t + i * 0.06)
    g.gain.linearRampToValueAtTime(0.018, t + i * 0.06 + 0.01)
    g.gain.linearRampToValueAtTime(0, t + i * 0.06 + 0.04)
    o.connect(g).connect(master)
    o.start(t + i * 0.06)
    o.stop(t + i * 0.06 + 0.05)
  }
}

function thunder(delay, power) {
  if (!on || !ctx) return
  const t = ctx.currentTime + delay
  const src = ctx.createBufferSource()
  src.buffer = noise(4, true)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(900, t)
  f.frequency.exponentialRampToValueAtTime(120, t + 2.5)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.9 * power, t + 0.08)
  g.gain.exponentialRampToValueAtTime(0.25 * power, t + 0.6)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6)
  src.connect(f).connect(g).connect(master)
  src.start(t)
  src.stop(t + 4)
}

function schedule() {
  timers.forEach(clearTimeout)
  timers = []
  const { kind, isDay } = state
  const wet = kind === 'rain' || kind === 'storm' || kind === 'drizzle'
  const tick = (fn, min, max) => {
    const run = () => {
      if (!on) return
      fn()
      timers.push(setTimeout(run, min + Math.random() * (max - min)))
    }
    timers.push(setTimeout(run, 400 + Math.random() * min))
  }
  if (!wet && isDay && (kind === 'clear' || kind === 'partly')) tick(birds, 1800, 5200)
  if (!wet && !isDay) tick(crickets, 500, 1400)
}

function apply() {
  if (!ctx) return
  const { kind, wind } = state
  const t = ctx.currentTime
  const rain = { drizzle: 0.1, rain: 0.28, storm: 0.42 }[kind] ?? 0
  const patter = { drizzle: 0.05, rain: 0.12, storm: 0.16 }[kind] ?? 0
  const w = Math.min(0.32, 0.04 + (wind ?? 8) / 120) + (kind === 'storm' ? 0.12 : 0) + (kind === 'snow' || kind === 'fog' ? 0.06 : 0)
  rainGain.gain.setTargetAtTime(rain, t, 0.8)
  patterGain.gain.setTargetAtTime(patter, t, 0.8)
  windGain.gain.setTargetAtTime(w, t, 1.2)
  schedule()
}

export function soundOn() {
  return on
}

export async function setSound(next) {
  on = next
  if (on && !ctx) build()
  if (!ctx) return
  if (on) {
    await ctx.resume()
    master.gain.setTargetAtTime(0.8, ctx.currentTime, 0.4)
    apply()
  } else {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.25)
    timers.forEach(clearTimeout)
    timers = []
  }
  window.dispatchEvent(new Event('sunnyday-sound'))
}

export function updateSound(next) {
  state = { ...state, ...next }
  if (on) apply()
}
