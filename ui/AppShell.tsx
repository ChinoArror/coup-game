import type { ReactNode } from 'react';
import { cn } from './cn';

export interface AppShellNavItem {
  key: string;
  label: string;
  description?: string;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}

export interface AppShellProps {
  nav?: AppShellNavItem[];
  /** User identity, theme toggle, logout: rendered in the sidebar on desktop and the top bar on mobile. */
  footer?: ReactNode;
  children: ReactNode;
}

const navRowBase = 'relative flex min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40';

function NavRow({ item, compact = false }: { item: AppShellNavItem; compact?: boolean }) {
  const content = (
    <>
      {item.active && <span aria-hidden="true" className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />}
      <span className="grid size-5 shrink-0 place-items-center [&_svg]:size-4">{item.icon}</span>
      <span className="min-w-0">
        <span className="block truncate">{item.label}</span>
        {item.description && !compact && <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{item.description}</span>}
      </span>
    </>
  );
  const className = cn(
    navRowBase,
    compact && 'shrink-0 py-1.5',
    item.active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
  );
  if (item.href) {
    return <a href={item.href} className={className} aria-current={item.active ? 'page' : undefined}>{content}</a>;
  }
  return (
    <button type="button" onClick={item.onClick} className={className} aria-current={item.active ? 'page' : undefined}>
      {content}
    </button>
  );
}

export function AppShell({ nav = [], footer, children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-sidebar text-foreground lg:flex">
      <header className="sticky top-0 z-30 flex flex-col gap-2 bg-sidebar/90 px-4 pb-2 pt-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Brand />
          {footer && <div className="flex min-w-0 items-center gap-1">{footer}</div>}
        </div>
        {nav.length > 0 && (
          <nav aria-label="Primary" className="flex flex-wrap gap-1">
            {nav.map(item => <NavRow key={item.key} item={item} compact />)}
          </nav>
        )}
      </header>

      <aside className="hidden w-60 shrink-0 flex-col gap-6 px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="px-2"><Brand /></div>
        {nav.length > 0 && (
          <nav aria-label="Primary" className="flex flex-col gap-1">
            {nav.map(item => <NavRow key={item.key} item={item} />)}
          </nav>
        )}
        {footer && <div className="mt-auto flex flex-col gap-3 px-1 pb-1">{footer}</div>}
      </aside>

      <main className="flex min-h-dvh min-w-0 flex-1 flex-col bg-background shadow-[0_0_18px_-6px_rgb(0_0_0/0.14)] lg:my-0 lg:min-h-dvh lg:rounded-tl-2xl">
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8 2xl:max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <span className="font-mono text-xs font-bold tracking-wider">C</span>
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block font-mono text-sm font-bold tracking-[0.12em]">COUP</span>
        <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Shadow Protocol</span>
      </span>
    </div>
  );
}

export interface PageHeaderProps {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Optional status chip shown beside the title (e.g. a Badge with a StatusDot). */
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Page header inside the app canvas: icon well, eyebrow, title, description and right-side actions. */
export function PageHeader({ icon, eyebrow, title, description, status, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">{icon}</span>}
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</p>}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {status}
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
