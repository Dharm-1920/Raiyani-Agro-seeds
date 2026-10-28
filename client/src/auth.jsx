import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api, { errMsg } from './api';
import { useAuth } from './context';
import { Brand, LanguageSelector, tr } from './language.jsx';
import Icon from './icons';
import { SHOP } from './config';

function GoogleMark() {
  return <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.9.6-2.05.97-3.39.97-2.61 0-4.83-1.76-5.62-4.12H3.05v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.38 13.93a6 6 0 0 1 0-3.86V7.48H3.05a10 10 0 0 0 0 9.04l3.33-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.33 2.59C7.17 7.71 9.39 5.95 12 5.95Z"/></svg>;
}
export function PasswordField({ label = 'Password', value, onChange, newPassword = false, autoFocus = false, recovery = false }) {
  const [show, setShow] = useState(false), id = useId();
  return <div className="auth-password-control"><div className="auth-field-heading"><label htmlFor={id}>{tr(label)}</label>{recovery && <Link className="auth-forgot" to="/forgot-password">{tr('Forgot password?')}</Link>}</div><span className="auth-password-field"><input id={id} type={show ? 'text' : 'password'} required autoFocus={autoFocus} autoComplete={newPassword ? 'new-password' : 'current-password'} minLength={newPassword ? 8 : undefined} maxLength={72} value={value} onChange={onChange} /><button type="button" aria-label={tr(show ? 'Hide password' : 'Show password')} aria-pressed={show} onClick={() => setShow(!show)}><Icon name={show ? 'eyeOff' : 'eye'} size={19} /></button></span></div>;
}
function AuthShell({ children }) {
  return <div className="auth-scene"><section className="auth-card"><div className="auth-card-top"><Link to="/" className="auth-brand" aria-label={tr('Go home')}><Brand /></Link><LanguageSelector /></div>{children}</section><p className="auth-bottom-note"><Icon name="leaf" size={16} />{tr('A little care. A better harvest.')} <Link to="/privacy">{tr('Privacy')}</Link></p></div>;
}
export function PrivacyPolicy() {
  return <AuthShell><h1>{tr('Privacy policy')}</h1><article className="auth-policy">
    <p>Raiyani Agro Seeds operates this website for customer accounts, farm-product orders, purchase invoices and customer support.</p>
    <h2>Account and order information</h2><p>The website stores your name, email, saved phone number, address, cart, orders and messages you send to the shop. Passwords are stored as hashes. A necessary sign-in cookie keeps your account signed in.</p>
    <h2>Sign in with Google</h2><p>If you choose Google sign-in, Google provides your account identifier, name and verified email to create or authenticate your shop account. The website stores those details for sign-in and account recovery. It does not request access to your Gmail messages, Google Drive files or Google contacts.</p>
    <h2>Invoices and account emails</h2><p>Your email is used for verification, password recovery and purchase invoices. Brevo processes the recipient address, message and any attached invoice to deliver these emails. Invoices include order, delivery and payment-status information. Optional WhatsApp delivery, when enabled and selected at checkout, shares the delivery number and invoice with the messaging provider.</p>
    <h2>Storage and your choices</h2><p>The website is hosted on Render and stores shop records in MongoDB. Account and order records remain stored until the shop removes them. You can update saved contact details in My account. To request access, correction or removal of your information, contact the shop at <a href={'mailto:' + SHOP.email}>{SHOP.email}</a>. You can also remove the website's Google connection from your Google Account; that does not automatically delete shop records.</p>
    <p><Link to="/">{tr('Go home')}</Link> · <Link to="/login">{tr('Sign in')}</Link></p>
  </article></AuthShell>;
}
const oauthErrors = {
  google_unavailable: 'Google sign-in is currently unavailable. Continue with email or phone.',
  google_failed: 'Google sign-in could not finish. Please try again or use email.',
  google_link_required: 'This email already has an account. Sign in with your password, then connect Google in My account.',
};
export function CustomerAuth({ register = false }) {
  const { login, register: createAccount } = useAuth();
  const navigate = useNavigate(), location = useLocation(), firstField = useRef(null);
  const [options, setOptions] = useState(null), [optionsError, setOptionsError] = useState(false);
  const [form, setForm] = useState({ name: '', identifier: '', email: '', phone: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(oauthErrors[new URLSearchParams(location.search).get('authError')] || '');
  const loadOptions = () => { setOptionsError(false); api.get('/auth/options').then(({ data }) => setOptions(data)).catch(() => setOptionsError(true)); };
  useEffect(loadOptions, []);
  useEffect(() => { firstField.current?.focus(); }, [register]);
  useEffect(() => { setError(oauthErrors[new URLSearchParams(location.search).get('authError')] || ''); setForm({ name: '', identifier: '', email: '', phone: '', password: '', confirm: '' }); }, [register, location.search]);
  const change = key => event => setForm({ ...form, [key]: event.target.value });
  const submit = async event => {
    event.preventDefault(); setError('');
    if (register && form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    if (register && new TextEncoder().encode(form.password).length > 72) { setError('Use at least 8 characters and no more than 72 bytes for your password.'); return; }
    setBusy(true);
    try {
      if (register) await createAccount({ name: form.name, email: form.email, phone: form.phone, password: form.password });
      else {
        const identifier = form.identifier.trim();
        await login(identifier.includes('@')
          ? { method: 'email', email: identifier, password: form.password }
          : { method: 'phone', phone: identifier, password: form.password });
      }
      const from = location.state?.from;
      navigate(typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/home', { replace: true });
    } catch (err) { setError(errMsg(err)); }
    finally { setBusy(false); }
  };
  return <AuthShell><span className="auth-kicker">{tr('YOUR FARMING ACCOUNT')}</span><h1>{tr(register ? 'A fresh start.' : 'Welcome back.')}</h1><p className="auth-intro">{tr(register ? 'Create your account. Grow with us.' : 'Your farm essentials, one sign-in away.')}</p>
      <form onSubmit={submit} className="auth-form"><fieldset disabled={busy}>
        {register && <label>{tr('Full name')}<input ref={firstField} required autoComplete="name" maxLength={120} value={form.name} onChange={change('name')} /></label>}
        {!register && <label>{tr('Email or phone number')}<input ref={firstField} required type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} value={form.identifier} onChange={change('identifier')} /></label>}
        {register && <><label>{tr('Email for invoices & recovery')}<input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={change('email')} /></label><label>{tr('Phone number (optional)')}<input type="tel" autoComplete="tel" maxLength={30} placeholder="+91 98765 43210" value={form.phone} onChange={change('phone')} /></label></>}
        <PasswordField value={form.password} newPassword={register} recovery={!register} onChange={change('password')} />
        {register && <><small className="auth-password-hint">{tr('Use at least 8 characters.')}</small><PasswordField label="Confirm password" newPassword value={form.confirm} onChange={change('confirm')} /></>}
        {error && <p className="auth-error" role="alert">{tr(error)}</p>}
        <button className="auth-submit" type="submit">{tr(busy ? 'Please wait…' : register ? 'Create account' : 'Sign in')}</button>
      </fieldset></form>
    <div className="auth-divider"><span>{tr('or')}</span></div>
    <div className="auth-methods auth-social-methods">
      <a className={'auth-method auth-google' + (!options?.google ? ' unavailable' : '')} href={options?.google ? `/api/auth/google/start?next=${encodeURIComponent(location.state?.from || '/home')}` : undefined} aria-disabled={!options?.google} onClick={!options?.google ? event => event.preventDefault() : undefined}><GoogleMark /><span>{tr('Continue with Google')}</span></a>
      {options && !options.google && <p className="auth-provider-note">{tr('Google sign-in is currently unavailable. Continue with email or phone.')}</p>}
      {optionsError && <p className="auth-provider-note" role="status">{tr('Sign-in options could not be checked.')} <button className="auth-text-button" type="button" onClick={loadOptions}>{tr('Retry')}</button></p>}
    </div>
    <p className="auth-switch">{tr(register ? 'Already have an account?' : 'New to Raiyani Agro Seeds?')} <Link state={location.state} to={register ? '/login' : '/register'}>{tr(register ? 'Sign in' : 'Create account')}</Link></p>
    {register && <p className="auth-privacy">{tr('We use your email for account recovery and purchase invoices.')}</p>}
  </AuthShell>;
}
export function ForgotPassword() {
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { setMessage((await api.post('/auth/forgot-password', { email })).data.message); }
    catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return <AuthShell><span className="auth-kicker">{tr('LET’S GET YOU BACK IN')}</span><h1>{tr('Forgot password?')}</h1><p className="auth-intro">{tr('Enter your account email. We’ll send you a link to choose a new password.')}</p><form className="auth-form" onSubmit={submit}><fieldset disabled={busy}><label>{tr('Email')}<input autoFocus required type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>{error && <p className="auth-error" role="alert">{tr(error)}</p>}{message && <p className="auth-success" role="status">{tr(message)}</p>}<button className="auth-submit" disabled={busy || Boolean(message)}>{tr(busy ? 'Sending…' : 'Send reset link')}<Icon name="mail" size={19} /></button></fieldset></form><Link className="auth-return" to="/login">← {tr('Back to sign in')}</Link></AuthShell>;
}
function useLinkToken() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  useEffect(() => { if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname); }, []);
  return token;
}
export function ResetPassword() {
  const token = useLinkToken(), { refreshUser } = useAuth();
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); setError('');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try { await api.post('/auth/reset-password', { token, password }); setDone(true); await refreshUser(); }
    catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return <AuthShell><span className="auth-kicker">{tr('A SECURE FRESH START')}</span><h1>{tr(done ? 'Password updated.' : 'Choose a new password')}</h1>{done ? <><p className="auth-success" role="status">{tr('Your password has been reset. Sign in with your new password.')}</p><Link className="auth-submit" to="/login">{tr('Sign in')}</Link></> : !token ? <p className="auth-error" role="alert">{tr('This reset link is invalid or expired. Request a new one.')}</p> : <form className="auth-form" onSubmit={submit}><fieldset disabled={busy}><PasswordField label="New password" newPassword autoFocus value={password} onChange={event => setPassword(event.target.value)} /><small className="auth-password-hint">{tr('Use at least 8 characters.')}</small><PasswordField label="Confirm password" newPassword value={confirm} onChange={event => setConfirm(event.target.value)} />{error && <p className="auth-error" role="alert">{tr(error)}</p>}<button className="auth-submit">{tr(busy ? 'Please wait…' : 'Reset password')}</button></fieldset></form>}{!done && <Link className="auth-return" to="/forgot-password">{tr('Request a new reset link')}</Link>}</AuthShell>;
}
export function VerifyEmail() {
  const token = useLinkToken(), { refreshUser } = useAuth();
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
  const verify = async () => {
    setBusy(true); setError('');
    try { await api.post('/auth/verify-email', { token }); setDone(true); await refreshUser(); }
    catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return <AuthShell><span className="auth-kicker">{tr('YOUR INVOICES, IN YOUR INBOX')}</span><h1>{tr(done ? 'Email verified.' : 'Verify your email')}</h1><p className="auth-intro">{tr(done ? 'Purchase invoices can now be sent to your email.' : 'Confirm your email to receive purchase invoices and recover your account.')}</p>{error && <p className="auth-error" role="alert">{tr(error)}</p>}{!done && token && <button className="auth-submit" onClick={verify} disabled={busy}>{tr(busy ? 'Please wait…' : 'Verify my email')}</button>}{!token && <p className="auth-error">{tr('Open the verification link from your email, or request a new one in My account.')}</p>}<Link className="auth-return" to="/account">{tr('My account')}</Link></AuthShell>;
}
export function AccountSecurity() {
  const { user, refreshUser } = useAuth();
  const [options, setOptions] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => { api.get('/auth/options').then(({ data }) => setOptions(data)).catch(() => {}); }, []);
  const sendVerification = async () => {
    setBusy(true); setError(''); setMessage('');
    try { const { data } = await api.post('/auth/resend-verification'); setMessage(data.message); await refreshUser(); }
    catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  const googleStatus = new URLSearchParams(useLocation().search).get('google');
  return <section className="account-panel account-security"><div className="account-panel-heading"><div><span className="eyebrow">{tr('KEEP YOUR ACCOUNT SAFE')}</span><h2>{tr('Sign-in & invoices')}</h2></div><Icon name="shield" /></div><p>{user.email}</p><p className={user.emailVerified ? 'ok' : 'muted'}>{tr(user.emailVerified ? 'Email verified. Ready for purchase invoices.' : 'Verify your email to receive purchase invoices automatically.')}</p><div className="security-actions">{!user.emailVerified && <button className="secondary" onClick={sendVerification} disabled={busy || !options?.emailDelivery}>{tr(busy ? 'Sending…' : 'Send verification email')}</button>}<Link className="secondary" to="/forgot-password">{tr(user.passwordEnabled ? 'Reset password' : 'Set a password')}</Link>{!user.googleLinked && options?.google && <a className="secondary" href="/api/auth/google/link">{tr('Connect Google')}</a>}{user.googleLinked && <span className="ok">{tr('Google connected')}</span>}</div>{options && !options.emailDelivery && <p className="muted">{tr('Email delivery is not connected yet. You can still download your invoices.')}</p>}{googleStatus === 'connected' && <p className="ok" role="status">{tr('Google connected')}</p>}{googleStatus === 'failed' && <p className="err" role="alert">{tr('Google could not be connected. Use the Google account with the same email.')}</p>}{message && <p className="ok" role="status">{tr(message)}</p>}{error && <p className="err" role="alert">{tr(error)}</p>}</section>;
}
