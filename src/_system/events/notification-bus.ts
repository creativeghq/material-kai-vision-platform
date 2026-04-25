/**
 * Platform-tier notification event bus.
 *
 * Lives in `_system/`, NOT under `src/modules/`. Reason: every module
 * that needs to deliver a notification (Email, Messaging, In-App
 * Notifications, Quotes, etc.) publishes/subscribes through this bus.
 * If the bus itself were in a module, disabling that module would
 * break notification routing for every other module.
 *
 * Why not just have `NotificationService` import `emailService` and
 * `messagingService` directly (the previous design): when those move
 * into modules and a module is disabled, the import chain breaks at
 * runtime. The bus pattern decouples publishers from subscribers, so
 * a disabled module just means its subscriber doesn't run — every
 * other path still works.
 *
 * Type-safety contract:
 *   - Each event type is a literal string key
 *   - Each payload type is declared in `NotificationEvents`
 *   - Subscribers receive correctly-typed payloads via overloads
 *
 * No external dependency (mitt, eventemitter3, etc.) — keeps the
 * platform tier free of optional packages.
 */

export interface NotificationEvents {
  /** Send a transactional or campaign email through the Email module. */
  'notification:email-send': {
    to: string | string[];
    templateId?: string;
    subject?: string;
    body?: string;
    /** Free-form template variables. */
    data?: Record<string, unknown>;
    /** Optional reply-to override. */
    replyTo?: string;
  };

  /** Send an SMS through the Messaging module. */
  'notification:sms-send': {
    to: string;
    body: string;
    /** Twilio-style messaging service id, optional. */
    messagingServiceId?: string;
  };

  /** Send a WhatsApp message through the Messaging module. */
  'notification:whatsapp-send': {
    to: string;
    body: string;
    templateId?: string;
    data?: Record<string, unknown>;
  };

  /**
   * Insert a row in `user_notifications` for the bell + inbox UI.
   * Picked up by the In-App Notifications module's subscriber.
   */
  'notification:in-app-create': {
    userId: string;
    title: string;
    message: string;
    /** e.g. 'quote.accepted', 'social.post.published'. Free-form. */
    kind?: string;
    /** Click-through URL when user opens the notification. */
    href?: string;
    metadata?: Record<string, unknown>;
  };
}

export type NotificationEventName = keyof NotificationEvents;

type Listener<E extends NotificationEventName> = (
  payload: NotificationEvents[E],
) => void | Promise<void>;

const listeners: { [E in NotificationEventName]?: Set<Listener<E>> } = {};

function getSet<E extends NotificationEventName>(event: E): Set<Listener<E>> {
  let set = listeners[event] as Set<Listener<E>> | undefined;
  if (!set) {
    set = new Set();
    listeners[event] = set as never;
  }
  return set;
}

/**
 * Subscribe to a notification event. Returns an unsubscribe function —
 * modules can call it on hot-reload / unmount to avoid duplicate handlers.
 */
export function on<E extends NotificationEventName>(
  event: E,
  listener: Listener<E>,
): () => void {
  const set = getSet(event);
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/**
 * Emit a notification event. Fires all subscribers in parallel
 * (Promise.allSettled — one failing subscriber doesn't block the others).
 * Returns when every subscriber has settled. Awaiting is optional;
 * fire-and-forget callers can ignore the returned promise.
 */
export async function emit<E extends NotificationEventName>(
  event: E,
  payload: NotificationEvents[E],
): Promise<void> {
  const set = listeners[event] as Set<Listener<E>> | undefined;
  if (!set || set.size === 0) {
    // No subscribers (likely the responsible module is disabled or not yet
    // registered). Silent no-op — that's the whole point of the bus.
    return;
  }
  await Promise.allSettled(Array.from(set, (listener) => Promise.resolve(listener(payload))));
}

export const notificationBus = { on, emit };
