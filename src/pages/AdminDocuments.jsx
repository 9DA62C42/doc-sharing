import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { logAction, deleteDocument, uploadNewVersion, applyFolderTemplate } from '../lib/documents';
import { useAuth } from '../lib/AuthContext.jsx';
import Collapsible from '../components/Collapsible.jsx';

export default function AdminDocuments() {
  const { user: currentUser, isOwner } = useAuth();
  const [docs, setDocs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [folders, setFolders] = useState([]);
  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [tagError, setTagError] = useState('');
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [applyResult, setApplyResult] = useState('');
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [groupLevels, setGroupLevels] = useState({}); // groupId -> level | 'none'
  const [userOverrides, setUserOverrides] = useState({}); // userId -> level | 'none'
  const [specialConditions, setSpecialConditions] = useState('');
  const [savingConditions, setSavingConditions] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [versionError, setVersionError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: g }, { data: u }, { data: f }, { data: t }] = await Promise.all([
        supabase.from('documents').select('id, title, special_conditions, storage_path, current_version, tags, owner_id, folder_id').order('title'),
        supabase.from('groups').select('*').order('name'),
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('folders').select('*').order('name'),
        supabase.from('tags').select('*').order('name'),
      ]);
      setDocs(d || []);
      setGroups(g || []);
      setUsers(u || []);
      setFolders(f || []);
      setTags(t || []);
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

  async function toggleTag(tagName) {
    const current = selectedDoc.tags || [];
    const next = current.includes(tagName) ? current.filter((t) => t !== tagName) : [...current, tagName];
    const { error } = await supabase.from('documents').update({ tags: next }).eq('id', selectedDocId);
    if (error) return;
    await logAction(selectedDocId, 'permission_changed', { type: 'tags' });
    setDocs((prev) => prev.map((d) => (d.id === selectedDocId ? { ...d, tags: next } : d)));
  }

  async function handleCreateTag(e) {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setTagError('');
    const { data, error } = await supabase.from('tags').insert({ name: newTagName.trim() }).select().single();
    if (error) { setTagError(error.message); return; }
    setTags((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewTagName('');
  }

  async function handleDeleteTag(tag) {
    await supabase.from('tags').delete().eq('id', tag.id);
    setTags((prev) => prev.filter((t) => t.id !== tag.id));
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
            <h3 style={{ margin: 0 }}>
              {selectedDoc.title}
              <span className="pill" style={{ marginLeft: 8 }}>v{selectedDoc.current_version}</span>
            </h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>上传人：{ownerName}</div>
          </div>

          {!canManagePermissions ? (
            <div className="panel-section">
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                这份文档由 {ownerName} 上传，只有上传人或站长能查看和管理它——分享范围、标签、特殊分享条件、
                所属文件夹、删除、上传新版本都不对你开放。
              </div>
            </div>
          ) : (
            <>
              <div className="panel-section">
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  {confirmingDelete ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>确认删除？不可恢复</span>
                      <button className="btn btn-danger" disabled={deleting} onClick={handleDelete}>
                        {deleting ? '删除中…' : '确认删除'}
                      </button>
                      <button className="btn" disabled={deleting} onClick={() => setConfirmingDelete(false)}>取消</button>
                    </div>
                  ) : (
                    <>
                      <label className="btn" style={{ cursor: 'pointer' }}>
                        {uploadingVersion ? '上传中…' : '上传新版本'}
                        <input type="file" style={{ display: 'none' }} onChange={handleUploadVersion} disabled={uploadingVersion} />
                      </label>
                      <button className="btn btn-danger" onClick={() => setConfirmingDelete(true)}>删除文档</button>
                    </>
                  )}
                </div>
                {deleteError && <div className="error-text" style={{ marginTop: 8 }}>{deleteError}</div>}
                {versionError && <div className="error-text" style={{ marginTop: 8 }}>{versionError}</div>}
              </div>

              <div className="panel-section">
                <div className="two-col" style={{ gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
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

                    <div style={{ marginTop: 16 }}>
                      <Collapsible title="个人覆盖">
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
                      </Collapsible>
                    </div>
                  </div>

                  <div>
                    <Collapsible title="所属文件夹">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select value={selectedDoc.folder_id || ''} onChange={(e) => setFolder(e.target.value)}>
                          <option value="">未分类</option>
                          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        {selectedDoc.folder_id && (
                          <button className="btn" disabled={applyingTemplate} onClick={handleApplyTemplate} style={{ flexShrink: 0 }}>
                            {applyingTemplate ? '套用中…' : '套用文件夹权限'}
                          </button>
                        )}
                      </div>
                      {applyResult && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{applyResult}</div>}
                    </Collapsible>

                    <div style={{ marginTop: 16 }}>
                      <Collapsible title="标签">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                          {tags.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>还没有标签</span>}
                          {tags.map((t) => {
                            const checked = (selectedDoc.tags || []).includes(t.name);
                            return (
                              <label
                                key={t.id}
                                className="pill"
                                style={{
                                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                                  ...(checked ? { background: 'var(--hero-tint)', color: 'var(--hero-dark)' } : {}),
                                }}
                              >
                                <input type="checkbox" checked={checked} onChange={() => toggleTag(t.name)} style={{ width: 'auto' }} />
                                {t.name}
                                <span
                                  onClick={(e) => { e.preventDefault(); handleDeleteTag(t); }}
                                  title="删除这个标签（不影响已经打过标签的文档）"
                                  style={{ marginLeft: 2, opacity: 0.6 }}
                                >
                                  ×
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <form onSubmit={handleCreateTag} style={{ display: 'flex', gap: 8 }}>
                          <input type="text" placeholder="新建标签" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} />
                          <button className="btn" type="submit" style={{ flexShrink: 0 }}>新建</button>
                        </form>
                        {tagError && <div className="error-text" style={{ marginTop: 6 }}>{tagError}</div>}
                      </Collapsible>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <Collapsible title="特殊分享条件">
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
                      </Collapsible>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
