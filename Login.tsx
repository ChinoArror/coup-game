import React, { useState } from 'react';
import { Shield, Lock } from 'lucide-react';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    
    try {
      const response = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      if (response.ok) {
        localStorage.setItem('coup_auth_token', 'validated');
        onLogin();
      } else {
        setError(true);
        setPassword('');
      }
    } catch (err) {
      console.error('Login error', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans text-slate-200 selection:bg-amber-500/30">
        <div className="mb-8 flex flex-col items-center gap-4 animate-bounce">
            <Shield className="text-amber-500 w-16 h-16 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
            <h1 className="text-2xl font-bold tracking-widest text-amber-500 font-mono">COUP: SHADOW PROTOCOL</h1>
        </div>
        
        <div className="w-full max-w-sm bg-slate-900/80 backdrop-blur-md p-8 rounded-2xl border-2 border-slate-800 shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all">
            <p className="text-slate-400 text-sm mb-6 text-center uppercase tracking-widest font-mono">Enter Access Code</p>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-slate-500" />
                    </div>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(false); }}
                        className={`w-full bg-slate-950 border ${error ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'border-slate-700'} rounded-lg py-3 pl-10 pr-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono`}
                        placeholder="PROTOCOL_KEY"
                        autoFocus
                    />
                </div>
                
                {error && (
                    <div className="text-red-400 text-xs font-mono text-center animate-pulse">
                        ACCESS DENIED. INVALID CREDENTIALS.
                    </div>
                )}
                
                <button
                    type="submit"
                    disabled={loading || !password}
                    className="mt-2 w-full bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold py-3 rounded-lg flex justify-center items-center transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] disabled:shadow-none uppercase tracking-widest"
                >
                    {loading ? 'Authenticating...' : 'Initialize'}
                </button>
            </form>
        </div>
    </div>
  );
}
