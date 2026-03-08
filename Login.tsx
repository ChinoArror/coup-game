import React, { useState } from 'react';
import { Shield, Lock, User } from 'lucide-react';

export default function Login() {
  const SSO_URL = 'https://accounts.aryuki.com';
  const APP_ID = 'coup-game'; // Matches wrangler.toml
  const CALLBACK_URL = window.location.origin + '/sso-callback';

  const handleSSOLogin = () => {
    window.location.href = `${SSO_URL}/?client_id=${APP_ID}&redirect=${encodeURIComponent(CALLBACK_URL)}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans text-slate-200 selection:bg-amber-500/30">
      <div className="mb-8 flex flex-col items-center gap-4 animate-pulse">
        <Shield className="text-amber-500 w-16 h-16 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
        <h1 className="text-2xl font-bold tracking-widest text-amber-500 font-mono">COUP: SHADOW PROTOCOL</h1>
      </div>

      <div className="w-full max-w-sm bg-slate-900/80 backdrop-blur-md p-8 rounded-2xl border-2 border-slate-800 shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all">
        <p className="text-slate-400 text-sm mb-8 text-center uppercase tracking-widest font-mono">Authentication Required</p>

        <button
          onClick={handleSSOLogin}
          className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold py-4 rounded-xl flex justify-center items-center gap-3 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:scale-[1.02] active:scale-[0.98] uppercase tracking-wider text-sm"
        >
          <Lock className="w-5 h-5" />
          Login With Aryuki Auth Center
        </button>

        <p className="mt-6 text-[10px] text-slate-500 text-center font-mono uppercase tracking-tighter opacity-50">
          Secure SSO Tunnel Established
        </p>
      </div>
    </div>
  );
}
