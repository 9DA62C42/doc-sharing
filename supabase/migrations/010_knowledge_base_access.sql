-- ═══════════════════════════════════════════════════════════════
-- 增量更新：知识库（外部嵌入页面）的访问控制，只有站长能设置谁可以看到。
-- 逻辑和文档的分组权限/个人覆盖类似，但只有"能看/不能看"两档，没有下载概念。
-- 站长自己始终可见；管理员没有特殊待遇，和普通成员一样要被明确授权。
-- 如果你的 Supabase 项目已经跑过一次 schema.sql，只需要跑这一段。
-- ═══════════════════════════════════════════════════════════════

create table public.kb_group_access (
  group_id uuid primary key references public.groups(id) on delete cascade
);

create table public.kb_user_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  allowed boolean not null
);

create or replace function public.has_kb_access(p_user_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  if exists (select 1 from profiles where id = p_user_id and account_status <> 'active') then
    return false;
  end if;
  if exists (select 1 from profiles where id = p_user_id and is_owner) then
    return true;
  end if;

  select allowed into v_allowed from kb_user_access where user_id = p_user_id;
  if v_allowed is not null then
    return v_allowed;
  end if;

  return exists (
    select 1 from kb_group_access kga
    join group_members gm on gm.group_id = kga.group_id
    where gm.user_id = p_user_id
  );
end;
$$;

grant execute on function public.has_kb_access(uuid) to authenticated;

alter table public.kb_group_access enable row level security;
alter table public.kb_user_access enable row level security;

create policy "kb_group_access_owner_only" on public.kb_group_access
  for all using (exists (select 1 from profiles where id = auth.uid() and is_owner));
create policy "kb_user_access_owner_only" on public.kb_user_access
  for all using (exists (select 1 from profiles where id = auth.uid() and is_owner));
