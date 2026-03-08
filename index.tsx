import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Login from './Login';
import AdminPanel from './AdminPanel';
import Leaderboard from './Leaderboard';

const RootComponent = () => {
  const [authStatus, setAuthStatus] = useState<'checking' | 'unauth' | 'admin' | 'user'>('checking');
  const [view, setView] = useState<'game' | 'admin' | 'leaderboard'>('game');

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('Unauth');
      const data = await res.json();
      setAuthStatus(data.role);
    } catch (e) {
      setAuthStatus('unauth');
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const ssoToken = searchParams.get('token');

    if (window.location.pathname === '/sso-callback' && ssoToken) {
      setAuthStatus('checking');
      fetch('/api/sso-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: ssoToken })
      })
        .then(res => {
          if (!res.ok) throw new Error('Callback failed');
          return res.json();
        })
        .then(data => {
          // Success! Clear URL and check auth
          window.history.replaceState({}, document.title, window.location.pathname.replace('/sso-callback', ''));
          checkAuth();
        })
        .catch(e => {
          console.error('[SSO_DEBUG] Callback failed:', e);
          setAuthStatus('unauth');
        });
    } else {
      checkAuth();
    }
  }, []);

  if (authStatus === 'checking') {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-amber-500 font-mono tracking-widest animate-pulse">ESTABLISHING CONNECTION...</div>;
  }

  if (authStatus === 'unauth') {
    return <Login />;
  }

  if (view === 'admin') return <AdminPanel onNavigate={setView} />;
  if (view === 'leaderboard') return <Leaderboard onBack={() => setView('game')} />;

  return <App role={authStatus} onNavigate={setView} onLogout={() => setAuthStatus('unauth')} />;
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element to mount to");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);