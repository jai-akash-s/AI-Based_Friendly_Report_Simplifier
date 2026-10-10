import React, { useState, useEffect } from 'react';
import { ArrowRight, Trash2, UserRoundPlus, UsersRound } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader, Empty, Modal } from '../components/common/CommonUI';

export function Patients() {
  const [patients, setPatients] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [deletingPatient, setDeletingPatient] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api('/patients/api/list')
      .then((data) => setPatients(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || 'Could not load patients.'));
  };

  useEffect(() => {
    let active = true;
    api('/patients/api/list')
      .then((data) => {
        if (active) setPatients(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load patients.');
      });
    return () => {
      active = false;
    };
  }, []);

  const add = async (event) => {
    event.preventDefault();
    try {
      await api('/patients/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const confirmDelete = async () => {
    if (!deletingPatient) return;
    setIsDeleting(true);
    try {
      await api(`/patients/api/${deletingPatient.id}`, { method: 'DELETE' });
      setDeletingPatient(null);
      load();
    } catch (err) {
      setError(err.message || 'Could not delete patient record.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Care workspace"
        title="Patient directory"
        description="Keep patient records and report history organized in one quiet workspace."
        action={
          <button type="button" className="button primary" onClick={() => setShowAdd(true)}>
            <UserRoundPlus size={17} /> Add patient
          </button>
        }
      />
      {error && <div className="alert error">{error}</div>}
      <section className="panel table-panel">
        <div className="section-title">
          <h2>All patient records</h2>
          <span className="muted">{patients.length} records</span>
        </div>
        {patients.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Code</th>
                  <th>Age / gender</th>
                  <th>Blood group</th>
                  <th>Reports</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id}>
                    <td>
                      <b>{patient.full_name}</b>
                      <small>{patient.contact_email || patient.contact_phone || 'No contact details'}</small>
                    </td>
                    <td><code>{patient.patient_code}</code></td>
                    <td>{patient.age || '-'} / {patient.gender || '-'}</td>
                    <td>{patient.blood_group || '-'}</td>
                    <td>{patient.report_count} reports</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                        <a className="text-link" href={`#/patients/${patient.id}`}>
                          View <ArrowRight size={14} />
                        </a>
                        <button
                          type="button"
                          className="button small"
                          title={`Delete ${patient.full_name}`}
                          onClick={() => setDeletingPatient(patient)}
                          style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fecaca',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11.5px',
                            borderRadius: '6px',
                            fontWeight: 600,
                          }}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<UsersRound />}
            title="Your directory is ready"
            text="Add a patient to start connecting reports to a record."
          />
        )}
      </section>
      {showAdd && (
        <Modal title="Add patient" onClose={() => setShowAdd(false)}>
          <form onSubmit={add} className="modal-form">
            <label>Full name<input name="full_name" required /></label>
            <div className="two-col">
              <label>Age<input name="age" type="number" /></label>
              <label>Gender<input name="gender" /></label>
            </div>
            <div className="two-col">
              <label>Blood group<input name="blood_group" /></label>
              <label>Phone<input name="contact_phone" /></label>
            </div>
            <label>Email<input name="contact_email" type="email" /></label>
            <button type="submit" className="button primary">Save patient</button>
          </form>
        </Modal>
      )}
      {deletingPatient && (
        <Modal title="Delete patient record" onClose={() => !isDeleting && setDeletingPatient(null)}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--navy)' }}>
              Are you sure you want to delete <b>{deletingPatient.full_name}</b> (<code>{deletingPatient.patient_code}</code>)?
            </p>
            <div className="alert warning" style={{ margin: 0, fontSize: '13px' }}>
              This will permanently delete this patient record along with all <b>{deletingPatient.report_count || 0} associated reports</b>, uploaded files, and scheduled reminders.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setDeletingPatient(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={confirmDelete}
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
