-- ═══════════════════════════════════════════════════════════════
-- 增量更新：文档版本历史 + 标签
-- 如果你的 Supabase 项目已经跑过一次 schema.sql，只需要跑这一段。
-- ═══════════════════════════════════════════════════════════════

alter table public.documents
  add column current_version int not null default 1,
  add column tags text[] not null default '{}';

-- 每次"上传新版本"时，把当前文件归档成一条历史记录，再把 documents 表指向新文件。
-- 不存"谁上传的"，够用即可；这张表只读不改，靠 documents 表的 owner_id 追溯上传者。
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number int not null,
  storage_path text not null,
  file_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

alter table public.document_versions enable row level security;

-- 能看这份文档的人就能看它的版本列表（复用同一个权限判断函数）；
-- 只有管理员能写入新版本记录。
create policy "document_versions_select_if_accessible" on public.document_versions
  for select using (public.has_document_access(document_id, auth.uid(), 'view'));
create policy "document_versions_insert_admin_only" on public.document_versions
  for insert with check (exists (select 1 from profiles where id = auth.uid() and is_admin));
