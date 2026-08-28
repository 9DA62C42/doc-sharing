import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { useAuth } from './lib/AuthContext.jsx';
import Login from './pages/Login.jsx';
import DocumentList from './pages/DocumentList.jsx';
import DocumentDetail from './pages/DocumentDetail.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminDocuments from './pages/AdminDocuments.jsx';
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

export default function App() {
  const { session, isAdmin, profile, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="masthead">
        <h1><span className="flag" />文档中心</h1>
        {session && (
          <nav className="nav-links">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>文档</NavLink>
            {isAdmin && (
              <>
                <NavLink to="/admin/users" className={({ isActive }) => (isActive ? 'active' : '')}>按用户设置权限</NavLink>
                <NavLink to="/admin/documents" className={({ isActive }) => (isActive ? 'active' : '')}>按文档设置权限</NavLink>
                <NavLink to="/admin/logs" className={({ isActive }) => (isActive ? 'active' : '')}>日志</NavLink>
              </>
            )}
            <span style={{ color: 'var(--muted)' }}>{profile?.display_name}</span>
            <a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>退出</a>
          </nav>
        )}
      </header>

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><DocumentList /></RequireAuth>} />
        <Route path="/documents/:id" element={<RequireAuth><DocumentDetail /></RequireAuth>} />
        <Route path="/admin/users" element={<RequireAuth><RequireAdmin><AdminUsers /></RequireAdmin></RequireAuth>} />
        <Route path="/admin/documents" element={<RequireAuth><RequireAdmin><AdminDocuments /></RequireAdmin></RequireAuth>} />
        <Route path="/admin/logs" element={<RequireAuth><RequireAdmin><AdminLogs /></RequireAdmin></RequireAuth>} />
      </Routes>
    </div>
  );
}
