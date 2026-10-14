import { useEffect, useRef, useState } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { auth } from './utils/firebase.js';
import { authErrorMessage as message } from './utils/authErrors.js';

export default function Login() {
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
  return <main className="login-page"><section className="card login-card">
    <h1>GST Helper</h1><h2>Sign in with your phone</h2>
    <p className="client-storage-note">Access your clients and monthly work securely across devices.</p>
    <form onSubmit={sendCode} className="client-form">
      <label className="field">Phone number<input type="tel" autoComplete="tel" value={phone} disabled={busy || Boolean(confirmation)} onChange={e => setPhone(e.target.value)} required /></label>
      {!confirmation && <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send OTP'}</button>}
    </form>
    <div id="otp-recaptcha" />
    {confirmation && <form onSubmit={verify} className="client-form">
      <label className="field">OTP sent to {phone}<input autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label>
      <div className="client-actions"><button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify & sign in'}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={sendCode}>Resend OTP</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setConfirmation(null); setCode(''); }}>Change number</button></div>
    </form>}
    {error && <p className="error-msg" role="alert">{error}</p>}
    <p className="client-storage-note">By continuing, you consent to Google processing your phone number for authentication and abuse prevention. SMS rates may apply.</p>
  </section></main>;
}
