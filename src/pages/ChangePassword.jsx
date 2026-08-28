import { useState } from 'react';
import PasswordForm from '../components/PasswordForm.jsx';

export default function ChangePassword() {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="card" style={{ maxWidth: 360, margin: '60px auto', textAlign: 'center' }}>
        <p>密码已更新。</p>
      </div>
    );
  }

  return (
    <PasswordForm
      title="修改密码"
      submitLabel="保存新密码"
      onSuccess={() => setDone(true)}
    />
  );
}
