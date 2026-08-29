// Supabase Edge Function
// 部署：supabase functions deploy manage-account
// 前端通过 supabase.functions.invoke('manage-account', { body: { userId, action, reason } }) 调用。
// action: 'suspend' | 'reinstate' | 'terminate' | 'lift_termination'
// 用 service_role 密钥改账号状态、调用封禁 API，所以必须放在服务端。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// GoTrue 没有真正的"永久封禁"，约定用一个很长的时长代替；解封时传 'none'。
const PERMANENT_BAN_DURATION = '876000h'; // 约 100 年

// 状态机：suspend 只能从 active 出发；terminate 只能从 suspended 出发（销号前必须先暂停留痕）；
// 撤销销号回到 suspended（而不是直接回到 active），需要管理员再手动点一次"恢复正常"确认。
const TRANSITIONS = {
  suspend: { from: 'active', to: 'suspended', requireReason: true },
  reinstate: { from: 'suspended', to: 'active', requireReason: false },
  terminate: { from: 'suspended', to: 'terminated', requireReason: true },
  lift_termination: { from: 'terminated', to: 'suspended', requireReason: false },
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
    const callerId = userData.user.id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile } = await adminClient
      .from('profiles').select('is_owner').eq('id', callerId).single();
    if (!callerProfile?.is_owner) return jsonResponse({ error: '只有站长能操作账号状态' }, 403);

    const { userId, action, reason } = await req.json();
    if (!userId || !action) return jsonResponse({ error: '缺少 userId 或 action' }, 400);
    if (userId === callerId) return jsonResponse({ error: '不能对自己的账号执行此操作' }, 400);

    const transition = TRANSITIONS[action];
    if (!transition) return jsonResponse({ error: `未知操作：${action}` }, 400);
    if (transition.requireReason && !reason?.trim()) {
      return jsonResponse({ error: '此操作需要填写理由' }, 400);
    }

    const { data: target } = await adminClient
      .from('profiles').select('account_status').eq('id', userId).single();
    if (!target) return jsonResponse({ error: '找不到该账号' }, 404);
    if (target.account_status !== transition.from) {
      return jsonResponse({ error: `账号当前状态是「${target.account_status}」，无法执行「${action}」` }, 409);
    }

    // terminate / lift_termination 需要同步调用 Auth 封禁 API
    if (action === 'terminate') {
      const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: PERMANENT_BAN_DURATION,
      });
      if (banError) return jsonResponse({ error: `封禁失败：${banError.message}` }, 500);
    } else if (action === 'lift_termination') {
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
      });
      if (unbanError) return jsonResponse({ error: `解除封禁失败：${unbanError.message}` }, 500);
    }

    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        account_status: transition.to,
        status_reason: reason?.trim() || null,
        status_changed_at: new Date().toISOString(),
        status_changed_by: callerId,
      })
      .eq('id', userId);
    if (updateError) return jsonResponse({ error: updateError.message }, 500);

    return jsonResponse({ ok: true, account_status: transition.to });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
