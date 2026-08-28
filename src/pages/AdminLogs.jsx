import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const ACTION_LABEL = {
  view: '查看',
  download: '下载',
  upload: '上传',
  permission_changed: '权限变更',
  delete: '删除',
};

export default function AdminLogs() {
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('access_logs')
        .select('*, profiles(display_name), documents(title)')
        .order('created_at', { ascending: false })
        .limit(200);
      setLogs(data || []);
    })();
  }, []);

  if (logs === null) return null;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="doc-row" style={{ gridTemplateColumns: '140px 100px 1fr 1fr', color: 'var(--muted)', fontSize: 12 }}>
        <span>时间</span><span>操作</span><span>用户</span><span>文档</span>
      </div>
      {logs.length === 0 && <div className="empty">暂无日志</div>}
      {logs.map((log) => (
        <div key={log.id} className="doc-row" style={{ gridTemplateColumns: '140px 100px 1fr 1fr' }}>
          <span className="meta">{new Date(log.created_at).toLocaleString('zh-CN')}</span>
          <span>{ACTION_LABEL[log.action] || log.action}</span>
          <span>{log.profiles?.display_name || '—'}</span>
          <span>{log.documents?.title || '—'}</span>
        </div>
      ))}
    </div>
  );
}
