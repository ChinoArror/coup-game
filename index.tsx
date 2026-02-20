import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Login from './Login';
import AdminPanel from './AdminPanel';
import Leaderboard from './Leaderboard';

const RootComponent = () => {
  const [authStatus, setAuthStatus] = useState<'checking' | 'unauth' | 'admin' | 'user'>('checking');
  const [view, setView] = useState<'game' | 'admin' | 'leaderboard'>('game');

  useEffect(() => {
    fetch('/api/me')
      .then(res => {
        if (!res.ok) throw new Error('Unauth');
        return res.json();
      })
      .then(data => {
        setAuthStatus(data.role);
        if (data.role === 'admin') setView('admin');
        else setView('game');
      })
      .catch((e) => {
        setAuthStatus('unauth');
      });
  }, []);

  if (authStatus === 'checking') {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-amber-500 font-mono tracking-widest animate-pulse">ESTABLISHING CONNECTION...</div>;
  }

  if (authStatus === 'unauth') {
    return <Login onLogin={(user) => {
      setAuthStatus(user.role);
      if (user.role === 'admin') setView('admin');
      else setView('game');
    }} />;
  }

  if (view === 'admin') return <AdminPanel onNavigate={setView} />;
  if (view === 'leaderboard') return <Leaderboard onBack={() => setView('game')} />;

  // Pass setView so that App can navigate to leaderboard or logout
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