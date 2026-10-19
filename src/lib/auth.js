import { DEMO } from './weather.js'

const REGION = import.meta.env.VITE_COGNITO_REGION
const CLIENT = import.meta.env.VITE_USER_POOL_CLIENT_ID
const KEY = 'sunnyday.session'
const DEMO_USERS = 'sunnyday.demo.users'

export const ACCOUNTS = DEMO ? 'demo' : REGION && CLIENT ? 'live' : 'off'
export const DEMO_CODE = '123456'

const MESSAGES = {
  UsernameExistsException: 'An account with this email already exists. Sign in instead',
  UserNotConfirmedException: 'Confirm your email first. Enter the code we sent you',
  NotAuthorizedException: 'The email or password is incorrect',
  UserNotFoundException: 'The email or password is incorrect',
  CodeMismatchException: 'That code is wrong. Check the email and try again',
  ExpiredCodeException: 'That code has expired. Send yourself a new one',
  InvalidPasswordException: 'Use at least 8 characters, including a number',
  LimitExceededException: 'Too many attempts. Wait a few minutes and try again',
  TooManyRequestsException: 'Too many attempts. Wait a few minutes and try again',
  CodeDeliveryFailureException: 'We couldn’t send the code. Check the email address',
}

export class AuthError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

let session = read(KEY, null)

function setSession(s) {
  session = s
  write(KEY, s)
  window.dispatchEvent(new Event('sunnyday-auth'))
}

export function getSession() {
  return session
}

async function idp(target, body) {
  let res
  try {
    res = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}` },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AuthError('Network', 'Can’t reach the sign-in service. Check your connection')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const code = (data.__type || '').split('#').pop()
    throw new AuthError(code, MESSAGES[code] || data.message || 'Sign-in failed')
  }
  return data
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function demoUsers() {
  return read(DEMO_USERS, {})
}

function checkPassword(pw) {
  if (pw.length < 8 || !/\d/.test(pw)) throw new AuthError('InvalidPasswordException', MESSAGES.InvalidPasswordException)
}

export async function signUp(email, password) {
  email = email.trim().toLowerCase()
  checkPassword(password)
  if (ACCOUNTS === 'demo') {
    await wait(500)
    const users = demoUsers()
    if (users[email]?.confirmed) throw new AuthError('UsernameExistsException', MESSAGES.UsernameExistsException)
    users[email] = { password, confirmed: false }
    write(DEMO_USERS, users)
    return { destination: email }
  }
  const r = await idp('SignUp', { ClientId: CLIENT, Username: email, Password: password, UserAttributes: [{ Name: 'email', Value: email }] })
  return { destination: r.CodeDeliveryDetails?.Destination || email }
}

export async function confirmSignUp(email, code) {
  email = email.trim().toLowerCase()
  if (ACCOUNTS === 'demo') {
    await wait(400)
    if (code !== DEMO_CODE) throw new AuthError('CodeMismatchException', MESSAGES.CodeMismatchException)
    const users = demoUsers()
    if (users[email]) users[email].confirmed = true
    write(DEMO_USERS, users)
    return
  }
  await idp('ConfirmSignUp', { ClientId: CLIENT, Username: email, ConfirmationCode: code })
}

export async function resendCode(email) {
  if (ACCOUNTS === 'demo') return wait(300)
  await idp('ResendConfirmationCode', { ClientId: CLIENT, Username: email.trim().toLowerCase() })
}

export async function signIn(email, password) {
  email = email.trim().toLowerCase()
  if (ACCOUNTS === 'demo') {
    await wait(500)
    const u = demoUsers()[email]
    if (!u || u.password !== password) throw new AuthError('NotAuthorizedException', MESSAGES.NotAuthorizedException)
    if (!u.confirmed) throw new AuthError('UserNotConfirmedException', MESSAGES.UserNotConfirmedException)
    setSession({ email, access: 'demo', refresh: 'demo', exp: Date.now() + 864e5 })
    return
  }
  const r = await idp('InitiateAuth', { ClientId: CLIENT, AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: email, PASSWORD: password } })
  const a = r.AuthenticationResult
  setSession({ email, access: a.AccessToken, refresh: a.RefreshToken, exp: Date.now() + a.ExpiresIn * 1000 })
}

export async function forgotPassword(email) {
  if (ACCOUNTS === 'demo') return wait(400)
  await idp('ForgotPassword', { ClientId: CLIENT, Username: email.trim().toLowerCase() })
}

export async function resetPassword(email, code, password) {
  email = email.trim().toLowerCase()
  checkPassword(password)
  if (ACCOUNTS === 'demo') {
    await wait(400)
    if (code !== DEMO_CODE) throw new AuthError('CodeMismatchException', MESSAGES.CodeMismatchException)
    const users = demoUsers()
    users[email] = { password, confirmed: true }
    write(DEMO_USERS, users)
    return
  }
  await idp('ConfirmForgotPassword', { ClientId: CLIENT, Username: email, ConfirmationCode: code, Password: password })
}

export async function accessToken() {
  if (!session) throw new AuthError('SignedOut', 'Sign in to manage your updates')
  if (ACCOUNTS === 'demo' || session.exp - 60000 > Date.now()) return session.access
  try {
    const r = await idp('InitiateAuth', { ClientId: CLIENT, AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: session.refresh } })
    const a = r.AuthenticationResult
    setSession({ ...session, access: a.AccessToken, exp: Date.now() + a.ExpiresIn * 1000 })
    return a.AccessToken
  } catch (e) {
    setSession(null)
    throw new AuthError('Expired', 'Your session has expired. Sign in again')
  }
}

export function signOut() {
  setSession(null)
}

export function forgetDemoUser(email) {
  const users = demoUsers()
  delete users[email]
  write(DEMO_USERS, users)
}
