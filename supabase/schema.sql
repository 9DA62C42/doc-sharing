-- ═══════════════════════════════════════════════════════════════
-- 文档分享站 · 数据库结构 + 权限策略
-- 在 Supabase 项目的 SQL Editor 里整段粘贴执行一次即可。
-- 权限模型：分组授权 + 个人覆盖，deny 优先于任何分组权限。
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────── 1. 基础表 ─────────────────────────

-- 账号状态：active 正常 / suspended 暂停（仍可登录，但看不到任何文档）/ terminated 销号（永久禁止登录）
create type public.account_status as enum ('active', 'suspended', 'terminated');

-- 用户资料表：和 Supabase 自带的 auth.users 一一对应
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  is_admin boolean not null default false,
  is_owner boolean not null default false,
  account_status public.account_status not null default 'active',
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 条款同意记录：每个用户对每个条款版本最多同意一次
create table public.policy_agreements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  policy_version text not null,
  agreed_at timestamptz not null default now(),
  primary key (user_id, policy_version)
);

-- 分组（如"财务组"、"客户资料"）
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 分组成员关系
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (group_id, user_id)
);

-- 文档
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  storage_path text not null,       -- Supabase Storage 里的路径
  file_type text,                   -- pdf / docx / xlsx / png ...
  size_bytes bigint,
  owner_id uuid not null references public.profiles(id) on delete set null,
  -- 分享人可以在此写明该文档的特殊分享条件（例如 Skill 类工具型文档的署名要求、
  -- .tex 源文件的再分发规则等），会展示在文档查看/下载页面上；为空则不展示。
  special_conditions text,
  current_version int not null default 1,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 文档版本历史：每次"上传新版本"时，把当前文件归档成一条历史记录。
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

-- 权限档位：view（仅查看/预览）、download（可下载）、deny（明确禁止，最高优先级）
create type public.access_level as enum ('view', 'download', 'deny');

-- 按分组授权
create table public.document_group_access (
  document_id uuid not null references public.documents(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  level public.access_level not null default 'view',
  primary key (document_id, group_id)
);

-- 按用户单独授权 / 覆盖（deny 用来在分组基础上"拉黑"某个人）
create table public.document_user_access (
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  level public.access_level not null default 'view',
  primary key (document_id, user_id)
);

-- 访问日志
create table public.access_logs (
  id bigint generated always as identity primary key,
  document_id uuid references public.documents(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,             -- view / download / upload / permission_changed / delete
  detail jsonb,
  created_at timestamptz not null default now()
);

create index idx_access_logs_document on public.access_logs(document_id);
create index idx_access_logs_user on public.access_logs(user_id);
create index idx_access_logs_created on public.access_logs(created_at desc);

-- ───────────────────────── 2. 权限判断函数 ─────────────────────────
-- 核心逻辑，所有 RLS policy 都调用这一个函数，只写一次到处复用：
--   1) 有个人覆盖记录 → 直接按覆盖结果（deny 就是拒绝，到此为止）
--   2) 没有个人覆盖 → 看所在分组里权限最高的一条
--   3) 都没有 → 不可见（owner 和管理员始终可见，见下方 policy）

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
  -- 非 active 账号（暂停/已销号）一律拒绝访问文档
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

grant execute on function public.has_document_access(uuid, uuid, public.access_level) to authenticated;

-- ───────────────────────── 3. 启用 RLS ─────────────────────────

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.documents enable row level security;
alter table public.document_group_access enable row level security;
alter table public.document_user_access enable row level security;
alter table public.access_logs enable row level security;
alter table public.policy_agreements enable row level security;
alter table public.document_versions enable row level security;

-- profiles：所有登录用户可以看到全部成员（10人小规模，方便选人）。
-- 管理员可以改成员的显示名称，但只有网站拥有人（is_owner）能改 is_admin/is_owner
-- 这两个角色字段本身；日常的账号状态变更走 manage-account 这个 Edge Function
-- （用 service_role 绕过 RLS），也不经过这条策略。
create policy "profiles_select_all" on public.profiles
  for select using (auth.uid() is not null);
create policy "profiles_update_admin_scoped" on public.profiles
  for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin)
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and is_owner)
    or (
      is_admin = (select p2.is_admin from profiles p2 where p2.id = profiles.id)
      and is_owner = (select p2.is_owner from profiles p2 where p2.id = profiles.id)
    )
  );
create policy "profiles_insert_owner_only" on public.profiles
  for insert with check (exists (select 1 from profiles where id = auth.uid() and is_owner));

-- groups / group_members：所有人可读，管理员可写
create policy "groups_select_all" on public.groups
  for select using (auth.uid() is not null);
create policy "groups_write_admin" on public.groups
  for all using (exists (select 1 from profiles where id = auth.uid() and is_admin));

create policy "group_members_select_all" on public.group_members
  for select using (auth.uid() is not null);
create policy "group_members_write_admin" on public.group_members
  for all using (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- documents：只能看到自己有权限的文档（通过函数判断），管理员/owner 可写
create policy "documents_select_accessible" on public.documents
  for select using (public.has_document_access(id, auth.uid(), 'view'));
-- 只有管理员能上传新文档（owner_id 仍记录成上传者本人，方便追溯）
create policy "documents_insert_admin_only" on public.documents
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and is_admin)
  );
create policy "documents_update_owner_or_admin" on public.documents
  for update using (
    owner_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  );
create policy "documents_delete_owner_or_admin" on public.documents
  for delete using (
    owner_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

-- document_group_access / document_user_access：只有管理员能读写（权限配置本身是敏感信息）
create policy "dga_admin_all" on public.document_group_access
  for all using (exists (select 1 from profiles where id = auth.uid() and is_admin));
create policy "dua_admin_all" on public.document_user_access
  for all using (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- access_logs：管理员看全部；普通用户只能看自己触发的记录；任何登录用户都能写入自己的日志
create policy "logs_select_own_or_admin" on public.access_logs
  for select using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  );
create policy "logs_insert_own" on public.access_logs
  for insert with check (user_id = auth.uid());

-- policy_agreements：用户只能看/写自己的同意记录，管理员能看全部（用于核实是否都同意了最新条款）
create policy "policy_agreements_select_own_or_admin" on public.policy_agreements
  for select using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  );
create policy "policy_agreements_insert_own" on public.policy_agreements
  for insert with check (user_id = auth.uid());

-- document_versions：能看这份文档的人就能看它的版本列表，只有管理员能写入新版本记录
create policy "document_versions_select_if_accessible" on public.document_versions
  for select using (public.has_document_access(document_id, auth.uid(), 'view'));
create policy "document_versions_insert_admin_only" on public.document_versions
  for insert with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- ───────────────────────── 4. 新用户自动建 profile ─────────────────────────
-- 管理员用 inviteUserByEmail 邀请新用户后，auth.users 会多一条记录，
-- 这个触发器自动在 profiles 里补一条（display_name 先用邮箱前缀占位）。

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── 5. Storage bucket 权限 ─────────────────────────
-- 在 Supabase 后台 Storage 里建一个名为 documents 的 bucket（设为 private，不要 public）。
-- 下面的 policy 让"能读该文档记录的人"才能读对应的 Storage 文件，
-- 文件路径约定为 documents/{document_id}/{原始文件名}。

create policy "storage_select_if_document_accessible" on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.has_document_access(
      (storage.foldername(name))[1]::uuid,
      auth.uid(),
      'view'
    )
  );

create policy "storage_insert_admin_only" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and exists (select 1 from profiles where id = auth.uid() and is_admin)
  );

create policy "storage_delete_owner_or_admin" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (
      exists (select 1 from profiles where id = auth.uid() and is_admin)
      or exists (
        select 1 from documents
        where id = (storage.foldername(name))[1]::uuid and owner_id = auth.uid()
      )
    )
  );

-- ───────────────────────── 6. 把自己设为第一个管理员 + 网站拥有人 ─────────────────────────
-- 执行完上面所有内容后，先在 Supabase 后台 Authentication 里手动创建你自己的账号，
-- 再回来执行下面这行（把邮箱换成你自己的）。is_owner 是唯一能在界面上任命/撤销其他人
-- 管理员身份的角色，这一步只能靠 SQL 手动设置，之后就不用再跑这条命令了：
--
-- update public.profiles set is_admin = true, is_owner = true where id = (select id from auth.users where email = 'you@example.com');
