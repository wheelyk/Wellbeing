import { apiFetch } from "../api/client";

// True only on a browser that can actually do all three things this feature needs: run a
// service worker, receive push events, and show notifications. Most notably false on iOS
// Safari unless the site has been added to the Home Screen first - a plain Safari tab on iPhone
// has no Push API at all, regardless of permission. Used to show a plain explanatory message
// instead of a toggle that would otherwise silently fail.
export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// The Push API's `applicationServerKey` needs raw bytes, not the base64url string
// GET /api/push/vapid-public-key actually returns - a small, standard conversion (this exact
// shape is the widely-documented way to do it; there's no built-in browser API for it). Exported
// (not just an internal helper) specifically so it has its own direct unit test, independent of
// mocking the whole Push API to exercise it indirectly.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  // Explicitly backed by a plain ArrayBuffer (not TypeScript's more general ArrayBufferLike,
  // which also covers SharedArrayBuffer) - `PushSubscriptionOptionsInit.applicationServerKey`
  // requires the narrower type.
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js");
}

// `navigator.serviceWorker.ready` can resolve while the worker it hands back is still in the
// "activating" state, not yet "activated" - confirmed directly against a real browser, not
// assumed: `registration.active?.state` read immediately after `ready` resolved was genuinely
// "activating", and calling `pushManager.subscribe()` at exactly that moment stalled
// indefinitely rather than resolving or rejecting. Waiting for the worker's own `statechange`
// event to actually report "activated" is what `ready` alone doesn't guarantee here. Exported
// (not just an internal helper) so its own race-condition fix - see the re-check comment below -
// has a direct unit test, independent of driving the entire real Push API to exercise it.
export async function waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
  const maybeWorker = registration.active ?? registration.waiting ?? registration.installing;
  if (!maybeWorker) return;
  // Narrowed into its own const - TypeScript's control-flow narrowing from the null-check above
  // doesn't carry into the closures below, which capture the outer variable directly.
  const worker: ServiceWorker = maybeWorker;
  if (worker.state === "activated") return;

  await new Promise<void>((resolve) => {
    function handleStateChange() {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", handleStateChange);
        resolve();
      }
    }
    worker.addEventListener("statechange", handleStateChange);
    // Re-check immediately (synchronously, no await between this and the check above) - the
    // worker can finish activating in the gap between that check and this listener being
    // attached, and a 'statechange' event that fires before anyone's listening is simply lost.
    // Confirmed this race is real, not theoretical: without this re-check, the wait hung
    // indefinitely against a real browser on more than one run of this exact code.
    handleStateChange();
  });
}

export class PushPermissionDeniedError extends Error {
  constructor() {
    super("Notification permission was denied.");
  }
}

// Requests permission (if not already granted), subscribes this browser to push, and tells the
// backend about the new subscription. Throws PushPermissionDeniedError specifically so the
// caller can show a clear, distinct message for "you said no" versus any other failure.
export async function subscribeToPush(vapidPublicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushPermissionDeniedError();
  }

  await registerServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  await waitForActivation(registration);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  await apiFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription.toJSON()),
  });
}

// Unsubscribes this browser and tells the backend, if a subscription exists here at all - a
// no-op (not an error) if this browser was never subscribed in the first place, e.g. reminders
// were only ever enabled on a different device.
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiFetch("/api/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}
