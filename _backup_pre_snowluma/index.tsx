import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Login from './Login';
import AdminPanel from './AdminPanel';
import Leaderboard from './Leaderboard';
import History from './History';
import Rules from './Rules';
import GameHub from './GameHub';
import GameHome from './GameHome';
import InviteAcceptance from './InviteAcceptance';
import NotFound from './NotFound';
import { invitePathForToken, pendingInviteStorageKey, resolveAppRoute } from './services/appRouting';
import { cleanSsoCallbackPath } from './services/sso';

const RootComponent = () => {
  const [authStatus, setAuthStatus] = useState<'checking' | 'unauth' | 'admin' | 'user'>('checking');
  const [identity, setIdentity] = useState<{ uuid: string; username: string; name: string; role: 'admin' | 'user' } | null>(null);
  const [view, setView] = useState<'app' | 'admin' | 'leaderboard' | 'history'>('app');
  const initialRoute = resolveAppRoute(window.location.pathname, window.location.search);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('Unauth');
      const data = await res.json() as { uuid: string; username: string; name: string; role: 'admin' | 'user' };
      setIdentity(data);
      setAuthStatus(data.role);
    } catch (e) {
      setIdentity(null);
      setAuthStatus('unauth');
    }
  };

  useEffect(() => {
    const openingRoute = resolveAppRoute(window.location.pathname, window.location.search);
    if (openingRoute.page === 'invite' && invitePathForToken(openingRoute.token)) {
      try { sessionStorage.setItem(pendingInviteStorageKey, openingRoute.token); } catch { /* Storage may be disabled. */ }
    }
    const searchParams = new URLSearchParams(window.location.search);
    const ssoToken = searchParams.get('token');

    if (window.location.pathname === '/sso-callback' && ssoToken) {
      setAuthStatus('checking');
      let invitePath: string | null = null;
      try { invitePath = invitePathForToken(sessionStorage.getItem(pendingInviteStorageKey)); } catch { /* Storage may be disabled. */ }
      window.history.replaceState({}, document.title, invitePath || cleanSsoCallbackPath(window.location.pathname));
      fetch('/api/sso-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: ssoToken })
      })
        .then(res => {
          if (!res.ok) throw new Error('Callback failed');
          return res.json();
        })
        .then(() => {
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

  if (document.querySelector('meta[name="coup-route-status"][content="404"]') || initialRoute.page === 'notFound') return <NotFound />;
  if (initialRoute.page === 'publicRules') return <Rules backHref="/" />;

  if (authStatus === 'checking') {
    if (initialRoute.page === 'home') return <Login />;
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-amber-500 font-mono tracking-widest animate-pulse">ESTABLISHING CONNECTION...</div>;
  }

  if (authStatus === 'unauth') {
    return <Login invited={initialRoute.page === 'invite'} />;
  }

  const route = resolveAppRoute(window.location.pathname, window.location.search);
  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => undefined);
    const afterLogoutUrl = encodeURIComponent(window.location.origin);
    window.location.href = `https://accounts.aryuki.com/logout?redirect=${afterLogoutUrl}`;
  };

  if (view === 'admin' && authStatus === 'admin') return <AdminPanel />;
  if (view === 'leaderboard') return <Leaderboard onBack={() => setView('app')} />;
  if (view === 'history') return <History onBack={() => setView('app')} />;

  if (route.page === 'rules') return <Rules backHref="/game" />;
  if (route.page === 'invite') return <InviteAcceptance token={route.token} />;
  if (route.page === 'rooms') return <GameHub />;
  if (route.page === 'room') return <GameHub roomId={route.roomId} />;
  if (route.page === 'solo') return <App role={authStatus} onNavigate={setView} onLogout={logout} />;

  return <GameHome identity={identity || { role: authStatus, name: 'Agent' }} onNavigate={setView} onLogout={logout} />;
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element to mount to");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
