import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getSignedUrl, logAction } from '../lib/documents';

const PREVIEWABLE = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'];

export default function DocumentDetail() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [canDownload, setCanDownload] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: docData, error: docError } = await supabase
        .from('documents').select('*').eq('id', id).single();
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
      await logAction(id, 'view');
    })();
  }, [id]);

  async function handleDownload() {
    const url = await getSignedUrl(doc.storage_path, 60);
    await logAction(id, 'download');
    window.open(url, '_blank');
  }

  if (error) return <div className="empty">{error}</div>;
  if (!doc) return null;

  return (
    <div>
      <Link to="/" style={{ fontSize: 13 }}>← 返回文档列表</Link>
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', margin: 0 }}>{doc.title}</h2>
          {canDownload ? (
            <button className="btn btn-primary" onClick={handleDownload}>下载</button>
          ) : (
            <span className="pill">仅可查看，无下载权限</span>
          )}
        </div>

        {doc.special_conditions && (
          <div className="card" style={{ marginTop: 16, background: 'var(--hero-tint)', borderColor: 'var(--hero)' }}>
            <div style={{ fontSize: 12, color: 'var(--hero-dark)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, fontWeight: 600 }}>
              特殊分享条件
            </div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{doc.special_conditions}</div>
          </div>
        )}

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
    </div>
  );
}
