import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { getApi } from '../api';

const LogoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M2 11h28M2 18h28M2 25h28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="24" cy="7" r="3.5" fill="currentColor" opacity=".9" />
  </svg>
);

export default function Layout() {
  const { toggle } = useTheme();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPending = () => {
    getApi('/api/table-requests?status=pending_approval').then((res) => {
      if (res.ok && Array.isArray(res.json?.requests)) {
        setPendingCount(res.json.requests.length);
      }
    });
  };

  useEffect(() => {
    fetchPending();
    const t = setInterval(fetchPending, 15000);
    const onUpdate = () => fetchPending();
    window.addEventListener('approval-updated', onUpdate);
    return () => {
      clearInterval(t);
      window.removeEventListener('approval-updated', onUpdate);
    };
  }, []);

  return (
    <div className="app-layout">
      <div className="narrow-viewport-message" role="status" aria-live="polite">
        <div className="narrow-viewport-message-inner">
          <p className="narrow-viewport-title">This site isn’t built for small screens.</p>
          <p className="narrow-viewport-body">I have a life outside of building apps. Widen your browser or use a laptop and we’re good.</p>
        </div>
      </div>
      <aside className="sidebar">
        <div className="sidebar-section">Tools</div>
        <nav className="sidebar-nav">
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
            <span className="nav-icon">⌂</span>
            <span>Home</span>
          </NavLink>
          <NavLink to="/assets" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">▦</span>
            <span>Assets</span>
          </NavLink>
          <NavLink to="/create-table" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">⟨⟩</span>
            <span>Create table</span>
          </NavLink>
          <NavLink to="/compare" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">⇄</span>
            <span>Compare</span>
          </NavLink>
          <NavLink to="/compare/runs" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">⇉</span>
            <span>Comparison runs</span>
          </NavLink>
          <NavLink to="/validate" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">✓</span>
            <span>Validate</span>
          </NavLink>
          <NavLink to="/validate/runs" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">◫</span>
            <span>Validation runs</span>
          </NavLink>
        </nav>
        <div className="sidebar-section">Workflow</div>
        <nav className="sidebar-nav">
          <NavLink to="/approval-center" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">◇</span>
            <span>Approval Center</span>
            {pendingCount > 0 && (
              <span className="nav-badge" aria-label={`${pendingCount} pending`}>{pendingCount}</span>
            )}
          </NavLink>
          <NavLink to="/requests-history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">▤</span>
            <span>Request History</span>
          </NavLink>
          <NavLink to="/query" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">⎘</span>
            <span>Run query</span>
          </NavLink>
        </nav>
        <div className="sidebar-section">External</div>
        <nav className="sidebar-nav">
          <a href="https://supabase.com/dashboard" className="nav-external" target="_blank" rel="noopener noreferrer">
            Supabase
          </a>
          <a href={import.meta.env.DEV ? 'http://127.0.0.1:8000/docs' : '/docs'} className="nav-external" target="_blank" rel="noopener">
            API docs
          </a>
          <NavLink to="/animation-reference" className={({ isActive }) => `nav-external-style ${isActive ? 'active' : ''}`}>
            Animation reference
          </NavLink>
        </nav>
      </aside>
      <header className="site-header">
        <div className="header-inner">
          <NavLink to="/" className="logo-link" aria-label="DataTools home">
            <span className="logo-icon">
              <LogoIcon />
            </span>
            <span>DataTools</span>
          </NavLink>
          <input type="text" className="header-search" placeholder="Search" aria-label="Search" />
          <div className="header-actions">
            <button type="button" className="theme-toggle" onClick={toggle} aria-label="Toggle dark mode" title="Toggle dark/light mode">
              <span className="theme-icon-light" aria-hidden="true">☀</span>
              <span className="theme-icon-dark" aria-hidden="true">☽</span>
            </button>
            <a href={import.meta.env.DEV ? 'http://127.0.0.1:8000/docs' : '/docs'} target="_blank" rel="noopener" className="cta">API docs</a>
          </div>
        </div>
      </header>
      <div className="main-wrap">
        <main id="main-content" tabIndex={-1}>
          <div key={location.pathname} className="view-animate-wrap">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
