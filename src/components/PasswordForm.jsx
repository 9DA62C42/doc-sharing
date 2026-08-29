import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function PasswordForm({ title, hint, onSuccess, submitLabel = '保存' }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('密码至少 8 位'); return; }
    if (password !== confirm) { setError('两次输入的密码不一致'); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    onSuccess?.();
  }

  return (
    <div className="card" style={{ maxWidth: 360, margin: '60px auto' }}>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--font-serif)' }}>{title}</h2>
      {hint && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{hint}</p>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label>新密码（至少 8 位）</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label>确认新密码</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
          {loading ? '保存中…' : submitLabel}
        </button>
      </form>
    </div>
  );
}
