import type { ReactNode } from 'react';
import { Shield } from 'lucide-react';

export default function ProtocolPage({ eyebrow, title, description, status = 'Secure channel established', actions, children, width = 'max-w-7xl' }: {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
  actions?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#090d12] text-slate-100 selection:bg-amber-400/25">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,rgba(245,158,11,0.12),transparent_55%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:56px_56px]" />

      <header className="relative z-10 border-b border-white/10 bg-[#090d12]/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[76px] max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3" aria-label="Coup home">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-300"><Shield size={21} /></span>
            <span className="min-w-0"><span className="block font-mono text-sm font-bold tracking-[0.16em] text-amber-200">COUP</span><span className="hidden text-[10px] tracking-[0.2em] text-slate-500 sm:block">SHADOW PROTOCOL</span></span>
          </a>
          {actions && <nav className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2" aria-label="Page actions">{actions}</nav>}
        </div>
      </header>

      <main className={`relative z-10 mx-auto ${width} px-4 pb-12 pt-8 sm:px-6 sm:pt-12 lg:px-8`}>
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-200/80"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.8)]" />{status}</div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-amber-300/70">{eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">{description}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
