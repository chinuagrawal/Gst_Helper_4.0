import { useEffect, useRef, useState } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { auth } from './utils/firebase.js';
import { authErrorMessage as message } from './utils/authErrors.js';
import './login.css';

export default function Login({ onBack }) {
  const [phone, setPhone] = useState('+91');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const verifier = useRef(null);
  useEffect(() => () => verifier.current?.clear(), []);
  async function sendCode(event) {
    event.preventDefault();
    if (busy) return;
    const number = phone.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(number)) { setError('Include the country code, for example +91 followed by your mobile number.'); return; }
    if (Date.now() < retryAt) { setError('Wait one minute before requesting another code.'); return; }
    setBusy(true); setError('');
    try {
      verifier.current?.clear();
      verifier.current = new RecaptchaVerifier(auth, 'otp-recaptcha', { size: 'invisible' });
      await verifier.current.render();
      setConfirmation(await signInWithPhoneNumber(auth, number, verifier.current));
      setRetryAt(Date.now() + 60000); setCode('');
    } catch (err) { setError(message(err)); verifier.current?.clear(); verifier.current = null; }
    finally { setBusy(false); }
  }
  async function verify(event) {
    event.preventDefault();
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError('');
    try { await confirmation.confirm(code); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  return <main className="signin-page">
    <header className="signin-header"><span className="signin-brand"><span>g.</span>GST Helper</span>{onBack && <button className="signin-back" onClick={onBack} disabled={busy}>← Back to home</button>}</header>
    <div className="signin-layout">
      <aside className="signin-story"><span className="signin-kicker">LESS ADMIN. MORE CLARITY.</span><h1>Your month.<br />Your clients.<br /><span>All together.</span></h1><p>A calmer way to prepare GST returns. Pick up your work right where you left it.</p>
        <div className="signin-workspace" aria-hidden="true"><div className="signin-workspace-top"><span>YOUR WORKSPACE</span><span>↗</span></div>{['Clients organized', 'Monthly reports saved', 'GSTR-1 JSON, ready to review'].map((item, i) => <div className="signin-workspace-row" key={item}><span className="signin-check">✓</span><span>{item}</span><span className="signin-row-line" style={{ width: `${45 - i * 8}px` }} /></div>)}<div className="signin-workspace-bottom"><span className="signin-dot" /> One account. Across devices.</div></div>
        <span className="signin-marketplace">Meesho available now <span>•</span> More marketplaces coming soon</span>
      </aside>
      <section className="signin-card" aria-labelledby="signin-title"><div className="signin-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg></div>
    <div className="signin-progress" aria-label={confirmation ? 'Step 2 of 2: Verify phone' : 'Step 1 of 2: Phone number'}><span className="is-active" /> <span className={confirmation ? 'is-active' : ''} /></div>
    <h2 id="signin-title">{confirmation ? 'Check your phone.' : 'Welcome to your workspace.'}</h2>
    <p className="signin-description">{confirmation ? `Enter the 6-digit code sent to ${phone}.` : 'Sign in or create your account with your phone number.'}</p>
    {!confirmation && <form onSubmit={sendCode} className="signin-form">
      <label className="signin-field">Phone number<input type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} disabled={busy} onChange={e => setPhone(e.target.value)} required aria-describedby="phone-hint" /></label>
      <p className="signin-hint" id="phone-hint">Include your country code. We’ll send you a verification code.</p>
      <button className="signin-primary" disabled={busy}>{busy ? <><span className="signin-spinner" /> Sending code…</> : <>Send verification code <span>→</span></>}</button>
    </form>}
    <div id="otp-recaptcha" />
    {confirmation && <form onSubmit={verify} className="signin-form">
      <label className="signin-field">Verification code<input className="signin-code" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" disabled={busy} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label>
      <button className="signin-primary" disabled={busy || code.length !== 6}>{busy ? <><span className="signin-spinner" /> Verifying…</> : <>Verify & sign in <span>→</span></>}</button>
      <div className="signin-secondary-actions"><button type="button" disabled={busy} onClick={sendCode}>Resend code</button>
        <button type="button" disabled={busy} onClick={() => { setConfirmation(null); setCode(''); setError(''); }}>Change number</button></div>
    </form>}
    {error && <p className="signin-error" role="alert">{error}</p>}
    <div className="signin-trust"><span aria-hidden="true">◇</span> Secure phone verification · No password to remember</div>
    <p className="signin-consent">By continuing, you consent to Google processing your phone number for authentication and abuse prevention. SMS rates may apply.</p>
  </section></div><footer className="signin-footer">GST filing made easy. A little less busywork.</footer></main>;
}
