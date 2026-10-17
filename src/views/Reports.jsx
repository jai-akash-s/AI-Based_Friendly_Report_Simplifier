import React, { useState, useEffect } from 'react';
import {
  ArrowDownAZ, ArrowUpAZ, ArrowUpDown, Calendar, Download, FileText, Printer,
  Search, Sparkles, UploadCloud, UserRound, X,
} from 'lucide-react';
import { api } from '../api/client';
import { PageHeader, Empty } from '../components/common/CommonUI';
import { ResultView } from '../components/reports/ResultView';

export function Reports() {
  const [reports, setReports] = useState([]);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('newest');
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => {
    let active = true;
    api('/api/reports')
      .then((data) => {
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

  const filtered = reports.filter((report) => {
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
        entities: report.entities?.map((e) => ({
          ...e,
          text: e.entity_text,
          label: e.entity_label,
          explanation: e.explanation || '',
        })) || [],
        recommendations: {
          aggregated: {
            foods_to_eat: Array.from(new Set((report.recommendations || []).flatMap((r) => r.foods_to_eat || []))),
            foods_to_avoid: Array.from(new Set((report.recommendations || []).flatMap((r) => r.foods_to_avoid || []))),
            recommended_exercise: Array.from(new Set((report.recommendations || []).flatMap((r) => r.recommended_exercise || []))),
            general_precautions: Array.from(new Set((report.recommendations || []).map((r) => r.exercise_precautions).filter(Boolean))),
          },
        },
      },
      patient: report.patient || null,
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
              onChange={(event) => setQuery(event.target.value)}
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

            <select
              className="sort-select-mobile"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
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
            {sortedReports.map((report) => (
              <article className="history-card" key={report.id}>
                <span className="history-icon"><FileText /></span>
                <div style={{ flex: 1 }}>
                  <h3>{report.filename || 'Pasted medical report'}</h3>
                  <p>{report.extracted_text?.slice(0, 130) || 'No extracted text'}...</p>
                  <small>{report.created_at ? new Date(report.created_at).toLocaleString() : 'Date unavailable'}</small>
                </div>
                <div className="history-actions">
                  <button type="button" className="button secondary small" onClick={() => openReport(report)} title="View & Print Report">
                    <Printer size={15} /> View &amp; Print
                  </button>
                  {report.patient_id && <a href={`#/patients/${report.patient_id}`} title="View patient"><UserRound size={17} /></a>}
                  {report.file_path && <a href={`/reports/${report.id}/download`} title="Download original file"><Download size={17} /></a>}
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
