// Web-Push-Registrierung im Browser: Service Worker + Push API.
// Abos werden pro Nutzer und Gerät in push_subscriptions gespeichert.

import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Läuft die App als installierte PWA (Home-Bildschirm)? */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS meldet sich als Mac mit Touch
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** iOS erlaubt Web Push nur für installierte PWAs. */
export function iosNeedsInstallForPush(): boolean {
  return isIos() && !isStandalone();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) return registration;
  return navigator.serviceWorker.register('/sw.js');
}

export type PushEnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'ios-install-required' | 'denied' | 'no-vapid' | 'error'; message: string };

/** Fragt die Berechtigung an, abonniert Push und speichert das Abo. */
export async function enablePush(userId: string): Promise<PushEnableResult> {
  if (!pushSupported()) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Dieser Browser unterstützt keine Web-Push-Benachrichtigungen.',
    };
  }
  if (iosNeedsInstallForPush()) {
    return {
      ok: false,
      reason: 'ios-install-required',
      message:
        'Füge GymPact zuerst über „Teilen → Zum Home-Bildschirm“ hinzu. Danach kannst du Push aktivieren.',
    };
  }
  if (!VAPID_PUBLIC_KEY) {
    return {
      ok: false,
      reason: 'no-vapid',
      message: 'Web Push ist auf diesem Server nicht konfiguriert (VAPID-Key fehlt).',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Benachrichtigungen wurden nicht erlaubt. Du kannst das in den Browser-Einstellungen ändern.',
    };
  }

  try {
    const registration = await getRegistration();
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error('Unvollständiges Push-Abonnement erhalten');
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 255),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw error;

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Push konnte nicht aktiviert werden.',
    };
  }
}

/** Beendet das Push-Abo dieses Geräts und löscht es serverseitig. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
}

/** Ist dieses Gerät aktuell abonniert? */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription !== null && subscription !== undefined;
}
