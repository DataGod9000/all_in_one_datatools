import { Outlet, NavLink } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const LogoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M2 11h28M2 18h28M2 25h28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="24" cy="7" r="3.5" fill="currentColor" opacity=".9" />
  </svg>
);

export default function Layout() {
  const { toggle } = useTheme();

  return (
    <div className="app-layout">
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
          <NavLink to="/ddl" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">⟨⟩</span>
            <span>DDL</span>
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
