/**
 * Bottom-right notices, confirmation prompts and undo-able ("deferred") operations.
 *
 * Module-level stores (no React context). NoticeViewport reads them with
 * useSyncExternalStore. Nothing here touches window / document / storage when the
 * module loads: browser APIs are only reached from functions that run in handlers
 * or effects, so this file is safe to bundle into the server-rendered Worker.
 */

export type NoticeTone = 'success' | 'destructive' | 'info' | 'warning';

export type NoticeItem = {
  id: string;
  tone: NoticeTone;
  title: string;
  description?: string;
  /** Milliseconds until the notice closes itself. 0 = sticky (no timer, no countdown bar). */
  duration: number;
  action?: { label: string; onClick: () => void };
  /** Whole-card activation (used by resume prompts). */
  onClick?: () => void;
  icon?: 'undo' | 'play' | 'default';
  createdAt: number;
};

export type NotifyInput = Omit<NoticeItem, 'id' | 'createdAt' | 'duration'> & { duration?: number; id?: string };

export type ConfirmRequest = {
  id: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'destructive' | 'default';
  resolve: (ok: boolean) => void;
};

export type DeferOptions = {
  title: string;
  description?: string;
  /** Undo window in ms (default 5000). */
  delayMs?: number;
  run: () => Promise<unknown> | unknown;
  successTitle: string;
  errorTitle?: string;
  onUndo?: () => void;
  onCommit?: () => void;
};

const DEFAULT_DURATION = 5000;
const CANCELLED_DURATION = 2500;

type Entry = {
  item: NoticeItem;
  /** Fired when the notice closes (timer or X). Only deferred operations set it. */
  onClose?: () => void;
  /** Accumulated visible time, excluding paused stretches. */
  elapsed: number;
  runningSince: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  /** Reasons the countdown is held (pointer over the card, focus inside it). */
  holds: Set<'hover' | 'focus'>;
};

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: NoticeItem[] = [];
let sequence = 0;

const emit = () => {
  snapshot = Array.from(entries.values(), entry => entry.item);
  listeners.forEach(listener => listener());
};

const messageOf = (error: unknown) => (error instanceof Error && error.message) || 'Please try again.';

// ── Countdown clock ─────────────────────────────────────────────────────────
// The timer lives here rather than in the viewport so a notice that is currently
// hidden (beyond the four-visible limit) still closes on time. A deferred
// operation must never be stranded just because its card is off screen.

const elapsedOf = (entry: Entry) => entry.elapsed + (entry.runningSince === null ? 0 : Date.now() - entry.runningSince);

const stopClock = (entry: Entry) => {
  if (entry.timer !== null) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  if (entry.runningSince !== null) {
    entry.elapsed = elapsedOf(entry);
    entry.runningSince = null;
  }
};

const startClock = (entry: Entry) => {
  if (entry.item.duration <= 0 || entry.timer !== null || entry.holds.size > 0) return;
  const id = entry.item.id;
  entry.runningSince = Date.now();
  entry.timer = setTimeout(() => dismiss(id), Math.max(0, entry.item.duration - entry.elapsed));
};

const removeEntry = (id: string): Entry | undefined => {
  const entry = entries.get(id);
  if (!entry) return undefined;
  stopClock(entry);
  entries.delete(id);
  return entry;
};

/**
 * Closes a notice: by its countdown, by the X button, or programmatically.
 * A deferred operation commits here. Closing its notice counts as "I'm sure",
 * so a dismissed or timed-out undo window runs the operation, and only Undo cancels it.
 */
export function dismiss(id: string): void {
  const entry = removeEntry(id);
  if (!entry) return;
  emit();
  entry.onClose?.();
}

/** Removes a notice without firing its close hook (used by Undo). */
function discard(id: string): void {
  if (removeEntry(id)) emit();
}

/** Holds or releases the countdown for one reason (pointer over the card, focus inside it). */
export function setNoticeHold(id: string, source: 'hover' | 'focus', held: boolean): void {
  const entry = entries.get(id);
  if (!entry || entry.holds.has(source) === held) return;
  if (held) {
    entry.holds.add(source);
    stopClock(entry);
  } else {
    entry.holds.delete(source);
    startClock(entry);
  }
  emit();
}

export const isNoticePaused = (id: string): boolean => (entries.get(id)?.holds.size ?? 0) > 0;

/** Visible time already spent on a notice, used to align its countdown bar when it mounts. */
export const getNoticeElapsed = (id: string): number => {
  const entry = entries.get(id);
  return entry ? elapsedOf(entry) : 0;
};

// ── Notices ─────────────────────────────────────────────────────────────────

function register(input: NotifyInput, onClose?: () => void): string {
  const id = input.id ?? `notice-${++sequence}`;
  // Replacing a notice with the same id closes the old one first, so a deferred
  // operation under that id still runs instead of being dropped silently.
  if (entries.has(id)) dismiss(id);
  const item: NoticeItem = {
    id,
    tone: input.tone,
    title: input.title,
    description: input.description,
    duration: input.duration ?? DEFAULT_DURATION,
    action: input.action,
    onClick: input.onClick,
    icon: input.icon,
    createdAt: Date.now(),
  };
  const entry: Entry = { item, onClose, elapsed: 0, runningSince: null, timer: null, holds: new Set() };
  entries.set(id, entry);
  startClock(entry);
  emit();
  return id;
}

/** Shows a notice. Passing an existing `id` replaces that notice. Returns its id. */
export function notify(input: NotifyInput): string {
  return register(input);
}

export function getNotices(): NoticeItem[] {
  return snapshot;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Runs an operation and reports the outcome. On success a success notice appears.
 * On failure a destructive notice appears and the error is re-thrown, so the caller's
 * own error handling (inline messages, state resets) still runs.
 */
export async function notifyResult<T>(
  op: () => Promise<T>,
  msg: { success: string; successDescription?: string; error?: string },
): Promise<T> {
  try {
    const result = await op();
    notify({ tone: 'success', title: msg.success, description: msg.successDescription, duration: DEFAULT_DURATION });
    return result;
  } catch (error) {
    notify({ tone: 'destructive', title: msg.error ?? 'Action failed', description: messageOf(error), duration: DEFAULT_DURATION });
    throw error;
  }
}

// ── Deferred (undo-able) operations ─────────────────────────────────────────

/** Tokens for deferred operations still inside their undo window or committing. */
const pendingSensitive = new Set<symbol>();
let unloadGuardInstalled = false;

const onBeforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  event.returnValue = '';
};

const syncUnloadGuard = () => {
  if (typeof window === 'undefined') return;
  const needed = pendingSensitive.size > 0;
  if (needed === unloadGuardInstalled) return;
  unloadGuardInstalled = needed;
  if (needed) window.addEventListener('beforeunload', onBeforeUnload);
  else window.removeEventListener('beforeunload', onBeforeUnload);
};

/**
 * Schedules a destructive operation behind an undo window. Shows a warning notice with
 * an Undo action and a countdown. When the countdown ends, or the X is clicked, the
 * operation runs and a success or error notice reports the outcome. Undo cancels it.
 * Returns a cancel function that behaves exactly like Undo.
 */
export function deferSensitive(opts: DeferOptions): () => void {
  const delayMs = Math.max(1, opts.delayMs ?? DEFAULT_DURATION);
  const token = Symbol(opts.title);
  let settled = false;
  let noticeId = '';

  const settle = (): boolean => {
    if (settled) return false;
    settled = true;
    pendingSensitive.delete(token);
    syncUnloadGuard();
    return true;
  };

  const commit = async () => {
    if (!settle()) return;
    try {
      opts.onCommit?.();
      await opts.run();
      notify({ tone: 'success', title: opts.successTitle, duration: DEFAULT_DURATION });
    } catch (error) {
      notify({ tone: 'destructive', title: opts.errorTitle || 'Action failed', description: messageOf(error), duration: DEFAULT_DURATION });
    }
  };

  const cancel = () => {
    if (!settle()) return;
    discard(noticeId);
    opts.onUndo?.();
    notify({ tone: 'info', title: `Cancelled — ${opts.title}`, duration: CANCELLED_DURATION });
  };

  pendingSensitive.add(token);
  syncUnloadGuard();
  noticeId = register(
    {
      tone: 'warning',
      title: opts.title,
      description: opts.description,
      duration: delayMs,
      icon: 'undo',
      action: { label: 'Undo', onClick: cancel },
    },
    // Timer completion and the X both land here: closing the notice commits the operation.
    () => { void commit(); },
  );
  return cancel;
}

// ── Confirmation prompts ────────────────────────────────────────────────────

let confirmRequest: ConfirmRequest | null = null;
const confirmListeners = new Set<() => void>();

const emitConfirm = () => {
  confirmListeners.forEach(listener => listener());
};

/** Asks the user to confirm through the shared modal. Resolves true only on explicit confirm. */
export function confirmAction(opts: Omit<ConfirmRequest, 'id' | 'resolve'>): Promise<boolean> {
  return new Promise<boolean>(resolvePromise => {
    sequence += 1;
    const id = `confirm-${sequence}`;
    const previous = confirmRequest;
    const request: ConfirmRequest = {
      ...opts,
      id,
      resolve: ok => {
        if (confirmRequest?.id === id) {
          confirmRequest = null;
          emitConfirm();
        }
        resolvePromise(ok);
      },
    };
    confirmRequest = request;
    // A new prompt replaces an unanswered one; the older caller gets "no".
    previous?.resolve(false);
    emitConfirm();
  });
}

export function subscribeConfirm(listener: () => void): () => void {
  confirmListeners.add(listener);
  return () => {
    confirmListeners.delete(listener);
  };
}

export function getConfirm(): ConfirmRequest | null {
  return confirmRequest;
}
