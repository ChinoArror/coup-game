import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
}

export interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function Segmented({ options, value, onChange, ariaLabel, className }: SegmentedProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const count = Math.max(options.length, 1);
  const activeIndex = Math.max(0, options.findIndex(option => option.value === value));

  const move = (target: number) => {
    const next = (target + count) % count;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(activeIndex + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(activeIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(count - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('relative inline-grid rounded-[9px] border border-border/60 bg-muted/70 p-[3px] shadow-[inset_0_1px_2px_rgb(0_0_0/0.07)]', className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="ease-enter pointer-events-none absolute inset-y-[3px] left-[3px] rounded-[6px] bg-foreground shadow-[0_1px_2px_rgb(0_0_0/0.28)] transition-transform duration-300 motion-reduce:transition-none"
        style={{ width: `calc((100% - 6px) / ${count})`, transform: `translateX(${activeIndex * 100}%)` }}
      />
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            ref={element => { refs.current[index] = element; }}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-[6px] px-3 py-[7px] text-[13px] font-medium tracking-[-0.01em] outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/40',
              selected ? 'text-background' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
