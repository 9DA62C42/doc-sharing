// Supabase Edge Function
// 部署：supabase functions deploy invite-user
// 前端通过 supabase.functions.invoke('invite-user', { body: { email, displayName, redirectTo } }) 调用。
// 用 service_role 密钥发邀请邮件，所以必须放在服务端，不能放前端代码里。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 浏览器直接调用 Edge Function 必须显式返回 CORS 头，否则请求在发出前就被拦下，
// 报错会是含糊的 "Failed to send a request to the Edge Function"。
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // 浏览器先发一个 OPTIONS 预检请求，必须正确响应，否则真正的 POST 发不出去
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '未登录' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // 用调用者自己的 token 先确认它是管理员，再用 service_role 做特权操作
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: '登录状态无效' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await adminClient
      .from('profiles').select('is_admin').eq('id', userData.user.id).single();
    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: '只有管理员能邀请新成员' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, displayName, redirectTo } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: '缺少邮箱' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName || email.split('@')[0] },
      redirectTo: redirectTo || undefined,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, userId: data.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // 兜底：任何没预料到的异常也要带 CORS 头返回，不然前端只会看到一句含糊的网络错误
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
