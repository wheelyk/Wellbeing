import { prisma } from "./prisma";
import { sendPushNotification, type ReminderPayload } from "./webPush";

// Extracted out of reminderScheduler.ts the moment a second caller (taskScheduler.ts) needed the
// exact same "send to every subscription this user has, sweep the ones the push service reports
// gone" logic - the same reasoning reminderRuns.ts's own header comment gives for why the firing
// rules live in one shared place rather than being re-written per caller: two copies of this could
// drift (e.g. one remembering to delete a gone subscription, the other not), and the bug would
// only surface as a subscription that silently never gets cleaned up.
export async function sendPushToUser(userId: string, payload: ReminderPayload): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });

  for (const subscription of subscriptions) {
    const { gone } = await sendPushNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
    );

    // The browser's own push service reports this endpoint no longer exists (410 Gone) or was
    // never valid (404) - the standard signal a user unsubscribed, uninstalled, or cleared site
    // data without this app ever being told directly. Nothing will ever succeed against it
    // again, so it's cleaned up here rather than left to fail silently on every future call.
    if (gone) {
      await prisma.pushSubscription.delete({ where: { id: subscription.id } });
    }
  }
}
