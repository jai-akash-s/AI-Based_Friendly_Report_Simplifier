import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle, Check, Download, FileText, HeartPulse, Pill, Printer,
  Search, ShieldCheck, Sparkles, Volume2, X, Pause, Play,
} from 'lucide-react';
import { api } from '../../api/client';
import { LabGauge } from './LabGauge';
import { HealthChatDrawer } from '../chat/HealthChatDrawer';

export const DISCLAIMER =
  'This tool is for understanding only, not a medical diagnosis or prescription. Educational summary only; this is not a diagnosis or treatment plan. Findings may have several explanations. Do not start, stop, or change treatment or medicines based on this summary; please consult your doctor.';

export function maskSensitiveText(value, enabled, identifiers) {
  if (!enabled) return value;
  return (identifiers || []).reduce((text, identifier) => {
    const name = String(identifier || '').trim();
    if (!name) return text;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(text || '').replace(new RegExp(escaped, 'gi'), '[MASKED]');
  }, String(value || ''));
}

function renderWithLinks(text) {
  if (!text || typeof text !== 'string') return text;
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  if (!regex.test(text)) return text;
  regex.lastIndex = 0;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [_, linkText, url] = match;
    parts.push(
      <a
        key={`${url}-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--primary)', textDecoration: 'underline', wordBreak: 'break-word', fontWeight: 500 }}
      >
        {linkText}
      </a>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export function Recommendation({ title, values = [] }) {
  return (
    <div>
      <b>{title}</b>
      {values.length > 0 ? (
        <ul>
          {values.slice(0, 8).map((value, idx) => (
            <li key={idx}>{renderWithLinks(value)}</li>
          ))}
        </ul>
      ) : (
        <small className="muted">No specific restrictions noted.</small>
      )}
    </div>
  );
}

function HighlightedText({ text, query }) {
  if (!query || !query.trim()) {
    return <pre className="original-report-pre">{text}</pre>;
  }

  const cleanQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${cleanQuery})`, 'gi');
  const parts = String(text || '').split(regex);

  return (
    <pre className="original-report-pre">
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="doc-highlight">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </pre>
  );
}

export function ResultView({ response, onClose, onReanalyze }) {
  const result = response.result || {};
  const rawPatient = response.patient || response.report?.patient || {};
  const extractedText = result.original_text || response.report?.extracted_text || '';
  const needsOcrReview = typeof result.extraction_confidence === 'number' && result.extraction_confidence < 65;

  // Extract fallback patient details from extracted text if missing or dummy
  const extractedPatient = React.useMemo(() => {
    if (!extractedText || typeof extractedText !== 'string') return {};
    const text = extractedText.trim();
    const info = {};

    const nameMatch = text.match(
      /(?:patient\s*name|full\s*name|^name)\s*[:\-]\s*([A-Za-z0-9.\s]+?)(?=\s*(?:\n|,|\s{2,}|UHID|Age|Sex|Gender|Blood|Phone|Mobile|DOB|Date|$))/im
    );
    if (nameMatch && nameMatch[1].trim()) {
      info.full_name = nameMatch[1].trim();
    }

    const ageGenderMatch = text.match(
      /(?:age\s*\/\s*(?:sex|gender)|age)\s*[:\-]?\s*([0-9\sYMDymd]+?)(?:\s*\/\s*(male|female|m|f))?(?=\s*(?:\/|\n|,|\s{2,}|UHID|Sex|Gender|Blood|Phone|$))/i
    );
    if (ageGenderMatch) {
      if (ageGenderMatch[1] && ageGenderMatch[1].trim()) {
        info.age = ageGenderMatch[1].trim();
      }
      if (ageGenderMatch[2]) {
        const rawG = ageGenderMatch[2].toLowerCase();
        info.gender = rawG === 'm' ? 'Male' : rawG === 'f' ? 'Female' : rawG.charAt(0).toUpperCase() + rawG.slice(1);
      }
    }

    const bloodMatch = text.match(
      /(?:blood\s*(?:group|type)?|bld|bg)\s*[:\-]?\s*([ABO0][AB]?\s*(?:\+|\-|positive|negative|pos|neg)|[A-Z]{1,3}[+-])/i
    );
    if (bloodMatch && bloodMatch[1].trim()) {
      info.blood_group = bloodMatch[1].trim().toUpperCase();
    }

    const phoneMatch = text.match(
      /(?:phone|mobile|contact(?:\s*no)?|tel)\s*[:\-]?\s*(\+?\d[\d\s().-]{7,}\d)/i
    );
    if (phoneMatch && phoneMatch[1].trim()) {
      info.contact_phone = phoneMatch[1].trim();
    }

    return info;
  }, [extractedText]);

  const isDummyName = (name) =>
    !name ||
    /^Report:\s*/i.test(name) ||
    name === 'Patient Report' ||
    name === 'Patient Record' ||
    name === 'Medical Report Summary';

  const patientName =
    (!isDummyName(rawPatient.full_name) ? rawPatient.full_name : null) ||
    (!isDummyName(response.report?.patient?.full_name) ? response.report?.patient?.full_name : null) ||
    extractedPatient.full_name ||
    (!rawPatient.full_name || isDummyName(rawPatient.full_name) ? 'Medical Report Summary' : rawPatient.full_name);

  const patientAge = rawPatient.age ?? response.report?.patient?.age ?? extractedPatient.age ?? null;
  const patientGender = rawPatient.gender || response.report?.patient?.gender || extractedPatient.gender || null;
  const patientBlood = rawPatient.blood_group || response.report?.patient?.blood_group || extractedPatient.blood_group || null;
  const patientPhone = rawPatient.contact_phone || rawPatient.phone || response.report?.patient?.contact_phone || extractedPatient.contact_phone || null;
  const patientCode = rawPatient.patient_code || response.report?.patient?.patient_code || null;

  const patient = {
    ...rawPatient,
    full_name: patientName,
    age: patientAge,
    gender: patientGender,
    blood_group: patientBlood,
    contact_phone: patientPhone,
    patient_code: patientCode,
  };

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

  // UX Enhancements: Highlighting, Audio Controls, AI Chat
  const [highlightQuery, setHighlightQuery] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [isPlayingSpeech, setIsPlayingSpeech] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [recViewMode, setRecViewMode] = useState('combined'); // 'combined' | 'by_condition'
  const originalColRef = useRef(null);

  const maskText = (value) =>
    maskSensitiveText(value, maskIdentifiers, [
      patient.full_name,
      patient.patient_code,
      patient.contact_phone,
      rawPatient.full_name,
      rawPatient.patient_code,
    ]);

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

  useEffect(() => {
    // When window speech closes or component unmounts, cancel audio
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const entities = displayEntities;
  const labResults = result.lab_results || response.report?.lab_results || [];
  const drugInteractions = result.drug_interactions || response.report?.drug_interactions || [];
  const doctorQuestions =
    result.questions_to_ask_doctor || response.report?.questions_to_ask_doctor || [];

  const rawRecs = result.recommendations || response.report?.recommendations || [];
  const byConditionList = Array.isArray(rawRecs)
    ? rawRecs.map((r) => ({
        condition: r.condition_name || 'Condition',
        source_flag: r.source_flag || '',
        foods_to_eat: r.foods_to_eat || [],
        foods_to_avoid: r.foods_to_avoid || [],
        recommended_exercise: r.recommended_exercise || [],
        exercise_precautions: r.exercise_precautions || '',
      }))
    : rawRecs.by_condition || [];

  const foodsToEat =
    rawRecs.aggregated?.foods_to_eat?.length
      ? rawRecs.aggregated.foods_to_eat
      : Array.from(new Set(byConditionList.flatMap((r) => r.foods_to_eat || [])));

  const foodsToAvoid =
    rawRecs.aggregated?.foods_to_avoid?.length
      ? rawRecs.aggregated.foods_to_avoid
      : Array.from(new Set(byConditionList.flatMap((r) => r.foods_to_avoid || [])));

  const exercises =
    rawRecs.aggregated?.recommended_exercise?.length
      ? rawRecs.aggregated.recommended_exercise
      : Array.from(new Set(byConditionList.flatMap((r) => r.recommended_exercise || [])));

  const precautions =
    rawRecs.aggregated?.general_precautions?.length
      ? rawRecs.aggregated.general_precautions
      : Array.from(new Set(byConditionList.map((r) => r.exercise_precautions).filter(Boolean)));
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

  const toggleSpeechSummary = () => {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setTranslationError('Text-to-speech is not supported by this browser.');
      return;
    }

    if (isPlayingSpeech) {
      window.speechSynthesis.cancel();
      setIsPlayingSpeech(false);
      return;
    }

    const textToSpeak = translated.summary || result.simplified_summary || '';
    if (!textToSpeak.trim()) return;

    const utterance = new window.SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = { en: 'en-US', ta: 'ta-IN', hi: 'hi-IN' }[language] || 'en-US';
    utterance.rate = playbackRate;
    utterance.onend = () => setIsPlayingSpeech(false);
    utterance.onerror = () => setIsPlayingSpeech(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsPlayingSpeech(true);
  };

  const changePlaybackRate = (rate) => {
    setPlaybackRate(rate);
    if (isPlayingSpeech) {
      window.speechSynthesis.cancel();
      setIsPlayingSpeech(false);
    }
  };

  const handleSelectHighlight = (term) => {
    if (!term) return;
    setHighlightQuery(term);
    if (originalColRef.current) {
      originalColRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const submitCorrectedText = async () => {
    setReanalysisError('');
    setReanalysisBusy(true);
    try {
      if (onReanalyze) {
        await onReanalyze(draftText);
      }
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
      setMedicineErrors((prev) => ({
        ...prev,
        [key]: 'Save this report before looking up an edited medicine name.',
      }));
      return;
    }
    setMedicineBusy((prev) => ({ ...prev, [key]: true }));
    setMedicineErrors((prev) => ({ ...prev, [key]: '' }));
    try {
      const data = await api(`/api/reports/${response.report.id}/medicine-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId, name }),
      });
      setDisplayEntities((prev) =>
        prev.map((item, itemIndex) =>
          String(item.entity_id || item.id || itemIndex) === key
            ? { ...item, ...data, text: data.cleaned_name || data.name, explanation: '' }
            : item
        )
      );
      setConfirmedMatches((prev) => ({ ...prev, [key]: false }));
      setMedicineDrafts((prev) => ({ ...prev, [key]: data.cleaned_name || '' }));
    } catch (error) {
      setMedicineErrors((prev) => ({
        ...prev,
        [key]: error.message || 'Medicine lookup failed.',
      }));
    } finally {
      setMedicineBusy((prev) => ({ ...prev, [key]: false }));
    }
  };

  const formatAge = (age) => {
    if (age == null || age === '') return '';
    const clean = String(age).replace(/\s*(years?|yrs?)\b/gi, '').trim();
    if (!clean) return '';
    if (/\b(y|m|d|years?|yrs?|months?|days?)\b/i.test(String(age))) {
      return String(age).trim();
    }
    return `${clean} yrs`;
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
              {[
                patient.patient_code ? maskText(patient.patient_code) : null,
                formatAge(patient.age),
                patient.gender,
                patient.blood_group ? `Blood: ${patient.blood_group}` : null,
                patient.contact_phone ? `Phone: ${maskText(patient.contact_phone)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="result-header-actions no-print">
            <label className="mask-identifiers-toggle">
              <input
                type="checkbox"
                checked={maskIdentifiers}
                onChange={(event) => setMaskIdentifiers(event.target.checked)}
              />
              Mask name/ID
            </label>
            <button
              type="button"
              className="button secondary print-btn"
              onClick={() => setShowChat(true)}
              title="Ask AI health assistant questions about this report"
            >
              <Sparkles size={15} /> Ask AI
            </button>
            <button
              type="button"
              className="button secondary print-btn"
              onClick={handlePrint}
              title="Print clean medical report"
            >
              <Printer size={15} /> Print Report
            </button>
            {response?.report?.id && (
              <a
                className="button secondary print-btn"
                href={`/api/reports/${response.report.id}/export/pdf`}
                title="Download simplified report as PDF"
              >
                <Download size={15} /> Download PDF
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
            {patient.patient_code && <div><strong>Patient ID:</strong> {maskText(patient.patient_code)}</div>}
            {formatAge(patient.age) && <div><strong>Age:</strong> {formatAge(patient.age)}</div>}
            {patient.gender && <div><strong>Gender:</strong> {patient.gender}</div>}
            {patient.blood_group && <div><strong>Blood Group:</strong> {patient.blood_group}</div>}
            {patient.contact_phone && <div><strong>Phone:</strong> {maskText(patient.contact_phone)}</div>}
            <div><strong>Date:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
          </div>
        </div>

        {/* Plain-Language Clinical Summary with Variable Speed Audio */}
        <div className="result-section">
          <div className="result-controls no-print">
            <h3 className="section-heading"><Sparkles size={16} /> Plain-Language Clinical Summary</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="audio-control-bar">
                <button
                  type="button"
                  className={`speech-button ${isPlayingSpeech ? 'active' : ''}`}
                  onClick={toggleSpeechSummary}
                  aria-label={isPlayingSpeech ? 'Pause voice summary' : 'Read summary aloud'}
                >
                  {isPlayingSpeech ? <Pause size={14} /> : <Volume2 size={14} />}
                  <span>{isPlayingSpeech ? 'Pause Audio' : 'Listen'}</span>
                </button>
                <div className="audio-speed-chips" title="Audio playback speed">
                  {[0.75, 1, 1.25, 1.5].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      className={`speed-chip ${playbackRate === speed ? 'active' : ''}`}
                      onClick={() => changePlaybackRate(speed)}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
              <label className="result-language-select">
                Language
                <select value={language} onChange={handleLanguageChange} disabled={translationBusy}>
                  <option value="en">English</option>
                  <option value="ta">Tamil</option>
                  <option value="hi">Hindi</option>
                </select>
              </label>
            </div>
          </div>
          {translationBusy && <p className="muted" role="status">Translating generated explanations...</p>}
          {translationError && <div className="alert error" role="alert">{translationError}</div>}
          {needsOcrReview && (
            <div className="alert warning" role="status">
              {result.analysis_warning || `OCR confidence is ${result.extraction_confidence}%. Please verify the handwritten text before relying on this summary.`}
            </div>
          )}

          {/* Side-by-Side Comparison with Interactive Highlighter */}
          <div className="result-comparison">
            <section className="result-summary-column">
              <h4>Simplified explanation</h4>
              <div className="result-summary">
                {maskText(translated.summary || result.simplified_summary || 'No medical terms detected.')}
              </div>
            </section>
            <section className="result-original-column" ref={originalColRef}>
              <div className="original-col-header">
                <h4>Original report text</h4>
                {highlightQuery && (
                  <span className="active-highlight-tag">
                    Highlighting: <strong>"{highlightQuery}"</strong>
                    <button
                      type="button"
                      onClick={() => setHighlightQuery('')}
                      aria-label="Clear active highlight"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
              </div>
              <HighlightedText text={maskText(extractedText || 'No original text available.')} query={highlightQuery} />
            </section>
          </div>
        </div>

        {/* Drug Interaction Warnings Section */}
        {drugInteractions.length > 0 && (
          <section className="result-section drug-interactions-section">
            <div className="drug-interaction-header-row">
              <h3 className="section-heading">
                <AlertTriangle size={18} className="warning-icon" /> Medication Combination Discussion Points
              </h3>
              <span className="interaction-badge-count">
                {drugInteractions.length} combination{drugInteractions.length > 1 ? 's' : ''} detected
              </span>
            </div>
            <p className="section-subtext">
              Our educational safety checker noticed these medications in your report. Discuss these potential interactions with your doctor or pharmacist.
            </p>
            <div className="drug-interactions-grid">
              {drugInteractions.map((item, idx) => (
                <div key={idx} className="drug-interaction-card">
                  <div className="interaction-card-top">
                    <div className="interacting-drugs">
                      <span className="drug-chip">{item.medication_1}</span>
                      <span className="drug-plus">+</span>
                      <span className="drug-chip">{item.medication_2}</span>
                    </div>
                    <span className={`interaction-severity-tag ${String(item.severity).toLowerCase()}`}>
                      {item.severity}
                    </span>
                  </div>
                  <strong className="interaction-title">{item.title}</strong>
                  <p className="interaction-desc">{item.description}</p>
                  <div className="interaction-prompt-box">
                    <strong>💬 Question for your doctor:</strong>
                    <p>"{item.doctor_prompt}"</p>
                  </div>
                </div>
              ))}
            </div>
            <small className="interaction-disclaimer">
              Educational caution: Never stop or adjust prescription dosages without guidance from your healthcare provider.
            </small>
          </section>
        )}

        {/* Interactive Laboratory Results with Visual Gauges */}
        {labResults.length > 0 && (
          <section className="result-section">
            <div className="section-heading-row">
              <h3 className="section-heading"><HeartPulse size={16} /> Laboratory Results & Reference Gauges</h3>
              <small className="muted no-print">Click any test to highlight in original text</small>
            </div>
            <div className="table-wrap lab-results-table-wrap">
              <table className="lab-results-table">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Result</th>
                    <th>Reference range</th>
                    <th>Visual gauge</th>
                    <th>What it may mean</th>
                  </tr>
                </thead>
                <tbody>
                  {labResults.map((lab, index) => (
                    <tr
                      key={`${lab.test_name}-${index}`}
                      className="lab-row-interactive"
                      onClick={() => handleSelectHighlight(lab.test_name)}
                      title={`Click to locate "${lab.test_name}" in original report`}
                    >
                      <td>
                        <strong className="interactive-term-link">{maskText(lab.test_name)}</strong>
                      </td>
                      <td>{maskText(`${lab.value} ${lab.unit || ''}`)}</td>
                      <td>
                        {typeof lab.reference_range === 'object' && lab.reference_range
                          ? `${lab.reference_range.low ?? ''}–${lab.reference_range.high ?? ''} ${lab.reference_range.unit || lab.unit || ''}`
                          : maskText(lab.reference_range || 'Not available')}
                      </td>
                      <td style={{ minWidth: '170px' }}>
                        <LabGauge lab={lab} />
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
            <div className="section-heading-row">
              <h3 className="section-heading"><HeartPulse size={16} /> Key Medical Terms & Findings Explained</h3>
              <small className="muted no-print">Click any term to highlight in original document</small>
            </div>
            <div className="entity-cards-grid">
              {entities.map((entity, i) => {
                const termText = entity.label === 'MEDICINE' ? entity.cleaned_name || entity.text : entity.text;
                return (
                  <div
                    key={entity.entity_id || entity.id || i}
                    className="entity-card interactive-entity-card"
                    onClick={() => handleSelectHighlight(termText)}
                    title={`Click to highlight "${termText}" in original document`}
                  >
                    <div className="entity-badge-row">
                      <strong className="entity-name">
                        <abbr className="glossary-term" title={['MEDICINE', 'MEDICATION'].includes(String(entity.label || '').toUpperCase()) ? 'Medicine name detected in the report.' : translated.entities?.[i] || entity.explanation || 'No glossary explanation is available.'}>
                          {maskText(termText)}
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
                        <div className="medicine-card-content" onClick={(e) => e.stopPropagation()}>
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
                                <button type="button" className="button small primary" onClick={() => setConfirmedMatches((prev) => ({ ...prev, [entityKey]: true }))}>Yes</button>
                                <button type="button" className="button small secondary" onClick={() => setConfirmedMatches((prev) => ({ ...prev, [entityKey]: false }))}>No</button>
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
                                onChange={(event) => setMedicineDrafts((prev) => ({ ...prev, [entityKey]: event.target.value }))}
                              />
                            </label>
                            <button
                              type="button"
                              className="button small secondary"
                              disabled={medicineBusy[entityKey]}
                              onClick={() => runMedicineLookup(entity, i)}
                            >
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
                );
              })}
            </div>
          </div>
        )}

        {/* Nutrition & Activity Guidance */}
        <div className="result-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <h3 className="section-heading" style={{ margin: 0 }}>
              <ShieldCheck size={16} /> General Lifestyle Information (not a treatment plan)
            </h3>
            {byConditionList.length > 0 && (
              <div className="rec-mode-toggle no-print">
                <button
                  type="button"
                  className={`rec-toggle-btn ${recViewMode === 'combined' ? 'active' : ''}`}
                  onClick={() => setRecViewMode('combined')}
                >
                  Combined Overview
                </button>
                <button
                  type="button"
                  className={`rec-toggle-btn ${recViewMode === 'by_condition' ? 'active' : ''}`}
                  onClick={() => setRecViewMode('by_condition')}
                >
                  By Flagged Condition &amp; Labs ({byConditionList.length})
                </button>
              </div>
            )}
          </div>
          {needsOcrReview ? (
            <div className="alert warning" role="status">
              Recommendations are paused until the report text is corrected and analyzed.
            </div>
          ) : (
            <>
              {recViewMode === 'by_condition' && byConditionList.length > 0 ? (
                <div className="condition-recs-grid">
                  {byConditionList.map((cond, idx) => (
                    <div key={idx} className="condition-rec-card">
                      <div className="condition-rec-header">
                        <h4>{cond.condition}</h4>
                        {cond.source_flag && (
                          <span className="condition-source-badge">{cond.source_flag}</span>
                        )}
                      </div>
                      <div className="condition-rec-body">
                        {cond.foods_to_eat?.length > 0 && (
                          <div className="condition-rec-group">
                            <span className="rec-group-label eat">Foods to Prioritize:</span>
                            <ul>
                              {cond.foods_to_eat.map((f, i) => (
                                <li key={i}>{renderWithLinks(f)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {cond.foods_to_avoid?.length > 0 && (
                          <div className="condition-rec-group">
                            <span className="rec-group-label avoid">Foods to Limit:</span>
                            <ul>
                              {cond.foods_to_avoid.map((f, i) => (
                                <li key={i}>{renderWithLinks(f)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {cond.recommended_exercise?.length > 0 && (
                          <div className="condition-rec-group">
                            <span className="rec-group-label exercise">Movement &amp; Physical Activity:</span>
                            <ul>
                              {cond.recommended_exercise.map((e, i) => (
                                <li key={i}>{renderWithLinks(e)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {cond.exercise_precautions && (
                          <p className="condition-rec-note">
                            <strong>Care Note:</strong> {renderWithLinks(cond.exercise_precautions)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
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
                      <strong>Precautions & Care Notes:</strong>{' '}
                      {precautions.map((p, idx) => (
                        <span key={idx}>
                          {idx > 0 && ' · '}
                          {renderWithLinks(p)}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Doctor Discussion Questions */}
        <div id="doctor-questions-section" className="result-section doctor-questions-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="section-heading"><FileText size={16} /> Questions to Ask Your Doctor</h3>
            <span className="no-print muted" style={{ fontSize: '12px' }}>Checklist for your appointment</span>
          </div>
          <ul className="questions-list checklist">
            {(translated.questions || (doctorQuestions.length ? doctorQuestions : [
              'Could you explain how these results fit with my health and any symptoms?',
              'Are any follow-up tests or routine monitoring appropriate for me?',
            ])).map((question) => (
              <li key={question} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <input type="checkbox" className="question-checkbox" aria-label="Mark question discussed" style={{ marginTop: '4px', cursor: 'pointer' }} />
                <span>{question}</span>
              </li>
            ))}
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
              ) : (
                <pre>{maskText(extractedText)}</pre>
              )}
            </div>
          </div>
        )}

        {/* Educational Disclaimer */}
        <footer className="result-disclaimer">
          <ShieldCheck size={14} />
          <span>{translated.disclaimer || result.disclaimer || DISCLAIMER}</span>
        </footer>

        {/* Interactive AI Health Clarity Assistant Modal */}
        <HealthChatDrawer
          isOpen={showChat}
          onClose={() => setShowChat(false)}
          report={response.report || response.result || response}
          patient={patient}
        />
      </article>
    </div>
  );
}
