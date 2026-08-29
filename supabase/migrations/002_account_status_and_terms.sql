-- ═══════════════════════════════════════════════════════════════
-- 增量更新：账号状态管理（暂停/销号）+ 条款同意记录 + 文档特殊分享条件
-- 如果你的 Supabase 项目已经跑过 schema.sql，只需要跑这一段。
-- ═══════════════════════════════════════════════════════════════

create type public.account_status as enum ('active', 'suspended', 'terminated');

alter table public.profiles
  add column account_status public.account_status not null default 'active',
  add column status_reason text,
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references public.profiles(id) on delete set null;

-- 条款同意记录：每个用户对每个条款版本最多同意一次
create table public.policy_agreements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  policy_version text not null,
  agreed_at timestamptz not null default now(),
  primary key (user_id, policy_version)
);

alter table public.policy_agreements enable row level security;

create policy "policy_agreements_select_own_or_admin" on public.policy_agreements
  for select using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  );
create policy "policy_agreements_insert_own" on public.policy_agreements
  for insert with check (user_id = auth.uid());

-- 文档特殊分享条件：分享人可以针对单份文档写明特殊要求
-- （比如 Skill 类工具型文档的署名要求、.tex 源文件的再分发规则等），
-- 展示在该文档的查看/下载页面上。为空则不展示任何特殊说明。
alter table public.documents
  add column special_conditions text;

-- has_document_access()：非 active 账号一律拒绝访问文档，这一层挡在数据库，
-- 前端即使漏做判断也不会真的读到内容。管理员和文档所有者的直通逻辑保持不变，
-- 但因为管理员账号本身理论上不会被暂停/销号（管理员不能操作自己），这里不用特殊处理。
create or replace function public.has_document_access(
  p_document_id uuid,
  p_user_id uuid,
  p_min_level public.access_level default 'view'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level public.access_level;
  v_rank constant jsonb := '{"deny": 0, "view": 1, "download": 2}';
begin
  if exists (select 1 from profiles where id = p_user_id and account_status <> 'active') then
    return false;
  end if;

  -- 管理员或文档所有者：始终可见
  if exists (select 1 from profiles where id = p_user_id and is_admin) then
    return true;
  end if;
  if exists (select 1 from documents where id = p_document_id and owner_id = p_user_id) then
    return true;
  end if;

  -- 个人覆盖优先
  select level into v_level
  from document_user_access
  where document_id = p_document_id and user_id = p_user_id;

  if v_level is not null then
    if v_level = 'deny' then
      return false;
    end if;
    return (v_rank->>v_level::text)::int >= (v_rank->>p_min_level::text)::int;
  end if;

  -- 没有个人覆盖，取分组里权限最高的一条
  select level into v_level
  from document_group_access dga
  join group_members gm on gm.group_id = dga.group_id
  where dga.document_id = p_document_id and gm.user_id = p_user_id
  order by (v_rank->>level::text)::int desc
  limit 1;

  if v_level is null then
    return false;
  end if;
  return (v_rank->>v_level::text)::int >= (v_rank->>p_min_level::text)::int;
end;
$$;
