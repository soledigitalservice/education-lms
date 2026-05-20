import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'error';
}

const variants: Record<NonNullable<AlertProps['variant']>, string> = {
  info: 'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-100',
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  warning:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  error:
    'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
};

export function Alert({ variant = 'info', className, role, ...rest }: AlertProps) {
  return (
    <div
      role={role ?? (variant === 'error' || variant === 'warning' ? 'alert' : 'status')}
      className={cn('rounded-lg border px-4 py-3 text-sm', variants[variant], className)}
      {...rest}
    />
  );
}
