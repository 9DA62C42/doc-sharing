import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { CURRENT_POLICY_VERSION } from '../lib/policies.js';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pendingUsers, setPendingUsers] = useState([]);

  useEffect(() => {
    (async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: profiles }, { data: agreements }, specialDocs, suspended, recentChanges] = await Promise.all([
        supabase.from('profiles').select('id, display_name'),
        supabase.from('policy_agreements').select('user_id').eq('policy_version', CURRENT_POLICY_VERSION),
        supabase.from('documents').select('id', { count: 'exact', head: true }).not('special_conditions', 'is', null),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'suspended'),
        supabase.from('access_logs').select('id', { count: 'exact', head: true }).eq('action', 'permission_changed').gte('created_at', sevenDaysAgo),
      ]);

      const agreedIds = new Set((agreements || []).map((a) => a.user_id));
      const pending = (profiles || []).filter((p) => !agreedIds.has(p.id));

      setPendingUsers(pending);
      setStats({
        pendingTerms: pending.length,
        specialConditionDocs: specialDocs.count || 0,
        suspendedAccounts: suspended.count || 0,
        recentPermissionChanges: recentChanges.count || 0,
      });
    })();
  }, []);

  if (!stats) return null;

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card"><div className="n">{stats.pendingTerms}</div><div className="l">未同意最新条款</div></div>
        <div className="stat-card"><div className="n">{stats.specialConditionDocs}</div><div className="l">含特殊分享条件的文档</div></div>
        <div className="stat-card"><div className="n">{stats.suspendedAccounts}</div><div className="l">已暂停账号</div></div>
        <div className="stat-card"><div className="n">{stats.recentPermissionChanges}</div><div className="l">近 7 天权限变更</div></div>
      </div>

      {pendingUsers.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
            未同意最新条款的成员（{pendingUsers.length}）
          </div>
          {pendingUsers.map((u) => (
            <div key={u.id} className="doc-row" style={{ gridTemplateColumns: '1fr' }}>
              <span className="name">{u.display_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
