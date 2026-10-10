import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Filter, Lock,
  RefreshCw, Search, Shield, ShieldAlert, Trash2, UserCheck,
  UserCog, UserPlus, Users, Activity,
} from 'lucide-react';
import { api } from '../api/client';
import { PageHeader, Empty, Modal } from '../components/common/CommonUI';

export function AdminPortal({ session }) {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'audit' | 'overview'
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingUser, setDeletingUser] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const isUserAdmin = session?.is_admin || session?.role === 'admin' || session?.user_email?.toLowerCase() === 'akash.saravanan1797@gmail.com';

  const loadData = () => {
    if (!isUserAdmin) return;
    setLoading(true);
    setError('');
    Promise.all([
      api('/api/admin/overview').catch(() => null),
      api('/api/admin/users').catch(() => []),
      api('/api/admin/audit-logs').catch(() => []),
    ])
      .then(([overviewData, usersData, auditData]) => {
        setOverview(overviewData);
        setUsers(Array.isArray(usersData) ? usersData : []);
        setAuditLogs(Array.isArray(auditData) ? auditData : []);
      })
      .catch((err) => setError(err.message || 'Failed to load administration records.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [isUserAdmin]);

  const handleRoleToggle = async (user) => {
    if (user.email.toLowerCase() === 'akash.saravanan1797@gmail.com') {
      setError('The primary administrator account role cannot be modified.');
      return;
    }
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      setActionBusy(true);
      await api(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      setSuccess(`Updated role for ${user.email} to ${newRole.toUpperCase()}.`);
      setTimeout(() => setSuccess(''), 4000);
      loadData();
    } catch (err) {
      setError(err.message || 'Could not update user role.');
    } finally {
      setActionBusy(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      setActionBusy(true);
      await api(`/api/admin/users/${deletingUser.id}`, { method: 'DELETE' });
      setDeletingUser(null);
      setSuccess(`User ${deletingUser.email} and all associated records deleted.`);
      setTimeout(() => setSuccess(''), 4000);
      loadData();
    } catch (err) {
      setError(err.message || 'Could not delete user account.');
    } finally {
      setActionBusy(false);
    }
  };

  if (!isUserAdmin) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '56px 24px', maxWidth: '600px', margin: '40px auto' }}>
        <div style={{ display: 'inline-flex', padding: '16px', background: '#fee2e2', borderRadius: '50%', color: '#b91c1c', marginBottom: '16px' }}>
          <ShieldAlert size={36} />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px', color: 'var(--ink)' }}>Restricted Access</h2>
        <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
          This page is reserved for the system administrator (<b>akash.saravanan1797@gmail.com</b>). You are currently signed in as standard user <code>{session?.user_email}</code>.
        </p>
        <a className="button primary" href="#/dashboard">Return to Dashboard</a>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.email || '').toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q);
  });

  return (
    <div className="admin-portal-container">
      <PageHeader
        eyebrow="System Administration"
        title="Admin Control Center"
        description="Manage user access, security roles, system throughput, and audit trails."
        action={
          <button type="button" className="button secondary" onClick={loadData} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh Data
          </button>
        }
      />

      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}

      {/* Admin Quick Stat Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '24px' }}>
        <div className="stat-box" style={{ borderTop: '3px solid var(--primary)' }}>
          <small>Total Users</small>
          <strong>{overview?.total_users ?? users.length}</strong>
        </div>
        <div className="stat-box" style={{ borderTop: '3px solid #0284c7' }}>
          <small>Patients Registered</small>
          <strong>{overview?.total_patients ?? 0}</strong>
        </div>
        <div className="stat-box" style={{ borderTop: '3px solid #10b981' }}>
          <small>Reports Analyzed</small>
          <strong>{overview?.total_reports ?? 0}</strong>
        </div>
        <div className="stat-box" style={{ borderTop: '3px solid #f59e0b' }}>
          <small>Active Administrators</small>
          <strong>{overview?.admins_count ?? 1}</strong>
        </div>
      </div>

      {/* Tabs */}
      <div className="sort-toggle-group" style={{ marginBottom: '20px' }}>
        <button
          type="button"
          className={`sort-toggle-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={14} /> Registered Users ({users.length})
        </button>
        <button
          type="button"
          className={`sort-toggle-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <Activity size={14} /> Audit Trail ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: USERS DIRECTORY */}
      {activeTab === 'users' && (
        <section className="panel table-panel">
          <div className="toolbar" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div className="search" style={{ flex: '1', minWidth: '240px' }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search users by email or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)' }}>
              Primary Admin: <b style={{ color: 'var(--primary)' }}>akash.saravanan1797@gmail.com</b>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User Email</th>
                  <th>Role</th>
                  <th>Provider</th>
                  <th>Patients</th>
                  <th>Reports</th>
                  <th>Registered</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const isPrimaryAdmin = user.email.toLowerCase() === 'akash.saravanan1797@gmail.com';
                  return (
                    <tr key={user.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <b>{user.email}</b>
                          {user.display_name && <small className="muted">{user.display_name}</small>}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            background: user.role === 'admin' ? '#fee2e2' : '#f1f5f9',
                            color: user.role === 'admin' ? '#b91c1c' : '#475569',
                            border: `1px solid ${user.role === 'admin' ? '#fecaca' : '#e2e8f0'}`,
                          }}
                        >
                          {user.role || 'user'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', textTransform: 'capitalize' }}>
                          {user.provider || 'local'}
                        </span>
                      </td>
                      <td>{user.patient_count ?? 0}</td>
                      <td>{user.report_count ?? 0}</td>
                      <td>
                        <small className="muted">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                        </small>
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          {!isPrimaryAdmin && (
                            <>
                              <button
                                type="button"
                                className="button secondary small"
                                onClick={() => handleRoleToggle(user)}
                                disabled={actionBusy}
                                title={user.role === 'admin' ? 'Demote to regular user' : 'Promote to admin'}
                                style={{ fontSize: '11px', padding: '4px 8px' }}
                              >
                                {user.role === 'admin' ? 'Make User' : 'Make Admin'}
                              </button>
                              <button
                                type="button"
                                className="button danger small"
                                onClick={() => setDeletingUser(user)}
                                disabled={actionBusy}
                                title="Delete user"
                                style={{
                                  background: '#fee2e2',
                                  color: '#b91c1c',
                                  border: '1px solid #fecaca',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                          {isPrimaryAdmin && (
                            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>Superadmin</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <section className="panel table-panel">
          <div className="section-title">
            <h2>System Audit Logs</h2>
            <span className="muted">Recent security, authentication, and clinical activity</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Resource ID</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <small className="muted">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                      </small>
                    </td>
                    <td><b>{log.user_email}</b></td>
                    <td>
                      <code>{log.action}</code>
                    </td>
                    <td>{log.resource_type || '-'}</td>
                    <td>{log.resource_id ? `#${log.resource_id}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Confirmation Modal for User Deletion */}
      {deletingUser && (
        <Modal title="Confirm User Deletion" onClose={() => !actionBusy && setDeletingUser(null)}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to permanently delete user <b>{deletingUser.email}</b>?
            </p>
            <div className="alert warning" style={{ margin: 0, fontSize: '13px' }}>
              This will permanently delete this account along with all <b>{deletingUser.report_count} reports</b>, <b>{deletingUser.patient_count} patient records</b>, and scheduled reminders.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setDeletingUser(null)}
                disabled={actionBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={confirmDeleteUser}
                disabled={actionBusy}
                style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
              >
                {actionBusy ? 'Deleting...' : 'Delete User Permanently'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
