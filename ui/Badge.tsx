import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive';

const tones: Record<BadgeTone, string> = {
  neutral: 'border-border/60 bg-muted/60 text-muted-foreground',
  primary: 'border-[color-mix(in_oklab,var(--primary)_30%,transparent)] bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] text-log-info',
  success: 'border-[color-mix(in_oklab,var(--success)_32%,transparent)] bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-log-success',
  warning: 'border-[color-mix(in_oklab,var(--warning)_40%,transparent)] bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-log-warn',
  destructive: 'border-[color-mix(in_oklab,var(--destructive)_32%,transparent)] bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-log-error',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums', tones[tone], className)}
      {...props}
    />
  );
}
