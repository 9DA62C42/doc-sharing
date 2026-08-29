import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getSignedUrl, logAction, listVersions } from '../lib/documents';
import Collapsible from '../components/Collapsible.jsx';

const PREVIEWABLE = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'];

function formatSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export default function DocumentDetail() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [canDownload, setCanDownload] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: docData, error: docError } = await supabase
        .from('documents').select('*, profiles!documents_owner_id_fkey(display_name)').eq('id', id).single();
      if (docError) { setError('无法访问该文档（可能已被移除权限）'); return; }
      setDoc(docData);

      const { data: userData } = await supabase.auth.getUser();
      const { data: allowDownload } = await supabase.rpc('has_document_access', {
        p_document_id: id,
        p_user_id: userData.user.id,
        p_min_level: 'download',
      });
      setCanDownload(!!allowDownload);

      if (PREVIEWABLE.includes(docData.file_type)) {
        const url = await getSignedUrl(docData.storage_path);
        setPreviewUrl(url);
      }
      setVersions(await listVersions(id));
      await logAction(id, 'view');
    })();
  }, [id]);

  async function handleDownload() {
    const url = await getSignedUrl(doc.storage_path, 60);
    await logAction(id, 'download');
    window.open(url, '_blank');
  }

  async function handleDownloadVersion(v) {
    const url = await getSignedUrl(v.storage_path, 60);
    await logAction(id, 'download', { version: v.version_number });
    window.open(url, '_blank');
  }

  if (error) return <div className="empty">{error}</div>;
  if (!doc) return null;

  return (
    <div>
      <Link to="/" style={{ fontSize: 13 }}>← 返回文档列表</Link>
      <div className="two-col" style={{ gridTemplateColumns: '1fr 300px', marginTop: 12 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0 }}>
              {doc.title}
              {doc.current_version > 1 && <span className="pill" style={{ marginLeft: 8 }}>v{doc.current_version}</span>}
            </h2>
            {canDownload ? (
              <button className="btn btn-primary" onClick={handleDownload}>下载</button>
            ) : (
              <span className="pill">仅可查看，无下载权限</span>
            )}
          </div>

          {previewUrl ? (
            doc.file_type === 'pdf' ? (
              <iframe src={previewUrl} title={doc.title} style={{ width: '100%', height: 600, border: 'none', marginTop: 16 }} />
            ) : (
              <img src={previewUrl} alt={doc.title} style={{ maxWidth: '100%', marginTop: 16 }} />
            )
          ) : (
            <div className="empty" style={{ marginTop: 16 }}>
              该格式暂不支持在线预览（{doc.file_type}），请下载后查看。
            </div>
          )}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-label">上传人</div>
            <div style={{ fontSize: 14 }}>{doc.profiles?.display_name || '未知用户'}</div>

            {doc.special_conditions && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 'var(--radius)', background: 'var(--hero-tint)' }}>
                <div style={{ fontSize: 13, color: 'var(--hero-dark)', marginBottom: 6, fontWeight: 500 }}>
                  特殊分享条件
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{doc.special_conditions}</div>
              </div>
            )}
          </div>

          {versions.length > 0 && (
            <div className="card">
              <Collapsible title={`历史版本（${versions.length}）`}>
                {versions.map((v) => (
                  <div key={v.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 500 }}>v{v.version_number}</span>
                      <span className="meta">{formatSize(v.size_bytes)}</span>
                    </div>
                    <div className="meta" style={{ marginTop: 2 }}>{new Date(v.created_at).toLocaleString()}</div>
                    {canDownload && (
                      <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadVersion(v); }} style={{ fontSize: 12 }}>下载此版本</a>
                    )}
                  </div>
                ))}
              </Collapsible>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
