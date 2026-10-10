import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle, Trash2, Calendar, AlertCircle, Clock } from 'lucide-react';
import { api } from '../../api/client';

export function ReminderPanel({ initialReminders = [], onUpdated }) {
  const [reminders, setReminders] = useState(initialReminders);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newTag, setNewTag] = useState('warning');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadReminders();
  }, []);

  const loadReminders = async () => {
    try {
      const data = await api('/api/reminders');
      if (Array.isArray(data)) {
        setReminders(data);
        if (onUpdated) onUpdated(data);
      }
    } catch (err) {
      console.warn('Could not load reminders:', err);
    }
  };

  const toggleStatus = async (reminder) => {
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
      console.warn('Could not update reminder status:', err);
    }
  };

  const deleteReminder = async (id, e) => {
    e.stopPropagation();
    try {
      await api(`/api/reminders/${id}`, { method: 'DELETE' });
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.warn('Could not delete reminder:', err);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const created = await api('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          due_text: newDue.trim() || 'Upcoming',
          tag: newTag,
        }),
      });
      setReminders((prev) => [created, ...prev]);
      setNewTitle('');
      setNewDue('');
      setShowAdd(false);
    } catch (err) {
      alert(err.message || 'Could not add reminder.');
    } finally {
      setBusy(false);
    }
  };

  const pendingReminders = reminders.filter((r) => r.status !== 'completed');

  return (
    <div className="panel reminder-panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">Follow-up</p>
          <h2>Patient Reminders</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="status-chip">{pendingReminders.length} due</span>
          <button
            type="button"
            className="button secondary small"
            style={{ padding: '4px 8px', fontSize: '12px' }}
            onClick={() => setShowAdd(!showAdd)}
            title="Add a new reminder"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="reminder-add-form" style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface-sunken, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border, #e2e8f0)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              placeholder="Reminder (e.g. Schedule Lipid Panel retest)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              style={{ width: '100%', fontSize: '13px', padding: '6px 10px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Due (e.g. In 2 weeks)"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                style={{ flex: 1, fontSize: '13px', padding: '6px 10px' }}
              />
              <select
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                style={{ width: '100px', fontSize: '13px', padding: '6px' }}
              >
                <option value="warning">Urgent</option>
                <option value="info">Soon</option>
                <option value="success">Routine</option>
              </select>
              <button type="submit" className="button primary small" disabled={busy}>
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      {reminders.length === 0 ? (
        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--muted, #64748b)', fontSize: '13px' }}>
          <Clock size={20} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
          <p>No active reminders. Uploading reports with abnormal findings will auto-create follow-up notes here.</p>
        </div>
      ) : (
        <ul className="reminder-list">
          {reminders.slice(0, 6).map((item) => (
            <li
              className={`reminder-item ${item.status === 'completed' ? 'completed' : ''}`}
              key={item.id}
              onClick={() => toggleStatus(item)}
              style={{ cursor: 'pointer', opacity: item.status === 'completed' ? 0.6 : 1 }}
              title="Click to toggle completed"
            >
              <span className={`reminder-tag ${item.tag || 'info'}`}>
                {item.status === 'completed' ? 'Done' : item.tag === 'warning' ? 'Soon' : 'Next'}
              </span>
              <div style={{ flex: 1 }}>
                <strong style={{ textDecoration: item.status === 'completed' ? 'line-through' : 'none' }}>
                  {item.title}
                </strong>
                <small>{item.due_text || 'Upcoming follow-up'}</small>
              </div>
              <button
                type="button"
                className="reminder-delete-btn"
                onClick={(e) => deleteReminder(item.id, e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted, #94a3b8)', padding: '4px' }}
                title="Delete reminder"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
