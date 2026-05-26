'use client';

import { useEffect, useMemo, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch, HttpError } from '@/lib/api/client';
import { useT } from '@/lib/i18n/client';
import { ROLE_LABELS, type Role } from '@/lib/rbac/roles';

interface Peer {
  id: string;
  fullName: string;
  email: string;
  role: Role;
}

interface Props {
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

export function NewDirectChatDialog({ onClose, onCreated }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingFor, setSubmittingFor] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await apiFetch<Peer[]>('/api/me/chat-peers');
        setPeers(list);
      } catch (err) {
        setError(err instanceof HttpError ? String(err.body.message) : 'Error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return peers;
    return peers.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [peers, query]);

  async function startChat(peer: Peer): Promise<void> {
    setSubmittingFor(peer.id);
    setError(null);
    try {
      const room = await apiFetch<{ id: string }>('/api/chat-rooms/direct', {
        method: 'POST',
        body: { otherUserId: peer.id },
      });
      onCreated(room.id);
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
      setSubmittingFor(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold">{t('Nueva conversación')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label={t('Cerrar')}
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {t('Solo aparecen profesores y compañeros con los que compartes curso (o tus admins).')}
        </p>

        <Input
          placeholder={t('Buscar por nombre o email...')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mt-4"
        />

        {error && <Alert variant="error" className="mt-3">{error}</Alert>}

        <div className="mt-3 max-h-72 overflow-y-auto">
          {loading ? (
            <p className="py-4 text-center text-sm text-slate-500">{t('Cargando…')}</p>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              {t('Nadie coincide con "{q}".', { q: query })}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{p.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {p.email} · <Badge variant="default">{t(ROLE_LABELS[p.role])}</Badge>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => startChat(p)}
                    loading={submittingFor === p.id}
                  >
                    {t('Chatear')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
