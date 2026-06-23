// client/src/hooks/usePushNotifications.ts
// Add "Enable Notifications" button to dashboard using this hook

import { useState, useEffect, useCallback } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function usePushNotifications(engineerName: string) {
  const [supported,   setSupported]   = useState(false);
  const [permission,  setPermission]  = useState<NotificationPermission>('default');
  const [subscribed,  setSubscribed]  = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window);
    setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');

    // Check if already subscribed on backend
    if (engineerName) {
      fetch(`/api/push/status/${encodeURIComponent(engineerName)}`)
        .then(r => r.json())
        .then(d => setSubscribed(d.subscribed))
        .catch(() => {});
    }
  }, [engineerName]);

  const subscribe = useCallback(async () => {
    if (!supported || !engineerName) return;
    setLoading(true); setError(null);
    try {
      // Register service worker
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Get VAPID public key from backend
      const keyRes  = await fetch('/api/push/vapid-public-key');
      const keyData = await keyRes.json();
      if (!keyData.publicKey) throw new Error('VAPID public key not configured on server');

      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') throw new Error('Notification permission denied');

      // Subscribe to push
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });

      // Send subscription to backend
      const res = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription: pushSub.toJSON(), engineerName }),
      });
      if (!res.ok) throw new Error('Failed to save subscription');

      setSubscribed(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [supported, engineerName]);

  const unsubscribe = useCallback(async () => {
    if (!engineerName) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();

      await fetch(`/api/push/unsubscribe/${encodeURIComponent(engineerName)}`, { method: 'DELETE' });
      setSubscribed(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [engineerName]);

  return { supported, permission, subscribed, loading, error, subscribe, unsubscribe };
}
