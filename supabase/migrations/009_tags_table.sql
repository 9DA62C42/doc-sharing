-- ═══════════════════════════════════════════════════════════════
-- 增量更新：标签改为"选择制"——维护一张标准标签表，文档从里面挑，
-- 不再是自由填写文本。documents.tags 还是 text[]（存标签名字），
-- 这张表只是"可选清单"，删掉一个标签不会去清理已经打上的文档
-- （和文件夹的"套用一次"同一个思路：够用就好，不做强约束）。
-- 如果你的 Supabase 项目已经跑过一次 schema.sql，只需要跑这一段。
-- ═══════════════════════════════════════════════════════════════

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.tags enable row level security;

create policy "tags_select_all" on public.tags
  for select using (auth.uid() is not null);
create policy "tags_write_admin" on public.tags
  for all using (exists (select 1 from profiles where id = auth.uid() and is_admin));
