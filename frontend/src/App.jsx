import { useEffect, useState } from 'react';
import {
  ArrowRight, Check, ChevronRight, CircleAlert, Download, FileText, HeartPulse,
  Home, LogOut, Menu, Search, ShieldCheck, Sparkles, UploadCloud, UserRound,
  UserRoundPlus, UsersRound, X,
} from 'lucide-react';

const api = async (path, options = {}) => {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};

const go = (path) => { window.location.hash = path; };
const currentPath = () => window.location.hash.replace(/^#/, '') || '/dashboard';

function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [path, setPath] = useState(currentPath());

  useEffect(() => {
    const onHashChange = () => setPath(currentPath());
    window.addEventListener('hashchange', onHashChange);
    api('/api/auth/session').then(setSession).catch(() => setSession(false)).finally(() => setChecking(false));
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (checking) return <div className="loading-screen"><Sparkles /><span>Opening your workspace...</span></div>;
  if (!session) return <AuthView onAuthenticated={setSession} />;
  return <Shell session={session} path={path} onLogout={() => { api('/api/logout').finally(() => setSession(false)); }} />;
}

function AuthView({ onAuthenticated }) {
  const [registering, setRegistering] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/api/auth/config').then(config => setGoogleEnabled(config.google_enabled)).catch(() => {}); }, []);

  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    const endpoint = registering ? '/api/register' : '/api/login';
    try {
      const result = await api(endpoint, { method: 'POST', body: new URLSearchParams(form) });
      onAuthenticated(result); go('/dashboard');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return <main className="auth-layout">
    <section className="auth-story">
      <div className="brand"><span className="brand-mark"><Sparkles size={18} /></span><span><b>AI Report Simplifier</b><small>Friendly health clarity</small></span></div>
      <div className="story-content"><p className="eyebrow">{registering ? 'A calmer way to begin' : 'Your health, made clearer'}</p><h1>{registering ? 'Build a clearer health information habit.' : 'Make more sense of the information in front of you.'}</h1><p>Turn complex medical reports into simple, useful explanations for better conversations with your care team.</p><div className="auth-flow"><span><b>01</b><strong>Upload</strong><small>Bring a report or paste text.</small></span><ArrowRight /><span><b>02</b><strong>Understand</strong><small>See important terms clearly.</small></span></div></div>
      <p className="quote"><ShieldCheck size={18} /> Your local workspace is designed around clarity and privacy.</p>
    </section>
    <section className="auth-panel"><form className="auth-form" onSubmit={submit}><p className="eyebrow">{registering ? 'Create account' : 'Welcome back'}</p><h2>{registering ? 'Start your health workspace' : 'Sign in to your health workspace'}</h2><p className="muted">Use an email and password to continue.</p>{error && <div className="alert error"><CircleAlert size={17} />{error}</div>}<label>Email address<input name="email" type="email" placeholder="you@example.com" required /></label><label>Password<input name="password" type="password" placeholder="At least 6 characters" required /></label>{registering && <label>Confirm password<input name="password_confirmation" type="password" placeholder="Re-enter your password" required /></label>}{!registering && <label className="check"><input type="checkbox" name="remember" /> Keep me signed in on this device</label>}<button className="button primary wide" disabled={busy}>{busy ? 'Please wait...' : registering ? 'Create account' : 'Login'} <ArrowRight size={17} /></button>{googleEnabled && <><div className="or"><span>or</span></div><a className="button secondary wide" href="/auth/google">Continue with Google</a></>}<div className="or"><span>or</span></div><button type="button" className="button secondary wide" onClick={() => { setRegistering(!registering); setError(''); }}>{registering ? 'Back to login' : 'Create an account'}</button><p className="form-note"><ShieldCheck size={15} /> Authentication is stored in your secure Flask session.</p></form></section>
  </main>;
}

function Shell({ session, path, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const view = path.startsWith('/patients/') ? <PatientDetail id={path.split('/')[2]} /> : path === '/patients' ? <Patients /> : path === '/reports' ? <Reports /> : <Dashboard />;
  return <div className="app-shell"><header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)}><Menu size={20} /></button><a className="brand" href="#/dashboard"><span className="brand-mark"><Sparkles size={18} /></span><span><b>AI Report Simplifier</b><small>Friendly health clarity</small></span></a><nav className={mobileOpen ? 'open' : ''}><NavLink href="/dashboard" icon={<Home size={16} />} label="Home" /><NavLink href="/reports" icon={<FileText size={16} />} label="My reports" /><NavLink href="/patients" icon={<UsersRound size={16} />} label="Patients" /></nav><div className="user-menu"><span className="avatar"><UserRound size={16} /></span><span className="user-email">{session.user_email}</span><button className="logout" onClick={onLogout}><LogOut size={15} /> Log out</button></div></header><main className="page">{view}</main><footer><span>AI-Based Friendly Report Simplifier</span><span>Educational use only · Have questions? Bring them to your care team.</span></footer></div>;
}

function NavLink({ href, icon, label }) { return <a href={`#${href}`} className={currentPath() === href ? 'active' : ''}>{icon}{label}</a>; }

function Dashboard() {
  const [patients, setPatients] = useState([]); const [error, setError] = useState(''); const [result, setResult] = useState(null); const [busy, setBusy] = useState(false); const [file, setFile] = useState(null);
  useEffect(() => { api('/patients/api/list').then(setPatients).catch(err => setError(err.message)); }, []);
  const submit = async (event) => { event.preventDefault(); setError(''); setBusy(true); const data = new FormData(event.currentTarget); if (file) data.set('report', file); try { const response = await api('/api/upload', { method: 'POST', body: data }); setResult(response); api('/patients/api/list').then(setPatients); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <><section className="hero"><div><p className="eyebrow">Your health clarity workspace</p><h1>Understand your medical reports, simply.</h1><p>AI-assisted explanations that make complex findings easier to follow.</p><a className="button primary" href="#upload">Upload medical report <ArrowRight size={17} /></a></div><div className="hero-visual"><span className="eyebrow">The clarity flow</span><div className="flow"><div><FileText /><b>Report</b><small>Complex findings</small></div><ChevronRight /><div className="highlight"><Sparkles /><b>AI analysis</b><small>Terms and values</small></div><ChevronRight /><div><HeartPulse /><b>Clear view</b><small>Useful next steps</small></div></div><div className="signal-card"><Sparkles size={16} /><span>“Your HbA1c is a little above the usual range.”</span></div></div></section><section className="feature-row"><span><UploadCloud /> <b>Read</b> Extract key information.</span><span><Sparkles /> <b>Understand</b> Translate medical terms.</span><span><ShieldCheck /> <b>Prepare</b> Keep questions close.</span></section><section id="upload" className="workspace-grid"><form className="panel upload-panel" onSubmit={submit}><div className="section-title"><div><p className="eyebrow">Start with a report</p><h2>Bring the details.</h2></div><span className="status-dot">Local workspace</span></div>{error && <div className="alert error"><CircleAlert size={17} />{error}</div>}<label>Patient record<select name="patient_id"><option value="">Auto-detect or create a new record</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.patient_code}</option>)}</select></label><div className="two-col"><label>Patient name<input name="patient_name" placeholder="Auto-detected if blank" /></label><label>Age<input name="patient_age" type="number" min="0" max="120" placeholder="Optional" /></label></div><label>Report file<div className="dropzone"><UploadCloud size={25} /><b>{file ? file.name : 'Drop your report here'}</b><small>PDF, PNG, JPG, JPEG or TXT · up to 16 MB</small><button type="button" className="button secondary small" onClick={() => document.querySelector('#file-input').click()}>Browse files</button><input id="file-input" hidden type="file" name="report" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={event => setFile(event.target.files[0])} /></div></label><div className="divider"><span>OR PASTE REPORT TEXT</span></div><label>Medical report text<textarea name="report_text" placeholder="Paste the report text here, including lab values, impression, or diagnosis..." /></label><button className="button primary" disabled={busy}>{busy ? 'Analyzing report...' : 'Simplify report'} <ArrowRight size={17} /></button></form><aside className="panel aside-panel"><Sparkles size={22} /><h3>Designed for a calmer first read</h3><p>Important pieces, organized without pretending to replace your care team.</p><ul><li><Check /> Medical terms explained in context</li><li><Check /> Personalized food and activity guidance</li><li><Check /> Patient history in one place</li><li><Check /> Educational, never a diagnosis</li></ul></aside></section>{result && <ResultView response={result} onClose={() => setResult(null)} />}</>;
}

function ResultView({ response, onClose }) { const result = response.result; return <div className="result-overlay"><article className="result-modal"><button className="close" onClick={onClose}><X /></button><p className="eyebrow">Analysis complete</p><h2>{response.patient?.full_name || 'Report'} is easier to follow.</h2><div className="result-summary">{result.simplified_summary || 'No medical terms detected.'}</div><div className="entity-list">{result.entities?.map(entity => <span key={`${entity.text}-${entity.label}`}><b>{entity.text}</b><small>{entity.label}</small></span>)}</div><h3>Recommendations</h3><div className="recommend-grid"><Recommendation title="Foods to eat" values={result.recommendations?.aggregated?.foods_to_eat} /><Recommendation title="Foods to limit" values={result.recommendations?.aggregated?.foods_to_avoid} /><Recommendation title="Movement" values={result.recommendations?.aggregated?.recommended_exercise} /></div></article></div>; }
function Recommendation({ title, values = [] }) { return <div><b>{title}</b><ul>{values.slice(0, 4).map(value => <li key={value}>{value}</li>)}</ul></div>; }

function Patients() { const [patients, setPatients] = useState([]); const [showAdd, setShowAdd] = useState(false); const [error, setError] = useState(''); const load = () => api('/patients/api/list').then(setPatients).catch(err => setError(err.message)); useEffect(load, []); const add = async event => { event.preventDefault(); try { await api('/patients/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); setShowAdd(false); load(); } catch (err) { setError(err.message); } }; return <><PageHeader eyebrow="Care workspace" title="Patient directory" description="Keep patient records and report history organized in one quiet workspace." action={<button className="button primary" onClick={() => setShowAdd(true)}><UserRoundPlus size={17} /> Add patient</button>} />{error && <div className="alert error">{error}</div>}<section className="panel table-panel"><div className="section-title"><h2>All patient records</h2><span className="muted">{patients.length} records</span></div>{patients.length ? <div className="table-wrap"><table><thead><tr><th>Patient</th><th>Code</th><th>Age / gender</th><th>Blood group</th><th>Reports</th><th /></tr></thead><tbody>{patients.map(patient => <tr key={patient.id}><td><b>{patient.full_name}</b><small>{patient.contact_email || patient.contact_phone || 'No contact details'}</small></td><td><code>{patient.patient_code}</code></td><td>{patient.age || '-'} / {patient.gender || '-'}</td><td>{patient.blood_group || '-'}</td><td>{patient.report_count} reports</td><td><a className="text-link" href={`#/patients/${patient.id}`}>View <ArrowRight size={14} /></a></td></tr>)}</tbody></table></div> : <Empty icon={<UsersRound />} title="Your directory is ready" text="Add a patient to start connecting reports to a record." />}</section>{showAdd && <Modal title="Add patient"><form onSubmit={add} className="modal-form"><label>Full name<input name="full_name" required /></label><div className="two-col"><label>Age<input name="age" type="number" /></label><label>Gender<input name="gender" /></label></div><div className="two-col"><label>Blood group<input name="blood_group" /></label><label>Phone<input name="contact_phone" /></label></div><label>Email<input name="contact_email" type="email" /></label><button className="button primary">Save patient</button></form></Modal>}</>; }

function Reports() { const [reports, setReports] = useState([]); const [query, setQuery] = useState(''); useEffect(() => { api('/api/reports').then(setReports).catch(() => {}); }, []); const visible = reports.filter(report => `${report.filename || ''} ${report.extracted_text || ''}`.toLowerCase().includes(query.toLowerCase())); return <><PageHeader eyebrow="Your workspace" title="My reports" description="Return to previous analyses, review summaries, or download original files." action={<a className="button primary" href="#/dashboard"><UploadCloud size={17} /> Upload report</a>} /><section className="panel"><div className="toolbar"><div className="search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search reports" /></div></div>{visible.length ? <div className="history-list">{visible.map(report => <article className="history-card" key={report.id}><span className="history-icon"><FileText /></span><div><h3>{report.filename || 'Pasted medical report'}</h3><p>{report.extracted_text?.slice(0, 130) || 'No extracted text'}...</p><small>{report.created_at ? new Date(report.created_at).toLocaleString() : 'Date unavailable'}</small></div><div className="history-actions"><a href={`#/patients/${report.patient_id}`} title="View patient"><UserRound size={17} /></a>{report.file_path && <a href={`/reports/${report.id}/download`} title="Download"><Download size={17} /></a>}</div></article>)}</div> : <Empty icon={<FileText />} title="No reports found" text="Upload a report to start your history." />}</section></>; }

function PatientDetail({ id }) { const [patient, setPatient] = useState(null); useEffect(() => { api(`/patients/api/${id}`).then(setPatient).catch(() => {}); }, [id]); if (!patient) return <div className="loading-screen"><Sparkles /><span>Loading patient record...</span></div>; return <><PageHeader eyebrow="Patient record" title={patient.full_name} description={`${patient.patient_code} · ${patient.report_count} saved reports`} action={<a className="button secondary" href="#/dashboard">Upload report</a>} /><section className="patient-facts panel"><Fact label="Age" value={patient.age ? `${patient.age} yrs` : 'N/A'} /><Fact label="Gender" value={patient.gender || 'N/A'} /><Fact label="Blood group" value={patient.blood_group || 'N/A'} /><Fact label="Phone" value={patient.contact_phone || 'N/A'} /></section><div className="section-title page-section-title"><h2>Report history</h2><span className="muted">{patient.reports?.length || 0} saved reports</span></div>{patient.reports?.length ? patient.reports.map(report => <article className="panel history-card detail-card" key={report.id}><div><h3>{report.filename || 'Pasted medical report'}</h3><small>{report.created_at ? new Date(report.created_at).toLocaleString() : ''}</small><div className="entity-list">{report.entities?.map(entity => <span key={entity.id}><b>{entity.entity_text}</b><small>{entity.entity_label}</small></span>)}</div><div className="result-summary">{report.simplified_text || 'No summary text generated.'}</div></div></article>) : <Empty icon={<FileText />} title="No reports yet" text="Upload a report to begin this patient's history." />}</>; }
function Fact({ label, value }) { return <div><small>{label}</small><b>{value}</b></div>; }
function PageHeader({ eyebrow, title, description, action }) { return <section className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</section>; }
function Empty({ icon, title, text }) { return <div className="empty"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>; }
function Modal({ title, children }) { return <div className="result-overlay"><article className="modal"><button className="close" onClick={() => { window.location.hash = '/patients'; }}><X /></button><p className="eyebrow">Patient directory</p><h2>{title}</h2>{children}</article></div>; }

export default App;
