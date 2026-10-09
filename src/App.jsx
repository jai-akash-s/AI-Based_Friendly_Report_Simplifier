import React, { Component, useEffect, useState } from 'react';
import {
  ArrowDownAZ, ArrowRight, ArrowUpAZ, ArrowUpDown, Calendar, Check, ChevronRight, CircleAlert, Download, Eye, FileText, HeartPulse,
  Home, LogOut, Menu, Printer, Search, ShieldCheck, Sparkles, UploadCloud, UserRound, Volume2,
  UserRoundPlus, UsersRound, X,
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const DISCLAIMER = 'This tool is for understanding only, not a medical diagnosis or prescription. Educational summary only; this is not a diagnosis or treatment plan. Findings may have several explanations. Do not start, stop, or change treatment or medicines based on this summary; please consult your doctor.';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Captured by ErrorBoundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="panel" style={{ margin: '40px auto', maxWidth: '540px', textAlign: 'center', padding: '36px 24px' }}>
          <div className="alert error" style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <CircleAlert size={18} />
            <span>Something went wrong while loading this page.</span>
          </div>
          <p className="muted" style={{ marginBottom: '24px', fontSize: '13px' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.hash = '#/dashboard';
              }}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const api = async (path, options = {}) => {
  const response = await fetch(path, { credentials: 'include', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};

const go = (path) => {
  const target = path.startsWith('/') ? path : `/${path}`;
  window.location.hash = `#${target}`;
};

const cleanPath = (hash = window.location.hash) => {
  const p = (hash || '').replace(/^#\/?/, '').split('?')[0].split('#')[0].trim();
  if (!p || p === 'dashboard' || p === 'upload') return '/dashboard';
  return '/' + p;
};

function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [path, setPath] = useState(cleanPath());

  useEffect(() => {
    const onHashChange = () => setPath(cleanPath());
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);

    api('/api/auth/session')
      .then((data) => {
        if (data && data.authenticated && data.user_email) {
          setSession(data);
        } else {
          setSession(null);
        }
      })
      .catch(() => setSession(null))
      .finally(() => setChecking(false));

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (err) {
      console.warn('Logout request warning:', err);
    } finally {
      setSession(null);
      go('/dashboard');
    }
  };

  if (checking) return <div className="loading-screen"><Sparkles /><span>Opening your workspace...</span></div>;
  if (!session) return <AuthView onAuthenticated={setSession} />;
  return <Shell session={session} path={path} onLogout={handleLogout} onNavigate={setPath} />;
}

function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function AuthView({ onAuthenticated }) {
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
              <a className="button google-auth-button wide" href="/auth/google">
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

function Shell({ session, path, onLogout, onNavigate }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  let view;
  if (path.startsWith('/patients/')) {
    const patientId = path.split('/')[2];
    view = <PatientDetail id={patientId} />;
  } else if (path === '/patients') {
    view = <Patients />;
  } else if (path === '/reports') {
    view = <Reports />;
  } else {
    view = <Dashboard />;
  }

  const navigateTo = (target) => {
    setMobileOpen(false);
    go(target);
    if (onNavigate) onNavigate(target);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation menu">
          <Menu size={20} />
        </button>
        <a className="brand" href="#/dashboard" onClick={() => navigateTo('/dashboard')}>
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span><b>AI Report Simplifier</b><small>Friendly health clarity</small></span>
        </a>
        <nav className={mobileOpen ? 'open' : ''}>
          <NavLink href="/dashboard" icon={<Home size={16} />} label="Home" currentPath={path} onClick={() => setMobileOpen(false)} />
          <NavLink href="/reports" icon={<FileText size={16} />} label="My reports" currentPath={path} onClick={() => setMobileOpen(false)} />
          <NavLink href="/patients" icon={<UsersRound size={16} />} label="Patients" currentPath={path} onClick={() => setMobileOpen(false)} />
          <button
            type="button"
            className="mobile-logout-link"
            onClick={() => { setMobileOpen(false); onLogout(); }}
          >
            <LogOut size={16} /> Log out ({session.user_email}) {session.provider === 'google' ? '(Google)' : ''}
          </button>
        </nav>
        <div className="user-menu">
          <span className="avatar">
            {session.provider === 'google' ? <GoogleIcon size={16} /> : <UserRound size={16} />}
          </span>
          <span className="user-email">
            {session.user_email}
            {session.provider === 'google' && <span className="google-badge">Google</span>}
          </span>
          <button type="button" className="logout" onClick={onLogout} title="Sign out of account">
            <LogOut size={15} /> <span>Log out</span>
          </button>
        </div>
      </header>
      <main className="page">
        <ErrorBoundary key={path}>
          {view}
        </ErrorBoundary>
      </main>
      <footer>
        <span>AI-Based Friendly Report Simplifier</span>
        <span>Educational use only · Have questions? Bring them to your care team.</span>
      </footer>
    </div>
  );
}

function NavLink({ href, icon, label, currentPath, onClick }) {
  const isActive = currentPath === href || (href === '/dashboard' && (currentPath === '/' || currentPath === '/upload'));
  return (
    <a
      href={`#${href}`}
      className={isActive ? 'active' : ''}
      onClick={onClick}
    >
      {icon}{label}
    </a>
  );
}

function Dashboard() {
  const [patients, setPatients] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api('/patients/api/list'),
      api('/api/dashboard/stats'),
    ])
      .then(([patientData, dashboardStats]) => {
        if (!active) return;
        setPatients(Array.isArray(patientData) ? patientData : []);
        setStats(dashboardStats || null);
      })
      .catch(err => {
        if (active) setError(err.message || 'Could not load the dashboard.');
      });
    return () => { active = false; };
  }, []);

  const chartData = Array.isArray(stats?.most_common_conditions) && stats.most_common_conditions.length
    ? stats.most_common_conditions.slice(0, 5).map(([label, count]) => ({
        label: label.length > 12 ? `${label.slice(0, 12)}…` : label,
        value: Number(count) || 0,
      }))
    : [
        { label: 'BP', value: 3 },
        { label: 'Diabetes', value: 2 },
        { label: 'Asthma', value: 1 },
        { label: 'Liver', value: 2 },
      ];

  const maxChartValue = Math.max(...chartData.map(item => item.value), 1);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    const data = new FormData(event.currentTarget);
    if (file) data.set('report', file);
    try {
      const response = await api('/api/upload', { method: 'POST', body: data });
      setResult(response);
      api('/patients/api/list').then(d => {
        if (Array.isArray(d)) setPatients(d);
      }).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reanalyzeCorrectedText = async (text) => {
    setBusy(true);
    const data = new FormData();
    data.set('report_text', text);
    data.set('report_title', result?.report?.filename || 'Corrected OCR report');
    try {
      const response = await api('/api/upload', { method: 'POST', body: data });
      setResult(response);
      return response;
    } finally {
      setBusy(false);
    }
  };

  const scrollToUpload = (e) => {
    if (e) e.preventDefault();
    const el = document.getElementById('upload');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Your health clarity workspace</p>
          <h1>Understand your medical reports, simply.</h1>
          <p>AI-assisted explanations that make complex findings easier to follow.</p>
          <a className="button primary" href="#/dashboard" onClick={scrollToUpload}>
            Upload medical report <ArrowRight size={17} />
          </a>
        </div>
        <div className="hero-visual">
          <span className="eyebrow">The clarity flow</span>
          <div className="flow">
            <div><FileText /><b>Report</b><small>Complex findings</small></div>
            <ChevronRight />
            <div className="highlight"><Sparkles /><b>AI analysis</b><small>Terms and values</small></div>
            <ChevronRight />
            <div><HeartPulse /><b>Clear view</b><small>Useful next steps</small></div>
          </div>
          <div className="signal-card"><Sparkles size={16} /><span>“Your HbA1c is a little above the usual range.”</span></div>
        </div>
      </section>

      <section className="feature-row">
        <span><UploadCloud /> <b>Read</b> Extract key information.</span>
        <span><Sparkles /> <b>Understand</b> Translate medical terms.</span>
        <span><ShieldCheck /> <b>Prepare</b> Keep questions close.</span>
      </section>

      <section className="analytics-panel-stack">
        <div className="panel analytics-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Health overview</p>
              <h2>Clinical snapshot</h2>
            </div>
            <span className="status-dot">Updated today</span>
          </div>

          <div className="stats-grid">
            <div className="stat-box">
              <small>Patients</small>
              <strong>{stats?.patient_count ?? 0}</strong>
            </div>
            <div className="stat-box">
              <small>Reports</small>
              <strong>{stats?.report_count ?? 0}</strong>
            </div>
            <div className="stat-box">
              <small>This month</small>
              <strong>{stats?.reports_this_month ?? 0}</strong>
            </div>
            <div className="stat-box accent">
              <small>Top condition</small>
              <strong>{stats?.most_common_conditions?.[0]?.[0] || 'No data'}</strong>
            </div>
          </div>

          <div className="mini-chart" aria-label="Most common conditions chart">
            {chartData.map(item => (
              <div className="bar-group" key={item.label}>
                <span className="bar" style={{ height: `${(item.value / maxChartValue) * 100}%` }} />
                <label>{item.label}</label>
              </div>
            ))}
          </div>
        </div>

        <div className="panel reminder-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Follow-up</p>
              <h2>Reminders</h2>
            </div>
            <span className="status-chip">3 due</span>
          </div>

          <ul className="reminder-list">
            <li className="reminder-item">
              <span className="reminder-tag warning">Soon</span>
              <div>
                <strong>HbA1c review</strong>
                <small>Follow up with patient in 2 days</small>
              </div>
            </li>
            <li className="reminder-item">
              <span className="reminder-tag info">Next</span>
              <div>
                <strong>BP check</strong>
                <small>Schedule a follow-up on Friday</small>
              </div>
            </li>
            <li className="reminder-item">
              <span className="reminder-tag success">Clear</span>
              <div>
                <strong>Medication review</strong>
                <small>Confirm last prescription update</small>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section id="upload" className="workspace-grid">
        <form className="panel upload-panel" onSubmit={submit}>
          <div className="section-title">
            <div>
              <p className="eyebrow">Start with a report</p>
              <h2>Bring the details.</h2>
            </div>
            <span className="status-dot">Local workspace</span>
          </div>
          {error && <div className="alert error"><CircleAlert size={17} />{error}</div>}
          <label>
            Patient record
            <select name="patient_id">
              <option value="">Auto-detect or create a new record</option>
              {Array.isArray(patients) && patients.map(patient => (
                <option key={patient.id} value={patient.id}>
                  {patient.full_name} · {patient.patient_code}
                </option>
              ))}
            </select>
          </label>
          <div className="two-col">
            <label>Patient name<input name="patient_name" placeholder="Auto-detected if blank" /></label>
            <label>Age<input name="patient_age" type="number" min="0" max="120" placeholder="Optional" /></label>
          </div>
          <label>
            Report file
            <div className="dropzone">
              <UploadCloud size={25} />
              <b>{file ? file.name : 'Drop your report here'}</b>
              <small>PDF, PNG, JPG, JPEG or TXT · up to 16 MB</small>
              <button
                type="button"
                className="button secondary small"
                onClick={() => document.querySelector('#file-input')?.click()}
              >
                Browse files
              </button>
              <input
                id="file-input"
                hidden
                type="file"
                name="report"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                onChange={event => setFile(event.target.files[0])}
              />
            </div>
          </label>
          <div className="divider"><span>OR PASTE REPORT TEXT</span></div>
          <label>Medical report text<textarea name="report_text" placeholder="Paste the report text here, including lab values, impression, or diagnosis..." /></label>
          <button className="button primary" disabled={busy}>
            {busy ? 'Analyzing report...' : 'Simplify report'} <ArrowRight size={17} />
          </button>
        </form>

        <aside className="panel aside-panel">
          <Sparkles size={22} />
          <h3>Designed for a calmer first read</h3>
          <p>Important pieces, organized without pretending to replace your care team.</p>
          <ul>
            <li><Check /> Medical terms explained in context</li>
            <li><Check /> Personalized food and activity guidance</li>
            <li><Check /> Patient history in one place</li>
            <li><Check /> Educational, never a diagnosis</li>
          </ul>
        </aside>
      </section>

      {result && <ResultView response={result} onClose={() => setResult(null)} onReanalyze={reanalyzeCorrectedText} />}
    </>
  );
}

function ResultView({ response, onClose, onReanalyze }) {
  const result = response.result || {};
  const patient = response.patient || {};
  const extractedText = result.original_text || response.report?.extracted_text || '';
  const needsOcrReview = typeof result.extraction_confidence === 'number' && result.extraction_confidence < 65;
  const [showRaw, setShowRaw] = useState(needsOcrReview);
  const [draftText, setDraftText] = useState(extractedText);
  const [reanalysisError, setReanalysisError] = useState('');
  const [reanalysisBusy, setReanalysisBusy] = useState(false);
  const [language, setLanguage] = useState('en');
  const [translation, setTranslation] = useState(null);
  const [translationError, setTranslationError] = useState('');
  const [translationBusy, setTranslationBusy] = useState(false);
  const [maskIdentifiers, setMaskIdentifiers] = useState(false);
  const [displayEntities, setDisplayEntities] = useState(result.entities || []);
  const [medicineDrafts, setMedicineDrafts] = useState({});
  const [medicineBusy, setMedicineBusy] = useState({});
  const [medicineErrors, setMedicineErrors] = useState({});
  const [confirmedMatches, setConfirmedMatches] = useState({});
  const maskText = (value) => maskSensitiveText(
    value,
    maskIdentifiers,
    [patient.full_name, patient.patient_code],
  );

  useEffect(() => {
    setDraftText(extractedText);
  }, [extractedText]);

  useEffect(() => {
    setDisplayEntities(result.entities || []);
    setMedicineDrafts({});
    setMedicineBusy({});
    setMedicineErrors({});
    setConfirmedMatches({});
  }, [response]);

  const handlePrint = () => {
    window.print();
  };

  const entities = displayEntities;
  const labResults = result.lab_results || response.report?.lab_results || [];
  const doctorQuestions = result.questions_to_ask_doctor
    || response.report?.questions_to_ask_doctor
    || [];
  const foodsToEat = result.recommendations?.aggregated?.foods_to_eat || [];
  const foodsToAvoid = result.recommendations?.aggregated?.foods_to_avoid || [];
  const exercises = result.recommendations?.aggregated?.recommended_exercise || [];
  const precautions = result.recommendations?.aggregated?.general_precautions || [];
  const translated = translation?.output || {};
  const handleLanguageChange = async (event) => {
    const nextLanguage = event.target.value;
    setLanguage(nextLanguage);
    setTranslationError('');
    setTranslation(null);
    if (nextLanguage === 'en') return;
    if (!response.report?.id) {
      setTranslationError('Save this report before requesting a translation.');
      return;
    }
    setTranslationBusy(true);
    try {
      const data = await api(`/api/reports/${response.report.id}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: nextLanguage }),
      });
      setTranslation(data);
    } catch (error) {
      setTranslationError(error.message || 'Translation could not be loaded.');
    } finally {
      setTranslationBusy(false);
    }
  };
  const speakSummary = () => {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setTranslationError('Text-to-speech is not supported by this browser.');
      return;
    }
    const utterance = new window.SpeechSynthesisUtterance(translated.summary || result.simplified_summary || '');
    utterance.lang = { en: 'en-US', ta: 'ta-IN', hi: 'hi-IN' }[language];
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };
  const submitCorrectedText = async () => {
    setReanalysisError('');
    setReanalysisBusy(true);
    try {
      await onReanalyze(draftText);
    } catch (error) {
      setReanalysisError(error.message || 'Could not reanalyze the corrected text.');
    } finally {
      setReanalysisBusy(false);
    }
  };
  const runMedicineLookup = async (entity, index) => {
    const entityId = entity.entity_id || entity.id;
    const key = String(entityId || index);
    const name = medicineDrafts[key] ?? entity.cleaned_name ?? entity.name ?? entity.text ?? '';
    if (!response.report?.id || !entityId) {
      setMedicineErrors(previous => ({ ...previous, [key]: 'Save this report before looking up an edited medicine name.' }));
      return;
    }
    setMedicineBusy(previous => ({ ...previous, [key]: true }));
    setMedicineErrors(previous => ({ ...previous, [key]: '' }));
    try {
      const data = await api(`/api/reports/${response.report.id}/medicine-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId, name }),
      });
      setDisplayEntities(previous => previous.map((item, itemIndex) => (
        String(item.entity_id || item.id || itemIndex) === key
          ? { ...item, ...data, text: data.cleaned_name || data.name, explanation: '' }
          : item
      )));
      setConfirmedMatches(previous => ({ ...previous, [key]: false }));
      setMedicineDrafts(previous => ({ ...previous, [key]: data.cleaned_name || '' }));
    } catch (error) {
      setMedicineErrors(previous => ({ ...previous, [key]: error.message || 'Medicine lookup failed.' }));
    } finally {
      setMedicineBusy(previous => ({ ...previous, [key]: false }));
    }
  };

  return (
    <div className="result-overlay">
      <article className="result-modal print-container">
        {/* Screen Header */}
        <div className="result-header">
          <div>
            <span className="status-dot">Analysis Complete · Patient Clarity</span>
            <h2>{maskText(patient.full_name || 'Medical Report Summary')}</h2>
            <p className="muted">
              {patient.patient_code ? `${maskText(patient.patient_code)} · ` : ''}
              {patient.age ? `${patient.age} yrs` : 'Age N/A'}
              {patient.gender ? ` · ${patient.gender}` : ''}
              {patient.blood_group ? ` · Blood: ${patient.blood_group}` : ''}
            </p>
          </div>
          <div className="result-header-actions no-print">
            <label className="mask-identifiers-toggle">
              <input
                type="checkbox"
                checked={maskIdentifiers}
                onChange={event => setMaskIdentifiers(event.target.checked)}
              />
              Mask name/ID
            </label>
            <button type="button" className="button secondary print-btn" onClick={handlePrint} title="Print clean medical report">
              <Printer size={16} /> Print Report
            </button>
            {response.report?.id && (
              <a
                className="button secondary print-btn"
                href={`/api/reports/${response.report.id}/export/pdf`}
                title="Download simplified report as PDF"
              >
                <Download size={16} /> Download PDF
              </a>
            )}
            <button type="button" className="close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Print-only Clinic Header */}
        <div className="print-only print-clinic-header">
          <div className="print-clinic-title">
            <h3>PATIENT HEALTH CLARITY REPORT</h3>
            <small>Simplified Report Summary & Discussion Prompts</small>
          </div>
          <div className="print-patient-meta">
            <div><strong>Patient Name:</strong> {maskText(patient.full_name || 'Patient Record')}</div>
            <div><strong>Patient ID:</strong> {maskText(patient.patient_code || 'PAT-N/A')}</div>
            <div><strong>Age / Gender:</strong> {patient.age ? `${patient.age} yrs` : 'N/A'} / {patient.gender || 'N/A'}</div>
            <div><strong>Date:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
          </div>
        </div>

        {/* Plain-Language Clinical Summary */}
        <div className="result-section">
          <div className="result-controls no-print">
            <h3 className="section-heading"><Sparkles size={16} /> Plain-Language Clinical Summary</h3>
            <label className="result-language-select">
              Output language
              <select value={language} onChange={handleLanguageChange} disabled={translationBusy}>
                <option value="en">English</option>
                <option value="ta">Tamil</option>
                <option value="hi">Hindi</option>
              </select>
            </label>
          </div>
          {translationBusy && <p className="muted" role="status">Translating generated explanations...</p>}
          {translationError && <div className="alert error" role="alert">{translationError}</div>}
          {needsOcrReview && (
            <div className="alert warning" role="status">
              {result.analysis_warning || `OCR confidence is ${result.extraction_confidence}%. Please verify the handwritten text before relying on this summary.`}
            </div>
          )}
          <div className="result-comparison">
            <section className="result-summary-column">
              <h4>Simplified explanation <button type="button" className="speech-button no-print" onClick={speakSummary} aria-label="Read summary aloud"><Volume2 size={15} /> Listen</button></h4>
              <div className="result-summary">
                {maskText(translated.summary || result.simplified_summary || 'No medical terms detected.')}
              </div>
            </section>
            <section className="result-original-column">
              <h4>Original report text</h4>
              <pre>{maskText(extractedText || 'No original text available.')}</pre>
            </section>
          </div>
        </div>

        {labResults.length > 0 && (
          <section className="result-section">
            <h3 className="section-heading"><HeartPulse size={16} /> Laboratory Results</h3>
            <div className="table-wrap lab-results-table-wrap">
              <table className="lab-results-table">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Result</th>
                    <th>Reference range</th>
                    <th>Status</th>
                    <th>What it may mean</th>
                  </tr>
                </thead>
                <tbody>
                  {labResults.map((lab, index) => (
                    <tr key={`${lab.test_name}-${index}`}>
                      <td>{maskText(lab.test_name)}</td>
                      <td>{maskText(`${lab.value} ${lab.unit || ''}`)}</td>
                      <td>
                        {typeof lab.reference_range === 'object' && lab.reference_range
                          ? `${lab.reference_range.low}–${lab.reference_range.high} ${lab.reference_range.unit || lab.unit || ''}`
                          : maskText(lab.reference_range || 'Not available')}
                      </td>
                      <td>
                        <span className={`lab-status-badge ${String(lab.status || 'Unknown').toLowerCase()}`}>
                          {lab.status || 'Unknown'}
                        </span>
                      </td>
                      <td>{maskText(translated.lab_meanings?.[index] || lab.meaning || 'No finding outside the displayed range.')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Identified Clinical Entities */}
        {entities.length > 0 && (
          <div className="result-section">
            <h3 className="section-heading"><HeartPulse size={16} /> Key Medical Terms & Findings Explained</h3>
            <div className="entity-cards-grid">
              {entities.map((entity, i) => (
                <div key={entity.entity_id || entity.id || i} className="entity-card">
                  <div className="entity-badge-row">
                    <strong className="entity-name">
                      <abbr className="glossary-term" title={['MEDICINE', 'MEDICATION'].includes(String(entity.label || '').toUpperCase()) ? 'Medicine name detected in the report.' : translated.entities?.[i] || entity.explanation || 'No glossary explanation is available.'}>
                        {maskText(entity.label === 'MEDICINE' ? entity.cleaned_name || entity.text : entity.text)}
                      </abbr>
                    </strong>
                    <span className="entity-tag">{entity.label}</span>
                  </div>
                  {['MEDICINE', 'MEDICATION'].includes(String(entity.label || '').toUpperCase()) ? (() => {
                    const entityKey = String(entity.entity_id || entity.id || i);
                    const draftName = medicineDrafts[entityKey] ?? entity.cleaned_name ?? entity.name ?? entity.text ?? '';
                    const isLlmSuggestion = entity.source === 'llm' && entity.confidence === 'medium' && entity.status === 'possible_match';
                    const isConfirmed = confirmedMatches[entityKey] === true;
                    return (
                      <div className="medicine-card-content">
                        {entity.status === 'verified' && (
                          <div className="medicine-description">
                            <span className="medicine-status-badge verified">Verified</span>
                            <p><strong>{maskText(entity.generic_name)}</strong>{entity.drug_class ? ` · ${maskText(entity.drug_class)}` : ''}</p>
                            <p>{maskText(entity.use)}</p>
                          </div>
                        )}
                        {entity.status === 'possible_match' && isLlmSuggestion && (
                          <div className="medicine-description">
                            <span className="medicine-status-badge unverified">Unverified</span>
                            <p>This may be <strong>{maskText(entity.generic_name)}</strong>{entity.drug_class ? ` (${maskText(entity.drug_class)})` : ''}, usually used for {maskText(entity.use)} Please confirm with your doctor or pharmacist.</p>
                          </div>
                        )}
                        {entity.status === 'possible_match' && !isLlmSuggestion && (
                          <div className="medicine-description">
                            <p>Did you mean <strong>{maskText(entity.matched_name || entity.generic_name)}</strong>?</p>
                            <div className="medicine-confirm-actions">
                              <button type="button" className="button small primary" onClick={() => setConfirmedMatches(previous => ({ ...previous, [entityKey]: true }))}>Yes</button>
                              <button type="button" className="button small secondary" onClick={() => setConfirmedMatches(previous => ({ ...previous, [entityKey]: false }))}>No</button>
                            </div>
                            {isConfirmed && (
                              <p><strong>{maskText(entity.generic_name)}</strong>{entity.drug_class ? ` · ${maskText(entity.drug_class)}` : ''}. {maskText(entity.use)}</p>
                            )}
                          </div>
                        )}
                        {(!entity.status || entity.status === 'not_found' || entity.confidence === 'low') && (
                          <p className="entity-explanation">Could not be identified. Please ask your pharmacist or doctor what this is used for.</p>
                        )}
                        <div className="medicine-edit-row">
                          <label>
                            Check or correct the detected name
                            <input
                              type="text"
                              value={draftName}
                              maxLength={255}
                              onChange={event => setMedicineDrafts(previous => ({ ...previous, [entityKey]: event.target.value }))}
                            />
                          </label>
                          <button type="button" className="button small secondary" disabled={medicineBusy[entityKey]} onClick={() => runMedicineLookup(entity, i)}>
                            {medicineBusy[entityKey] ? 'Checking...' : 'Run lookup'}
                          </button>
                        </div>
                        {medicineErrors[entityKey] && <p className="medicine-error" role="alert">{medicineErrors[entityKey]}</p>}
                        <p className="medicine-card-note">Brand names can vary. Confirm the exact medicine and dose with your doctor or pharmacist.</p>
                      </div>
                    );
                  })() : (
                    <p className="entity-explanation">{maskText(translated.entities?.[i] || entity.explanation)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nutrition & Activity Guidance */}
        <div className="result-section">
          <h3 className="section-heading"><ShieldCheck size={16} /> General Lifestyle Information (not a treatment plan)</h3>
          {needsOcrReview ? (
            <div className="alert warning" role="status">
              Recommendations are paused until the report text is corrected and analyzed.
            </div>
          ) : (
            <>
              <div className="recommend-grid">
                <Recommendation title="Foods to Prioritize" values={foodsToEat} />
                <Recommendation title="Foods to Limit" values={foodsToAvoid} />
                <Recommendation title="Movement & Physical Activity" values={exercises} />
              </div>
              {precautions.length > 0 && (
                <div className="precautions-box">
                  <strong>Precautions & Care Notes:</strong> {precautions.join(' · ')}
                </div>
              )}
            </>
          )}
        </div>

        {/* Doctor Discussion Questions */}
        <div className="result-section doctor-questions-card">
          <h3 className="section-heading"><FileText size={16} /> Questions to Ask Your Doctor</h3>
          <ul className="questions-list">
            {(translated.questions || (doctorQuestions.length ? doctorQuestions : [
              'Could you explain how these results fit with my health and any symptoms?',
              'Are any follow-up tests or routine monitoring appropriate for me?',
            ])).map((question) => <li key={question}>{question}</li>)}
          </ul>
        </div>

        {/* Extracted Raw Document Text */}
        {extractedText && (
          <div className="result-section extracted-text-section">
            <div className="extracted-header">
              <h3 className="section-heading"><FileText size={16} /> Extracted Document Text</h3>
              <button
                type="button"
                className="button secondary small no-print"
                onClick={() => setShowRaw(!showRaw)}
              >
                {showRaw ? 'Hide Extracted Text' : 'View Extracted Text'}
              </button>
            </div>
            <div className={`extracted-content ${showRaw ? 'open' : 'preview'}`}>
              {showRaw ? (
                <>
                  <label htmlFor="corrected-ocr-text">Review and correct extracted text</label>
                  {maskIdentifiers ? (
                    <pre>{maskText(draftText)}</pre>
                  ) : (
                    <textarea
                      id="corrected-ocr-text"
                      value={draftText}
                      onChange={(event) => setDraftText(event.target.value)}
                      rows={8}
                      style={{ width: '100%', resize: 'vertical', marginTop: '8px' }}
                    />
                  )}
                  {needsOcrReview && !maskIdentifiers && (
                    <button
                      type="button"
                      className="button primary small no-print"
                      onClick={submitCorrectedText}
                      disabled={reanalysisBusy || !draftText.trim()}
                    >
                      {reanalysisBusy ? 'Reanalyzing...' : 'Analyze corrected text'}
                    </button>
                  )}
                  {reanalysisError && <div className="alert error" role="alert">{reanalysisError}</div>}
                </>
              ) : <pre>{maskText(extractedText)}</pre>}
            </div>
          </div>
        )}

        {/* Educational Disclaimer */}
        <footer className="result-disclaimer">
          <ShieldCheck size={14} />
          <span>{translated.disclaimer || result.disclaimer || DISCLAIMER}</span>
        </footer>
      </article>
    </div>
  );
}

function Recommendation({ title, values = [] }) {
  return (
    <div>
      <b>{title}</b>
      {values.length > 0 ? (
        <ul>{values.slice(0, 5).map(value => <li key={value}>{value}</li>)}</ul>
      ) : (
        <small className="muted">No specific restrictions noted.</small>
      )}
    </div>
  );
}

function maskSensitiveText(value, enabled, identifiers) {
  if (!enabled) return value;
  return (identifiers || []).reduce((text, identifier) => {
    const name = String(identifier || '').trim();
    if (!name) return text;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(text || '').replace(new RegExp(escaped, 'gi'), '[MASKED]');
  }, String(value || ''));
}

function Patients() {
  const [patients, setPatients] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api('/patients/api/list')
      .then(data => setPatients(Array.isArray(data) ? data : []))
      .catch(err => setError(err.message || 'Could not load patients.'));
  };

  useEffect(() => {
    let active = true;
    api('/patients/api/list')
      .then(data => {
        if (active) setPatients(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        if (active) setError(err.message || 'Could not load patients.');
      });
    return () => {
      active = false;
    };
  }, []);

  const add = async event => {
    event.preventDefault();
    try {
      await api('/patients/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))
      });
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Care workspace"
        title="Patient directory"
        description="Keep patient records and report history organized in one quiet workspace."
        action={
          <button className="button primary" onClick={() => setShowAdd(true)}>
            <UserRoundPlus size={17} /> Add patient
          </button>
        }
      />
      {error && <div className="alert error">{error}</div>}
      <section className="panel table-panel">
        <div className="section-title">
          <h2>All patient records</h2>
          <span className="muted">{patients.length} records</span>
        </div>
        {patients.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Code</th>
                  <th>Age / gender</th>
                  <th>Blood group</th>
                  <th>Reports</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {patients.map(patient => (
                  <tr key={patient.id}>
                    <td>
                      <b>{patient.full_name}</b>
                      <small>{patient.contact_email || patient.contact_phone || 'No contact details'}</small>
                    </td>
                    <td><code>{patient.patient_code}</code></td>
                    <td>{patient.age || '-'} / {patient.gender || '-'}</td>
                    <td>{patient.blood_group || '-'}</td>
                    <td>{patient.report_count} reports</td>
                    <td>
                      <a className="text-link" href={`#/patients/${patient.id}`}>
                        View <ArrowRight size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<UsersRound />}
            title="Your directory is ready"
            text="Add a patient to start connecting reports to a record."
          />
        )}
      </section>
      {showAdd && (
        <Modal title="Add patient" onClose={() => setShowAdd(false)}>
          <form onSubmit={add} className="modal-form">
            <label>Full name<input name="full_name" required /></label>
            <div className="two-col">
              <label>Age<input name="age" type="number" /></label>
              <label>Gender<input name="gender" /></label>
            </div>
            <div className="two-col">
              <label>Blood group<input name="blood_group" /></label>
              <label>Phone<input name="contact_phone" /></label>
            </div>
            <label>Email<input name="contact_email" type="email" /></label>
            <button className="button primary">Save patient</button>
          </form>
        </Modal>
      )}
    </>
  );
}

function Reports() {
  const [reports, setReports] = useState([]);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('newest'); // 'newest' | 'oldest' | 'title-asc' | 'title-desc' | 'relevance'
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => {
    let active = true;
    api('/api/reports')
      .then(data => {
        if (active) setReports(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const calculateRelevance = (report, q) => {
    if (!q || !q.trim()) return 0;
    const term = q.trim().toLowerCase();
    const title = (report.filename || 'Pasted medical report').toLowerCase();
    const summary = (report.simplified_text || '').toLowerCase();
    const text = (report.extracted_text || '').toLowerCase();

    let score = 0;
    if (title.startsWith(term)) score += 100;
    else if (title.includes(term)) score += 60;
    if (summary.includes(term)) score += 30;
    if (text.includes(term)) score += 15;
    return score;
  };

  const getReportTitle = (report) => (report.filename || 'Pasted medical report').trim();

  const filtered = reports.filter(report => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (report.filename || '').toLowerCase().includes(q) ||
      (report.extracted_text || '').toLowerCase().includes(q) ||
      (report.simplified_text || '').toLowerCase().includes(q)
    );
  });

  const sortedReports = [...filtered].sort((a, b) => {
    if (sortKey === 'relevance') {
      const scoreB = calculateRelevance(b, query);
      const scoreA = calculateRelevance(a, query);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    }
    if (sortKey === 'newest') {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    }
    if (sortKey === 'oldest') {
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    }
    if (sortKey === 'title-asc') {
      return getReportTitle(a).localeCompare(getReportTitle(b), undefined, { sensitivity: 'base' });
    }
    if (sortKey === 'title-desc') {
      return getReportTitle(b).localeCompare(getReportTitle(a), undefined, { sensitivity: 'base' });
    }
    return 0;
  });

  const openReport = (report) => {
    setSelectedReport({
      result: {
        simplified_summary: report.simplified_text,
        original_text: report.extracted_text,
        lab_results: report.lab_results || [],
        entities: report.entities?.map(e => ({
          ...e,
          text: e.entity_text,
          label: e.entity_label,
          explanation: e.explanation || '',
        })) || [],
        recommendations: {
          aggregated: {
            foods_to_eat: report.recommendations?.[0]?.foods_to_eat || [],
            foods_to_avoid: report.recommendations?.[0]?.foods_to_avoid || [],
            recommended_exercise: report.recommendations?.[0]?.recommended_exercise || [],
            general_precautions: [report.recommendations?.[0]?.exercise_precautions].filter(Boolean),
          },
        },
      },
      patient: { full_name: report.filename ? `Report: ${report.filename}` : 'Patient Report' },
      report,
    });
  };

  const getSortLabel = () => {
    switch (sortKey) {
      case 'newest': return 'Date (Newest first)';
      case 'oldest': return 'Date (Oldest first)';
      case 'title-asc': return 'Title (A–Z)';
      case 'title-desc': return 'Title (Z–A)';
      case 'relevance': return 'Relevance match';
      default: return 'Newest first';
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Your workspace"
        title="My reports"
        description="Return to previous analyses, review summaries, or print report results."
        action={<a className="button primary" href="#/dashboard"><UploadCloud size={17} /> Upload report</a>}
      />
      <section className="panel">
        <div className="toolbar history-toolbar">
          <div className="search">
            <Search size={17} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search reports by title or content..."
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery('')}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="sort-controls-wrapper">
            <div className="sort-header-label">
              <ArrowUpDown size={15} />
              <span>Sort:</span>
            </div>

            {/* Segmented Toggle Group */}
            <div className="sort-toggle-group" role="radiogroup" aria-label="Order reports by">
              <button
                type="button"
                className={`sort-toggle-btn ${sortKey === 'newest' ? 'active' : ''}`}
                onClick={() => setSortKey('newest')}
                title="Order by newest date first"
                role="radio"
                aria-checked={sortKey === 'newest'}
              >
                <Calendar size={13} />
                <span>Newest</span>
              </button>
              <button
                type="button"
                className={`sort-toggle-btn ${sortKey === 'oldest' ? 'active' : ''}`}
                onClick={() => setSortKey('oldest')}
                title="Order by oldest date first"
                role="radio"
                aria-checked={sortKey === 'oldest'}
              >
                <Calendar size={13} />
                <span>Oldest</span>
              </button>
              <button
                type="button"
                className={`sort-toggle-btn ${sortKey === 'title-asc' ? 'active' : ''}`}
                onClick={() => setSortKey('title-asc')}
                title="Order alphabetically: Title A to Z"
                role="radio"
                aria-checked={sortKey === 'title-asc'}
              >
                <ArrowDownAZ size={14} />
                <span>A–Z</span>
              </button>
              <button
                type="button"
                className={`sort-toggle-btn ${sortKey === 'title-desc' ? 'active' : ''}`}
                onClick={() => setSortKey('title-desc')}
                title="Order alphabetically: Title Z to A"
                role="radio"
                aria-checked={sortKey === 'title-desc'}
              >
                <ArrowUpAZ size={14} />
                <span>Z–A</span>
              </button>
              <button
                type="button"
                className={`sort-toggle-btn ${sortKey === 'relevance' ? 'active' : ''}`}
                onClick={() => setSortKey('relevance')}
                title="Order by relevance to search term"
                role="radio"
                aria-checked={sortKey === 'relevance'}
              >
                <Sparkles size={13} />
                <span>Relevance</span>
              </button>
            </div>

            {/* Mobile Compact Select Dropdown */}
            <select
              className="sort-select-mobile"
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              aria-label="Sort reports"
            >
              <option value="newest">📅 Date: Newest first</option>
              <option value="oldest">📅 Date: Oldest first</option>
              <option value="title-asc">🔤 Title: A to Z</option>
              <option value="title-desc">🔤 Title: Z to A</option>
              <option value="relevance">✨ Match relevance</option>
            </select>
          </div>
        </div>

        {/* History Meta Summary Bar */}
        <div className="history-meta-bar">
          <span className="history-count">
            Showing <b>{sortedReports.length}</b> {sortedReports.length === 1 ? 'report' : 'reports'}
            {query.trim() ? ` matching “${query}”` : ''}
          </span>
          <span className="history-sort-badge">
            <ArrowUpDown size={12} /> Ordered by: <b>{getSortLabel()}</b>
          </span>
        </div>

        {sortedReports.length ? (
          <div className="history-list">
            {sortedReports.map(report => (
              <article className="history-card" key={report.id}>
                <span className="history-icon"><FileText /></span>
                <div style={{ flex: 1 }}>
                  <h3>{report.filename || 'Pasted medical report'}</h3>
                  <p>{report.extracted_text?.slice(0, 130) || 'No extracted text'}...</p>
                  <small>{report.created_at ? new Date(report.created_at).toLocaleString() : 'Date unavailable'}</small>
                </div>
                <div className="history-actions">
                  <button type="button" className="button secondary small" onClick={() => openReport(report)} title="View & Print Report">
                    <Printer size={15} /> View & Print
                  </button>
                  <a href={`#/patients/${report.patient_id}`} title="View patient"><UserRound size={17} /></a>
                  {report.file_path && <a href={`/reports/${report.id}/download`} title="Download"><Download size={17} /></a>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={<FileText />}
            title={query ? 'No matching reports' : 'No reports found'}
            text={query ? `No reports matched "${query}". Try adjusting your search terms or sort order.` : 'Upload a report to start your history.'}
            action={
              query ? (
                <button type="button" className="button secondary small" onClick={() => setQuery('')}>
                  <X size={14} /> Clear search filter
                </button>
              ) : (
                <a className="button primary small" href="#/dashboard">
                  <UploadCloud size={15} /> Upload medical report
                </a>
              )
            }
          />
        )}
      </section>
      {selectedReport && <ResultView response={selectedReport} onClose={() => setSelectedReport(null)} />}
    </>
  );
}

function PatientDetail({ id }) {
  const [patient, setPatient] = useState(null);
  const [reportSort, setReportSort] = useState('newest'); // 'newest' | 'oldest' | 'title-asc'
  const [selectedReport, setSelectedReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api(`/patients/api/${id}`)
      .then(data => {
        if (active) setPatient(data);
      })
      .catch(err => {
        if (active) setError(err.message || 'Patient record could not be loaded.');
      });
    return () => { active = false; };
  }, [id]);

  if (error) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div className="alert error" style={{ display: 'inline-flex', marginBottom: '20px' }}>
          <CircleAlert size={16} /> {error}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
          <a className="button secondary" href="#/patients">Back to patient directory</a>
          <a className="button primary" href="#/dashboard">Go to dashboard</a>
        </div>
      </div>
    );
  }

  if (!patient) return <div className="loading-screen"><Sparkles /><span>Loading patient record...</span></div>;

  const sortedPatientReports = [...(patient.reports || [])].sort((a, b) => {
    if (reportSort === 'newest') {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    }
    if (reportSort === 'oldest') {
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    }
    if (reportSort === 'title-asc') {
      return (a.filename || 'Pasted medical report').localeCompare(b.filename || 'Pasted medical report', undefined, { sensitivity: 'base' });
    }
    return 0;
  });

  const openReport = (report) => {
    setSelectedReport({
      result: {
        simplified_summary: report.simplified_text,
        original_text: report.extracted_text,
        lab_results: report.lab_results || [],
        entities: report.entities?.map(e => ({
          ...e,
          text: e.entity_text,
          label: e.entity_label,
          explanation: e.explanation || '',
        })) || [],
        recommendations: {
          aggregated: {
            foods_to_eat: report.recommendations?.[0]?.foods_to_eat || [],
            foods_to_avoid: report.recommendations?.[0]?.foods_to_avoid || [],
            recommended_exercise: report.recommendations?.[0]?.recommended_exercise || [],
            general_precautions: [report.recommendations?.[0]?.exercise_precautions].filter(Boolean),
          },
        },
      },
      patient,
      report,
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Patient record"
        title={patient.full_name}
        description={`${patient.patient_code} · ${patient.report_count} saved reports`}
        action={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <a className="button secondary" href="#/patients">← All patients</a>
            <a className="button primary" href="#/dashboard"><UploadCloud size={16} /> Upload report</a>
          </div>
        }
      />
      <section className="patient-facts panel">
        <Fact label="Age" value={patient.age ? `${patient.age} yrs` : 'N/A'} />
        <Fact label="Gender" value={patient.gender || 'N/A'} />
        <Fact label="Blood group" value={patient.blood_group || 'N/A'} />
        <Fact label="Phone" value={patient.contact_phone || 'N/A'} />
      </section>
      <LabTrendChart patientId={patient.id} reports={patient.reports || []} />
      <div className="section-title page-section-title patient-history-header">
        <div>
          <h2>Report history</h2>
          <span className="muted">{patient.reports?.length || 0} saved reports</span>
        </div>
        {(patient.reports?.length || 0) > 1 && (
          <div className="sort-toggle-group compact" role="radiogroup" aria-label="Sort patient reports">
            <button
              type="button"
              className={`sort-toggle-btn ${reportSort === 'newest' ? 'active' : ''}`}
              onClick={() => setReportSort('newest')}
              title="Order by newest first"
            >
              <Calendar size={12} /> Newest
            </button>
            <button
              type="button"
              className={`sort-toggle-btn ${reportSort === 'oldest' ? 'active' : ''}`}
              onClick={() => setReportSort('oldest')}
              title="Order by oldest first"
            >
              <Calendar size={12} /> Oldest
            </button>
            <button
              type="button"
              className={`sort-toggle-btn ${reportSort === 'title-asc' ? 'active' : ''}`}
              onClick={() => setReportSort('title-asc')}
              title="Order by title A–Z"
            >
              <ArrowDownAZ size={12} /> A–Z
            </button>
          </div>
        )}
      </div>
      {sortedPatientReports.length ? (
        sortedPatientReports.map(report => (
          <article className="panel history-card detail-card" key={report.id}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>{report.filename || 'Pasted medical report'}</h3>
                <button type="button" className="button secondary small" onClick={() => openReport(report)}>
                  <Printer size={15} /> View & Print
                </button>
              </div>
              <small>{report.created_at ? new Date(report.created_at).toLocaleString() : ''}</small>
              <div className="entity-list" style={{ marginTop: '8px' }}>
                {report.entities?.map(entity => (
                  <span key={entity.id}><b>{entity.entity_text}</b><small>{entity.entity_label}</small></span>
                ))}
              </div>
              <div className="result-summary">{report.simplified_text || 'No summary text generated.'}</div>
            </div>
          </article>
        ))
      ) : (
        <Empty icon={<FileText />} title="No reports yet" text="Upload a report to begin this patient's history." />
      )}
      {selectedReport && <ResultView response={selectedReport} onClose={() => setSelectedReport(null)} />}
    </>
  );
}

function LabTrendChart({ patientId, reports }) {
  const [selectedTest, setSelectedTest] = useState('');
  const [trend, setTrend] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const availableTests = [...new Set(
    reports.flatMap(report => (report.lab_results || []).map(result => result.test_name).filter(Boolean)),
  )];
  const testName = selectedTest || availableTests[0] || '';

  useEffect(() => {
    if (!testName) {
      setTrend(null);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError('');
    api(`/api/patients/${patientId}/lab-trends?test=${encodeURIComponent(testName)}`)
      .then(data => {
        if (active) setTrend(data);
      })
      .catch(err => {
        if (active) setError(err.message || 'Could not load laboratory history.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [patientId, testName]);

  if (!availableTests.length) return null;

  const chartData = (trend?.points || []).map(point => ({
    ...point,
    date_label: point.date ? new Date(point.date).toLocaleDateString() : 'Date unavailable',
  }));

  return (
    <section className="panel lab-trend-panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">Report history</p>
          <h2>Laboratory trends</h2>
        </div>
        <label className="lab-trend-select">
          Test
          <select value={testName} onChange={event => setSelectedTest(event.target.value)}>
            {availableTests.map(test => <option key={test} value={test}>{test}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {loading ? (
        <p className="muted">Loading test history...</p>
      ) : chartData.length > 1 ? (
        <div className="lab-trend-chart">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 12, right: 18, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date_label" />
              <YAxis />
              <Tooltip formatter={(value, _name, item) => [`${value} ${item.payload.unit}`, trend?.test_name]} />
              <Line type="monotone" dataKey="value" stroke="#0f8b82" strokeWidth={3} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="muted">At least two reports with this test are needed to show a trend.</p>
      )}
    </section>
  );
}

function Fact({ label, value }) { return <div><small>{label}</small><b>{value}</b></div>; }
function PageHeader({ eyebrow, title, description, action }) { return <section className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</section>; }
function Empty({ icon, title, text, action }) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '8px' }}>{action}</div>}
    </div>
  );
}
function Modal({ title, children }) { return <div className="result-overlay"><article className="modal"><button className="close" onClick={() => { window.location.hash = '/patients'; }}><X /></button><p className="eyebrow">Patient directory</p><h2>{title}</h2>{children}</article></div>; }

export default App;
