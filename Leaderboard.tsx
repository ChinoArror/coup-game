import React, { useState, useEffect } from 'react';
import { Trophy, Clock, Skull, ArrowLeft } from 'lucide-react';

export default function Leaderboard({ onBack }: { onBack: () => void }) {
    const [data, setData] = useState<any[]>([]);

    useEffect(() => {
        fetch('/api/leaderboard').then(r => r.json()).then(setData);
    }, []);

    const getRankStyle = (place: number) => {
        if (place === 1) return 'text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)] border-amber-500';
        if (place === 2) return 'text-slate-300 drop-shadow-[0_0_10px_rgba(203,213,225,0.5)] border-slate-300';
        if (place === 3) return 'text-amber-700 drop-shadow-[0_0_10px_rgba(180,83,9,0.5)] border-amber-700';
        return 'text-slate-500 border-slate-700';
    };

    const getRankLabel = (place: number) => {
        if (place === 1) return 'WINNER';
        if (place === 2) return '2ND PLACE';
        if (place === 3) return '1ST DEAD';
        return `RANK ${place}`;
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-8">
            <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-amber-500 transition-colors font-mono">
                    <ArrowLeft size={18} /> BACK
                </button>
                <div className="flex items-center gap-3">
                    <Trophy className="text-amber-500 w-8 h-8 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                    <h1 className="text-2xl font-bold tracking-widest text-amber-500 font-mono">GLOBAL RANKINGS</h1>
                </div>
                <div className="w-[80px]"></div> {/* Spacer */}
            </header>

            <div className="max-w-4xl mx-auto bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border-2 border-slate-800 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                {data.length === 0 ? (
                    <div className="text-center text-slate-500 font-mono py-12">No match records found in database.</div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {data.map((row, i) => (
                            <div key={row.id} className={`flex items-center justify-between p-4 rounded-xl border ${getRankStyle(row.place)} bg-slate-950/80`}>
                                <div className="flex items-center gap-4">
                                    <h2 className="text-xl font-bold font-mono min-w-[120px] truncate">{row.username}</h2>
                                </div>
                                <div className="flex gap-8 text-sm font-mono text-slate-400">
                                    <div className="flex items-center gap-2">
                                        <Trophy size={14} className={row.place === 1 ? 'text-amber-500' : 'text-slate-500'} />
                                        <span className={row.place === 1 ? 'text-amber-500 font-bold' : ''}>{getRankLabel(row.place)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Clock size={14} />
                                        <span>{row.duration_seconds}s</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="opacity-50">{new Date(row.match_date).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
