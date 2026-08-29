import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { useAuth } from './lib/AuthContext.jsx';
import { useTheme } from './lib/ThemeContext.jsx';
import Login from './pages/Login.jsx';
import SetPassword from './pages/SetPassword.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Terms from './pages/Terms.jsx';
import AccountBlocked from './pages/AccountBlocked.jsx';
import DocumentList from './pages/DocumentList.jsx';
import DocumentDetail from './pages/DocumentDetail.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminDocuments from './pages/AdminDocuments.jsx';
import AdminAccounts from './pages/AdminAccounts.jsx';
import AdminLogs from './pages/AdminLogs.jsx';

function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

// 账号状态非 active（暂停/销号）一律拦到 AccountBlocked；没同意最新条款的先去 /terms。
function RequireGoodStanding({ children }) {
  const { profile, hasAgreedTerms, agreementChecked, loading } = useAuth();
  if (loading || !agreementChecked) return null;
  if (profile?.account_status && profile.account_status !== 'active') return <AccountBlocked />;
  if (!hasAgreedTerms) return <Navigate to="/terms" replace />;
  return children;
}

export default function App() {
  const { session, isAdmin, profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">文档中心</div>

        {session && (
          <nav className="sidebar-nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>文档</NavLink>
            {isAdmin && (
              <>
                <NavLink to="/admin" end className={({ isActive }) => (isActive ? 'active' : '')}>概览</NavLink>
                <NavLink to="/admin/users" className={({ isActive }) => (isActive ? 'active' : '')}>按用户设置权限</NavLink>
                <NavLink to="/admin/documents" className={({ isActive }) => (isActive ? 'active' : '')}>按文档设置权限</NavLink>
                <NavLink to="/admin/accounts" className={({ isActive }) => (isActive ? 'active' : '')}>账号管理</NavLink>
                <NavLink to="/admin/logs" className={({ isActive }) => (isActive ? 'active' : '')}>日志</NavLink>
              </>
            )}
            <NavLink to="/change-password" className={({ isActive }) => (isActive ? 'active' : '')}>修改密码</NavLink>
          </nav>
        )}

        {session && (
          <div className="sidebar-footer">
            <div className="sidebar-footer-row">
              <span className="user-name">{profile?.display_name}</span>
              <button className="theme-toggle" onClick={toggle} title="切换亮暗模式" aria-label="切换亮暗模式">
                {theme === 'dark' ? '☀' : '●'}
              </button>
            </div>
            <a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>退出</a>
          </div>
        )}
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/terms" element={<RequireAuth><Terms /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><RequireGoodStanding><DocumentList /></RequireGoodStanding></RequireAuth>} />
          <Route path="/documents/:id" element={<RequireAuth><RequireGoodStanding><DocumentDetail /></RequireGoodStanding></RequireAuth>} />
          <Route path="/change-password" element={<RequireAuth><RequireGoodStanding><ChangePassword /></RequireGoodStanding></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><RequireGoodStanding><RequireAdmin><AdminDashboard /></RequireAdmin></RequireGoodStanding></RequireAuth>} />
          <Route path="/admin/users" element={<RequireAuth><RequireGoodStanding><RequireAdmin><AdminUsers /></RequireAdmin></RequireGoodStanding></RequireAuth>} />
          <Route path="/admin/documents" element={<RequireAuth><RequireGoodStanding><RequireAdmin><AdminDocuments /></RequireAdmin></RequireGoodStanding></RequireAuth>} />
          <Route path="/admin/accounts" element={<RequireAuth><RequireGoodStanding><RequireAdmin><AdminAccounts /></RequireAdmin></RequireGoodStanding></RequireAuth>} />
          <Route path="/admin/logs" element={<RequireAuth><RequireGoodStanding><RequireAdmin><AdminLogs /></RequireAdmin></RequireGoodStanding></RequireAuth>} />
        </Routes>
      </main>
    </div>
  );
}
