const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper: race a promise against a timeout
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

export async function subscribeToPush(): Promise<boolean> {
  try {
    console.log('[PUSH] Starting subscription flow...');

    // Check basic support
    if (!('serviceWorker' in navigator)) {
      console.log('[PUSH] ❌ Service Worker not supported');
      return false;
    }

    if (!('PushManager' in window)) {
      console.log('[PUSH] ❌ PushManager not supported (iOS Safari requires PWA mode)');
      return false;
    }

    if (!('Notification' in window)) {
      console.log('[PUSH] ❌ Notification API not supported');
      return false;
    }

    console.log('[PUSH] ✅ Browser support OK. Current permission:', Notification.permission);

    // Request permission (with timeout — iOS can hang here)
    let permission: NotificationPermission;
    try {
      permission = await withTimeout(
        Notification.requestPermission(),
        8000,
        'Permission request timed out'
      );
    } catch {
      console.log('[PUSH] ❌ Permission request timed out or failed');
      return false;
    }

    console.log('[PUSH] Permission result:', permission);

    if (permission !== 'granted') {
      console.log('[PUSH] ❌ Permission denied:', permission);
      return false;
    }

    // Wait for service worker (with timeout)
    let registration: ServiceWorkerRegistration;
    try {
      registration = await withTimeout(
        navigator.serviceWorker.ready,
        8000,
        'Service Worker not ready'
      );
      console.log('[PUSH] ✅ Service Worker ready. Scope:', registration.scope);
    } catch {
      console.log('[PUSH] ❌ Service Worker not ready within timeout');
      return false;
    }

    // Always fetch VAPID key from API (most reliable across all platforms)
    let vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
    try {
      const keyRes = await withTimeout(
        fetch(`${API}/api/auth/vapid-public-key`),
        5000,
        'VAPID fetch timeout'
      );
      const keyData = await keyRes.json();
      if (keyData.publicKey) {
        vapidKey = keyData.publicKey;
        console.log('[PUSH] ✅ VAPID key fetched from API');
      }
    } catch (e) {
      console.log('[PUSH] ⚠️ API VAPID fetch failed, using env var');
    }

    if (!vapidKey) {
      console.log('[PUSH] ❌ No VAPID key available');
      return false;
    }

    console.log('[PUSH] VAPID key:', vapidKey.substring(0, 20) + '...');
    return await doSubscribe(registration, vapidKey);
  } catch (error) {
    console.error('[PUSH] ❌ Subscribe error:', error);
    return false;
  }
}

async function doSubscribe(registration: ServiceWorkerRegistration, vapidKey: string): Promise<boolean> {
  try {
    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    console.log('[PUSH] Existing subscription:', subscription ? 'yes' : 'no');

    if (!subscription) {
      console.log('[PUSH] Creating new push subscription...');
      subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }),
        10000,
        'Push subscription timed out'
      );
      console.log('[PUSH] ✅ Push subscription created');
    }

    // Send to backend
    const token = localStorage.getItem('cz_token');
    if (!token) {
      console.log('[PUSH] ❌ No auth token found');
      return false;
    }

    console.log('[PUSH] Sending subscription to backend...');
    const res = await fetch(`${API}/api/auth/push-subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    if (res.ok) {
      console.log('[PUSH] ✅ Subscribed successfully!');
      return true;
    }

    const errText = await res.text().catch(() => 'unknown');
    console.log('[PUSH] ❌ Backend returned error:', res.status, errText);
    return false;
  } catch (error) {
    console.error('[PUSH] ❌ doSubscribe error:', error);
    return false;
  }
}

