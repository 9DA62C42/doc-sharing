import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { logAction } from '../lib/documents';
import { useAuth } from '../lib/AuthContext.jsx';

const STATUS_LABEL = { active: '正常', suspended: '已暂停', terminated: '已销号' };

function StatusPill({ status }) {
  if (status === 'active') return null;
  return <span className={`pill ${status === 'terminated' ? 'pill-deny' : ''}`} style={{ marginLeft: 6 }}>{STATUS_LABEL[status]}</span>;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function AdminAccounts() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // 'suspend' | 'terminate' | null
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('display_name');
    const others = (data || []).filter((u) => u.id !== currentUser?.id);
    setUsers(others);
    if (others.length && !selectedUserId) setSelectedUserId(others[0].id);
  }

  useEffect(() => { load(); }, [currentUser]);

  function startAction(action) {
    setError('');
    setReason('');
    setPendingAction(action);
  }

  function cancelAction() {
    setPendingAction(null);
    setReason('');
  }

  async function runAction(action, targetUserId, actionReason) {
    setBusy(true);
    setError('');
    const { data, error } = await supabase.functions.invoke('manage-account', {
      body: { userId: targetUserId, action, reason: actionReason || undefined },
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    await logAction(null, 'account_status_changed', { targetUserId, action, reason: actionReason || null });
    setUsers((prev) => prev.map((u) => (
      u.id === targetUserId
        ? { ...u, account_status: data.account_status, status_reason: actionReason || null, status_changed_at: new Date().toISOString() }
        : u
    )));
    setPendingAction(null);
    setReason('');
  }

  async function confirmWithReason() {
    if (!reason.trim()) { setError('请填写理由'); return; }
    await runAction(pendingAction, selectedUserId, reason.trim());
  }

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="two-col">
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          成员（{users.length}）
        </div>
        {users.map((u) => (
          <div
            key={u.id}
            className={`list-item ${u.id === selectedUserId ? 'active' : ''}`}
            onClick={() => { setSelectedUserId(u.id); cancelAction(); setError(''); }}
          >
            {u.display_name}
            <StatusPill status={u.account_status} />
          </div>
        ))}
      </div>

      {selectedUser && (
        <div>
          <h3 style={{ marginTop: 0 }}>
            {selectedUser.display_name}
            <StatusPill status={selectedUser.account_status} />
          </h3>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-label">
              当前状态
            </div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>{STATUS_LABEL[selectedUser.account_status]}</div>
            {selectedUser.status_changed_at && (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                上次变更：{formatDateTime(selectedUser.status_changed_at)}
                {selectedUser.status_reason && <> · 理由：{selectedUser.status_reason}</>}
              </div>
            )}
          </div>

          <div className="card">
            {selectedUser.account_status === 'active' && (
              pendingAction === 'suspend' ? (
                <ReasonBox
                  label="暂停理由（必填）"
                  reason={reason}
                  setReason={setReason}
                  busy={busy}
                  onConfirm={confirmWithReason}
                  onCancel={cancelAction}
                />
              ) : (
                <button className="btn btn-danger" onClick={() => startAction('suspend')}>暂停</button>
              )
            )}

            {selectedUser.account_status === 'suspended' && (
              pendingAction === 'terminate' ? (
                <ReasonBox
                  label="销号理由（必填）"
                  reason={reason}
                  setReason={setReason}
                  busy={busy}
                  onConfirm={confirmWithReason}
                  onCancel={cancelAction}
                />
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy} onClick={() => runAction('reinstate', selectedUser.id)}>恢复正常</button>
                  <button className="btn btn-danger" onClick={() => startAction('terminate')}>销号</button>
                </div>
              )
            )}

            {selectedUser.account_status === 'terminated' && (
              <button className="btn" disabled={busy} onClick={() => runAction('lift_termination', selectedUser.id)}>撤销销号</button>
            )}

            {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function ReasonBox({ label, reason, setReason, busy, onConfirm, onCancel }) {
  return (
    <div>
      <label>{label}</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        style={{
          width: '100%', fontFamily: 'var(--font-sans)', fontSize: 14, padding: '8px 10px',
          border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
          background: 'var(--surface)', color: 'var(--text)', resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" disabled={busy} onClick={onConfirm}>确认</button>
        <button className="btn" disabled={busy} onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
