-- ═══════════════════════════════════════════════════════════════
-- 增量更新：文档管理（标签/特殊条件/文件夹归属/删除/上传新版本）
-- 收紧为只有上传人或站长能做，不再对任意管理员开放。
-- 如果你的 Supabase 项目已经跑过一次 schema.sql，只需要跑这一段。
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "documents_update_owner_or_admin" on public.documents;
create policy "documents_update_owner_or_site_owner" on public.documents
  for update using (
    owner_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );

drop policy if exists "documents_delete_owner_or_admin" on public.documents;
create policy "documents_delete_owner_or_site_owner" on public.documents
  for delete using (
    owner_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );

-- Storage 那边同理收紧：新版本文件也是写进已存在文档的文件夹里，
-- 之前"任意管理员"能写的口子会让非上传人绕过前端直接传新版本文件，堵掉。
-- 新建文档时 documents 行先插入（owner_id = 自己），此时这条策略天然成立，不影响正常上传流程。
drop policy if exists "storage_insert_admin_only" on storage.objects;
create policy "storage_insert_owner_or_site_owner" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and (
      exists (
        select 1 from documents
        where id = (storage.foldername(name))[1]::uuid and owner_id = auth.uid()
      )
      or exists (select 1 from profiles where id = auth.uid() and is_owner)
    )
  );

drop policy if exists "storage_delete_owner_or_admin" on storage.objects;
create policy "storage_delete_owner_or_site_owner" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (
      exists (
        select 1 from documents
        where id = (storage.foldername(name))[1]::uuid and owner_id = auth.uid()
      )
      or exists (select 1 from profiles where id = auth.uid() and is_owner)
    )
  );

-- 版本历史记录本身（归档旧版本那一步）同理收紧，避免留下"归档了但新文件传不上去"的半截状态。
drop policy if exists "document_versions_insert_admin_only" on public.document_versions;
create policy "document_versions_insert_owner_or_site_owner" on public.document_versions
  for insert with check (
    exists (select 1 from documents d where d.id = document_id and d.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );

