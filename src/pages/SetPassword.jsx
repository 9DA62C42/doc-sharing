import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import PasswordForm from '../components/PasswordForm.jsx';

// 邀请邮件里的链接会带 #access_token=...&type=invite，
// supabase-js 客户端会自动识别并建立登录态（createClient 默认开启 detectSessionInUrl），
// 所以这个页面只需要等 session 出现，再展示设密码表单即可。
export default function SetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => navigate('/'), 1200);
    return () => clearTimeout(t);
  }, [done, navigate]);

  if (done) {
    return (
      <div className="card" style={{ maxWidth: 360, margin: '60px auto', textAlign: 'center' }}>
        <p>密码已设置好，正在进入文档中心…</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="card" style={{ maxWidth: 360, margin: '60px auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          正在验证邀请链接…如果长时间停在这里，说明链接可能已过期，请联系管理员重新发一次邀请。
        </p>
      </div>
    );
  }

  return (
    <PasswordForm
      title="设置你的密码"
      hint="欢迎加入，设置一个密码后就可以正常登录了。"
      submitLabel="完成，进入文档中心"
      onSuccess={() => setDone(true)}
    />
  );
}
