-- ═══════════════════════════════════════════════════════════════
-- 增量更新：网站拥有人（is_owner）任命/撤销管理员；管理员可以改成员显示名称
-- 如果你的 Supabase 项目已经跑过一次 schema.sql，只需要跑这一段。
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column is_owner boolean not null default false;

-- 之前 profiles_update_admin / profiles_insert_admin 这两条策略允许"任意管理员"
-- 直接改 profiles 表的任何字段（包括 is_admin 本身），但代码里其实从没真正用过这条通道
-- （账号状态变更走的是 manage-account 这个 Edge Function，用 service_role 绕过 RLS）。
-- 现在换成一条更精确的策略：管理员可以改成员的显示名称，但只有网站拥有人能改
-- is_admin / is_owner 这两个角色字段。
drop policy if exists "profiles_update_admin" on public.profiles;
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

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_owner_only" on public.profiles
  for insert with check (exists (select 1 from profiles where id = auth.uid() and is_owner));

-- 把自己设成网站拥有人（邮箱换成你自己的）：
-- update public.profiles set is_owner = true where id = (select id from auth.users where email = 'you@example.com');
