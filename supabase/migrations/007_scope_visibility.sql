-- ═══════════════════════════════════════════════════════════════
-- 增量更新：收紧可见范围
-- 1) 文档的分组权限/个人覆盖：非上传人、非站长的管理员不能再"查看"（之前只是不能改）
-- 2) 访问日志：站长看全部；普通管理员只能看和自己上传的文档相关的日志，以及自己的操作记录
-- 如果你的 Supabase 项目已经跑过一次 schema.sql，只需要跑这一段。
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "dga_select_admin" on public.document_group_access;
create policy "dga_select_owner_or_site_owner" on public.document_group_access
  for select using (
    exists (select 1 from documents d where d.id = document_id and d.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );

drop policy if exists "dua_select_admin" on public.document_user_access;
create policy "dua_select_owner_or_site_owner" on public.document_user_access
  for select using (
    exists (select 1 from documents d where d.id = document_id and d.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );

drop policy if exists "logs_select_own_or_admin" on public.access_logs;
create policy "logs_select_scoped" on public.access_logs
  for select using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
    or exists (select 1 from documents d where d.id = access_logs.document_id and d.owner_id = auth.uid())
  );
