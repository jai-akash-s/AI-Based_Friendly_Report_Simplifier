import React, { useState, useEffect } from 'react';
import {
  Clock, Plus, CheckCircle2, Circle, Trash2, Calendar,
  AlertCircle, Search, RefreshCw, Check, Sparkles, Filter, AlertTriangle
} from 'lucide-react';
import { api, go } from '../api/client';
import { PageHeader, Empty, Modal } from '../components/common/CommonUI';

export function Reminders({ session }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'completed', 'urgent'
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newTag, setNewTag] = useState('warning');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadReminders = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/reminders');
      if (Array.isArray(data)) {
        setReminders(data);
      }
    } catch (err) {
      setError(err.message || 'Could not load reminders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
  }, []);

  const handleToggle = async (reminder) => {
    const nextStatus = reminder.status === 'completed' ? 'pending' : 'completed';
    try {
      await api(`/api/reminders/${reminder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      setReminders((prev) =>
        prev.map((r) => (r.id === reminder.id ? { ...r, status: nextStatus } : r))
      );
    } catch (err) {
      alert(err.message || 'Could not update reminder.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api(`/api/reminders/${id}`, { method: 'DELETE' });
      setReminders((prev) => prev.filter((r) => r.id !== id));
      setDeletingId(null);
    } catch (err) {
      alert(err.message || 'Could not delete reminder.');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const created = await api('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          due_text: newDue.trim() || 'Scheduled',
          tag: newTag,
          notes: newNotes.trim(),
        }),
      });
      setReminders((prev) => [created, ...prev]);
      setNewTitle('');
      setNewDue('');
      setNewTag('warning');
      setNewNotes('');
      setShowAddModal(false);
    } catch (err) {
      alert(err.message || 'Could not create reminder.');
    } finally {
      setSaving(false);
    }
  };

  // Stats calculation
  const totalCount = reminders.length;
  const pendingList = reminders.filter((r) => r.status !== 'completed');
  const completedList = reminders.filter((r) => r.status === 'completed');
  const urgentCount = pendingList.filter((r) => r.tag === 'warning').length;

  // Filtered list
  const filtered = reminders.filter((item) => {
    if (filter === 'pending' && item.status === 'completed') return false;
    if (filter === 'completed' && item.status !== 'completed') return false;
    if (filter === 'urgent' && (item.tag !== 'warning' || item.status === 'completed')) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = (item.title || '').toLowerCase().includes(q);
      const matchDue = (item.due_text || '').toLowerCase().includes(q);
      const matchNotes = (item.notes || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDue && !matchNotes) return false;
    }
    return true;
  });

  return (
    <div className="reminders-page" style={{ display: 'grid', gap: '24px' }}>
      <PageHeader
        eyebrow="Clinical Tools"
        title="Care Reminders & Follow-ups"
        description="Schedule and track diagnostic test rechecks, prescription follow-ups, and patient care reminders."
        action={
          <button
            type="button"
            className="button primary"
            onClick={() => setShowAddModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} /> New Reminder
          </button>
        }
      />

      {error && (
        <div className="alert danger" role="alert">
          {error}
        </div>
      )}

      {/* Metric Summary Cards */}
      <div className="stats-grid" style={{ marginTop: '0' }}>
        <div className="stat-box accent">
          <small>Total Reminders</small>
          <strong>{totalCount}</strong>
        </div>
        <div className="stat-box">
          <small>Pending Action</small>
          <strong style={{ color: 'var(--primary)' }}>{pendingList.length}</strong>
        </div>
        <div className="stat-box">
          <small>Urgent Attention</small>
          <strong style={{ color: urgentCount > 0 ? '#b45309' : 'var(--ink)' }}>{urgentCount}</strong>
        </div>
        <div className="stat-box">
          <small>Completed</small>
          <strong style={{ color: '#15803d' }}>{completedList.length}</strong>
        </div>
      </div>

      {/* Control bar: search, filters, refresh */}
      <div
        className="panel"
        style={{
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search reminders or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '14px',
              width: '100%',
              color: 'var(--ink)',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-sunken)', padding: '3px', borderRadius: '8px' }}>
            <button
              type="button"
              className={`button small ${filter === 'all' ? 'primary' : 'secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() => setFilter('all')}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              className={`button small ${filter === 'pending' ? 'primary' : 'secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() => setFilter('pending')}
            >
              Pending ({pendingList.length})
            </button>
            <button
              type="button"
              className={`button small ${filter === 'urgent' ? 'primary' : 'secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() => setFilter('urgent')}
            >
              Urgent ({urgentCount})
            </button>
            <button
              type="button"
              className={`button small ${filter === 'completed' ? 'primary' : 'secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() => setFilter('completed')}
            >
              Completed ({completedList.length})
            </button>
          </div>

          <button
            type="button"
            className="button secondary small"
            onClick={loadReminders}
            title="Refresh reminders"
            style={{ padding: '6px 10px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Reminders List Section */}
      <div className="panel" style={{ padding: '24px' }}>
        <div className="section-title" style={{ marginBottom: '16px' }}>
          <div>
            <p className="eyebrow">Active Care Tasks</p>
            <h2>Scheduled Follow-ups</h2>
          </div>
          <span className="status-chip">{filtered.length} shown</span>
        </div>

        {loading && reminders.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
            <Clock size={24} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
            <p>Loading care reminders...</p>
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            icon={<Clock size={36} />}
            title="No reminders found"
            text={
              search
                ? `No reminders match "${search}". Try adjusting your search query.`
                : filter !== 'all'
                ? `No reminders in the "${filter}" category.`
                : 'No care reminders scheduled yet. Add a reminder or analyze reports to generate follow-up notes.'
            }
            action={
              <button
                type="button"
                className="button primary small"
                onClick={() => setShowAddModal(true)}
              >
                <Plus size={14} /> Add First Reminder
              </button>
            }
          />
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {filtered.map((item) => {
              const isDone = item.status === 'completed';
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '14px',
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1px solid var(--line)',
                    background: isDone ? 'var(--surface-sunken)' : 'var(--panel-bg)',
                    opacity: isDone ? 0.75 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleToggle(item)}
                    title={isDone ? 'Mark as pending' : 'Mark as completed'}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      marginTop: '2px',
                      color: isDone ? 'var(--primary)' : 'var(--muted)',
                    }}
                  >
                    {isDone ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        className={`reminder-tag ${item.tag || 'info'}`}
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                      >
                        {item.tag === 'warning' ? 'Urgent' : item.tag === 'success' ? 'Routine' : 'Soon'}
                      </span>
                      <strong
                        style={{
                          fontSize: '15px',
                          color: 'var(--ink)',
                          textDecoration: isDone ? 'line-through' : 'none',
                        }}
                      >
                        {item.title}
                      </strong>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        marginTop: '6px',
                        fontSize: '12px',
                        color: 'var(--muted)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={13} />
                        Due: {item.due_text || 'Upcoming'}
                      </span>
                      {item.notes && (
                        <span>
                          Notes: <em>{item.notes}</em>
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => handleToggle(item)}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      {isDone ? 'Undo' : 'Mark Done'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(item.id)}
                      title="Delete reminder"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                        padding: '6px',
                        borderRadius: '6px',
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Reminder Modal */}
      {showAddModal && (
        <Modal title="Schedule Care Reminder" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleCreate} style={{ display: 'grid', gap: '16px', marginTop: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Reminder Title *
              </label>
              <input
                type="text"
                placeholder="e.g. Follow up for Cold & Fever symptom relief"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                style={{ width: '100%', padding: '8px 12px', fontSize: '14px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Due Timeline
                </label>
                <input
                  type="text"
                  placeholder="e.g. In 3 days, Tomorrow, In 1 week"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Urgency / Priority
                </label>
                <select
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px' }}
                >
                  <option value="warning">Urgent (Immediate attention)</option>
                  <option value="info">Soon (Within a few days)</option>
                  <option value="success">Routine (Standard follow-up)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Clinical Notes (Optional)
              </label>
              <textarea
                placeholder="Add instructions, tests to recheck, or medication directions..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '8px 12px', fontSize: '14px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Reminder'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <Modal title="Delete Care Reminder" onClose={() => setDeletingId(null)}>
          <div style={{ padding: '12px 0' }}>
            <p>Are you sure you want to delete this care reminder? This action cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setDeletingId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => handleDelete(deletingId)}
                style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


