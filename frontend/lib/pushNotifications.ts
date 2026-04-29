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

export async function subscribeToPush(): Promise<boolean> {
  try {
    // Check support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[PUSH] Not supported in this browser');
      return false;
    }

    // Check permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[PUSH] Permission denied');
      return false;
    }

    // Wait for service worker
    const registration = await navigator.serviceWorker.ready;

    // Get VAPID key
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.log('[PUSH] No VAPID key configured');
      return false;
    }

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
    }

    // Send to backend
    const token = localStorage.getItem('cz_token');
    if (!token) return false;

    const res = await fetch(`${API}/api/auth/push-subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    if (res.ok) {
      console.log('[PUSH] ✅ Subscribed successfully');
      return true;
    }

    return false;
  } catch (error) {
    console.error('[PUSH] Subscribe error:', error);
    return false;
  }
}
