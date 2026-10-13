import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, Award, BarChart2, Bell, BookOpen, Calendar, Clock,
  FileSpreadsheet, FileText, HeartPulse, Home, LayoutDashboard,
  LogOut, Mail, Menu, Moon, ShieldCheck, Sparkles, Sun, UploadCloud,
  User, UserCheck, UserCog, UsersRound, X,
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { go } from '../../api/client';

export function Shell({ session, path, onLogout, onNavigate, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const menuRef = useRef(null);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('medreport_theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('medreport_theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const navigateTo = (target) => {
    setSidebarOpen(false);
    go(target);
    if (onNavigate) onNavigate(target);
  };

  const isUserAdmin = session?.is_admin || session?.role === 'admin' || session?.user_email?.toLowerCase() === 'akash.saravanan1797@gmail.com';

  const getInitials = () => {
    if (session?.display_name) {
      const parts = session.display_name.trim().split(/\s+/);
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (session?.user_email) {
      const namePart = session.user_email.split('@')[0];
      const subparts = namePart.split(/[._-]/);
      if (subparts.length >= 2) return `${subparts[0][0]}${subparts[1][0]}`.toUpperCase();
      return namePart.slice(0, 2).toUpperCase();
    }
    return 'ME';
  };

  const initials = getInitials();

  return (
    <div className="byts-shell">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="byts-backdrop"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 95,
          }}
        />
      )}

      {/* Left Navigation Sidebar */}
      <aside className={`byts-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="byts-sidebar-brand">
          <div className="byts-brand-logo">
            <span className="byts-logo-icon">MedReport<sup style={{ fontSize: '13px', color: 'var(--primary)' }}>+</sup></span>
            <span className="byts-logo-sub">FRIENDLY HEALTH CLARITY</span>
          </div>
        </div>

        <nav className="byts-nav">
          {/* OVERVIEW Group */}
          <div className="byts-nav-group">
            <span className="byts-nav-heading">OVERVIEW</span>
            <SidebarLink
              href="/dashboard"
              icon={<Home size={17} />}
              label="Dashboard"
              currentPath={path}
              onClick={() => navigateTo('/dashboard')}
            />
            <SidebarLink
              href="/reports"
              icon={<FileText size={17} />}
              label="My Reports"
              currentPath={path}
              onClick={() => navigateTo('/reports')}
            />
            <SidebarLink
              href="/patients"
              icon={<UsersRound size={17} />}
              label="Patients"
              currentPath={path}
              onClick={() => navigateTo('/patients')}
            />
          </div>

          {/* CLINICAL TOOLS Group */}
          <div className="byts-nav-group">
            <span className="byts-nav-heading">CLINICAL TOOLS</span>
            <SidebarLink
              href="/upload"
              icon={<UploadCloud size={17} />}
              label="Scan Report"
              currentPath={path}
              onClick={() => {
                navigateTo('/dashboard');
                setTimeout(() => {
                  const el = document.getElementById('upload');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }}
            />
            <SidebarLink
              href="/reminders"
              icon={<Clock size={17} />}
              label="Care Reminders"
              currentPath={path}
              onClick={() => navigateTo('/reminders')}
            />
          </div>

          {/* ADMINISTRATION Group */}
          {isUserAdmin && (
            <div className="byts-nav-group">
              <span className="byts-nav-heading">ADMINISTRATION</span>
              <SidebarLink
                href="/admin"
                icon={<ShieldCheck size={17} />}
                label="Admin Portal"
                currentPath={path}
                onClick={() => navigateTo('/admin')}
              />
            </div>
          )}
        </nav>

        {/* Sidebar Footer with Logout */}
        <div className="byts-sidebar-footer">
          <button
            type="button"
            className="byts-logout-btn"
            onClick={onLogout}
            title="Sign out of account"
          >
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="byts-main-area">
        {/* Sticky Header Topbar */}
        <header className="byts-topbar">
          <div className="byts-topbar-left">
            <button
              type="button"
              className="byts-burger-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle navigation menu"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="byts-topbar-title">AI Report Simplifier</span>
          </div>

          <div className="byts-topbar-right">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle color theme"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {/* Role Badge */}
            <span className={`byts-role-badge ${isUserAdmin ? 'admin' : 'user'}`}>
              {isUserAdmin ? (
                <>
                  <ShieldCheck size={13} /> Admin
                </>
              ) : (
                <>
                  <UserCheck size={13} /> User
                </>
              )}
            </span>

            {/* User Avatar Circle with Dropdown Menu */}
            <div className="byts-avatar-menu-wrapper" ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="byts-avatar-circle"
                onClick={() => setMenuOpen((prev) => !prev)}
                title={`Account: ${session?.user_email || 'User'}`}
                aria-label="User account menu"
                aria-expanded={menuOpen}
                style={{ cursor: 'pointer', border: menuOpen ? '2px solid var(--primary)' : undefined }}
              >
                {initials}
              </button>

              {menuOpen && (
                <div className="byts-user-dropdown" role="menu">
                  <div className="byts-dropdown-header">
                    <div className="byts-dropdown-avatar">
                      {initials}
                    </div>
                    <div className="byts-dropdown-user-info">
                      <span className="byts-dropdown-name">{session?.display_name || 'Workspace User'}</span>
                      <span className="byts-dropdown-email" title={session?.user_email}>
                        <Mail size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                        {session?.user_email}
                      </span>
                      <span className={`byts-dropdown-role ${isUserAdmin ? 'admin' : 'user'}`}>
                        {isUserAdmin ? 'Administrator' : 'Standard User'}
                      </span>
                    </div>
                  </div>

                  <div className="byts-dropdown-divider" />

                  <div className="byts-dropdown-menu">
                    <button
                      type="button"
                      className="byts-dropdown-item"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowProfileModal(true);
                      }}
                    >
                      <User size={15} />
                      <span>User Profile</span>
                    </button>

                    {isUserAdmin && (
                      <button
                        type="button"
                        className="byts-dropdown-item"
                        onClick={() => {
                          setMenuOpen(false);
                          navigateTo('/admin');
                        }}
                      >
                        <ShieldCheck size={15} />
                        <span>Admin Portal</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="byts-dropdown-item logout-item"
                      onClick={() => {
                        setMenuOpen(false);
                        onLogout();
                      }}
                    >
                      <LogOut size={15} />
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* User Profile View Modal */}
        {showProfileModal && (
          <div className="result-overlay" onClick={() => setShowProfileModal(false)}>
            <div
              className="modal byts-profile-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '480px' }}
            >
              <button
                type="button"
                className="close"
                onClick={() => setShowProfileModal(false)}
                aria-label="Close profile modal"
              >
                <X size={16} />
              </button>

              <div className="byts-profile-header">
                <div className="byts-profile-avatar-large">
                  {initials}
                </div>
                <div className="byts-profile-title-block">
                  <p className="eyebrow" style={{ margin: 0 }}>User Profile</p>
                  <h2 style={{ margin: '4px 0', fontSize: '1.4rem' }}>{session?.display_name || 'Workspace User'}</h2>
                  <span className={`byts-role-badge ${isUserAdmin ? 'admin' : 'user'}`}>
                    {isUserAdmin ? 'Administrator' : 'Standard User'}
                  </span>
                </div>
              </div>

              <div className="byts-profile-body">
                <div className="byts-profile-row">
                  <span className="byts-profile-label">Login Email</span>
                  <span className="byts-profile-value highlight-email">{session?.user_email || 'Not available'}</span>
                </div>

                <div className="byts-profile-row">
                  <span className="byts-profile-label">Display Name</span>
                  <span className="byts-profile-value">{session?.display_name || 'Workspace User'}</span>
                </div>

                <div className="byts-profile-row">
                  <span className="byts-profile-label">Account Role</span>
                  <span className="byts-profile-value">{isUserAdmin ? 'Administrator (Full Access)' : 'Standard User'}</span>
                </div>

                <div className="byts-profile-row">
                  <span className="byts-profile-label">Sign-in Provider</span>
                  <span className="byts-profile-value" style={{ textTransform: 'capitalize' }}>
                    {session?.provider || 'Local Account'}
                  </span>
                </div>

                {session?.user_id && (
                  <div className="byts-profile-row">
                    <span className="byts-profile-label">Account ID</span>
                    <span className="byts-profile-value">#{session.user_id}</span>
                  </div>
                )}

                {session?.created_at && (
                  <div className="byts-profile-row">
                    <span className="byts-profile-label">Member Since</span>
                    <span className="byts-profile-value">
                      {new Date(session.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                )}

                <div className="byts-profile-row">
                  <span className="byts-profile-label">Session Status</span>
                  <span className="byts-profile-value" style={{ color: '#16a34a', fontWeight: 600 }}>
                    ● Active & Verified
                  </span>
                </div>
              </div>

              <div className="byts-profile-footer">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowProfileModal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={() => {
                    setShowProfileModal(false);
                    onLogout();
                  }}
                  style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Body Container */}
        <main className="byts-content-body">
          <ErrorBoundary key={path}>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function SidebarLink({ href, icon, label, currentPath, onClick }) {
  const isExact = currentPath === href;
  const isDashboard = href === '/dashboard' && (currentPath === '/' || currentPath === '/dashboard');
  const isActive = isExact || isDashboard;

  return (
    <a
      href={`#${href}`}
      className={`byts-nav-item ${isActive ? 'active' : ''}`}
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

