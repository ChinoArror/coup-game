import React, { useState, useEffect } from 'react';
import { Shield, Users, Power, Lock, Trophy } from 'lucide-react';

export default function AdminPanel({ onNavigate }: { onNavigate: (view: 'game' | 'leaderboard') => void }) {
    const [users, setUsers] = useState<any[]>([]);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        const res = await fetch('/api/admin/users');
        if (res.ok) {
            setUsers(await res.json());
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername || !newPassword) return;
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newUsername, password: newPassword }),
        });
        if (res.ok) {
            setNewUsername('');
            setNewPassword('');
            fetchUsers();
        }
    };

    const handleTogglePause = async (id: string, isPaused: boolean) => {
        const res = await fetch(`/api/admin/users/${id}/${isPaused ? 'continue' : 'pause'}`, { method: 'PUT' });
        if (res.ok) {
            fetchUsers();
        }
    };

    const handleLogout = async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.reload();
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-500/30 p-8">
            <header className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2">
                    <Shield className="text-amber-500 w-8 h-8 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                    <h1 className="text-2xl font-bold tracking-widest text-amber-500 font-mono">ADMIN SERVER</h1>
                </div>
                <div className="flex gap-4">
                    <button onClick={() => onNavigate('game')} className="bg-slate-800 hover:bg-slate-700 font-bold px-4 py-2 rounded-lg transition-colors border border-slate-700">Go to Game</button>
                    <button onClick={() => onNavigate('leaderboard')} className="bg-slate-800 hover:bg-slate-700 font-bold px-4 py-2 rounded-lg transition-colors border border-slate-700">Leaderboard</button>
                    <button onClick={handleLogout} className="bg-red-900/40 border border-red-500 hover:bg-red-900/60 text-red-100 font-bold px-4 py-2 rounded-lg transition-colors">Logout</button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                {/* ADD USER */}
                <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border-2 border-slate-800 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                    <h2 className="text-xl font-bold font-mono text-slate-300 flex items-center gap-2 mb-6"><Users /> ADD OPERATIVE</h2>
                    <form onSubmit={handleAddUser} className="flex flex-col gap-4">
                        <input
                            type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
                            placeholder="Username"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 px-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all font-mono"
                        />
                        <input
                            type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Password"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 px-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all font-mono"
                        />
                        <button type="submit" disabled={!newUsername || !newPassword} className="bg-amber-600 hover:bg-amber-500 text-slate-950 disabled:bg-slate-800 disabled:text-slate-500 font-bold py-3 rounded-lg flex justify-center items-center transition-all uppercase tracking-widest">
                            Create User
                        </button>
                    </form>
                </div>

                {/* LIST USERS */}
                <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border-2 border-slate-800 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                    <h2 className="text-xl font-bold font-mono text-slate-300 flex items-center gap-2 mb-6"><Power /> MANAGE OPERATIVES</h2>
                    <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto">
                        {users.map(u => (
                            <div key={u.id} className="flex justify-between items-center bg-slate-950 border border-slate-800 p-4 rounded-lg">
                                <div>
                                    <div className="font-bold text-slate-300 font-mono">{u.username}</div>
                                    <div className="text-xs text-slate-500">{new Date(u.created_at).toLocaleString()}</div>
                                </div>
                                <button
                                    onClick={() => handleTogglePause(u.id, !!u.is_paused)}
                                    className={`px-3 py-1 text-xs font-bold font-mono rounded-lg border ${u.is_paused ? 'bg-amber-600/20 text-amber-500 border-amber-500/50' : 'bg-red-600/20 text-red-500 border-red-500/50'}`}
                                >
                                    {u.is_paused ? 'CONTINUE' : 'PAUSE'}
                                </button>
                            </div>
                        ))}
                        {users.length === 0 && <div className="text-slate-500 text-center py-8">No operatives found in database.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
