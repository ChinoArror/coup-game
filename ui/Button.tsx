import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'foreground';
export type ButtonSize = 'sm' | 'default' | 'lg' | 'icon';

const base = "ui-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,scale,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-ring active:scale-[0.96] motion-reduce:active:scale-100 cursor-pointer";

const variants: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  outline: 'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
  foreground: 'bg-foreground text-background shadow-sm hover:bg-foreground/90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs',
  default: 'h-10 px-4',
  lg: 'h-12 px-6',
  icon: 'size-10',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Class string for button styling, for links that should look like buttons. */
export function buttonClassName(variant: ButtonVariant = 'default', size: ButtonSize = 'default', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({ variant = 'default', size = 'default', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClassName(variant, size, className)} {...props} />;
}
