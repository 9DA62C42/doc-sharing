import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function AdminKnowledgeBase() {
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [groupIds, setGroupIds] = useState(new Set());
  const [userOverrides, setUserOverrides] = useState({}); // userId -> 'allow' | 'deny' | 'none'

  useEffect(() => {
    (async () => {
      const [{ data: g }, { data: u }, { data: kga }, { data: kua }] = await Promise.all([
        supabase.from('groups').select('*').order('name'),
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('kb_group_access').select('group_id'),
        supabase.from('kb_user_access').select('user_id, allowed'),
      ]);
      setGroups(g || []);
      setUsers(u || []);
      setGroupIds(new Set((kga || []).map((r) => r.group_id)));
      const o = {};
      (kua || []).forEach((r) => { o[r.user_id] = r.allowed ? 'allow' : 'deny'; });
      setUserOverrides(o);
    })();
  }, []);

  async function toggleGroup(groupId) {
    const isMember = groupIds.has(groupId);
    if (isMember) {
      await supabase.from('kb_group_access').delete().eq('group_id', groupId);
    } else {
      await supabase.from('kb_group_access').insert({ group_id: groupId });
    }
    setGroupIds((prev) => {
      const next = new Set(prev);
      isMember ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  }

  async function setUserOverride(userId, value) {
    if (value === 'none') {
      await supabase.from('kb_user_access').delete().eq('user_id', userId);
    } else {
      await supabase.from('kb_user_access').upsert({ user_id: userId, allowed: value === 'allow' });
    }
    setUserOverrides((prev) => ({ ...prev, [userId]: value }));
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>知识库访问权限</h3>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          控制谁能在侧边栏看到"知识库"入口。站长自己始终可见；管理员没有特殊待遇，
          和普通成员一样需要被明确授权（分组或个人）。
        </div>
      </div>

      <div className="section-label">按分组授权（分组内任意成员可见）</div>
      <div className="card" style={{ marginBottom: 20 }}>
        {groups.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>还没有创建任何分组</div>}
        {groups.map((g) => (
          <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
            <input type="checkbox" checked={groupIds.has(g.id)} onChange={() => toggleGroup(g.id)} style={{ width: 'auto' }} />
            {g.name}
          </label>
        ))}
      </div>

      <div className="section-label">个人覆盖（deny 优先于分组授权）</div>
      <div className="card" style={{ padding: 0 }}>
        {users.map((u) => (
          <div key={u.id} className="doc-row" style={{ gridTemplateColumns: '1fr 160px' }}>
            <span className="name">{u.display_name}{u.is_owner && <span className="pill" style={{ marginLeft: 6 }}>站长</span>}</span>
            <select
              disabled={u.is_owner}
              value={userOverrides[u.id] || 'none'}
              onChange={(e) => setUserOverride(u.id, e.target.value)}
            >
              <option value="none">无覆盖（跟随分组）</option>
              <option value="allow">允许</option>
              <option value="deny">禁止</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
