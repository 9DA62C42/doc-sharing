import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';
import { CURRENT_POLICY_VERSION, POLICIES } from '../lib/policies.js';

export default function Terms() {
  const { user, hasAgreedTerms, agreementChecked, refreshAgreement } = useAuth();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (agreementChecked && hasAgreedTerms) return <Navigate to="/" replace />;

  async function handleAgree() {
    setSubmitting(true);
    setError('');
    const { error } = await supabase.from('policy_agreements').insert({
      user_id: user.id,
      policy_version: CURRENT_POLICY_VERSION,
    });
    setSubmitting(false);
    if (error) { setError(error.message); return; }
    await refreshAgreement();
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>使用前请阅读并同意以下条款</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          条款版本更新后需要重新同意一次，之后不会再重复弹出，直到下一次版本更新。
        </p>
      </div>

      {POLICIES.map((p) => (
        <div key={p.key} className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>{p.title}</h3>
          <pre style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-sans)',
            fontSize: 13, lineHeight: 1.7, maxHeight: 320, overflowY: 'auto',
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: 14, margin: 0,
          }}>
            {p.text}
          </pre>
        </div>
      ))}

      <div className="card">
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text)' }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} />
          我已阅读并同意以上全部条款
        </label>
        {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
        <button
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          disabled={!checked || submitting}
          onClick={handleAgree}
        >
          {submitting ? '提交中…' : '同意并继续'}
        </button>
      </div>
    </div>
  );
}
