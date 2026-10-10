import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const controlBase = 'ease-enter w-full rounded-[10px] border-2 border-input bg-muted/70 px-3 py-2 text-base text-foreground shadow-[inset_0_1px_2px_rgb(0_0_0/0.08)] outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 focus:border-primary focus:bg-background focus:ring-[3px] focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px]';

function FieldLabel({ label, children }: { label?: ReactNode; children: ReactNode }) {
  if (!label) return <>{children}</>;
  return (
    <label className="flex w-full flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, className, ...props }, ref) {
  return (
    <FieldLabel label={label}>
      <input ref={ref} className={cn(controlBase, className)} {...props} />
    </FieldLabel>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, className, children, ...props }, ref) {
  return (
    <FieldLabel label={label}>
      <select ref={ref} className={cn(controlBase, 'pr-8', className)} {...props}>
        {children}
      </select>
    </FieldLabel>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, className, ...props }, ref) {
  return (
    <FieldLabel label={label}>
      <textarea ref={ref} className={cn(controlBase, 'min-h-24 resize-y leading-6', className)} {...props} />
    </FieldLabel>
  );
});
