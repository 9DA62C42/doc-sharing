import { supabase } from '../supabaseClient';

// 生成一个短期有效的签名 URL 用于预览/下载（比公开 bucket 更安全）
export async function getSignedUrl(storagePath, expiresInSeconds = 300) {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function logAction(documentId, action, detail = null) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return;
  await supabase.from('access_logs').insert({
    document_id: documentId,
    user_id: userId,
    action,
    detail,
  });
}

export async function deleteDocument(doc) {
  const { error: storageError } = await supabase.storage.from('documents').remove([doc.storage_path]);
  if (storageError) throw storageError;
  const { error: deleteError } = await supabase.from('documents').delete().eq('id', doc.id);
  if (deleteError) throw deleteError;
  // 文档行已经删掉了，access_logs.document_id 会因外键约束拒绝指向一个不存在的文档，
  // 所以这条记录用 document_id: null，把文档信息放进 detail 里留痕。
  await logAction(null, 'delete', { documentId: doc.id, title: doc.title });
}

// 上传新版本：先把当前文件归档成一条历史记录，再把 documents 表指向新文件。
export async function uploadNewVersion(doc, file) {
  const archivedVersion = doc.current_version || 1;
  const { error: archiveError } = await supabase.from('document_versions').insert({
    document_id: doc.id,
    version_number: archivedVersion,
    storage_path: doc.storage_path,
    file_type: doc.file_type,
    size_bytes: doc.size_bytes,
  });
  if (archiveError) throw archiveError;

  const nextVersion = archivedVersion + 1;
  const storagePath = `${doc.id}/v${nextVersion}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, { upsert: true });
  if (uploadError) throw uploadError;

  const fileType = file.name.split('.').pop();
  const { error: updateError } = await supabase
    .from('documents')
    .update({
      storage_path: storagePath,
      file_type: fileType,
      size_bytes: file.size,
      current_version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', doc.id);
  if (updateError) throw updateError;

  await logAction(doc.id, 'upload', { type: 'new_version', version: nextVersion });
  return { storage_path: storagePath, file_type: fileType, size_bytes: file.size, current_version: nextVersion };
}

export async function listVersions(documentId) {
  const { data } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false });
  return data || [];
}

// 把文件夹的默认权限模板"套用一次"到某份文档上：复制模板当前的分组权限/个人覆盖，
// upsert 进这份文档自己的 document_group_access / document_user_access。
// 之后文件夹模板再变，不会影响这份已经套用过的文档——该文档的权限记录就是它自己的了。
export async function applyFolderTemplate(documentId, folderId) {
  const [{ data: groupTemplate }, { data: userTemplate }] = await Promise.all([
    supabase.from('folder_group_access').select('group_id, level').eq('folder_id', folderId),
    supabase.from('folder_user_access').select('user_id, level').eq('folder_id', folderId),
  ]);

  if (groupTemplate?.length) {
    const { error } = await supabase.from('document_group_access').upsert(
      groupTemplate.map((row) => ({ document_id: documentId, group_id: row.group_id, level: row.level }))
    );
    if (error) throw error;
  }
  if (userTemplate?.length) {
    const { error } = await supabase.from('document_user_access').upsert(
      userTemplate.map((row) => ({ document_id: documentId, user_id: row.user_id, level: row.level }))
    );
    if (error) throw error;
  }

  await logAction(documentId, 'permission_changed', { type: 'apply_folder_template', folderId });
}

export async function uploadDocument(file, title) {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData?.user?.id;

  // 先建文档记录拿到 id，再用这个 id 当 Storage 里的文件夹名，
  // 这样 storage 的 RLS policy 才能反查 documents 表判断权限。
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      title,
      storage_path: '', // 占位，插入后马上补上
      file_type: file.name.split('.').pop(),
      size_bytes: file.size,
      owner_id: ownerId,
    })
    .select()
    .single();
  if (docError) throw docError;

  const storagePath = `${doc.id}/${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase
    .from('documents')
    .update({ storage_path: storagePath, updated_at: new Date().toISOString() })
    .eq('id', doc.id);
  if (updateError) throw updateError;

  await logAction(doc.id, 'upload');
  return doc.id;
}
