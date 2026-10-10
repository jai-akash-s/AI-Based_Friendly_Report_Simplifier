import React, { useState, useEffect } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../../api/client';

export function LabTrendChart({ patientId, reports }) {
  const [selectedTest, setSelectedTest] = useState('');
  const [trend, setTrend] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const availableTests = [...new Set(
    reports.flatMap((report) => (report.lab_results || []).map((result) => result.test_name).filter(Boolean)),
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
      .then((data) => {
        if (active) setTrend(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load laboratory history.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [patientId, testName]);

  if (!availableTests.length) return null;

  const chartData = (trend?.points || []).map((point) => ({
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
          <select value={testName} onChange={(event) => setSelectedTest(event.target.value)}>
            {availableTests.map((test) => (
              <option key={test} value={test}>{test}</option>
            ))}
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
              <Tooltip formatter={(value, _name, item) => [`${value} ${item.payload.unit || ''}`, trend?.test_name]} />
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
