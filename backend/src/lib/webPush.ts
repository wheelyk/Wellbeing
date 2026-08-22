import webpush from "web-push";

// Same "fail loudly, never silently default" principle as jwt.ts's requireSecret - but checked
// lazily (only when a route actually needs a VAPID value), not at process startup. Unlike the
// JWT secrets - which every single request touches via requireAuth - these are only needed once
// reminders are actually used, so an unset value shouldn't break every other unrelated route (or
// the test suite, which never configures real VAPID keys) before this feature is even reached.
function requireVapidConfig(): { publicKey: string; privateKey: string; subject: string } {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must all be set");
  }
  return { publicKey, privateKey, subject };
}

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  const { publicKey, privateKey, subject } = requireVapidConfig();
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export function getVapidPublicKey(): string {
  return requireVapidConfig().publicKey;
}

export interface PushSubscriptionDetails {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface ReminderPayload {
  title: string;
  body: string;
}

// Sends one real push notification. `gone: true` means the browser's own push service reports
// this specific subscription no longer exists (410 Gone) or was never valid (404) - the standard
// signal that a user unsubscribed, uninstalled, or cleared site data without this app ever being
// told directly. The caller (reminderScheduler.ts) is responsible for deleting that row; this
// function only reports the fact, since it has no business deciding what to do with a database
// row on its own.
export async function sendPushNotification(
  subscription: PushSubscriptionDetails,
  payload: ReminderPayload,
): Promise<{ gone: boolean }> {
  ensureConfigured();
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { gone: false };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      return { gone: true };
    }
    throw err;
  }
}
