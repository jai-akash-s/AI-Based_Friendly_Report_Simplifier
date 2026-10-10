import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api, go, cleanPath } from './api/client';
import { Shell } from './components/layout/Shell';
import { AuthView } from './views/AuthView';
import { Dashboard } from './views/Dashboard';
import { Patients } from './views/Patients';
import { PatientDetail } from './views/PatientDetail';
import { Reports } from './views/Reports';
import { AdminPortal } from './views/AdminPortal';

function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [path, setPath] = useState(cleanPath());

  useEffect(() => {
    const onHashChange = () => setPath(cleanPath());
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);

    api('/api/auth/session')
      .then((data) => {
        if (data && data.authenticated && data.user_email) {
          setSession(data);
        } else {
          setSession(null);
        }
      })
      .catch(() => setSession(null))
      .finally(() => setChecking(false));

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (err) {
      console.warn('Logout request warning:', err);
    } finally {
      setSession(null);
      go('/dashboard');
    }
  };

  if (checking) {
    return (
      <div className="loading-screen">
        <Sparkles />
        <span>Opening your workspace...</span>
      </div>
    );
  }

  if (!session) {
    return <AuthView onAuthenticated={setSession} />;
  }

  let currentView;
  if (path.startsWith('/patients/')) {
    const patientId = path.split('/')[2];
    currentView = <PatientDetail id={patientId} />;
  } else if (path === '/patients') {
    currentView = <Patients />;
  } else if (path === '/reports') {
    currentView = <Reports />;
  } else if (path === '/admin') {
    currentView = <AdminPortal session={session} />;
  } else {
    currentView = <Dashboard session={session} />;
  }

  return (
    <Shell
      session={session}
      path={path}
      onLogout={handleLogout}
      onNavigate={setPath}
    >
      {currentView}
    </Shell>
  );
}

export default App;
