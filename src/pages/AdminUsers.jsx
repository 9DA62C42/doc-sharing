import { useEffect, useState } from 'react';
import { supabase, functionErrorMessage } from '../supabaseClient';
import { logAction } from '../lib/documents';
import { useAuth } from '../lib/AuthContext.jsx';
import Collapsible from '../components/Collapsible.jsx';

export default function AdminUsers() {
  const { user: currentUser, isOwner } = useAuth();
  const [users, setUsers] = useState([]);
  const [overrideError, setOverrideError] = useState('');
  const [groups, setGroups] = useState([]);
  const [docs, setDocs] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [memberGroupIds, setMemberGroupIds] = useState(new Set());
  const [overrides, setOverrides] = useState({}); // documentId -> level | 'none'
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: u }, { data: g }, { data: d }] = await Promise.all([
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('groups').select('*').order('name'),
        supabase.from('documents').select('id, title, owner_id').order('title'),
      ]);
      setUsers(u || []);
      setGroups(g || []);
      setDocs(d || []);
      if (u && u.length) setSelectedUserId(u[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    (async () => {
      const [{ data: gm }, { data: dua }] = await Promise.all([
        supabase.from('group_members').select('group_id').eq('user_id', selectedUserId),
        supabase.from('document_user_access').select('document_id, level').eq('user_id', selectedUserId),
      ]);
      setMemberGroupIds(new Set((gm || []).map((r) => r.group_id)));
      const o = {};
      (dua || []).forEach((r) => { o[r.document_id] = r.level; });
      setOverrides(o);
    })();
  }, [selectedUserId]);

  async function toggleGroup(groupId) {
    const isMember = memberGroupIds.has(groupId);
    if (isMember) {
      await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', selectedUserId);
    } else {
      await supabase.from('group_members').insert({ group_id: groupId, user_id: selectedUserId });
    }
    await logAction(null, 'permission_changed', { type: 'group_membership', groupId, userId: selectedUserId });
    setMemberGroupIds((prev) => {
      const next = new Set(prev);
      isMember ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  }

  async function setOverride(documentId, level) {
    setOverrideError('');
    const { error } = level === 'none'
      ? await supabase.from('document_user_access').delete().eq('document_id', documentId).eq('user_id', selectedUserId)
      : await supabase.from('document_user_access').upsert({ document_id: documentId, user_id: selectedUserId, level });
    if (error) { setOverrideError(error.message); return; }
    await logAction(documentId, 'permission_changed', { type: 'user_override', level, userId: selectedUserId });
    setOverrides((prev) => ({ ...prev, [documentId]: level }));
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviteStatus('发送中…');
    const { error } = await supabase.functions.invoke('invite-user', {
      body: {
        email: inviteEmail,
        displayName: inviteName,
        redirectTo: `${window.location.origin}/set-password`,
      },
    });
    if (error) { setInviteStatus(`失败：${await functionErrorMessage(error)}`); return; }
    setInviteStatus(`已向 ${inviteEmail} 发送邀请邮件`);
    setInviteEmail(''); setInviteName('');
  }

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const { data, error } = await supabase.from('groups').insert({ name: newGroupName.trim() }).select().single();
    if (!error) { setGroups((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name))); setNewGroupName(''); }
  }

  async function handleDeleteGroup(group) {
    await supabase.from('groups').delete().eq('id', group.id);
    setGroups((prev) => prev.filter((g) => g.id !== group.id));
  }

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div>
      <div className="card" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <form onSubmit={handleInvite}>
          <div className="section-label">邀请新成员</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="email" placeholder="邮箱" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            <input type="text" placeholder="显示名（可选）" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
            <button className="btn btn-primary" type="submit">邀请</button>
          </div>
          {inviteStatus && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{inviteStatus}</div>}
        </form>
        <form onSubmit={handleCreateGroup}>
          <div className="section-label">新建分组</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="分组名称" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} required />
            <button className="btn" type="submit" style={{ flexShrink: 0 }}>创建</button>
          </div>
          {groups.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {groups.map((g) => (
                <span key={g.id} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {g.name}
                  <span onClick={() => handleDeleteGroup(g)} title="删除这个分组" style={{ cursor: 'pointer', opacity: 0.6 }}>×</span>
                </span>
              ))}
            </div>
          )}
        </form>
      </div>

      <div className="two-col">
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          成员（{users.length}）
        </div>
        {users.map((u) => (
          <div
            key={u.id}
            className={`list-item ${u.id === selectedUserId ? 'active' : ''}`}
            onClick={() => setSelectedUserId(u.id)}
          >
            {u.display_name}{u.is_admin && <span className="pill" style={{ marginLeft: 6 }}>管理员</span>}
          </div>
        ))}
      </div>

      {selectedUser && (
        <div>
          <h3 style={{ marginTop: 0 }}>{selectedUser.display_name}</h3>

          <div className="section-label">
            所属分组（决定默认可见范围）
          </div>
          <div className="card" style={{ marginBottom: 20 }}>
            {groups.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>还没有创建任何分组</div>}
            {groups.map((g) => (
              <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
                <input type="checkbox" checked={memberGroupIds.has(g.id)} onChange={() => toggleGroup(g.id)} style={{ width: 'auto' }} />
                {g.name}
              </label>
            ))}
          </div>

          <Collapsible title="个人覆盖（在分组权限基础上，针对单份文档单独调整；只显示你上传的文档）">
            {overrideError && <div className="error-text" style={{ marginBottom: 8 }}>{overrideError}</div>}
            <div className="card" style={{ padding: 0 }}>
              {docs.filter((doc) => doc.owner_id === currentUser?.id || isOwner).map((doc) => (
                <div key={doc.id} className="doc-row" style={{ gridTemplateColumns: '1fr 160px' }}>
                  <span className="name">{doc.title}</span>
                  <select
                    value={overrides[doc.id] || 'none'}
                    onChange={(e) => setOverride(doc.id, e.target.value)}
                  >
                    <option value="none">无覆盖（跟随分组）</option>
                    <option value="view">仅查看</option>
                    <option value="download">可下载</option>
                    <option value="deny">禁止查看</option>
                  </select>
                </div>
              ))}
              {docs.filter((doc) => doc.owner_id === currentUser?.id || isOwner).length === 0 && (
                <div style={{ padding: 12, fontSize: 13, color: 'var(--muted)' }}>你还没有上传任何文档。</div>
              )}
            </div>
          </Collapsible>
        </div>
      )}
      </div>
    </div>
  );
}
