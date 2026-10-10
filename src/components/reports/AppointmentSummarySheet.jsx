import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { CheckSquare, ExternalLink, HeartPulse, Pill, Printer, QrCode, ShieldCheck, X } from 'lucide-react';

export function AppointmentSummarySheet({ response, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const result = response.result || {};
  const patient = response.patient || {};
  const reportId = response.report?.id;
  const labResults = result.lab_results || response.report?.lab_results || [];
  const drugInteractions = result.drug_interactions || response.report?.drug_interactions || [];
  const doctorQuestions = result.questions_to_ask_doctor || response.report?.questions_to_ask_doctor || [];
  const entities = result.entities || [];

  // Filter abnormal or notable lab findings
  const notableLabs = labResults.filter(
    (l) => ['high', 'low', 'critical'].includes(String(l.status || '').toLowerCase())
  );
  const displayLabs = notableLabs.length > 0 ? notableLabs : labResults.slice(0, 6);

  const medicines = entities.filter(
    (e) => ['MEDICINE', 'MEDICATION'].includes(String(e.label || '').toUpperCase())
  );

  const summaryUrl = reportId
    ? `${window.location.origin}/reports/${reportId}/summary`
    : `${window.location.origin}/#/reports`;

  useEffect(() => {
    // Generate QR code encoding direct mobile-scannable web URL
    QRCode.toDataURL(summaryUrl, {
      width: 130,
      margin: 1,
      color: { dark: '#123b56', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch((err) => console.error('QR code generation failed:', err));
  }, [summaryUrl]);

  const handlePrint = () => {
    window.print();
  };

  const formatAge = (age) => {
    if (age == null || age === '') return 'N/A';
    const clean = String(age).replace(/\s*(years?|yrs?)\b/gi, '').trim();
    return clean ? `${clean} yrs` : 'N/A';
  };

  return (
    <div className="appointment-sheet-overlay">
      <div className="appointment-sheet-card print-container">
        {/* Actions bar (screen only) */}
        <div className="sheet-top-actions no-print">
          <div className="sheet-badge">
            <QrCode size={16} /> Doctor Appointment Summary Sheet
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="button primary small" onClick={handlePrint}>
              <Printer size={15} /> Print Summary Sheet
            </button>
            <button type="button" className="close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Official Header */}
        <div className="sheet-header">
          <div className="sheet-clinic-info">
            <h2>CLINICAL DISCUSSION SUMMARY</h2>
            <p className="muted">Prepared for Outpatient Physician Visit · Patient-Brought Summary</p>
          </div>
          {qrDataUrl && (
            <div className="sheet-qr-box">
              <a
                href={summaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Scan with phone or click to open digital summary"
              >
                <img src={qrDataUrl} alt="Scan for Doctor Summary" className="sheet-qr-img" />
              </a>
              <small>Scan for Digital Summary</small>
              <a
                href={summaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="qr-test-link no-print"
                style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', marginTop: '2px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                Test link <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>

        {/* Patient Demographics */}
        <div className="sheet-demographics-grid">
          <div><strong>Patient Name:</strong> {patient.full_name || 'Patient Record'}</div>
          <div><strong>Patient ID:</strong> {patient.patient_code || 'PAT-N/A'}</div>
          <div><strong>Age / Gender:</strong> {formatAge(patient.age)} / {patient.gender || 'N/A'}</div>
          <div><strong>Date:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
        </div>

        {/* Notable Labs */}
        <div className="sheet-section">
          <h4 className="sheet-section-title">
            <HeartPulse size={16} /> Notable Lab Metrics to Review
          </h4>
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Result</th>
                <th>Normal Limits</th>
                <th>Flag</th>
                <th>Clinical Note</th>
              </tr>
            </thead>
            <tbody>
              {displayLabs.map((lab, i) => (
                <tr key={`${lab.test_name}-${i}`}>
                  <td><strong>{lab.test_name}</strong></td>
                  <td>{lab.value} {lab.unit || ''}</td>
                  <td>
                    {typeof lab.reference_range === 'object' && lab.reference_range
                      ? `${lab.reference_range.low ?? ''}–${lab.reference_range.high ?? ''} ${lab.reference_range.unit || lab.unit || ''}`
                      : lab.reference_range || 'N/A'}
                  </td>
                  <td>
                    <span className={`lab-status-badge ${String(lab.status || '').toLowerCase()}`}>
                      {lab.status || 'Flagged'}
                    </span>
                  </td>
                  <td><small>{lab.meaning || 'Review relative to baseline.'}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Drug Interactions & Medicines */}
        {(drugInteractions.length > 0 || medicines.length > 0) && (
          <div className="sheet-section">
            <h4 className="sheet-section-title">
              <Pill size={16} /> Medications & Interaction Discussion Points
            </h4>
            {drugInteractions.length > 0 && (
              <div className="sheet-interaction-list">
                {drugInteractions.map((interaction, idx) => (
                  <div key={idx} className="sheet-interaction-item">
                    <div className="sheet-interaction-header">
                      <strong>⚠️ {interaction.title}</strong>
                      <span className="interaction-pill">{interaction.severity}</span>
                    </div>
                    <p>{interaction.description}</p>
                    <div className="sheet-doctor-question">
                      <strong>Discussion Point:</strong> {interaction.doctor_prompt}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {medicines.length > 0 && (
              <div className="sheet-medicine-tags">
                <span className="muted" style={{ fontSize: '11px', fontWeight: 600 }}>Active medicines detected:</span>
                {medicines.map((m, idx) => (
                  <span key={idx} className="sheet-med-chip">
                    {m.cleaned_name || m.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Doctor Questions Checklist */}
        <div className="sheet-section">
          <h4 className="sheet-section-title">
            <CheckSquare size={16} /> Patient Agenda & Questions for Physician
          </h4>
          <ul className="sheet-checklist">
            {(doctorQuestions.length > 0 ? doctorQuestions : [
              'How do these results correlate with my current symptoms or routine care?',
              'Do any medication adjustments or follow-up laboratory intervals make sense?',
            ]).map((q, idx) => (
              <li key={idx}>
                <input type="checkbox" id={`sheet-q-${idx}`} />
                <label htmlFor={`sheet-q-${idx}`}>{q}</label>
              </li>
            ))}
          </ul>
        </div>

        {/* Clinical Note Space */}
        <div className="sheet-notes-section">
          <strong>Physician / Patient Appointment Notes:</strong>
          <div className="sheet-notes-lines">
            <div className="note-line" />
            <div className="note-line" />
            <div className="note-line" />
          </div>
        </div>

        {/* Footer Disclaimer */}
        <div className="sheet-footer">
          <ShieldCheck size={14} />
          <small>
            Educational clarity summary generated for collaborative doctor-patient dialogue.
            Not a prescription or autonomous diagnosis. All clinical decisions remain between the physician and patient.
          </small>
        </div>
      </div>
    </div>
  );
}
