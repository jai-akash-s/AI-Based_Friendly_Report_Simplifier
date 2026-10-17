import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultView, maskSensitiveText } from './ResultView';

// Mock speech synthesis
window.speechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
};

describe('ResultView Component', () => {
  const sampleResponse = {
    patient: {
      full_name: 'John Smith',
      patient_code: 'PAT-2026-JS99',
      age: 52,
      gender: 'Male',
    },
    report: {
      id: 12,
      filename: 'cbc_report.pdf',
      extracted_text: 'Complete Blood Count: Hemoglobin 10.5 g/dL (Low), WBC 6500.',
    },
    result: {
      simplified_summary: 'Your report mentions low Hemoglobin. Please consult your physician.',
      disclaimer: 'Educational summary only; not a diagnosis.',
      lab_results: [
        {
          test_name: 'Hemoglobin',
          value: '10.5',
          unit: 'g/dL',
          status: 'Low',
          reference_range: { low: 13.0, high: 17.0, unit: 'g/dL' },
          meaning: 'Red blood cell oxygen carrier.',
        },
      ],
      entities: [
        {
          entity_text: 'Anemia',
          entity_label: 'DISEASE',
          explanation: 'Lower red blood cell count.',
        },
      ],
      recommendations: {
        aggregated: {
          foods_to_eat: ['Spinach', 'Lentils'],
          foods_to_avoid: ['Excessive black tea'],
        },
      },
      questions_to_ask_doctor: ['Could low iron be causing my fatigue?'],
    },
  };

  it('renders simplified explanation and educational disclaimer', () => {
    render(<ResultView response={sampleResponse} onClose={() => {}} />);
    expect(
      screen.getByText(/Your report mentions low Hemoglobin\. Please consult your physician\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Educational summary only; not a diagnosis\./i)
    ).toBeInTheDocument();
  });

  it('renders export action: Download PDF', () => {
    render(<ResultView response={sampleResponse} onClose={() => {}} />);
    expect(screen.getByText(/Download PDF/i)).toBeInTheDocument();
  });

  it('renders Ask AI button', () => {
    render(<ResultView response={sampleResponse} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /Ask AI/i })).toBeInTheDocument();
  });

  it('masks sensitive patient information when toggle is clicked', () => {
    render(<ResultView response={sampleResponse} onClose={() => {}} />);
    expect(screen.getAllByText('John Smith').length).toBeGreaterThan(0);

    const maskCheckbox = screen.getByLabelText(/Mask name\/ID/i);
    fireEvent.click(maskCheckbox);

    expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
    expect(screen.getAllByText('[MASKED]').length).toBeGreaterThan(0);
  });

  it('tests maskSensitiveText utility function', () => {
    const original = 'Patient John Smith was admitted with code PAT-2026-JS99.';
    const masked = maskSensitiveText(original, true, ['John Smith', 'PAT-2026-JS99']);
    expect(masked).toBe('Patient [MASKED] was admitted with code [MASKED].');

    const unmasked = maskSensitiveText(original, false, ['John Smith']);
    expect(unmasked).toBe(original);
  });

  it('renders patient name, age, blood group, and phone number when present', () => {
    const demoResponse = {
      patient: {
        full_name: 'Mr SARAVANAN N',
        patient_code: 'PAT-2026-J7BV',
        age: '57 Y 10 M 28 D',
        gender: 'Male',
        blood_group: 'O POSITIVE',
        contact_phone: '+91 9876543210',
      },
      report: { id: 16 },
      result: {
        simplified_summary: 'Report summary',
      },
    };
    render(<ResultView response={demoResponse} onClose={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: /Mr SARAVANAN N/i })).toBeInTheDocument();
    expect(screen.getAllByText(/57 Y 10 M 28 D/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Blood: O POSITIVE/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Phone: \+91 9876543210/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Age N\/A/i)).not.toBeInTheDocument();
  });

  it('falls back to extracting name and age from report text when dummy name is provided', () => {
    const fallbackResponse = {
      patient: {
        full_name: 'Report: WhatsApp_Image_2026-10-09.jpeg',
      },
      report: {
        id: 16,
        extracted_text: 'Hospital Name\nName : Mr SARAVANAN N\nAge/Gender : 57 Y 10 M 28 D/ Male\nBlood Group: B+\nPhone: 7904596229',
      },
      result: {
        simplified_summary: 'All findings normal.',
      },
    };
    render(<ResultView response={fallbackResponse} onClose={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: /Mr SARAVANAN N/i })).toBeInTheDocument();
    expect(screen.getAllByText(/57 Y 10 M 28 D/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Blood: B\+/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Phone: 7904596229/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Age N\/A/i)).not.toBeInTheDocument();
  });
});
