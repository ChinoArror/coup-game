import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, description, children, footer, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div aria-hidden="true" className="animate-in fade-in-0 absolute inset-0 bg-black/40 backdrop-blur-sm duration-200" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'animate-in fade-in-0 zoom-in-95 ease-enter relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-[14px] border border-border/80 bg-popover/95 text-popover-foreground backdrop-blur-xl duration-200 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_28px_56px_-24px_color-mix(in_oklab,var(--foreground)_45%,transparent)]',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">{title}</h2>
            {description && <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <X size={15} />
          </button>
        </div>
        {children && <div className="min-h-0 overflow-y-auto px-4 pb-4 text-sm">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-border/60 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
