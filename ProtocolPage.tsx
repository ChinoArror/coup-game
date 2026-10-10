import type { ReactNode } from 'react';
import { Shield } from 'lucide-react';
import { Badge, ThemeToggle } from './ui';

export default function ProtocolPage({ eyebrow, title, description, status = 'Secure channel established', actions, children, width = 'max-w-7xl', backdrop }: {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
  actions?: ReactNode;
  children: ReactNode;
  width?: string;
  /** Optional decorative layer behind the page content (e.g. the login wave field). */
  backdrop?: ReactNode;
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(75%_55%_at_50%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_68%)]" />
      {backdrop}

      <header className="relative z-10 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-label="Coup home">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Shield size={16} /></span>
            <span className="min-w-0 leading-tight">
              <span className="block font-mono text-sm font-bold tracking-[0.12em]">COUP</span>
              <span className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:block">SHADOW PROTOCOL</span>
            </span>
          </a>
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {actions && <nav className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2" aria-label="Page actions">{actions}</nav>}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className={`relative z-10 mx-auto ${width} px-4 pb-12 pt-8 sm:px-6 sm:pt-12 lg:px-8`}>
        <div className="mb-8">
          {status && (
            <div className="mb-4">
              <Badge tone="success" className="gap-1.5 py-1 pl-2.5 pr-3 text-[11px] font-medium uppercase tracking-wider">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-success shadow-[0_0_8px_color-mix(in_oklab,var(--success)_60%,transparent)]" />
                {status}
              </Badge>
            </div>
          )}
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">{title}</h1>
          {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
