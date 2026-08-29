import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { logAction, deleteDocument, uploadNewVersion, applyFolderTemplate } from '../lib/documents';
import { useAuth } from '../lib/AuthContext.jsx';

export default function AdminDocuments() {
  const { user: currentUser, isOwner } = useAuth();
  const [docs, setDocs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [folders, setFolders] = useState([]);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [applyResult, setApplyResult] = useState('');
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [groupLevels, setGroupLevels] = useState({}); // groupId -> level | 'none'
  const [userOverrides, setUserOverrides] = useState({}); // userId -> level | 'none'
  const [specialConditions, setSpecialConditions] = useState('');
  const [savingConditions, setSavingConditions] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [versionError, setVersionError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: g }, { data: u }, { data: f }] = await Promise.all([
        supabase.from('documents').select('id, title, special_conditions, storage_path, current_version, tags, owner_id, folder_id').order('title'),
        supabase.from('groups').select('*').order('name'),
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('folders').select('*').order('name'),
      ]);
      setDocs(d || []);
      setGroups(g || []);
      setUsers(u || []);
      setFolders(f || []);
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
      const doc = docs.find((d) => d.id === selectedDocId);
      setSpecialConditions(doc?.special_conditions || '');
      setTagsInput((doc?.tags || []).join(', '));
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

  async function handleUploadVersion(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingVersion(true);
    setVersionError('');
    try {
      const updated = await uploadNewVersion(selectedDoc, file);
      setDocs((prev) => prev.map((d) => (d.id === selectedDocId ? { ...d, ...updated } : d)));
    } catch (err) {
      setVersionError(err.message);
    } finally {
      setUploadingVersion(false);
      e.target.value = '';
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

  async function setFolder(folderId) {
    setApplyResult('');
    const value = folderId || null;
    const { error } = await supabase.from('documents').update({ folder_id: value }).eq('id', selectedDocId);
    if (error) return;
    await logAction(selectedDocId, 'permission_changed', { type: 'folder', folderId: value });
    setDocs((prev) => prev.map((d) => (d.id === selectedDocId ? { ...d, folder_id: value } : d)));
  }

  async function handleApplyTemplate() {
    setApplyingTemplate(true);
    setApplyResult('');
    try {
      await applyFolderTemplate(selectedDocId, selectedDoc.folder_id);
      const [{ data: dga }, { data: dua }] = await Promise.all([
        supabase.from('document_group_access').select('group_id, level').eq('document_id', selectedDocId),
        supabase.from('document_user_access').select('user_id, level').eq('document_id', selectedDocId),
      ]);
      const gl = {}; (dga || []).forEach((r) => { gl[r.group_id] = r.level; });
      const ul = {}; (dua || []).forEach((r) => { ul[r.user_id] = r.level; });
      setGroupLevels(gl);
      setUserOverrides(ul);
      setApplyResult('已套用文件夹的默认权限模板。');
    } catch (err) {
      setApplyResult(`套用失败：${err.message}`);
    } finally {
      setApplyingTemplate(false);
    }
  }

  async function saveTags() {
    setSavingTags(true);
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from('documents').update({ tags }).eq('id', selectedDocId);
    setSavingTags(false);
    if (error) return;
    await logAction(selectedDocId, 'permission_changed', { type: 'tags' });
    setDocs((prev) => prev.map((d) => (d.id === selectedDocId ? { ...d, tags } : d)));
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
  const canManagePermissions = !!selectedDoc && (selectedDoc.owner_id === currentUser?.id || isOwner);
  const ownerName = selectedDoc ? (users.find((u) => u.id === selectedDoc.owner_id)?.display_name || '未知用户') : '';

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
            onClick={() => { setSelectedDocId(d.id); setConfirmingDelete(false); setDeleteError(''); setVersionError(''); setApplyResult(''); }}
          >
            {d.title}
          </div>
        ))}
      </div>

      {selectedDoc && (
        <div className="card">
          <div className="panel-section" style={{ marginTop: 0, paddingTop: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ margin: 0 }}>
                {selectedDoc.title}
                <span className="pill" style={{ marginLeft: 8 }}>v{selectedDoc.current_version}</span>
              </h3>
              {confirmingDelete ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>确认删除？不可恢复</span>
                  <button className="btn btn-danger" disabled={deleting} onClick={handleDelete}>
                    {deleting ? '删除中…' : '确认删除'}
                  </button>
                  <button className="btn" disabled={deleting} onClick={() => setConfirmingDelete(false)}>取消</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <label className="btn" style={{ cursor: 'pointer' }}>
                    {uploadingVersion ? '上传中…' : '上传新版本'}
                    <input type="file" style={{ display: 'none' }} onChange={handleUploadVersion} disabled={uploadingVersion} />
                  </label>
                  <button className="btn btn-danger" onClick={() => setConfirmingDelete(true)}>删除文档</button>
                </div>
              )}
            </div>
            {deleteError && <div className="error-text" style={{ marginTop: 8 }}>{deleteError}</div>}
            {versionError && <div className="error-text" style={{ marginTop: 8 }}>{versionError}</div>}
          </div>

          {canManagePermissions ? (
            <>
              <div className="panel-section">
                <div className="section-label">分组权限</div>
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

              <div className="panel-section">
                <div className="section-label">个人覆盖</div>
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
            </>
          ) : (
            <div className="panel-section">
              <div className="section-label">分享范围</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                此文档由 {ownerName} 上传，只有上传人或站长可以查看和设置分享范围。
              </div>
            </div>
          )}

          <div className="panel-section">
            <div className="section-label">所属文件夹</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={selectedDoc.folder_id || ''} onChange={(e) => setFolder(e.target.value)}>
                <option value="">未分类</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              {selectedDoc.folder_id && (
                <button className="btn" disabled={!canManagePermissions || applyingTemplate} onClick={handleApplyTemplate} style={{ flexShrink: 0 }}>
                  {applyingTemplate ? '套用中…' : '套用文件夹权限'}
                </button>
              )}
            </div>
            {selectedDoc.folder_id && !canManagePermissions && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                只有此文档的上传人或站长能套用文件夹权限模板。
              </div>
            )}
            {applyResult && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{applyResult}</div>}
          </div>

          <div className="panel-section">
            <div className="section-label">标签（逗号分隔，用于文档列表页筛选）</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="例如：财务, 合同" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
              <button className="btn" disabled={savingTags} onClick={saveTags} style={{ flexShrink: 0 }}>
                {savingTags ? '保存中…' : '保存'}
              </button>
            </div>
          </div>

          <div className="panel-section">
            <div className="section-label">特殊分享条件（展示在该文档的查看/下载页面上，留空则不展示）</div>
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
