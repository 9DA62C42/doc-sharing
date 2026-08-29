import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';

export default function AdminFolders() {
  const { user: currentUser, isOwner } = useAuth();
  const [folders, setFolders] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [groupLevels, setGroupLevels] = useState({});
  const [userOverrides, setUserOverrides] = useState({});
  const [newFolderName, setNewFolderName] = useState('');
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: f }, { data: g }, { data: u }] = await Promise.all([
        supabase.from('folders').select('*').order('name'),
        supabase.from('groups').select('*').order('name'),
        supabase.from('profiles').select('*').order('display_name'),
      ]);
      setFolders(f || []);
      setGroups(g || []);
      setUsers(u || []);
      if (f && f.length) setSelectedFolderId(f[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selectedFolderId) return;
    (async () => {
      const [{ data: fga }, { data: fua }] = await Promise.all([
        supabase.from('folder_group_access').select('group_id, level').eq('folder_id', selectedFolderId),
        supabase.from('folder_user_access').select('user_id, level').eq('folder_id', selectedFolderId),
      ]);
      const gl = {}; (fga || []).forEach((r) => { gl[r.group_id] = r.level; });
      const ul = {}; (fua || []).forEach((r) => { ul[r.user_id] = r.level; });
      setGroupLevels(gl);
      setUserOverrides(ul);
    })();
  }, [selectedFolderId]);

  async function handleCreateFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreateError('');
    const { data, error } = await supabase
      .from('folders')
      .insert({ name: newFolderName.trim(), owner_id: currentUser.id })
      .select()
      .single();
    if (error) { setCreateError(error.message); return; }
    setFolders((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewFolderName('');
    setSelectedFolderId(data.id);
  }

  async function setGroupLevel(groupId, level) {
    if (level === 'none') {
      await supabase.from('folder_group_access').delete().eq('folder_id', selectedFolderId).eq('group_id', groupId);
    } else {
      await supabase.from('folder_group_access').upsert({ folder_id: selectedFolderId, group_id: groupId, level });
    }
    setGroupLevels((prev) => ({ ...prev, [groupId]: level }));
  }

  async function setUserOverride(userId, level) {
    if (level === 'none') {
      await supabase.from('folder_user_access').delete().eq('folder_id', selectedFolderId).eq('user_id', userId);
    } else {
      await supabase.from('folder_user_access').upsert({ folder_id: selectedFolderId, user_id: userId, level });
    }
    setUserOverrides((prev) => ({ ...prev, [userId]: level }));
  }

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);
  const canManage = !!selectedFolder && (selectedFolder.owner_id === currentUser?.id || isOwner);

  return (
    <div className="two-col">
      <div>
        <form onSubmit={handleCreateFolder} className="card" style={{ marginBottom: 16 }}>
          <div className="section-label">新建文件夹</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="文件夹名称" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} required />
            <button className="btn" type="submit" style={{ flexShrink: 0 }}>创建</button>
          </div>
          {createError && <div className="error-text" style={{ marginTop: 8 }}>{createError}</div>}
        </form>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
            文件夹（{folders.length}）
          </div>
          {folders.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--muted)' }}>还没有文件夹</div>}
          {folders.map((f) => (
            <div key={f.id} className={`list-item ${f.id === selectedFolderId ? 'active' : ''}`} onClick={() => setSelectedFolderId(f.id)}>
              {f.name}
            </div>
          ))}
        </div>
      </div>

      {selectedFolder && (
        <div className="card">
          <div className="panel-section" style={{ marginTop: 0, paddingTop: 0 }}>
            <h3 style={{ margin: 0 }}>{selectedFolder.name}</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              创建人：{users.find((u) => u.id === selectedFolder.owner_id)?.display_name || '未知用户'}
            </div>
          </div>

          <div className="panel-section">
            <div className="section-label">
              默认分组权限（文档需要手动"套用"才会实际生效；文件夹权限之后再变，不影响已经套用过的文档）
            </div>
            {!canManage && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                只有创建这个文件夹的人或站长能改默认权限模板。
              </div>
            )}
            {groups.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>还没有创建任何分组</div>}
            {groups.map((g) => (
              <div key={g.id} className="doc-row" style={{ gridTemplateColumns: '1fr 160px' }}>
                <span className="name">{g.name}</span>
                <select disabled={!canManage} value={groupLevels[g.id] || 'none'} onChange={(e) => setGroupLevel(g.id, e.target.value)}>
                  <option value="none">不可见</option>
                  <option value="view">仅查看</option>
                  <option value="download">可下载</option>
                </select>
              </div>
            ))}
          </div>

          <div className="panel-section">
            <div className="section-label">默认个人覆盖</div>
            {users.map((u) => (
              <div key={u.id} className="doc-row" style={{ gridTemplateColumns: '1fr 160px' }}>
                <span className="name">{u.display_name}</span>
                <select disabled={!canManage} value={userOverrides[u.id] || 'none'} onChange={(e) => setUserOverride(u.id, e.target.value)}>
                  <option value="none">无覆盖（跟随分组）</option>
                  <option value="view">仅查看</option>
                  <option value="download">可下载</option>
                  <option value="deny">禁止查看</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
