/**
 * Wires `ModuleDefinition.subscribers` into the platform's notification bus.
 *
 * Behaviour:
 *   - On registry init + every enabled-set change: attach subscribers for
 *     every enabled module that hasn't already been attached.
 *   - When a module becomes disabled: detach its subscribers (so disabling
 *     the Email module really stops Email from receiving send events).
 *
 * Lazy-loads the listener function only on first attach to avoid pulling
 * module code into the main bundle at app boot.
 */

import { notificationBus, type NotificationEventName, type NotificationEvents } from '@/_system/events/notification-bus';
import { registeredModules } from './registry';
import type { ModuleSubscriber } from './ModuleDefinition';

type Detach = () => void;

const attached: Map<string, Detach[]> = new Map();
const inflight: Map<string, Promise<void>> = new Map();

async function attachOne(slug: string, sub: ModuleSubscriber): Promise<Detach> {
  const fn = await sub.listener();
  // We trust the module to publish a listener whose payload type matches the
  // event name it declares. The bus has a typed `on<E>(event, listener)`,
  // but here `event` is a runtime string — so we cast at the boundary.
  const event = sub.event as NotificationEventName;
  return notificationBus.on(event, fn as (p: NotificationEvents[NotificationEventName]) => void | Promise<void>);
}

/**
 * Attach subscribers for one module. Idempotent: if already attached,
 * does nothing. Concurrent calls for the same slug are deduped via
 * `inflight`.
 */
export async function attachModuleSubscribers(slug: string): Promise<void> {
  if (attached.has(slug)) return;
  if (inflight.has(slug)) return inflight.get(slug);

  const mod = registeredModules.find((m) => m.manifest.slug === slug);
  if (!mod || !mod.subscribers || mod.subscribers.length === 0) {
    attached.set(slug, []);
    return;
  }

  const promise = (async () => {
    const detachers = await Promise.all(mod.subscribers!.map((s) => attachOne(slug, s)));
    attached.set(slug, detachers);
  })();
  inflight.set(slug, promise);
  try {
    await promise;
  } finally {
    inflight.delete(slug);
  }
}

/**
 * Detach all subscribers for one module. Idempotent.
 */
export function detachModuleSubscribers(slug: string): void {
  const detachers = attached.get(slug);
  if (!detachers) return;
  for (const d of detachers) {
    try {
      d();
    } catch {
      // Listener removal is best-effort — never throw.
    }
  }
  attached.delete(slug);
}

/**
 * Sync attach/detach state to the current `enabledSlugs` set.
 * Call this from the registry-cache subscriber on every refresh.
 */
export async function syncSubscribersToEnabledSet(enabledSlugs: ReadonlySet<string>): Promise<void> {
  // Detach modules that are no longer enabled.
  for (const slug of attached.keys()) {
    if (!enabledSlugs.has(slug)) detachModuleSubscribers(slug);
  }
  // Attach modules that are newly enabled.
  await Promise.all(
    Array.from(enabledSlugs)
      .filter((slug) => !attached.has(slug))
      .map((slug) => attachModuleSubscribers(slug)),
  );
}
