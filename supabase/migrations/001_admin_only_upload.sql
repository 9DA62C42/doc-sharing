-- ═══════════════════════════════════════════════════════════════
-- 增量更新：把上传权限收紧为"仅管理员"
-- 如果你的 Supabase 项目已经跑过一次 schema.sql，只需要跑这一小段，
-- 不用把整个 schema.sql 重新执行一遍（会因为表已存在而报错）。
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_admin_only" on public.documents
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

drop policy if exists "storage_insert_own" on storage.objects;
create policy "storage_insert_admin_only" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and exists (select 1 from profiles where id = auth.uid() and is_admin)
  );
