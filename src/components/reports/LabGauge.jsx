import React, { useState } from 'react';

/**
 * Parses numeric value from strings like "14.2", "140 mg/dL", "< 5.7"
 */
function parseNumeric(val) {
  if (val == null) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const match = String(val).match(/[-+]?[0-9]*\.?[0-9]+/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * Extracts low and high limits from reference_range (object or string)
 */
function extractLimits(refRange) {
  if (!refRange) return { low: null, high: null, type: 'none' };

  if (typeof refRange === 'object') {
    const low = parseNumeric(refRange.low);
    const high = parseNumeric(refRange.high);
    if (low != null || high != null) {
      return { low, high, type: 'range' };
    }
  }

  const str = String(refRange).trim();

  // Pattern: "< 5.7" or "<= 100"
  const upperMatch = str.match(/^[<≤]\s*([0-9.]+)/);
  if (upperMatch) {
    return { low: 0, high: parseFloat(upperMatch[1]), type: 'upper_only' };
  }

  // Pattern: "> 60" or ">= 90"
  const lowerMatch = str.match(/^[>≥]\s*([0-9.]+)/);
  if (lowerMatch) {
    return { low: parseFloat(lowerMatch[1]), high: null, type: 'lower_only' };
  }

  // Pattern: "70 - 99" or "70 to 110" or "70-99"
  const rangeMatch = str.match(/([0-9.]+)\s*(?:-|–|—|to)\s*([0-9.]+)/i);
  if (rangeMatch) {
    return { low: parseFloat(rangeMatch[1]), high: parseFloat(rangeMatch[2]), type: 'range' };
  }

  return { low: null, high: null, type: 'unknown' };
}

export function LabGauge({ lab }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const val = parseNumeric(lab.value);
  const { low, high, type } = extractLimits(lab.reference_range);
  const status = String(lab.status || '').trim().toLowerCase();

  // If no numeric value or limits cannot be parsed, fallback to clean badge
  if (val == null || (low == null && high == null)) {
    return (
      <div className="lab-gauge-compact">
        <span className={`lab-status-badge ${status || 'unknown'}`}>
          {lab.status || 'Recorded'}
        </span>
      </div>
    );
  }

  // Calculate position mapping
  let positionPct = 50;
  let zone = 'normal';

  if (type === 'range' && low != null && high != null && high > low) {
    const span = high - low;
    const pad = span * 0.35;
    const minBound = Math.max(0, low - pad);
    const maxBound = high + pad;

    if (val < low) {
      zone = val < low - pad * 0.7 ? 'critical' : 'low';
      // Low zone occupies 0% to 28%
      const ratio = Math.max(0, (val - minBound) / Math.max(0.1, low - minBound));
      positionPct = Math.max(4, ratio * 28);
    } else if (val > high) {
      zone = val > high + pad * 0.7 ? 'critical' : 'high';
      // High zone occupies 72% to 96%
      const ratio = Math.min(1, (val - high) / Math.max(0.1, maxBound - high));
      positionPct = Math.min(96, 72 + ratio * 24);
    } else {
      zone = 'normal';
      // Normal zone occupies 28% to 72%
      const ratio = (val - low) / span;
      positionPct = 28 + ratio * 44;
    }
  } else if (type === 'upper_only' && high != null) {
    if (val <= high) {
      zone = 'normal';
      positionPct = Math.max(8, (val / high) * 60);
    } else {
      zone = val > high * 1.3 ? 'critical' : 'high';
      positionPct = Math.min(96, 60 + ((val - high) / (high * 0.5)) * 36);
    }
  } else if (type === 'lower_only' && low != null) {
    if (val >= low) {
      zone = 'normal';
      positionPct = Math.min(92, 40 + ((val - low) / Math.max(1, low * 0.5)) * 50);
    } else {
      zone = val < low * 0.7 ? 'critical' : 'low';
      positionPct = Math.max(6, (val / low) * 40);
    }
  }

  const zoneClasses = {
    critical: 'zone-critical',
    low: 'zone-low',
    high: 'zone-high',
    normal: 'zone-normal',
  };

  const statusLabel =
    status === 'high' ? 'High' :
    status === 'low' ? 'Low' :
    status === 'normal' ? 'Optimal' :
    zone === 'critical' ? 'Critical' :
    zone === 'high' ? 'High' :
    zone === 'low' ? 'Low' : 'Optimal';

  const markerColor =
    zone === 'critical' ? '#dc2626' :
    zone === 'high' ? '#f59e0b' :
    zone === 'low' ? '#3b82f6' : '#10b981';

  return (
    <div
      className="interactive-lab-gauge"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(!showTooltip)}
      role="region"
      aria-label={`${lab.test_name} gauge: ${val} ${lab.unit || ''}, status ${statusLabel}`}
    >
      <div className="gauge-status-row">
        <span className={`lab-status-badge ${zoneClasses[zone] || 'normal'}`}>
          {statusLabel}
        </span>
        <span className="gauge-val-caption">
          <strong>{val}</strong> {lab.unit || ''}
        </span>
      </div>

      <div className="gauge-track-wrapper">
        <div className="gauge-track">
          <div className="gauge-segment low" title={`Low range (< ${low ?? ''})`} />
          <div className="gauge-segment optimal" title={`Optimal range (${low ?? 0} – ${high ?? ''})`} />
          <div className="gauge-segment high" title={`High range (> ${high ?? ''})`} />
        </div>

        {/* Marker pin */}
        <div
          className="gauge-pin"
          style={{ left: `${positionPct}%`, backgroundColor: markerColor }}
        >
          <div className="gauge-pin-core" />
        </div>
      </div>

      <div className="gauge-bounds-row">
        <span>{low != null ? `${low}` : ''}</span>
        <span className="gauge-label-mid">Normal Range</span>
        <span>{high != null ? `${high}` : ''}</span>
      </div>

      {showTooltip && (
        <div className="gauge-tooltip">
          <div><strong>Your value:</strong> {val} {lab.unit || ''}</div>
          <div><strong>Optimal limits:</strong> {low != null ? low : '0'} – {high != null ? high : 'N/A'} {lab.unit || ''}</div>
          <small>Status: {statusLabel}</small>
        </div>
      )}
    </div>
  );
}
