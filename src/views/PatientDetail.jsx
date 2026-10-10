import React, { useState, useEffect } from 'react';
import {
  Activity, AlertTriangle, ArrowDownAZ, Calendar, CheckCircle2, ChevronDown,
  ChevronUp, CircleAlert, Clock, FileText, Filter, HeartPulse, Pill, Printer,
  Sparkles, Trash2, UploadCloud,
} from 'lucide-react';
import { api, go } from '../api/client';
import { PageHeader, Empty, Fact, Modal } from '../components/common/CommonUI';
import { LabTrendChart } from '../components/patients/LabTrendChart';
import { ResultView } from '../components/reports/ResultView';

export function PatientDetail({ id }) {
  const [patient, setPatient] = useState(null);
  const [reportSort, setReportSort] = useState('newest');
  const [selectedReport, setSelectedReport] = useState(null);
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'cards'
  const [timelineFilter, setTimelineFilter] = useState('all'); // 'all' | 'abnormal' | 'meds'
  const [expandedSummaryIds, setExpandedSummaryIds] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api(`/patients/api/${id}`)
      .then((data) => {
        if (active) setPatient(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Patient record could not be loaded.');
      });
    return () => { active = false; };
  }, [id]);

  const handleDeletePatient = async () => {
    setIsDeleting(true);
    try {
      await api(`/patients/api/${id}`, { method: 'DELETE' });
      go('/patients');
    } catch (err) {
      setError(err.message || 'Could not delete patient record.');
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

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

  if (!patient) {
    return (
      <div className="loading-screen">
        <Sparkles />
        <span>Loading patient clinical timeline...</span>
      </div>
    );
  }

  const reports = patient.reports || [];

  const toggleExpand = (reportId) => {
    setExpandedSummaryIds((prev) => ({
      ...prev,
      [reportId]: !prev[reportId],
    }));
  };

  const sortedPatientReports = [...reports].sort((a, b) => {
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

  const filteredReports = sortedPatientReports.filter((report) => {
    if (timelineFilter === 'abnormal') {
      return (report.lab_results || []).some((l) =>
        ['high', 'low', 'critical'].includes(String(l.status || '').toLowerCase())
      );
    }
    if (timelineFilter === 'meds') {
      return (report.entities || []).some((e) =>
        ['MEDICINE', 'MEDICATION'].includes(String(e.entity_label || '').toUpperCase())
      );
    }
    return true;
  });

  const openReport = (report) => {
    setSelectedReport({
      result: {
        simplified_summary: report.simplified_text,
        original_text: report.extracted_text,
        lab_results: report.lab_results || [],
        drug_interactions: report.drug_interactions || [],
        questions_to_ask_doctor: report.questions_to_ask_doctor || [],
        entities: report.entities?.map((e) => ({
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
        eyebrow="Longitudinal clinical tracking"
        title={patient.full_name}
        description={`${patient.patient_code} · ${patient.report_count} saved reports`}
        action={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <a className="button secondary" href="#/patients">← All patients</a>
            <a className="button primary" href="#/dashboard"><UploadCloud size={16} /> Upload report</a>
            <button
              type="button"
              className="button danger"
              onClick={() => setShowDeleteModal(true)}
              style={{
                background: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <Trash2 size={16} /> Delete patient
            </button>
          </div>
        }
      />

      <section className="patient-facts panel">
        <Fact label="Age" value={patient.age ? `${patient.age} yrs` : 'N/A'} />
        <Fact label="Gender" value={patient.gender || 'N/A'} />
        <Fact label="Blood group" value={patient.blood_group || 'N/A'} />
        <Fact label="Phone" value={patient.contact_phone || 'N/A'} />
      </section>

      {/* Longitudinal Lab Trend Chart */}
      <LabTrendChart patientId={patient.id} reports={reports} />

      {/* Interactive Clinical Timeline Controls */}
      <div className="section-title page-section-title patient-history-header">
        <div>
          <h2>Automated Clinical Timeline</h2>
          <span className="muted">Chronological health progression & report trajectories</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* View Mode Toggle */}
          <div className="sort-toggle-group compact" role="radiogroup" aria-label="Timeline view toggle">
            <button
              type="button"
              className={`sort-toggle-btn ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
            >
              <Activity size={13} /> Timeline
            </button>
            <button
              type="button"
              className={`sort-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
            >
              <FileText size={13} /> Cards
            </button>
          </div>

          {/* Filter Pills */}
          <div className="sort-toggle-group compact" role="radiogroup" aria-label="Filter timeline events">
            <button
              type="button"
              className={`sort-toggle-btn ${timelineFilter === 'all' ? 'active' : ''}`}
              onClick={() => setTimelineFilter('all')}
            >
              All ({reports.length})
            </button>
            <button
              type="button"
              className={`sort-toggle-btn ${timelineFilter === 'abnormal' ? 'active' : ''}`}
              onClick={() => setTimelineFilter('abnormal')}
            >
              <AlertTriangle size={12} /> Abnormal Labs
            </button>
            <button
              type="button"
              className={`sort-toggle-btn ${timelineFilter === 'meds' ? 'active' : ''}`}
              onClick={() => setTimelineFilter('meds')}
            >
              <Pill size={12} /> Medications
            </button>
          </div>

          {/* Sort Control */}
          {reports.length > 1 && (
            <div className="sort-toggle-group compact" role="radiogroup" aria-label="Sort timeline events">
              <button
                type="button"
                className={`sort-toggle-btn ${reportSort === 'newest' ? 'active' : ''}`}
                onClick={() => setReportSort('newest')}
                title="Newest first"
              >
                <Calendar size={12} /> Newest
              </button>
              <button
                type="button"
                className={`sort-toggle-btn ${reportSort === 'oldest' ? 'active' : ''}`}
                onClick={() => setReportSort('oldest')}
                title="Oldest first"
              >
                <Calendar size={12} /> Oldest
              </button>
            </div>
          )}
        </div>
      </div>

      {filteredReports.length > 0 ? (
        viewMode === 'timeline' ? (
          /* Interactive Connected Vertical Timeline */
          <div className="clinical-timeline-container">
            <div className="timeline-spine" />
            <div className="timeline-events-list">
              {filteredReports.map((report, idx) => {
                const dateObj = report.created_at ? new Date(report.created_at) : new Date();
                const abnormalLabs = (report.lab_results || []).filter((l) =>
                  ['high', 'low', 'critical'].includes(String(l.status || '').toLowerCase())
                );
                const conditions = (report.entities || []).filter((e) =>
                  ['DISEASE', 'SYMPTOM'].includes(String(e.entity_label || '').toUpperCase())
                );
                const meds = (report.entities || []).filter((e) =>
                  ['MEDICINE', 'MEDICATION'].includes(String(e.entity_label || '').toUpperCase())
                );
                const isExpanded = !!expandedSummaryIds[report.id];
                const hasAbnormal = abnormalLabs.length > 0;

                return (
                  <article className="timeline-event-row" key={report.id}>
                    {/* Timestamp Node */}
                    <div className="timeline-node-column">
                      <div className={`timeline-node-dot ${hasAbnormal ? 'warning' : 'healthy'}`}>
                        {hasAbnormal ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                      </div>
                      <div className="timeline-date-caption">
                        <strong>{dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                        <small>{dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</small>
                      </div>
                    </div>

                    {/* Timeline Event Card */}
                    <div className="timeline-card panel">
                      <div className="timeline-card-header">
                        <div>
                          <span className="timeline-event-type">
                            <Clock size={11} /> Milestone #{filteredReports.length - idx}
                          </span>
                          <h3 className="timeline-title">{report.filename || 'Clinical Consultation Report'}</h3>
                        </div>
                        <button
                          type="button"
                          className="button secondary small"
                          onClick={() => openReport(report)}
                          title="Open full interactive analysis"
                        >
                          <Printer size={14} /> View & Print
                        </button>
                      </div>

                      {/* Clinical Badges Grid */}
                      <div className="timeline-tags-wrapper">
                        {/* Abnormal lab flags */}
                        {abnormalLabs.map((l, i) => (
                          <span key={`ab-${i}`} className={`timeline-tag lab-${String(l.status).toLowerCase()}`}>
                            <HeartPulse size={11} /> {l.test_name}: <strong>{l.value} {l.unit || ''}</strong> ({l.status})
                          </span>
                        ))}

                        {/* Conditions / Diseases */}
                        {conditions.map((c, i) => (
                          <span key={`c-${i}`} className="timeline-tag condition">
                            <Activity size={11} /> {c.entity_text}
                          </span>
                        ))}

                        {/* Medications */}
                        {meds.map((m, i) => (
                          <span key={`m-${i}`} className="timeline-tag med">
                            <Pill size={11} /> {m.entity_text}
                          </span>
                        ))}
                      </div>

                      {/* Summary with Collapsible Accordion */}
                      <div className="timeline-summary-preview">
                        <p className={isExpanded ? 'expanded' : 'clamped'}>
                          {report.simplified_text || 'No summary text recorded.'}
                        </p>
                        {report.simplified_text && report.simplified_text.length > 120 && (
                          <button
                            type="button"
                            className="timeline-readmore-btn"
                            onClick={() => toggleExpand(report.id)}
                          >
                            {isExpanded ? (
                              <>Show less <ChevronUp size={13} /></>
                            ) : (
                              <>Read full summary <ChevronDown size={13} /></>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          /* Cards View */
          sortedPatientReports.map((report) => (
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
                  {report.entities?.map((entity) => (
                    <span key={entity.id}><b>{entity.entity_text}</b><small>{entity.entity_label}</small></span>
                  ))}
                </div>
                <div className="result-summary">{report.simplified_text || 'No summary text generated.'}</div>
              </div>
            </article>
          ))
        )
      ) : (
        <Empty
          icon={<FileText />}
          title="No reports match this filter"
          text="Try switching filters or uploading a new clinical report."
        />
      )}

      {selectedReport && <ResultView response={selectedReport} onClose={() => setSelectedReport(null)} />}

      {showDeleteModal && (
        <Modal title="Delete Patient Record" onClose={() => !isDeleting && setShowDeleteModal(false)}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--navy)' }}>
              Are you sure you want to delete <b>{patient.full_name}</b> (<code>{patient.patient_code}</code>)?
            </p>
            <div className="alert warning" style={{ margin: 0, fontSize: '13px' }}>
              This action cannot be undone. All <b>{reports.length} associated reports</b>, uploaded files, and clinical reminders for this patient will be permanently deleted.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={handleDeletePatient}
                disabled={isDeleting}
                style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
              >
                {isDeleting ? 'Deleting...' : 'Delete patient record'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
