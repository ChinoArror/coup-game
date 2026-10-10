import { useEffect, useState } from 'react';
import { ArrowRight, Bot, Clock3, Crown, History, LayoutDashboard, LogOut, Shield, Trophy, Users } from 'lucide-react';

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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#090d12] text-slate-100 selection:bg-amber-400/25">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,rgba(245,158,11,0.12),transparent_55%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:56px_56px]" />

      <header className="relative z-10 border-b border-white/10 bg-[#090d12]/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3" aria-label="Coup home">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-300"><Shield size={21} /></span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-sm font-bold tracking-[0.16em] text-amber-200">COUP</span>
              <span className="hidden text-[10px] tracking-[0.2em] text-slate-500 sm:block">SHADOW PROTOCOL</span>
            </span>
          </a>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-48 truncate text-sm font-semibold text-slate-100">{displayName}</p>
              <p className="mt-0.5 inline-flex items-center justify-end gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                {identity.role === 'admin' && <Crown size={11} className="text-amber-300" />}
                {identity.role === 'admin' ? 'Administrator' : 'Operative'}
              </p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] font-mono text-sm font-bold text-amber-200" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
            <button onClick={onLogout} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-slate-400 transition hover:border-red-300/30 hover:bg-red-400/10 hover:text-red-200" aria-label="Log out" title="Log out"><LogOut size={17} /></button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 sm:pt-12 lg:px-8 lg:pt-16">
        <section className="mb-8 flex flex-col justify-between gap-5 sm:mb-10 sm:flex-row sm:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-200/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.8)]" /> Secure channel established
            </div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-amber-300/70">Command desk / {identity.role === 'admin' ? 'administrator' : 'player'}</p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">Choose your next move.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Enter a live duel against the house agents, or build a table and bring your people in.</p>
          </div>
          <div className="hidden items-center gap-2 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500 lg:flex"><span className="h-px w-8 bg-amber-300/40" /> Protocol 01 <span className="text-slate-700">/</span> Awaiting command</div>
        </section>

        <section aria-label="Choose a game mode" className="grid gap-4 lg:grid-cols-2 lg:gap-5">
          <a href={soloHref} className="group relative flex min-h-[300px] flex-col overflow-hidden rounded-3xl border border-amber-200/20 bg-gradient-to-br from-[#282116] via-[#171713] to-[#10151a] p-5 shadow-[0_24px_80px_rgba(0,0,0,.24)] transition duration-300 hover:-translate-y-1 hover:border-amber-200/40 hover:shadow-[0_28px_90px_rgba(245,158,11,.1)] sm:min-h-[340px] sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-64 w-64 rounded-full border border-amber-100/[0.07] sm:h-80 sm:w-80"><div className="absolute inset-7 rounded-full border border-amber-100/[0.06]" /><div className="absolute inset-14 rounded-full border border-amber-100/[0.05]" /></div>
            <div className="relative flex items-start justify-between gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/15 bg-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-amber-200/80"><Bot size={13} /> Direct protocol</span>
              <span className="font-mono text-xs tracking-[0.18em] text-amber-100/40">01</span>
            </div>
            <div className="relative mt-7 sm:mt-9">
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{savedMatch === 'active' ? 'Your match is waiting.' : 'Take on the agents.'}</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">One seat is yours. Alapha and Beta are already at the table.</p>
            </div>
            <div className="relative mt-6 grid max-w-md grid-cols-2 gap-2 sm:mt-7">
              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3 sm:p-4"><span className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200/55">Agent 01</span><p className="mt-1 font-semibold text-slate-100">Alapha</p><p className="mt-1 text-[11px] text-slate-500">Unpredictable tactician</p></div>
              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3 sm:p-4"><span className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200/55">Agent 02</span><p className="mt-1 font-semibold text-slate-100">Beta</p><p className="mt-1 text-[11px] text-slate-500">Calculated operator</p></div>
            </div>
            <div className="relative mt-auto flex items-center justify-between gap-3 pt-7">
              <span className="text-sm font-semibold text-amber-100">{savedMatch === 'loading' ? 'Checking saved match…' : savedMatch === 'active' ? 'Continue match' : 'Start a new match'}</span>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-amber-300 text-[#15120d] transition group-hover:translate-x-1"><ArrowRight size={19} /></span>
            </div>
          </a>

          <a href="/game" className="group relative flex min-h-[300px] flex-col overflow-hidden rounded-3xl border border-sky-200/15 bg-gradient-to-br from-[#14232a] via-[#111a20] to-[#10151a] p-5 shadow-[0_24px_80px_rgba(0,0,0,.2)] transition duration-300 hover:-translate-y-1 hover:border-sky-200/35 hover:shadow-[0_28px_90px_rgba(56,189,248,.08)] sm:min-h-[340px] sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-12 h-72 w-72 rounded-full border border-sky-100/[0.07]"><div className="absolute inset-8 rounded-full border border-sky-100/[0.06]" /><div className="absolute inset-16 rounded-full border border-sky-100/[0.05]" /></div>
            <div className="relative flex items-start justify-between gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/15 bg-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-sky-100/80"><Users size={13} /> Assemble a table</span>
              <span className="font-mono text-xs tracking-[0.18em] text-sky-100/40">02</span>
            </div>
            <div className="relative mt-7 sm:mt-9">
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Bring your own crew.</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">Set the table for 3–6. Mix AI agents with invited players, then start when every seat is ready.</p>
            </div>
            <div className="relative mt-7 grid max-w-md grid-cols-3 gap-2">
              {[3, 4, 6].map(count => <div key={count} className="rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3 text-center"><p className="font-mono text-lg font-bold text-sky-100">{count}</p><p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">seats</p></div>)}
            </div>
            <div className="relative mt-auto flex items-center justify-between gap-3 pt-7">
              <span className="text-sm font-semibold text-sky-100">Create or join a room</span>
              <span className="grid h-11 w-11 place-items-center rounded-full border border-sky-100/20 bg-sky-100/10 text-sky-100 transition group-hover:translate-x-1"><ArrowRight size={19} /></span>
            </div>
          </a>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="More destinations">
          {identity.role === 'admin' && <button onClick={() => onNavigate('admin')} className="flex min-h-16 items-center gap-3 rounded-2xl border border-amber-200/15 bg-white/[0.025] px-4 text-left transition hover:border-amber-200/30 hover:bg-white/[0.045]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-200/10 text-amber-200"><LayoutDashboard size={18} /></span><span className="flex-1"><span className="block text-sm font-semibold text-slate-100">Admin dashboard</span><span className="mt-0.5 block text-xs text-slate-500">Manage agents and active rooms</span></span><ArrowRight size={16} className="text-slate-600" /></button>}
          <button onClick={() => onNavigate('history')} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 text-left transition hover:border-white/20 hover:bg-white/[0.045]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-slate-300"><History size={18} /></span><span className="flex-1"><span className="block text-sm font-semibold text-slate-100">Match history</span><span className="mt-0.5 block text-xs text-slate-500">Review your previous tables</span></span><ArrowRight size={16} className="text-slate-600" /></button>
          <button onClick={() => onNavigate('leaderboard')} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 text-left transition hover:border-white/20 hover:bg-white/[0.045]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-slate-300"><Trophy size={18} /></span><span className="flex-1"><span className="block text-sm font-semibold text-slate-100">Leaderboard</span><span className="mt-0.5 block text-xs text-slate-500">See who holds the table</span></span><ArrowRight size={16} className="text-slate-600" /></button>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-5 font-mono text-[10px] uppercase tracking-[0.13em] text-slate-600">
          <span>Shadow Protocol / Secure play session</span>
          <span className="inline-flex items-center gap-1.5"><Clock3 size={12} /> {savedMatch === 'active' ? 'Match autosaves' : 'Ready when you are'}</span>
        </footer>
      </main>
    </div>
  );
}
