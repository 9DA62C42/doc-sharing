// Supabase Edge Function
// 部署：supabase functions deploy invite-user
// 前端通过 supabase.functions.invoke('invite-user', { body: { email, displayName } }) 调用。
// 用 service_role 密钥发邀请邮件，所以必须放在服务端，不能放前端代码里。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // 用调用者自己的 token 先确认它是管理员，再用 service_role 做特权操作
  const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: '登录状态无效' }), { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await adminClient
    .from('profiles').select('is_admin').eq('id', userData.user.id).single();
  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: '只有管理员能邀请新成员' }), { status: 403 });
  }

  const { email, displayName } = await req.json();
  if (!email) {
    return new Response(JSON.stringify({ error: '缺少邮箱' }), { status: 400 });
  }

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName || email.split('@')[0] },
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true, userId: data.user.id }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
