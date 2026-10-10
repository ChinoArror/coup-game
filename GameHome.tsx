import { useEffect, useState } from 'react';
import { ArrowRight, Bot, Clock3, Crown, History, LayoutDashboard, LogOut, Shield, Trophy, Users } from 'lucide-react';
import { AppShell, Badge, Button, InsetPanel, PageHeader, StatusDot, ThemeToggle } from './ui';

type Identity = { name?: string; username?: string; role: 'admin' | 'user' };
type HomeView = 'admin' | 'history' | 'leaderboard';

export default function GameHome({ identity, onNavigate, onLogout }: {
  identity: Identity;
  onNavigate: (view: HomeView) => void;
  onLogout: () => void;
}) {
  const [savedMatch, setSavedMatch] = useState<'loading' | 'active' | 'none'>('loading');

  useEffect(() => {
    let active = true;
    void fetch('/api/process')
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (active) setSavedMatch(data?.state && data.state.phase !== 'GAME_OVER' ? 'active' : 'none');
      })
      .catch(() => { if (active) setSavedMatch('none'); });
    return () => { active = false; };
  }, []);

  const displayName = identity.name || identity.username || 'Agent';
  const soloHref = savedMatch === 'none' ? '/play?new=1' : '/play';

  const nav = [
    { key: 'home', label: 'Command desk', description: 'Choose your next move', icon: <Shield size={18} />, active: true },
    ...(identity.role === 'admin' ? [{ key: 'admin', label: 'Admin dashboard', description: 'Manage agents and active rooms', icon: <LayoutDashboard size={18} />, onClick: () => onNavigate('admin') }] : []),
    { key: 'history', label: 'Match history', description: 'Review your previous tables', icon: <History size={18} />, onClick: () => onNavigate('history') },
    { key: 'leaderboard', label: 'Leaderboard', description: 'See who holds the table', icon: <Trophy size={18} />, onClick: () => onNavigate('leaderboard') },
  ];

  const footer = (
    <div className="flex items-center gap-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{displayName}</p>
        <p className="inline-flex items-center gap-1 text-micro uppercase tracking-[0.14em] text-muted-foreground">
          {identity.role === 'admin' && <Crown size={11} className="text-log-warn" />}
          {identity.role === 'admin' ? 'Administrator' : 'Operative'}
        </p>
      </div>
      <ThemeToggle />
      <Button variant="ghost" size="icon" onClick={onLogout} className="text-muted-foreground hover:text-destructive" aria-label="Log out" title="Log out"><LogOut size={17} /></Button>
    </div>
  );

  return (
    <AppShell nav={nav} footer={footer}>
      <PageHeader
        eyebrow={`Command desk / ${identity.role === 'admin' ? 'administrator' : 'player'}`}
        title="Choose your next move."
        description="Enter a live duel against the house agents, or build a table and bring your people in."
        status={<Badge tone="success" className="gap-1.5 py-1 pl-2.5 pr-3 text-[11px] font-medium uppercase tracking-wider"><StatusDot tone="success" />Secure channel established</Badge>}
        actions={<span className="hidden font-mono text-micro uppercase tracking-[0.14em] text-muted-foreground lg:inline">Protocol 01 / Awaiting command</span>}
      />

      <section aria-label="Choose a game mode" className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <a href={soloHref} className="group ui-card relative flex min-h-72 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-5 outline-none transition duration-300 hover:-translate-y-0.5 hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-80 sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 size-64 rounded-full border border-primary/10 sm:size-80"><div className="absolute inset-7 rounded-full border border-primary/10" /><div className="absolute inset-14 rounded-full border border-primary/10" /></div>
          <div className="relative flex items-start justify-between gap-4">
            <Badge tone="primary" className="gap-2 py-1.5 pl-2.5 pr-3 text-micro uppercase tracking-[0.15em]"><Bot size={13} /> Direct protocol</Badge>
            <span className="font-mono text-xs tracking-[0.18em] text-muted-foreground">01</span>
          </div>
          <div className="relative mt-7 sm:mt-9">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{savedMatch === 'active' ? 'Your match is waiting.' : 'Take on the agents.'}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">One seat is yours. Alapha and Beta are already at the table.</p>
          </div>
          <div className="relative mt-6 grid max-w-md grid-cols-2 gap-2 sm:mt-7">
            <InsetPanel className="bg-background/60 p-3 sm:p-4"><span className="font-mono text-micro uppercase tracking-[0.14em] text-muted-foreground">Agent 01</span><p className="mt-1 font-semibold">Alapha</p><p className="mt-1 text-meta text-muted-foreground">Unpredictable tactician</p></InsetPanel>
            <InsetPanel className="bg-background/60 p-3 sm:p-4"><span className="font-mono text-micro uppercase tracking-[0.14em] text-muted-foreground">Agent 02</span><p className="mt-1 font-semibold">Beta</p><p className="mt-1 text-meta text-muted-foreground">Calculated operator</p></InsetPanel>
          </div>
          <div className="relative mt-auto flex items-center justify-between gap-3 pt-7">
            <span className="text-sm font-semibold text-primary">{savedMatch === 'loading' ? 'Checking saved match…' : savedMatch === 'active' ? 'Continue match' : 'Start a new match'}</span>
            <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground transition group-hover:translate-x-1"><ArrowRight size={19} /></span>
          </div>
        </a>

        <a href="/game" className="group ui-card relative flex min-h-72 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-5 outline-none transition duration-300 hover:-translate-y-0.5 hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-80 sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-12 size-72 rounded-full border border-primary/10"><div className="absolute inset-8 rounded-full border border-primary/10" /><div className="absolute inset-16 rounded-full border border-primary/10" /></div>
          <div className="relative flex items-start justify-between gap-4">
            <Badge tone="neutral" className="gap-2 py-1.5 pl-2.5 pr-3 text-micro uppercase tracking-[0.15em]"><Users size={13} /> Assemble a table</Badge>
            <span className="font-mono text-xs tracking-[0.18em] text-muted-foreground">02</span>
          </div>
          <div className="relative mt-7 sm:mt-9">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bring your own crew.</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Set the table for 3–6. Mix AI agents with invited players, then start when every seat is ready.</p>
          </div>
          <div className="relative mt-7 grid max-w-md grid-cols-3 gap-2">
            {[3, 4, 6].map(count => <InsetPanel key={count} className="bg-background/60 px-3 py-3 text-center"><p className="font-mono text-lg font-bold tabular-nums text-primary">{count}</p><p className="mt-1 text-micro uppercase tracking-[0.12em] text-muted-foreground">seats</p></InsetPanel>)}
          </div>
          <div className="relative mt-auto flex items-center justify-between gap-3 pt-7">
            <span className="text-sm font-semibold text-primary">Create or join a room</span>
            <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground transition group-hover:translate-x-1"><ArrowRight size={19} /></span>
          </div>
        </a>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="More destinations">
        {identity.role === 'admin' && <button type="button" onClick={() => onNavigate('admin')} className="ui-card group flex min-h-16 items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 text-left outline-none transition hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-[3px] focus-visible:ring-ring/40">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><LayoutDashboard size={18} /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Admin dashboard</span><span className="mt-0.5 block text-xs text-muted-foreground">Manage agents and active rooms</span></span>
          <ArrowRight size={16} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </button>}
        <button type="button" onClick={() => onNavigate('history')} className="ui-card group flex min-h-16 items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 text-left outline-none transition hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-[3px] focus-visible:ring-ring/40">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><History size={18} /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Match history</span><span className="mt-0.5 block text-xs text-muted-foreground">Review your previous tables</span></span>
          <ArrowRight size={16} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </button>
        <button type="button" onClick={() => onNavigate('leaderboard')} className="ui-card group flex min-h-16 items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 text-left outline-none transition hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-[3px] focus-visible:ring-ring/40">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Trophy size={18} /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Leaderboard</span><span className="mt-0.5 block text-xs text-muted-foreground">See who holds the table</span></span>
          <ArrowRight size={16} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </button>
      </section>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 pt-5 font-mono text-micro uppercase tracking-[0.13em] text-muted-foreground">
        <span>Shadow Protocol / Secure play session</span>
        <span className="inline-flex items-center gap-1.5"><Clock3 size={12} /> {savedMatch === 'active' ? 'Match autosaves' : 'Ready when you are'}</span>
      </footer>
    </AppShell>
  );
}
