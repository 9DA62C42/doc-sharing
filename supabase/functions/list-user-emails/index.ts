// Supabase Edge Function
// 部署：supabase functions deploy list-user-emails
// 前端通过 supabase.functions.invoke('list-user-emails', { body: { userIds: [...] } }) 调用。
// 邮箱存在 auth.users 里，客户端用 anon key 查不到，只有 service_role 能读，
// 所以日志导出时要拿邮箱必须过这个函数（仅管理员可调用）。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: '未登录' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: '登录状态无效' }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile } = await adminClient
      .from('profiles').select('is_admin').eq('id', userData.user.id).single();
    if (!callerProfile?.is_admin) return jsonResponse({ error: '只有管理员能导出日志' }, 403);

    const { userIds } = await req.json();
    if (!Array.isArray(userIds)) return jsonResponse({ error: '缺少 userIds' }, 400);

    const emails = {};
    for (const id of userIds) {
      const { data } = await adminClient.auth.admin.getUserById(id);
      if (data?.user?.email) emails[id] = data.user.email;
    }

    return jsonResponse({ emails });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
