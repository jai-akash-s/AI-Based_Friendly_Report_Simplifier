import React, { useState, useEffect } from 'react';
import {
  Activity, Award, BarChart2, Bell, BookOpen, Calendar, Clock,
  FileSpreadsheet, FileText, HeartPulse, Home, LayoutDashboard,
  LogOut, Menu, Moon, ShieldCheck, Sparkles, Sun, UploadCloud,
  UserCheck, UserCog, UsersRound, X,
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { go } from '../../api/client';

export function Shell({ session, path, onLogout, onNavigate, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('medreport_theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('medreport_theme', theme);
  }, [theme]);

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
              onClick={() => {
                navigateTo('/dashboard');
                setTimeout(() => {
                  const el = document.querySelector('.reminders-card');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }}
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

            {/* User Avatar Circle */}
            <div
              className="byts-avatar-circle"
              title={`${session?.user_email} (${isUserAdmin ? 'Admin' : 'User'})`}
            >
              {initials}
            </div>
          </div>
        </header>

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

