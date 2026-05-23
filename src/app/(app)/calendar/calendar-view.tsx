'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api/client';
import { useT, useLocale } from '@/lib/i18n/client';
import type { CalendarEventDto } from '@/lib/calendar/service';
import { NewEventDialog } from './new-event-dialog';

/** Maps the active locale to a BCP-47 tag for Intl date formatting. */
function dateLocale(loc: string): string {
  return loc === 'en' ? 'en-US' : 'es';
}

interface Props {
  initialEvents: CalendarEventDto[];
  /** "YYYY-M" — used as the initial active month. */
  initialMonth: string;
}

type ViewMode = 'month' | 'list';

const KIND_LABELS: Record<CalendarEventDto['kind'], string> = {
  LIVE_SESSION: 'Clase en vivo',
  ASSIGNMENT_DUE: 'Entrega de tarea',
  COURSE_START: 'Inicio de curso',
  COURSE_END: 'Fin de curso',
  MANUAL: 'Personal',
};

export function CalendarView({ initialEvents, initialMonth }: Props) {
  const t = useT();
  const [events, setEvents] = useState<CalendarEventDto[]>(initialEvents);
  const [view, setView] = useState<ViewMode>('month');
  const [activeMonth, setActiveMonth] = useState<string>(initialMonth);
  const [enabledKinds, setEnabledKinds] = useState<Set<CalendarEventDto['kind']>>(
    new Set(['LIVE_SESSION', 'ASSIGNMENT_DUE', 'COURSE_START', 'COURSE_END', 'MANUAL']),
  );
  const [showNew, setShowNew] = useState(false);

  // Re-fetch when the active month moves outside the initial pre-load window.
  useEffect(() => {
    const [y, m] = activeMonth.split('-').map(Number);
    if (!y || !m) return;
    const from = new Date(y, m - 2, 1); // 1 month before
    const to = new Date(y, m + 2, 0, 23, 59, 59); // 1 month after
    void apiFetch<CalendarEventDto[]>(
      `/api/me/calendar?from=${from.toISOString()}&to=${to.toISOString()}`,
    ).then((rows) => setEvents(rows));
  }, [activeMonth]);

  const filtered = useMemo(
    () => events.filter((e) => enabledKinds.has(e.kind)),
    [events, enabledKinds],
  );

  function toggleKind(kind: CalendarEventDto['kind']): void {
    const next = new Set(enabledKinds);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setEnabledKinds(next);
  }

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('Calendario')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('{n} evento(s) visibles', { n: filtered.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-slate-300 p-0.5 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setView('month')}
              className={
                'rounded-md px-3 py-1 text-sm font-medium transition ' +
                (view === 'month'
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-700 dark:text-slate-200')
              }
            >
              {t('Mes')}
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={
                'rounded-md px-3 py-1 text-sm font-medium transition ' +
                (view === 'list'
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-700 dark:text-slate-200')
              }
            >
              {t('Lista')}
            </button>
          </div>
          <Button onClick={() => setShowNew(true)} size="sm">
            {t('+ Evento personal')}
          </Button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(KIND_LABELS) as Array<CalendarEventDto['kind']>).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => toggleKind(k)}
            className={
              'rounded-full border px-3 py-1 text-xs transition ' +
              (enabledKinds.has(k)
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                : 'border-slate-300 text-slate-500 dark:border-slate-700')
            }
          >
            {t(KIND_LABELS[k])}
          </button>
        ))}
      </div>

      <section className="mt-6">
        {view === 'month' ? (
          <MonthGrid
            events={filtered}
            activeMonth={activeMonth}
            onMonthChange={setActiveMonth}
          />
        ) : (
          <ListView events={filtered} />
        )}
      </section>

      {showNew && (
        <NewEventDialog
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            const [y, m] = activeMonth.split('-').map(Number);
            const from = new Date(y!, m! - 2, 1);
            const to = new Date(y!, m! + 2, 0, 23, 59, 59);
            const fresh = await apiFetch<CalendarEventDto[]>(
              `/api/me/calendar?from=${from.toISOString()}&to=${to.toISOString()}`,
            );
            setEvents(fresh);
          }}
        />
      )}
    </>
  );
}

// =========================================================================
// Month grid view
// =========================================================================

function MonthGrid({
  events,
  activeMonth,
  onMonthChange,
}: {
  events: CalendarEventDto[];
  activeMonth: string;
  onMonthChange: (yyyyMm: string) => void;
}) {
  const t = useT();
  const loc = useLocale();
  const [y, m] = activeMonth.split('-').map(Number);
  const year = y ?? new Date().getFullYear();
  const month0 = (m ?? new Date().getMonth() + 1) - 1;

  // Bucket events by date string (local timezone) for quick lookup.
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEventDto[]>();
    for (const e of events) {
      const d = new Date(e.startsAt);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(k) ?? [];
      list.push(e);
      map.set(k, list);
    }
    return map;
  }, [events]);

  // Build a 6-week grid starting on Monday.
  const first = new Date(year, month0, 1);
  // dayOfWeek: 0 (Mon) … 6 (Sun)
  const firstDow = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month0, 1 - firstDow);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  const monthLabel = first.toLocaleDateString(dateLocale(loc), { month: 'long', year: 'numeric' });

  function shiftMonth(delta: number): void {
    const d = new Date(year, month0 + delta, 1);
    onMonthChange(`${d.getFullYear()}-${d.getMonth() + 1}`);
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)}>
          ←
        </Button>
        <h2 className="text-lg font-semibold capitalize">{monthLabel}</h2>
        <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)}>
          →
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-xs dark:border-slate-700 dark:bg-slate-700">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <div
            key={d}
            className="bg-slate-50 px-2 py-1 text-center font-medium text-slate-500 dark:bg-slate-800"
          >
            {t(d)}
          </div>
        ))}
        {cells.map((cell) => {
          const inMonth = cell.getMonth() === month0;
          const key = `${cell.getFullYear()}-${cell.getMonth()}-${cell.getDate()}`;
          const dayEvents = byDate.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={cell.toISOString()}
              className={
                'flex min-h-24 flex-col gap-0.5 bg-white p-1 dark:bg-slate-900 ' +
                (inMonth ? '' : 'opacity-40')
              }
            >
              <p
                className={
                  'text-right text-[10px] ' +
                  (isToday
                    ? 'font-bold text-brand-600'
                    : 'text-slate-500')
                }
              >
                {cell.getDate()}
              </p>
              {dayEvents.slice(0, 3).map((e) => (
                <EventChip key={e.id} event={e} />
              ))}
              {dayEvents.length > 3 && (
                <p className="text-[10px] text-slate-500">
                  {t('+{n} más', { n: dayEvents.length - 3 })}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventChip({ event }: { event: CalendarEventDto }) {
  const loc = useLocale();
  const color = event.color ?? '#6b7280';
  const content = (
    <div
      className="truncate rounded px-1 py-0.5 text-[10px] text-white"
      style={{ backgroundColor: color }}
      title={`${event.title}${event.subtitle ? ` — ${event.subtitle}` : ''}`}
    >
      {!event.allDay && (
        <span className="font-mono opacity-80">
          {new Date(event.startsAt).toLocaleTimeString(dateLocale(loc), {
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
        </span>
      )}
      {event.title}
    </div>
  );
  return event.href ? (
    <Link href={event.href}>{content}</Link>
  ) : (
    content
  );
}

// =========================================================================
// List view
// =========================================================================

function ListView({ events }: { events: CalendarEventDto[] }) {
  const t = useT();
  const loc = useLocale();
  // Group by date (locale-formatted) keeping chronological order.
  const groups = useMemo(() => {
    const m = new Map<string, CalendarEventDto[]>();
    for (const e of events) {
      const d = new Date(e.startsAt);
      const k = d.toLocaleDateString(dateLocale(loc), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const arr = m.get(k) ?? [];
      arr.push(e);
      m.set(k, arr);
    }
    return [...m.entries()];
  }, [events, loc]);

  if (groups.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">{t('No hay eventos en este rango.')}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([day, items]) => (
        <Card key={day}>
          <CardTitle className="capitalize">{day}</CardTitle>
          <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
            {items.map((e) => {
              const content = (
                <div className="flex items-start gap-3 py-2">
                  <span
                    className="mt-1 inline-block size-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: e.color ?? '#6b7280' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.title}</p>
                    {e.subtitle && (
                      <p className="truncate text-xs text-slate-500">{e.subtitle}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <Badge>{t(KIND_LABELS[e.kind])}</Badge>
                    <p className="mt-1">
                      {e.allDay
                        ? t('Todo el día')
                        : new Date(e.startsAt).toLocaleTimeString(dateLocale(loc), {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                    </p>
                  </div>
                </div>
              );
              return (
                <li key={e.id}>
                  {e.href ? (
                    <Link href={e.href} className="block hover:bg-slate-50 dark:hover:bg-slate-800">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
