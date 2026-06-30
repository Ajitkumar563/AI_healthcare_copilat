// Web Notifications API helpers for Sahaay emergency alerts.
// Works on localhost without HTTPS. In production, HTTPS is required.

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Returns current permission or null if the API isn't available. */
export function getNotificationPermission(): NotificationPermission | null {
  if (!isNotificationSupported()) return null;
  return Notification.permission;
}

/**
 * Requests browser notification permission.
 * Only shows the prompt if permission is still "default" — never re-prompts
 * after the user has already granted or denied.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isNotificationSupported()) {
    console.log("[Notifications] requestNotificationPermission — not supported in this browser.");
    return null;
  }
  if (Notification.permission !== "default") {
    console.log(`[Notifications] requestNotificationPermission — already "${Notification.permission}", not re-prompting.`);
    return Notification.permission;
  }
  try {
    const result = await Notification.requestPermission();
    console.log(`[Notifications] requestNotificationPermission — user responded: "${result}"`);
    return result;
  } catch (e) {
    console.log("[Notifications] requestNotificationPermission — threw an error:", e);
    return null;
  }
}

/**
 * Shows a native OS-level emergency notification.
 * Visible even when the browser tab is in the background.
 * `requireInteraction: true` keeps it on screen until the user acts on it.
 */
export function showEmergencyNotification(title: string, body: string): void {
  console.log("[Notifications] showEmergencyNotification called. supported:", isNotificationSupported(), "permission:", isNotificationSupported() ? Notification.permission : "n/a");

  if (!isNotificationSupported()) {
    console.log("[Notifications] Aborted — Notification API not supported in this browser.");
    return;
  }
  if (Notification.permission !== "granted") {
    console.log(`[Notifications] Aborted — permission is "${Notification.permission}", not "granted". User must click the enable-notifications banner first.`);
    return;
  }

  console.log("[Notifications] Permission granted — firing new Notification() now.");
  const n = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag: "sahaay-emergency",   // replaces any prior emergency notification
    requireInteraction: true,  // does not auto-dismiss
  });

  n.onclick = () => {
    window.focus();
    n.close();
  };
}
