import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabGauge } from './LabGauge';

describe('LabGauge Component', () => {
  const sampleLabHigh = {
    test_name: 'Glucose',
    value: 145,
    unit: 'mg/dL',
    status: 'High',
    reference_range: { low: 70, high: 99, unit: 'mg/dL' },
    meaning: 'Fasting blood sugar level.',
  };

  const sampleLabNormal = {
    test_name: 'Hemoglobin',
    value: 14.5,
    unit: 'g/dL',
    status: 'Normal',
    reference_range: { low: 12.0, high: 16.0, unit: 'g/dL' },
    meaning: 'Oxygen carrying protein in red blood cells.',
  };

  const sampleLabLow = {
    test_name: 'Platelets',
    value: 120,
    unit: '10^3/uL',
    status: 'Low',
    reference_range: { low: 150, high: 450, unit: '10^3/uL' },
    meaning: 'Clotting cells.',
  };

  it('renders test value, unit, and aria-label correctly', () => {
    render(<LabGauge lab={sampleLabHigh} />);
    expect(screen.getByText('145')).toBeInTheDocument();
    expect(screen.getByText('mg/dL')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Glucose gauge: 145 mg\/dL, status High/i })
    ).toBeInTheDocument();
  });

  it('displays the correct status badge for High value', () => {
    render(<LabGauge lab={sampleLabHigh} />);
    expect(screen.getByText(/High/i)).toBeInTheDocument();
  });

  it('displays Normal/Optimal status badge when value is in range', () => {
    render(<LabGauge lab={sampleLabNormal} />);
    expect(screen.getByText(/Optimal/i)).toBeInTheDocument();
    expect(screen.getByText('14.5')).toBeInTheDocument();
  });

  it('displays Low status badge when value is below range', () => {
    render(<LabGauge lab={sampleLabLow} />);
    expect(screen.getByText(/Low/i)).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('renders reference range boundary markers', () => {
    render(<LabGauge lab={sampleLabNormal} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });
});
