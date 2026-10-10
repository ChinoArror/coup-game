import { useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from 'react';
import { ArrowRight, CircleCheck, CircleX, Info, CirclePlay, TriangleAlert, Undo2, X } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';
import { Modal } from './Modal';
import {
  dismiss,
  getConfirm,
  getNotices,
  getNoticeElapsed,
  isNoticePaused,
  setNoticeHold,
  subscribe,
  subscribeConfirm,
  type NoticeItem,
  type NoticeTone,
} from './notify';

const MAX_VISIBLE = 4;

const tones: Record<NoticeTone, { border: string; glyph: string; bar: string; Icon: typeof Info }> = {
  success: { border: 'border-success/25', glyph: 'text-log-success', bar: 'bg-success shadow-[0_0_5px_color-mix(in_oklab,var(--success)_55%,transparent)]', Icon: CircleCheck },
  destructive: { border: 'border-destructive/30', glyph: 'text-log-error', bar: 'bg-destructive shadow-[0_0_5px_color-mix(in_oklab,var(--destructive)_55%,transparent)]', Icon: CircleX },
  info: { border: 'border-border/80', glyph: 'text-log-info', bar: 'bg-primary shadow-[0_0_5px_color-mix(in_oklab,var(--primary)_55%,transparent)]', Icon: Info },
  warning: { border: 'border-warning/35', glyph: 'text-log-warn', bar: 'bg-warning shadow-[0_0_5px_color-mix(in_oklab,var(--warning)_55%,transparent)]', Icon: TriangleAlert },
};

// Stable snapshots: useSyncExternalStore needs referentially equal values when nothing changed.
const EMPTY_NOTICES: NoticeItem[] = [];
const getServerNotices = () => EMPTY_NOTICES;
const getServerConfirm = () => null;

/** Bottom-right notice stack plus the shared confirmation modal. Mount once, near the app root. */
export function NoticeViewport() {
  const notices = useSyncExternalStore(subscribe, getNotices, getServerNotices);
  const confirm = useSyncExternalStore(subscribeConfirm, getConfirm, getServerConfirm);
  const visible = notices.slice(-MAX_VISIBLE);

  return (
    <>
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {visible.map(item => <NoticeCard key={item.id} item={item} />)}
      </div>
      {confirm && (
        <Modal
          key={confirm.id}
          open
          onClose={() => confirm.resolve(false)}
          title={confirm.title}
          description={confirm.description}
          footer={<>
            <Button
              variant="outline"
              autoFocus={confirm.tone === 'destructive'}
              onClick={() => confirm.resolve(false)}
              className="min-h-11 px-4 text-xs font-semibold"
            >
              {confirm.cancelLabel || 'Cancel'}
            </Button>
            <Button
              variant={confirm.tone === 'destructive' ? 'destructive' : 'default'}
              autoFocus={confirm.tone !== 'destructive'}
              onClick={() => confirm.resolve(true)}
              className="min-h-11 px-4 text-xs font-semibold"
            >
              {confirm.confirmLabel || 'Confirm'}
            </Button>
          </>}
        />
      )}
    </>
  );
}

function NoticeCard({ item }: { item: NoticeItem }) {
  // Read the start offset once, at mount. Changing animation-delay on a running
  // animation would make the bar jump on every store update.
  const [elapsed] = useState(() => getNoticeElapsed(item.id));
  const paused = isNoticePaused(item.id);
  const style = tones[item.tone];
  const Icon = item.icon === 'undo' ? Undo2 : item.icon === 'play' ? CirclePlay : style.Icon;
  const interactive = Boolean(item.onClick);

  const activate = () => item.onClick?.();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Only the card itself activates; keys pressed on the X or action button must not.
    if (!interactive || event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  };

  const barStyle = {
    animationDuration: `${item.duration}ms`,
    animationDelay: `-${elapsed}ms`,
    animationPlayState: paused ? 'paused' : 'running',
    // Read by the reduced-motion rule in styles.css, which otherwise zeroes animation durations.
    '--countdown-ms': `${item.duration}ms`,
  } as CSSProperties;

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? activate : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      onPointerEnter={() => setNoticeHold(item.id, 'hover', true)}
      onPointerLeave={() => setNoticeHold(item.id, 'hover', false)}
      onFocus={() => setNoticeHold(item.id, 'focus', true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setNoticeHold(item.id, 'focus', false);
      }}
      className={cn(
        'animate-in fade-in-0 slide-in-from-bottom-2 ease-enter pointer-events-auto relative w-full overflow-hidden rounded-[11px] border bg-popover/95 p-3 pb-4 text-popover-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_16px_36px_-18px_color-mix(in_oklab,var(--foreground)_50%,transparent)] backdrop-blur-xl duration-200 sm:w-[min(360px,calc(100vw-2rem))]',
        style.border,
        interactive && 'cursor-pointer outline-none hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-[3px] focus-visible:ring-ring/40',
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-[7px] bg-muted/70 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]', style.glyph)}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-medium">{item.title}</p>
          {item.description && <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{item.description}</p>}
        </div>
        {item.action && (
          <Button
            variant="outline"
            size="sm"
            onClick={event => {
              event.stopPropagation();
              item.action?.onClick();
            }}
            className="h-8 shrink-0 px-3 text-xs"
          >
            {item.action.label}
          </Button>
        )}
        {interactive && <ArrowRight size={15} aria-hidden="true" className="mt-1 shrink-0 text-muted-foreground" />}
        <button
          type="button"
          onClick={event => {
            // X closes the card. For a deferred operation that means "run it now" (see dismiss in notify.ts).
            event.stopPropagation();
            dismiss(item.id);
          }}
          aria-label="Dismiss"
          className="grid size-6 shrink-0 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X size={14} />
        </button>
      </div>
      {item.duration > 0 && (
        <span aria-hidden="true" className="absolute inset-x-2 bottom-1 h-[3px] overflow-hidden rounded-full bg-border/45">
          <span className={cn('anim-countdown block h-full rounded-full', style.bar)} style={barStyle} />
        </span>
      )}
    </div>
  );
}
