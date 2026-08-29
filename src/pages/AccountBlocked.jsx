import { useAuth } from '../lib/AuthContext.jsx';

export default function AccountBlocked() {
  const { profile, signOut } = useAuth();

  return (
    <div className="card" style={{ maxWidth: 420, margin: '80px auto', textAlign: 'center' }}>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--font-serif)' }}>账号已被暂停</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>
        {profile?.status_reason || '如需了解详情请联系管理员。'}
      </p>
      <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => signOut()}>
        退出登录
      </button>
    </div>
  );
}
