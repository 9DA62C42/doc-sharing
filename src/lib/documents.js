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
