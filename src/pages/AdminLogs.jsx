import { useEffect, useMemo, useState } from 'react';
import { supabase, functionErrorMessage } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';

const ACTION_LABEL = {
  view: '查看',
  download: '下载',
  upload: '上传',
  permission_changed: '权限变更',
  delete: '删除',
  account_status_changed: '账号状态变更',
};

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export default function AdminLogs() {
  const { isOwner } = useAuth();
  const [logs, setLogs] = useState(null);
  const [users, setUsers] = useState([]);
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: u }] = await Promise.all([
        supabase
          .from('access_logs')
          .select('*, profiles!access_logs_user_id_fkey(display_name), documents!access_logs_document_id_fkey(title)')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('profiles').select('id, display_name').order('display_name'),
      ]);
      setLogs(l || []);
      setUsers(u || []);
    })();
  }, []);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter((log) => (
      (userFilter === 'all' || log.user_id === userFilter)
      && (actionFilter === 'all' || log.action === actionFilter)
    ));
  }, [logs, userFilter, actionFilter]);

  async function handleExport() {
    setExporting(true);
    setExportError('');
    const userIds = [...new Set(filteredLogs.map((log) => log.user_id).filter(Boolean))];
    let emails = {};
    if (userIds.length) {
      const { data, error } = await supabase.functions.invoke('list-user-emails', { body: { userIds } });
      if (error) { setExportError(await functionErrorMessage(error)); setExporting(false); return; }
      emails = data.emails || {};
    }

    const header = ['时间', '操作类型', '操作人', '邮箱', '涉及文档', '详情'];
    const rows = filteredLogs.map((log) => [
      new Date(log.created_at).toLocaleString('zh-CN'),
      ACTION_LABEL[log.action] || log.action,
      log.profiles?.display_name || '—',
      emails[log.user_id] || '—',
      log.documents?.title || '—',
      log.detail ? JSON.stringify(log.detail) : '',
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `访问日志_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  if (logs === null) return null;

  return (
    <div>
      {!isOwner && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          你看到的是范围受限的日志：自己的操作记录，以及涉及你上传文档的记录。完整日志只有站长能看。
        </div>
      )}
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px' }}>
          <label>按用户筛选</label>
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="all">全部用户</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label>按操作类型筛选</label>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">全部操作</option>
            {Object.entries(ACTION_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={exporting} onClick={handleExport}>
          {exporting ? '导出中…' : `导出为 CSV（${filteredLogs.length} 条）`}
        </button>
      </div>
      {exportError && <div className="error-text" style={{ marginBottom: 12 }}>{exportError}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="doc-row" style={{ gridTemplateColumns: '140px 100px 1fr 1fr 1fr', color: 'var(--muted)', fontSize: 12 }}>
          <span>时间</span><span>操作类型</span><span>操作人</span><span>涉及文档</span><span>详情</span>
        </div>
        {filteredLogs.length === 0 && <div className="empty">没有符合筛选条件的日志</div>}
        {filteredLogs.map((log) => (
          <div key={log.id} className="doc-row" style={{ gridTemplateColumns: '140px 100px 1fr 1fr 1fr' }}>
            <span className="meta">{new Date(log.created_at).toLocaleString('zh-CN')}</span>
            <span>{ACTION_LABEL[log.action] || log.action}</span>
            <span>{log.profiles?.display_name || '—'}</span>
            <span>{log.documents?.title || '—'}</span>
            <span className="meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.detail ? JSON.stringify(log.detail) : ''}>
              {log.detail ? JSON.stringify(log.detail) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
