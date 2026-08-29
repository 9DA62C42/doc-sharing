-- ═══════════════════════════════════════════════════════════════
-- 增量更新：文档的分享范围（分组权限 / 个人覆盖）只能由该文档的上传人
-- 或站长（is_owner）设置，普通管理员不再能替别人上传的文档改分享范围。
-- 如果你的 Supabase 项目已经跑过一次 schema.sql，只需要跑这一段。
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "dga_admin_all" on public.document_group_access;
drop policy if exists "dua_admin_all" on public.document_user_access;

-- 查看权限配置：任何管理员都能看（用于审计/排查），但不能写。
create policy "dga_select_admin" on public.document_group_access
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin));
create policy "dua_select_admin" on public.document_user_access
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- 写入（新增/修改/删除）：只有该文档的上传人（documents.owner_id）或站长能操作。
create policy "dga_insert_owner_or_site_owner" on public.document_group_access
  for insert with check (
    exists (select 1 from documents d where d.id = document_id and d.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );
create policy "dga_update_owner_or_site_owner" on public.document_group_access
  for update using (
    exists (select 1 from documents d where d.id = document_id and d.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );
create policy "dga_delete_owner_or_site_owner" on public.document_group_access
  for delete using (
    exists (select 1 from documents d where d.id = document_id and d.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );

create policy "dua_insert_owner_or_site_owner" on public.document_user_access
  for insert with check (
    exists (select 1 from documents d where d.id = document_id and d.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );
create policy "dua_update_owner_or_site_owner" on public.document_user_access
  for update using (
    exists (select 1 from documents d where d.id = document_id and d.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );
create policy "dua_delete_owner_or_site_owner" on public.document_user_access
  for delete using (
    exists (select 1 from documents d where d.id = document_id and d.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );
