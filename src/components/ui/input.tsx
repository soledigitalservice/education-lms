import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `in-${reactId}`;
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition placeholder:text-slate-400',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          'dark:bg-slate-800 dark:text-slate-100',
          error
            ? 'border-red-500'
            : 'border-slate-300 dark:border-slate-700',
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-desc` : undefined}
        {...rest}
      />
      {error || hint ? (
        <p
          id={`${inputId}-desc`}
          className={cn('text-xs', error ? 'text-red-600' : 'text-slate-500')}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
});
