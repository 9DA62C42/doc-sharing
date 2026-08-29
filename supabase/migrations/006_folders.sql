-- ═══════════════════════════════════════════════════════════════
-- 增量更新：单层文件夹 + 文件夹默认权限模板（套用一次，不实时继承）
-- 如果你的 Supabase 项目已经跑过一次 schema.sql，只需要跑这一段。
-- ═══════════════════════════════════════════════════════════════

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 文件夹的默认权限模板，形状和 document_group_access / document_user_access 一样。
-- 这只是"模板"：文档套用后，实际生效的权限记录被复制进文档自己的
-- document_group_access / document_user_access，之后文件夹模板再变
-- 不会影响已经套用过的文档——避免出现"日志里查不到、权限却变了"的情况。
create table public.folder_group_access (
  folder_id uuid not null references public.folders(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  level public.access_level not null default 'view',
  primary key (folder_id, group_id)
);

create table public.folder_user_access (
  folder_id uuid not null references public.folders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  level public.access_level not null default 'view',
  primary key (folder_id, user_id)
);

alter table public.documents
  add column folder_id uuid references public.folders(id) on delete set null;

alter table public.folders enable row level security;
alter table public.folder_group_access enable row level security;
alter table public.folder_user_access enable row level security;

-- folders：登录用户都能看（列表页要按文件夹筛选/上传时要选文件夹）；
-- 建文件夹本身谁都是管理员就行；改名/删除只有创建人或站长能做
-- （和文档的"只有上传人能设置范围"保持同一套规则）。
create policy "folders_select_all" on public.folders
  for select using (auth.uid() is not null);
create policy "folders_insert_admin" on public.folders
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and is_admin)
  );
create policy "folders_update_owner_or_site_owner" on public.folders
  for update using (
    owner_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );
create policy "folders_delete_owner_or_site_owner" on public.folders
  for delete using (
    owner_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );

-- folder_group_access / folder_user_access：任何管理员可查看，
-- 只有该文件夹的创建人或站长能改模板本身。
create policy "fga_select_admin" on public.folder_group_access
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin));
create policy "fua_select_admin" on public.folder_user_access
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin));

create policy "fga_write_owner_or_site_owner" on public.folder_group_access
  for all using (
    exists (select 1 from folders f where f.id = folder_id and f.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  )
  with check (
    exists (select 1 from folders f where f.id = folder_id and f.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );
create policy "fua_write_owner_or_site_owner" on public.folder_user_access
  for all using (
    exists (select 1 from folders f where f.id = folder_id and f.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  )
  with check (
    exists (select 1 from folders f where f.id = folder_id and f.owner_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_owner)
  );
