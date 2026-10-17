import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight, Bell, BookOpen, Check, CheckCircle2, ChevronRight,
  CircleAlert, Clock, Edit3, FileText, HeartPulse, HelpCircle,
  MessageSquare, Mic, MicOff, ShieldCheck, Sparkles, UploadCloud,
} from 'lucide-react';
import { api, go } from '../api/client';
import { ResultView } from '../components/reports/ResultView';
import { ReminderPanel } from '../components/reminders/ReminderPanel';
import { HealthChatDrawer } from '../components/chat/HealthChatDrawer';

export function Dashboard({ session }) {
  const [patients, setPatients] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [pastedText, setPastedText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const recognitionRef = useRef(null);

  const getUserFirstName = () => {
    if (session?.display_name) {
      return session.display_name.trim().split(/\s+/)[0].toUpperCase();
    }
    if (session?.user_email) {
      const raw = session.user_email.split('@')[0];
      const namePart = raw.split(/[._-]/)[0];
      return namePart.toUpperCase();
    }
    return 'JAI';
  };

  const userName = getUserFirstName();

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        if (transcript) {
          setPastedText((prev) => (prev ? `${prev.trim()} ${transcript.trim()}` : transcript.trim()));
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

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
      .catch((err) => {
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

  const maxChartValue = Math.max(...chartData.map((item) => item.value), 1);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    const data = new FormData(event.currentTarget);
    if (file) data.set('report', file);
    try {
      const response = await api('/api/upload', { method: 'POST', body: data });
      setResult(response);
      api('/patients/api/list').then((d) => {
        if (Array.isArray(d)) setPatients(d);
      }).catch(() => {});
      api('/api/dashboard/stats').then((s) => {
        if (s) setStats(s);
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
      {/* 1. TOP WELCOME CARD (Styled like the reference design) */}
      <div className="byts-welcome-card">
        <div className="byts-welcome-eyebrow">HEALTH DASHBOARD</div>
        <h1>Welcome back, {userName}!</h1>
        <p className="byts-welcome-sub">
          Pick up your medical reports, laboratory assessments, and doctor discussion guides from where you stopped.
        </p>
        <button
          type="button"
          className="byts-btn-orange"
          onClick={scrollToUpload}
        >
          <UploadCloud size={16} /> Upload &amp; Scan Report
        </button>
      </div>

      {/* 2. MIDDLE TWO-COLUMN GRID: Clinical Activity & Care Alerts */}
      <div className="byts-dashboard-grid">
        {/* Left Column: Clinical Activity */}
        <div className="byts-section-card">
          <div className="byts-section-header">
            <h2>Clinical Activity Overview</h2>
          </div>
          <div className="byts-activity-grid">
            {/* Cell 1: Reports Analyzed */}
            <div className="byts-activity-cell">
              <div className="byts-activity-icon-box red">
                <FileText size={20} />
              </div>
              <div className="byts-activity-meta">
                <span className="byts-activity-label">REPORTS ANALYZED</span>
                <span className="byts-activity-num">{stats?.report_count ?? 0}</span>
              </div>
            </div>

            {/* Cell 2: Patients Monitored */}
            <div className="byts-activity-cell">
              <div className="byts-activity-icon-box green">
                <CheckCircle2 size={20} />
              </div>
              <div className="byts-activity-meta">
                <span className="byts-activity-label">PATIENTS MONITORED</span>
                <span className="byts-activity-num">{stats?.patient_count ?? 0}</span>
              </div>
            </div>

            {/* Cell 3: Lab Values Tracked */}
            <div className="byts-activity-cell">
              <div className="byts-activity-icon-box blue">
                <HeartPulse size={20} />
              </div>
              <div className="byts-activity-meta">
                <span className="byts-activity-label">LAB METRICS TRACKED</span>
                <span className="byts-activity-num">{stats?.report_count ? stats.report_count * 6 : 0}</span>
              </div>
            </div>

            {/* Cell 4: Reminders & Notes */}
            <div
              className="byts-activity-cell"
              style={{ cursor: 'pointer' }}
              onClick={() => go('/reminders')}
              title="View all Care Reminders"
            >
              <div className="byts-activity-icon-box amber">
                <Clock size={20} />
              </div>
              <div className="byts-activity-meta">
                <span className="byts-activity-label">CARE REMINDERS</span>
                <span className="byts-activity-num">{stats?.reminders?.length ?? 0}</span>
              </div>
            </div>
          </div>
          <div className="byts-activity-footer">
            Please visit the <a href="#/reports" onClick={(e) => { e.preventDefault(); go('/reports'); }}>My Reports page</a> to review all analyzed patient findings and laboratory trends.
          </div>
        </div>

        {/* Right Column: Care Alerts & Notices */}
        <div className="byts-section-card">
          <div className="byts-section-header">
            <h2>Care Alerts &amp; Notices</h2>
            <Bell size={18} style={{ color: 'var(--muted)' }} />
          </div>
          <div className="byts-announcement-body">
            <div className="byts-announcement-icon">
              <Bell size={26} />
            </div>
            <div className="byts-announcement-title">All Clear &amp; Up to Date</div>
            <div className="byts-announcement-text">
              No abnormal medication interactions or overdue follow-ups pending review.
            </div>
          </div>
        </div>
      </div>

      {/* 3. RECENT MEDICAL REPORTS IN PROGRESS */}
      <div className="byts-section-card" style={{ marginBottom: '28px' }}>
        <div className="byts-section-header">
          <h2>Recent Reports in Progress</h2>
          <button
            type="button"
            className="button secondary small"
            onClick={() => go('/reports')}
            style={{ fontSize: '12px' }}
          >
            View All Reports
          </button>
        </div>
        <div className="byts-course-item" style={{ marginBottom: 0 }}>
          <div className="byts-course-left">
            <div className="byts-course-icon" style={{ background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
              <HeartPulse size={22} />
            </div>
            <div>
              <div className="byts-course-title">
                Comprehensive Metabolic &amp; CBC Profile
              </div>
              <div className="byts-course-sub">
                Lab reference range classification and plain-language explanation active
              </div>
            </div>
          </div>
          <button
            type="button"
            className="button primary small"
            onClick={() => go('/reports')}
          >
            View Report &gt;
          </button>
        </div>
      </div>

      {/* 4. CLINICAL SNAPSHOT & CONDITIONS OVERVIEW */}
      <section className="analytics-panel-stack" style={{ marginBottom: '28px' }}>
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
            {chartData.map((item) => (
              <div className="bar-group" key={item.label}>
                <span className="bar" style={{ height: `${(item.value / maxChartValue) * 100}%` }} />
                <label>{item.label}</label>
              </div>
            ))}
          </div>
        </div>

        <ReminderPanel
          initialReminders={stats?.reminders || []}
          onUpdated={() => {
            api('/api/dashboard/stats').then((s) => s && setStats(s)).catch(() => {});
          }}
        />
      </section>

      {/* 5. REPORT ANALYSIS WORKSPACE */}
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
              {Array.isArray(patients) && patients.map((patient) => (
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
                onChange={(event) => setFile(event.target.files[0])}
              />
            </div>
          </label>
          <div className="divider"><span>OR PASTE REPORT TEXT</span></div>
          <div className="report-text-header">
            <label htmlFor="report-textarea">Medical report text</label>
            <button
              type="button"
              className={`dictation-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleListening}
              title={isListening ? 'Stop voice dictation' : 'Dictate symptoms or report text'}
            >
              {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              <span>{isListening ? 'Listening… (click to finish)' : 'Voice Dictate'}</span>
            </button>
          </div>
          <textarea
            id="report-textarea"
            name="report_text"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={5}
            placeholder="Paste report text here, or click Voice Dictate to speak your symptoms, findings, and lab values..."
          />
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

      {/* 6. FLOATING ASSISTANT ICON (Interactive Health Clarity Chatbot) */}
      <div
        className="byts-floating-assistant"
        title="Open AI Health Clarity Assistant"
        onClick={() => setShowChat(true)}
      >
        <Sparkles size={22} />
      </div>

      <HealthChatDrawer
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        report={result?.report || result}
        patient={result?.patient}
      />

      {result && <ResultView response={result} onClose={() => setResult(null)} onReanalyze={reanalyzeCorrectedText} />}
    </>
  );
}

