import type { ReactNode } from 'react';
import { cn } from './cn';

export interface StatTileProps {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  hero?: boolean;
  className?: string;
}

export function StatTile({ icon, label, value, hint, hero = false, className }: StatTileProps) {
  return (
    <div className={cn('ui-card flex h-full items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5', className)}>
      {icon && (
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', hero ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-1 text-lg font-semibold leading-tight tabular-nums">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
