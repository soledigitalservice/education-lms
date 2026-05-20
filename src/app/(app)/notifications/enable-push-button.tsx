'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { apiFetch, HttpError } from '@/lib/api/client';

type State =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'server-disabled' }
  | { kind: 'denied' }
  | { kind: 'subscribed' }
  | { kind: 'unsubscribed'; publicKey: string };

/**
 * Click handler:
 *   1. Make sure the SW is registered (the layout already does this).
 *   2. Ask the browser for `pushManager.subscribe()` with our VAPID key.
 *   3. POST the subscription to /api/me/push-subscriptions.
 *
 * The button hides itself when not supported / configured so the UI stays clean.
 */
export function EnablePushButton() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      // Feature detect.
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState({ kind: 'unsupported' });
        return;
      }
      // Check server config.
      try {
        const res = await apiFetch<{ configured: boolean; publicKey?: string }>(
          '/api/push/vapid-public-key',
        );
        if (!res.configured || !res.publicKey) {
          setState({ kind: 'server-disabled' });
          return;
        }
        // Check existing subscription.
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setState({ kind: 'subscribed' });
          return;
        }
        if (Notification.permission === 'denied') {
          setState({ kind: 'denied' });
          return;
        }
        setState({ kind: 'unsubscribed', publicKey: res.publicKey });
      } catch (err) {
        if (err instanceof HttpError && err.status === 503) {
          setState({ kind: 'server-disabled' });
          return;
        }
        setState({ kind: 'unsupported' });
      }
    })();
  }, []);

  async function enable(): Promise<void> {
    if (state.kind !== 'unsubscribed') return;
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState({ kind: 'denied' });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(state.publicKey),
      });
      const json = sub.toJSON();
      await apiFetch('/api/me/push-subscriptions', {
        method: 'POST',
        body: {
          endpoint: sub.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        },
      });
      setState({ kind: 'subscribed' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo activar');
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === 'loading' || state.kind === 'unsupported' || state.kind === 'server-disabled') {
    return null;
  }
  if (state.kind === 'subscribed') {
    return (
      <span className="text-xs text-emerald-600">✓ Notificaciones push activas</span>
    );
  }
  if (state.kind === 'denied') {
    return (
      <span className="text-xs text-slate-500" title="Permiso denegado en el navegador. Ajústalo en la configuración de notificaciones del sitio.">
        Push bloqueado
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={enable} loading={busy}>
        Activar push
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
