'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { cn } from '@/lib/cn';
import { LOCALE_COOKIE, LOCALES, type Locale } from '@/lib/i18n/config';
import { useLocale } from '@/lib/i18n/client';

/** Compact ES | EN switch. Persists the choice in a cookie and refreshes. */
export function LanguageToggle({ className }: { className?: string }) {
  const router = useRouter();
  const active = useLocale();
  const [pending, startTransition] = useTransition();

  function setLocale(next: Locale): void {
    if (next === active) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-slate-300 p-0.5 text-xs font-semibold dark:border-slate-700',
        pending && 'opacity-60',
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={active === l}
          className={cn(
            'rounded px-2 py-0.5 uppercase transition',
            active === l
              ? 'bg-brand-600 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
