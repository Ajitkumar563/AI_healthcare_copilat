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
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return null;
  }
}

/**
 * Shows a native OS-level emergency notification.
 * Visible even when the browser tab is in the background.
 * `requireInteraction: true` keeps it on screen until the user acts on it.
 */
export function showEmergencyNotification(title: string, body: string): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== "granted") return;

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
