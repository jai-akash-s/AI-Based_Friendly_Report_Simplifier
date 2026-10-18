import React, { useState, useEffect } from 'react';
import { ArrowRight, CircleAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { api, getApiUrl, go } from '../api/client';
import { GoogleIcon } from '../components/common/CommonUI';

export function AuthView({ onAuthenticated }) {
  const [registering, setRegistering] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/auth/config')
      .then((config) => setGoogleEnabled(config.google_enabled === true))
      .catch(() => {});
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const endpoint = registering ? '/api/register' : '/api/login';
    try {
      const result = await api(endpoint, { method: 'POST', body: new URLSearchParams(form) });
      onAuthenticated(result);
      go('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span><b>AI Report Simplifier</b><small>Friendly health clarity</small></span>
        </div>
        <div className="story-content">
          <p className="eyebrow">{registering ? 'A calmer way to begin' : 'Your health, made clearer'}</p>
          <h1>{registering ? 'Build a clearer health information habit.' : 'Make more sense of the information in front of you.'}</h1>
          <p>Turn complex medical reports into simple, useful explanations for better conversations with your care team.</p>
          <div className="auth-flow">
            <span><b>01</b><strong>Upload</strong><small>Bring a report or paste text.</small></span>
            <ArrowRight />
            <span><b>02</b><strong>Understand</strong><small>See important terms clearly.</small></span>
          </div>
        </div>
        <p className="quote"><ShieldCheck size={18} /> Your local workspace is designed around clarity and privacy.</p>
      </section>

      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <p className="eyebrow">{registering ? 'Create account' : 'Welcome back'}</p>
          <h2>{registering ? 'Start your health workspace' : 'Sign in to your health workspace'}</h2>
          <p className="muted">Continue with Google or use an email and password.</p>

          {error && (
            <div className="alert error">
              <CircleAlert size={17} />
              {error}
            </div>
          )}

          {googleEnabled && (
            <>
              <a className="button google-auth-button wide" href={getApiUrl('/auth/google')}>
                <GoogleIcon size={18} />
                <span>Continue with Google</span>
              </a>
              <div className="or"><span>or with email</span></div>
            </>
          )}

          <label>
            Email address
            <input name="email" type="email" placeholder="you@example.com" required />
          </label>

          <label>
            Password
            <input name="password" type="password" placeholder="At least 6 characters" required />
          </label>

          {registering && (
            <label>
              Confirm password
              <input name="password_confirmation" type="password" placeholder="Re-enter your password" required />
            </label>
          )}

          {!registering && (
            <label className="check">
              <input type="checkbox" name="remember" /> Keep me signed in on this device
            </label>
          )}

          <button className="button primary wide" disabled={busy}>
            {busy ? 'Please wait...' : registering ? 'Create account' : 'Login'} <ArrowRight size={17} />
          </button>

          <div className="or"><span>or</span></div>

          <button
            type="button"
            className="button secondary wide"
            onClick={() => { setRegistering(!registering); setError(''); }}
          >
            {registering ? 'Back to login' : 'Create an account'}
          </button>

          <p className="form-note">
            <ShieldCheck size={15} /> Authentication is stored in your secure workspace session.
          </p>
        </form>
      </section>
    </main>
  );
}
