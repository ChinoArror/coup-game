import { useEffect, useRef, type ReactNode } from 'react';
import { CircleCheck, Info, X, CircleX } from 'lucide-react';
import { cn } from './cn';

export type NoticeTone = 'success' | 'destructive' | 'info';

const tones: Record<NoticeTone, { border: string; glyph: string; bar: string; Icon: typeof Info }> = {
  success: { border: 'border-success/25', glyph: 'text-log-success', bar: 'bg-success shadow-[0_0_5px_color-mix(in_oklab,var(--success)_55%,transparent)]', Icon: CircleCheck },
  destructive: { border: 'border-destructive/30', glyph: 'text-log-error', bar: 'bg-destructive shadow-[0_0_5px_color-mix(in_oklab,var(--destructive)_55%,transparent)]', Icon: CircleX },
  info: { border: 'border-border/80', glyph: 'text-log-info', bar: 'bg-primary shadow-[0_0_5px_color-mix(in_oklab,var(--primary)_55%,transparent)]', Icon: Info },
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  className?: string;
}

/** Bottom-right result notice. Closes itself after 5s; the countdown bar shows the remaining time. */
export function Notice({ tone = 'info', title, children, onClose, className }: NoticeProps) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  const style = tones[tone];
  const { Icon } = style;

  return (
    <div
      role={tone === 'destructive' ? 'alert' : 'status'}
      className={cn(
        'animate-in fade-in-0 slide-in-from-bottom-2 ease-enter relative w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[11px] border bg-popover/95 p-3 pb-4 text-popover-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_16px_36px_-18px_color-mix(in_oklab,var(--foreground)_50%,transparent)] backdrop-blur-xl duration-200',
        style.border,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-[7px] bg-muted/70 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]', style.glyph)}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          {title && <p className="text-sm font-medium">{title}</p>}
          {children && <div className="text-[12.5px] leading-snug text-muted-foreground">{children}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="grid size-6 shrink-0 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X size={14} />
        </button>
      </div>
      <span aria-hidden="true" className="absolute inset-x-2 bottom-1 h-[3px] overflow-hidden rounded-full bg-border/45">
        <span className={cn('anim-countdown block h-full rounded-full', style.bar)} />
      </span>
    </div>
  );
}
