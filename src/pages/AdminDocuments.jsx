import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { logAction, deleteDocument } from '../lib/documents';

export default function AdminDocuments() {
  const [docs, setDocs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [groupLevels, setGroupLevels] = useState({}); // groupId -> level | 'none'
  const [userOverrides, setUserOverrides] = useState({}); // userId -> level | 'none'
  const [specialConditions, setSpecialConditions] = useState('');
  const [savingConditions, setSavingConditions] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: g }, { data: u }] = await Promise.all([
        supabase.from('documents').select('id, title, special_conditions, storage_path').order('title'),
        supabase.from('groups').select('*').order('name'),
        supabase.from('profiles').select('*').order('display_name'),
      ]);
      setDocs(d || []);
      setGroups(g || []);
      setUsers(u || []);
      if (d && d.length) setSelectedDocId(d[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selectedDocId) return;
    (async () => {
      const [{ data: dga }, { data: dua }] = await Promise.all([
        supabase.from('document_group_access').select('group_id, level').eq('document_id', selectedDocId),
        supabase.from('document_user_access').select('user_id, level').eq('document_id', selectedDocId),
      ]);
      const gl = {}; (dga || []).forEach((r) => { gl[r.group_id] = r.level; });
      const ul = {}; (dua || []).forEach((r) => { ul[r.user_id] = r.level; });
      setGroupLevels(gl);
      setUserOverrides(ul);
      setSpecialConditions(docs.find((d) => d.id === selectedDocId)?.special_conditions || '');
    })();
  }, [selectedDocId]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteDocument(selectedDoc);
      setDocs((prev) => prev.filter((d) => d.id !== selectedDocId));
      setSelectedDocId(null);
      setConfirmingDelete(false);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  async function saveSpecialConditions() {
    setSavingConditions(true);
    const value = specialConditions.trim() || null;
    const { error } = await supabase.from('documents').update({ special_conditions: value }).eq('id', selectedDocId);
    setSavingConditions(false);
    if (error) return;
    await logAction(selectedDocId, 'permission_changed', { type: 'special_conditions' });
    setDocs((prev) => prev.map((d) => (d.id === selectedDocId ? { ...d, special_conditions: value } : d)));
  }

  async function setGroupLevel(groupId, level) {
    if (level === 'none') {
      await supabase.from('document_group_access').delete().eq('document_id', selectedDocId).eq('group_id', groupId);
    } else {
      await supabase.from('document_group_access').upsert({ document_id: selectedDocId, group_id: groupId, level });
    }
    await logAction(selectedDocId, 'permission_changed', { type: 'group_access', groupId, level });
    setGroupLevels((prev) => ({ ...prev, [groupId]: level }));
  }

  async function setUserOverride(userId, level) {
    if (level === 'none') {
      await supabase.from('document_user_access').delete().eq('document_id', selectedDocId).eq('user_id', userId);
    } else {
      await supabase.from('document_user_access').upsert({ document_id: selectedDocId, user_id: userId, level });
    }
    await logAction(selectedDocId, 'permission_changed', { type: 'user_override', userId, level });
    setUserOverrides((prev) => ({ ...prev, [userId]: level }));
  }

  const selectedDoc = docs.find((d) => d.id === selectedDocId);

  return (
    <div className="two-col">
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          文档（{docs.length}）
        </div>
        {docs.map((d) => (
          <div
            key={d.id}
            className={`list-item ${d.id === selectedDocId ? 'active' : ''}`}
            onClick={() => { setSelectedDocId(d.id); setConfirmingDelete(false); setDeleteError(''); }}
          >
            {d.title}
          </div>
        ))}
      </div>

      {selectedDoc && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', margin: 0 }}>{selectedDoc.title}</h3>
            {confirmingDelete ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>确认删除？不可恢复</span>
                <button className="btn btn-danger" disabled={deleting} onClick={handleDelete}>
                  {deleting ? '删除中…' : '确认删除'}
                </button>
                <button className="btn" disabled={deleting} onClick={() => setConfirmingDelete(false)}>取消</button>
              </div>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirmingDelete(true)}>删除文档</button>
            )}
          </div>
          {deleteError && <div className="error-text" style={{ marginBottom: 12 }}>{deleteError}</div>}

          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            分组权限
          </div>
          <div className="card" style={{ padding: 0, marginBottom: 20 }}>
            {groups.map((g) => (
              <div key={g.id} className="doc-row" style={{ gridTemplateColumns: '1fr 160px' }}>
                <span className="name">{g.name}</span>
                <select value={groupLevels[g.id] || 'none'} onChange={(e) => setGroupLevel(g.id, e.target.value)}>
                  <option value="none">不可见</option>
                  <option value="view">仅查看</option>
                  <option value="download">可下载</option>
                </select>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            个人覆盖
          </div>
          <div className="card" style={{ padding: 0 }}>
            {users.map((u) => (
              <div key={u.id} className="doc-row" style={{ gridTemplateColumns: '1fr 160px' }}>
                <span className="name">{u.display_name}</span>
                <select value={userOverrides[u.id] || 'none'} onChange={(e) => setUserOverride(u.id, e.target.value)}>
                  <option value="none">无覆盖（跟随分组）</option>
                  <option value="view">仅查看</option>
                  <option value="download">可下载</option>
                  <option value="deny">禁止查看</option>
                </select>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '20px 0 6px' }}>
            特殊分享条件（展示在该文档的查看/下载页面上，留空则不展示）
          </div>
          <div className="card">
            <textarea
              value={specialConditions}
              onChange={(e) => setSpecialConditions(e.target.value)}
              placeholder="例如：本文档为 AI Skill，二次分享前需征得同意，输出成果需在文末署名「XXX」；或：本 .tex 源文件仅供本人编译使用，不得再分发源文件本身。"
              rows={4}
              style={{
                width: '100%', fontFamily: 'var(--font-sans)', fontSize: 14, padding: '8px 10px',
                border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
                background: 'var(--surface)', color: 'var(--text)', resize: 'vertical',
              }}
            />
            <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={savingConditions} onClick={saveSpecialConditions}>
              {savingConditions ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
