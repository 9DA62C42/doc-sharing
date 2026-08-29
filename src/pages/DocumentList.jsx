import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { uploadDocument } from '../lib/documents';
import { useAuth } from '../lib/AuthContext.jsx';

function formatSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export default function DocumentList() {
  const { isAdmin } = useAuth();
  const [docs, setDocs] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState(null);

  async function load() {
    // RLS 已经在数据库层过滤好了：这里查出来的就是当前用户能看到的全部文档
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) setError(error.message);
    else setDocs(data);
  }

  useEffect(() => { load(); }, []);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await uploadDocument(file, file.name);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (docs === null) return null;

  const allTags = [...new Set(docs.flatMap((d) => d.tags || []))].sort();
  const filteredDocs = docs.filter((d) => {
    const matchesQuery = !query || d.title.toLowerCase().includes(query.toLowerCase());
    const matchesTag = !activeTag || (d.tags || []).includes(activeTag);
    return matchesQuery && matchesTag;
  });

  return (
    <div>
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            {uploading ? '上传中…' : '上传文档'}
            <input type="file" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      )}

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      {docs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="搜索文档名称…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ borderRadius: 999, marginBottom: allTags.length ? 10 : 0 }}
          />
          {allTags.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span
                className="pill"
                style={{ cursor: 'pointer', ...(activeTag === null ? { background: 'var(--hero-tint)', color: 'var(--hero-dark)' } : {}) }}
                onClick={() => setActiveTag(null)}
              >
                全部
              </span>
              {allTags.map((tag) => (
                <span
                  key={tag}
                  className="pill"
                  style={{ cursor: 'pointer', ...(activeTag === tag ? { background: 'var(--hero-tint)', color: 'var(--hero-dark)' } : {}) }}
                  onClick={() => setActiveTag(tag)}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="empty">还没有你能看到的文档。上传一份，或者联系管理员开权限。</div>
      ) : filteredDocs.length === 0 ? (
        <div className="empty">没有匹配的文档。</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="doc-row" style={{ color: 'var(--muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
            <span>名称</span><span>类型</span><span>大小</span><span></span>
          </div>
          {filteredDocs.map((doc) => (
            <div className="doc-row" key={doc.id}>
              <Link className="name" to={`/documents/${doc.id}`}>{doc.title}</Link>
              <span className="meta">{doc.file_type}</span>
              <span className="meta">{formatSize(doc.size_bytes)}</span>
              <span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
