import React, { useState, useEffect } from 'react';
import { Trophy, Clock, ArrowLeft } from 'lucide-react';
import { AppShell, Button, Card, PageHeader, ThemeToggle, cn } from './ui';

export default function Leaderboard({ onBack }: { onBack: () => void }) {
    const [data, setData] = useState<any[]>([]);

    useEffect(() => {
        fetch('/api/leaderboard').then(r => r.json()).then(setData);
    }, []);

    const getRankStyle = (place: number) => {
        if (place === 1) return 'border-warning/50 bg-warning/10 text-log-warn';
        if (place === 2) return 'border-border bg-muted/50 text-foreground';
        if (place === 3) return 'border-warning/30 bg-warning/5 text-log-warn/80';
        return 'border-border/60 bg-background/50 text-muted-foreground';
    };

    const getRankLabel = (place: number) => {
        if (place === 1) return 'WINNER';
        if (place === 2) return '2ND PLACE';
        if (place === 3) return '1ST DEAD';
        return `RANK ${place}`;
    };

    return (
        <AppShell
            nav={[
                { key: 'back', label: 'Command desk', description: 'Back to the command desk', icon: <ArrowLeft size={18} />, onClick: onBack },
                { key: 'leaderboard', label: 'Leaderboard', description: 'See who holds the table', icon: <Trophy size={18} />, active: true },
            ]}
            footer={<ThemeToggle />}
        >
            <PageHeader
                icon={<Trophy size={20} />}
                title="GLOBAL RANKINGS"
                actions={<Button variant="outline" onClick={onBack} className="h-10 gap-2 px-3 font-mono text-xs"><ArrowLeft size={16} />BACK</Button>}
            />

            <Card className="mx-auto max-w-4xl p-6">
                {data.length === 0 ? (
                    <div className="py-12 text-center font-mono text-muted-foreground">No match records found in database.</div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {data.map((row, i) => (
                            <div key={row.id} className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4', getRankStyle(row.place))}>
                                <div className="flex items-center gap-4">
                                    <h2 className="min-w-[120px] truncate font-mono text-xl font-bold">{row.username}</h2>
                                </div>
                                <div className="flex flex-wrap gap-6 font-mono text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <Trophy size={14} className={row.place === 1 ? 'text-log-warn' : 'text-muted-foreground'} />
                                        <span className={row.place === 1 ? 'font-bold text-log-warn' : ''}>{getRankLabel(row.place)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Clock size={14} />
                                        <span className="tabular-nums">{row.duration_seconds}s</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="opacity-60">{new Date(row.match_date).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </AppShell>
    );
}
