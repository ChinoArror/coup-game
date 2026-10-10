import { cn } from './cn';

export type StatusTone = 'success' | 'warning' | 'destructive' | 'primary' | 'muted';

const tones: Record<StatusTone, string> = {
  success: 'bg-success shadow-[0_0_8px_color-mix(in_oklab,var(--success)_60%,transparent)]',
  warning: 'bg-warning shadow-[0_0_8px_color-mix(in_oklab,var(--warning)_60%,transparent)]',
  destructive: 'bg-destructive shadow-[0_0_8px_color-mix(in_oklab,var(--destructive)_60%,transparent)]',
  primary: 'bg-primary shadow-[0_0_8px_color-mix(in_oklab,var(--primary)_60%,transparent)]',
  muted: 'bg-muted-foreground/60',
};

export interface StatusDotProps {
  tone?: StatusTone;
  pulse?: boolean;
  label?: string;
  className?: string;
}

export function StatusDot({ tone = 'success', pulse = false, label, className }: StatusDotProps) {
  return (
    <>
      <span aria-hidden="true" className={cn('inline-block size-2 shrink-0 rounded-full', tones[tone], pulse && 'animate-pulse', className)} />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}
