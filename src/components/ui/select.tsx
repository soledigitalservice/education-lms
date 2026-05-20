import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `sel-${reactId}`;
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {label}
        </label>
      ) : null}
      <select
        ref={ref}
        id={inputId}
        className={cn(
          'rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          'dark:bg-slate-800 dark:text-slate-100',
          error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700',
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {children}
      </select>
      {error || hint ? (
        <p className={cn('text-xs', error ? 'text-red-600' : 'text-slate-500')}>{error ?? hint}</p>
      ) : null}
    </div>
  );
});
